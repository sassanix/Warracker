# backend/file_routes.py
from flask import Blueprint, request, jsonify, current_app, send_from_directory, Response
from datetime import datetime, UTC
from pathlib import PurePosixPath
from werkzeug.security import safe_join
import os
import mimetypes
import logging

# Use try-except pattern for imports to handle both Docker and development environments
try:
    from . import db_handler
    from .auth_utils import token_required, admin_required
    from .paperless_handler import get_paperless_handler, PaperlessHandler
    from .paperless_access import (
        check_paperless_document_access,
        claim_upload_ownership,
        record_paperless_document_owner,
        user_can_link_paperless_document,
        visible_paperless_document_ids,
    )
    from .utils import allowed_file
    from .db_handler import get_db_connection, release_db_connection
except ImportError:
    import db_handler
    from auth_utils import token_required, admin_required
    from paperless_handler import get_paperless_handler, PaperlessHandler
    from paperless_access import (
        check_paperless_document_access,
        claim_upload_ownership,
        record_paperless_document_owner,
        user_can_link_paperless_document,
        visible_paperless_document_ids,
    )
    from utils import allowed_file
    from db_handler import get_db_connection, release_db_connection

# Create the file routes blueprint
file_bp = Blueprint('file_bp', __name__)

# Set up logging
logger = logging.getLogger(__name__)

# Strictly passive MIME types that may be rendered inline in a browser tab.
# Active formats (text/html, image/svg+xml, application/xhtml+xml, XML, etc.)
# are forced to application/octet-stream + attachment + sandbox CSP so an
# uploaded or Paperless-ingested document can never execute script on our origin.
_SAFE_INLINE_MIME_TYPES = frozenset({
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'text/plain',
})


def _safe_serving_headers(raw_mimetype, filename_for_disposition):
    """Return (mimetype, content_disposition, csp) safe for serving user/Paperless files."""
    base_mime = (raw_mimetype or '').split(';', 1)[0].strip().lower()
    safe_name = os.path.basename(filename_for_disposition or 'document').replace('"', '').replace('\r', '').replace('\n', '')
    if base_mime in _SAFE_INLINE_MIME_TYPES:
        return (
            base_mime,
            f'inline; filename="{safe_name}"',
            "default-src 'none'; frame-ancestors 'self'",
        )
    return (
        'application/octet-stream',
        f'attachment; filename="{safe_name}"',
        'sandbox',
    )


def _is_safe_upload_subpath(rel_path):
    """Reject traversal, backslashes, absolute paths, and dotfiles (e.g. .secret_key)."""
    if not rel_path or rel_path.startswith('/') or '\\' in rel_path or '\x00' in rel_path:
        return False
    parts = PurePosixPath(rel_path).parts
    if not parts:
        return False
    for part in parts:
        if part in ('', '.', '..') or part.startswith('.'):
            return False
    return True


def _resolve_upload_file_path(upload_dir, rel_path):
    """Safely resolve a file inside upload_dir, rejecting symlinks and escapes."""
    if not _is_safe_upload_subpath(rel_path):
        return None
    joined = safe_join(upload_dir, rel_path)
    if not joined:
        return None
    if os.path.islink(joined):
        return None
    real_root = os.path.realpath(upload_dir)
    real_target = os.path.realpath(joined)
    try:
        if os.path.commonpath([real_root, real_target]) != real_root or real_target == real_root:
            return None
    except ValueError:
        return None
    return real_target


# ============================
# Shared file authorization
# ============================

def _check_file_access(cur, db_search_path, user_id, is_admin):
    """
    Shared authorization check for serving uploaded files.
    db_search_path is the path as stored in the DB (e.g. 'uploads/abc.pdf').
    Returns:
      - 'ok'        when the user may access the file
      - 'not_found' when no warranty or claim row references the path and caller is admin
      - 'forbidden' when unauthorized (or unreferenced for non-admins)

    Rules (identical for /files/ and /secure-file/):
      - only paths referenced by a warranty or claim_documents row may ever
        be served (even for admins, so unreferenced files such as .secret_key
        in UPLOAD_FOLDER are never downloadable)
      - admins: allowed for any referenced warranty or claim file
      - the owner of the warranty/claim the file is attached to: allowed
      - anyone else: allowed only for shared warranty document types (product
        photo, invoice, manual) when global_view_enabled is true and
        global_view_admin_only is false
    """
    query = """
        SELECT w.id, w.user_id
        FROM warranties w
        WHERE w.invoice_path = %s OR w.manual_path = %s OR w.other_document_path = %s OR w.product_photo_path = %s
    """
    cur.execute(query, (db_search_path, db_search_path, db_search_path, db_search_path))
    results = cur.fetchall()

    claim_owners = []
    if not results:
        cur.execute("""
            SELECT w.user_id
            FROM claim_documents d
            JOIN warranty_claims c ON d.claim_id = c.id
            JOIN warranties w ON c.warranty_id = w.id
            WHERE d.file_path = %s
        """, (db_search_path,))
        claim_owners = [row[0] for row in (cur.fetchall() or [])]

    if not results and not claim_owners:
        logger.warning(f"[FILE_AUTH] Unreferenced file access attempt: '{db_search_path}' by user {user_id}")
        return "not_found" if is_admin else "forbidden"

    if is_admin:
        logger.info(f"[FILE_AUTH] Admin access granted for referenced file '{db_search_path}'")
        return "ok"

    # Claim documents (issue #148): owner-only, like warranty "other
    # documents" they never participate in global view.
    if not results:
        if user_id in claim_owners:
            logger.info(f"[FILE_AUTH] Claim document ownership confirmed for '{db_search_path}'")
            return "ok"
        logger.warning(f"[FILE_AUTH] Unauthorized file access attempt: '{db_search_path}' by user {user_id}")
        return "forbidden"

    # Ownership authorization
    for warranty_id_db, warranty_user_id_db in (results or []):
        if warranty_user_id_db == user_id:
            logger.info(f"[FILE_AUTH] Ownership confirmed for warranty_id={warranty_id_db}")
            return "ok"

    # Global view permissions for shared documents (photos, invoices, manuals)
    if results:
        for warranty_id_db, _warranty_user_id_db in results:
            cur.execute('SELECT product_photo_path, invoice_path, manual_path FROM warranties WHERE id = %s', (warranty_id_db,))
            warranty_files = cur.fetchone()
            # Only shared document types participate in global view (not other_document)
            if warranty_files and db_search_path in warranty_files:
                cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
                settings = {row[0]: row[1] for row in cur.fetchall()}

                global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
                admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'

                if global_view_enabled and (not admin_only or is_admin):
                    logger.info(f"[FILE_AUTH] Global view access granted for shared document: '{db_search_path}'")
                    return "ok"

    logger.warning(f"[FILE_AUTH] Unauthorized file access attempt: '{db_search_path}' by user {user_id}")
    return "forbidden"


def _check_file_authorization(cur, db_search_path, user_id, is_admin):
    """Backward-compatible boolean wrapper around _check_file_access."""
    return _check_file_access(cur, db_search_path, user_id, is_admin) == "ok"


def _paperless_next_path(next_url):
    """Next-page path for paperless_handler.get, which takes a path.

    Paperless returns absolute `next` URLs; convert them to path plus
    query, and pass through relative values and None unchanged.
    """
    if next_url and next_url.startswith('http'):
        from urllib.parse import urlparse
        parts = urlparse(next_url)
        return parts.path + (('?' + parts.query) if parts.query else '')
    return next_url


# ============================
# Local File Serving Routes
# ============================

@file_bp.route('/files/<path:filename>', methods=['GET', 'POST'])
@token_required
def serve_file(filename):
    """File serving with the same authorization checks as /secure-file/."""
    conn = None
    try:
        logger.info(f"File access request for {filename} by user {request.user['id']}")

        if not filename.startswith('uploads/'):
            logger.warning(f"Attempted access to non-uploads file: {filename}")
            return jsonify({"message": "Access denied"}), 403

        # Remove 'uploads/' prefix and validate subpath (rejects traversal and dotfiles)
        file_path = filename[8:]
        if not _is_safe_upload_subpath(file_path):
            logger.warning(f"Potential path traversal or hidden file access attempt: {filename} by user {request.user['id']}")
            return jsonify({"message": "Invalid file path"}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            user_id = request.user['id']
            is_admin = request.user.get('is_admin', False)
            access = _check_file_access(cur, filename, user_id, is_admin)
        release_db_connection(conn)
        conn = None

        if access == "not_found":
            return jsonify({"message": "File not found"}), 404
        if access != "ok":
            return jsonify({"message": "You are not authorized to access this file"}), 403

        full_path = _resolve_upload_file_path(current_app.config['UPLOAD_FOLDER'], file_path)
        if not full_path or not os.path.isfile(full_path):
            return jsonify({"message": "File not found"}), 404

        # FILE-01: these bytes are authorization-gated, so they must not
        # sit in a shared cache for a year (the Flask default) and must
        # not be content-sniffed. Match the /secure-file/ headers.
        response = send_from_directory(current_app.config['UPLOAD_FOLDER'], file_path)
        safe_mime, disposition, csp = _safe_serving_headers(response.mimetype, file_path)
        response.mimetype = safe_mime
        response.headers['Content-Disposition'] = disposition
        response.headers['Content-Security-Policy'] = csp
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response
    except Exception as e:
        logger.error(f"Error serving file {filename}: {e}")
        return jsonify({"message": "Error accessing file"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/secure-file/<path:filename>', methods=['GET', 'POST'])
@token_required
def secure_file_access(filename):
    """Enhanced secure file serving with authorization checks and Paperless-ngx integration."""
    conn = None
    try:
        # Check if this is a Paperless-ngx document ID request (paperless-{id})
        if filename.startswith('paperless-'):
            try:
                paperless_id = int(filename.replace('paperless-', ''))
                return serve_paperless_document(paperless_id)
            except ValueError:
                logger.warning(f"[SECURE_FILE] Invalid Paperless-ngx document ID format: {filename}")
                return jsonify({"message": "Invalid Paperless document ID"}), 400
        
        # Original local file serving logic
        logger.info(f"[SECURE_FILE] Raw filename from route: '{filename}' (len: {len(filename)})")
        logger.info(f"[SECURE_FILE] repr(filename): {repr(filename)}")

        # Security check for path traversal and dotfiles (e.g. .secret_key)
        if not _is_safe_upload_subpath(filename):
            logger.warning(f"[SECURE_FILE] Potential path traversal or hidden file attempt: {filename} by user {request.user['id']}")
            return jsonify({"message": "Invalid file path"}), 400

        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        db_search_path = f"uploads/{filename}"

        conn = get_db_connection()
        with conn.cursor() as cur:
            logger.info(f"[SECURE_FILE] Searching DB for paths like: '{db_search_path}' (repr: {repr(db_search_path)})")
            access = _check_file_access(cur, db_search_path, user_id, is_admin)
        release_db_connection(conn)
        conn = None

        if access == "not_found":
            return jsonify({"message": "File not found"}), 404
        if access != "ok":
            logger.warning(f"[SECURE_FILE] Unauthorized file access attempt: '{filename}' (repr: {repr(filename)}) by user {user_id}")
            return jsonify({"message": "You are not authorized to access this file"}), 403

        upload_dir = current_app.config['UPLOAD_FOLDER']
        logger.info(f"[SECURE_FILE] User {user_id} authorized for file '{filename}'. Attempting to serve from {upload_dir}.")

        target_file_path_for_send = _resolve_upload_file_path(upload_dir, filename)
        if not target_file_path_for_send or not os.path.exists(target_file_path_for_send):
            logger.error(f"[SECURE_FILE] File '{filename}' does not exist in {upload_dir}")
            return jsonify({"message": "File not found"}), 404

        if not os.path.isfile(target_file_path_for_send):
            logger.error(f"[SECURE_FILE] Path '{target_file_path_for_send}' exists but is not a file")
            return jsonify({"message": "Invalid file"}), 400

        # Check file size and readability
        try:
            file_size = os.path.getsize(target_file_path_for_send)
            logger.info(f"[SECURE_FILE] File size: {file_size} bytes")

            with open(target_file_path_for_send, 'rb') as f:
                f.read(1)
                f.seek(0)

        except (OSError, IOError) as e:
            logger.error(f"[SECURE_FILE] Cannot read file '{target_file_path_for_send}': {e}")
            return jsonify({"message": "File read error"}), 500

        try:
            guessed_mime, _ = mimetypes.guess_type(target_file_path_for_send)
            safe_mime, disposition, csp = _safe_serving_headers(guessed_mime, filename)

            logger.info(f"[SECURE_FILE] Serving file with size {file_size} bytes, mimetype: {safe_mime}")

            def generate():
                try:
                    with open(target_file_path_for_send, 'rb') as f:
                        chunk_size = 4096  # 4KB chunks
                        total_sent = 0
                        while True:
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            total_sent += len(chunk)
                            logger.debug(f"[SECURE_FILE] Streaming chunk: {len(chunk)} bytes, total sent: {total_sent}/{file_size}")
                            yield chunk
                        logger.info(f"[SECURE_FILE] Streaming completed: {total_sent}/{file_size} bytes sent")
                except Exception as e:
                    logger.error(f"[SECURE_FILE] Error during streaming: {e}")
                    raise

            response = Response(
                generate(),
                mimetype=safe_mime,
                headers={
                    'Content-Length': str(file_size),
                    'Content-Disposition': disposition,
                    'Content-Security-Policy': csp,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'X-Content-Type-Options': 'nosniff',
                    'Connection': 'close'
                }
            )
            return response
        except Exception as send_error:
            logger.error(f"[SECURE_FILE] Error serving file: {send_error}")
            return jsonify({"message": "Error serving file"}), 500
                
    except Exception as e:
        logger.error(f"[SECURE_FILE] Error in secure file access for '{filename}' (repr: {repr(filename)}): {e}", exc_info=True)
        return jsonify({"message": "Error accessing file"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless-file/<int:paperless_id>', methods=['GET'])
@token_required
def serve_paperless_document(paperless_id: int):
    """Serve a document from Paperless-ngx"""
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        
        # Authorize and fetch Paperless settings, then release the pooled
        # DB connection BEFORE performing outbound HTTP I/O to Paperless.
        conn = get_db_connection()
        with conn.cursor() as cur:
            access = check_paperless_document_access(cur, user_id, is_admin, paperless_id)
        if access == "not_found":
            logger.warning(f"[PAPERLESS_FILE] No Warracker record of Paperless document ID {paperless_id}")
            return jsonify({"message": "Document not found"}), 404
        if access != "ok":
            logger.warning(f"[PAPERLESS_FILE] Unauthorized access to Paperless document {paperless_id} by user {user_id}")
            return jsonify({"message": "You are not authorized to access this document"}), 403

        paperless_handler = get_paperless_handler(conn)
        release_db_connection(conn)
        conn = None

        if not paperless_handler:
            return jsonify({"message": "Paperless-ngx integration not available"}), 503
        
        # Get document from Paperless-ngx
        success, content, message, content_type = paperless_handler.get_document_preview(paperless_id)
        
        if not success:
            logger.error(f"[PAPERLESS_FILE] Failed to retrieve document {paperless_id}: {message}")
            return jsonify({"message": "Document not found"}), 404
        
        # Stream the document content
        def generate():
            chunk_size = 4096
            total_sent = 0
            remaining = len(content)
            
            while remaining > 0:
                chunk_size_actual = min(chunk_size, remaining)
                chunk = content[total_sent:total_sent + chunk_size_actual]
                total_sent += chunk_size_actual
                remaining -= chunk_size_actual
                yield chunk

        # Only passive MIME types (PDF, raster images, plain text) may be served
        # inline; active content (HTML, SVG, XML, etc.) is forced to download
        # as application/octet-stream with a sandbox CSP.
        safe_mime, disposition, csp = _safe_serving_headers(content_type, f"paperless_document_{paperless_id}")

        response = Response(
            generate(),
            mimetype=safe_mime,
            headers={
                'Content-Length': str(len(content)),
                'Content-Disposition': disposition,
                'Content-Security-Policy': csp,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Content-Type-Options': 'nosniff'
            }
        )
        
        logger.info(f"[PAPERLESS_FILE] Successfully served Paperless document {paperless_id} to user {user_id}")
        return response
        
    except Exception as e:
        logger.error(f"[PAPERLESS_FILE] Error serving Paperless document {paperless_id}: {e}")
        return jsonify({"message": "Error retrieving document"}), 500
    finally:
        if conn:
            release_db_connection(conn)

# ============================
# Paperless-ngx Integration Routes
# ============================

@file_bp.route('/paperless/upload', methods=['POST'])
@token_required
def paperless_upload():
    """
    Proxy endpoint to upload files to Paperless-ngx
    """
    conn = None
    try:
        logger.info("Paperless upload endpoint called")
        
        # Get Paperless handler. The handler only reads site settings from
        # the connection, so release it right away: the upload below polls
        # Paperless for up to 10 minutes, and holding a pooled connection
        # idle in transaction for the whole wait starves the pool (#298).
        # A fresh connection is taken again below for the ownership claim.
        conn = get_db_connection()
        logger.info("Database connection acquired")

        paperless_handler = get_paperless_handler(conn)
        logger.info(f"Paperless handler: {paperless_handler is not None}")
        release_db_connection(conn)
        conn = None

        if not paperless_handler:
            logger.warning("Paperless handler is None - integration not configured")
            return jsonify({"error": "Paperless-ngx integration is not enabled or configured"}), 400
        
        # Validate file upload
        logger.info(f"Request files keys: {list(request.files.keys())}")
        if 'file' not in request.files:
            logger.warning("No 'file' key in request.files")
            return jsonify({"error": "No file provided"}), 400
        
        uploaded_file = request.files['file']
        logger.info(f"Uploaded file: filename='{uploaded_file.filename}', content_type='{uploaded_file.content_type}'")
        
        if uploaded_file.filename == '':
            logger.warning("Empty filename")
            return jsonify({"error": "No file selected"}), 400
        
        # Validate file type
        if not allowed_file(uploaded_file.filename):
            logger.warning(f"File type not allowed: {uploaded_file.filename}")
            return jsonify({"error": "File type not allowed"}), 400
        
        # Get additional metadata
        title = request.form.get('title', uploaded_file.filename)
        document_type = request.form.get('document_type', 'warranty_document')
        logger.info(f"Upload metadata: title='{title}', document_type='{document_type}'")
        
        # Add Warracker-specific tags
        tags = ['warracker', document_type]
        if request.form.get('warranty_id'):
            tags.append(f"warranty_{request.form.get('warranty_id')}")
        logger.info(f"Upload tags: {tags}")
        
        # Read file content
        try:
            file_content = uploaded_file.read()
            logger.info(f"File content read successfully: {len(file_content)} bytes")
        except Exception as file_read_error:
            logger.error(f"Error reading file content: {file_read_error}")
            return jsonify({"error": "Error reading uploaded file"}), 400
        
        # Upload to Paperless-ngx. The start time bounds the PPL-03
        # reclaim window: claims recorded after it cannot predate the
        # document being uploaded.
        upload_started_at = datetime.now(UTC)
        logger.info("Starting upload to Paperless-ngx")
        try:
            success, document_id, message = paperless_handler.upload_document(
                file_content=file_content,
                filename=uploaded_file.filename,
                title=title,
                tags=tags,
                correspondent="Warracker"
            )
            logger.info(f"Upload result: success={success}, document_id={document_id}, message='{message}'")
        except Exception as upload_error:
            logger.error(f"Error during paperless upload: {upload_error}")
            return jsonify({"error": "Upload to Paperless-ngx failed"}), 500
        
        if success:
            logger.info("Upload successful")
            # Record the uploader as the document's owner in Warracker, so
            # search/linking/serving can be scoped to them. Paperless may
            # return a non-numeric (task) id instead of a document id; only
            # numeric ids can be tracked. The connection was released
            # before the upload, so take a fresh one for the claim.
            try:
                numeric_document_id = int(document_id)
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        claim_upload_ownership(cur, numeric_document_id, request.user['id'], upload_started_at)
                    conn.commit()
                finally:
                    release_db_connection(conn)
                    conn = None
            except (TypeError, ValueError):
                logger.info(f"Upload returned non-document id {document_id!r}; ownership not recorded")
            return jsonify({
                "success": True,
                "document_id": document_id,
                "message": message
            }), 200
        else:
            logger.warning(f"Upload failed: {message}")
            # PPL-05: a duplicate upload returns the existing document's
            # id, which must not be revealed when another user owns it.
            # Reveal it only when the requester could link it anyway.
            revealed_id = document_id
            if document_id is not None:
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        if not user_can_link_paperless_document(
                            cur, request.user['id'],
                            request.user.get('is_admin', False), document_id
                        ):
                            revealed_id = None
                finally:
                    release_db_connection(conn)
                    conn = None
            return jsonify({
                "success": False,
                "document_id": revealed_id,
                "error": message
            }), 200
            
    except Exception as e:
        logger.error(f"Error in Paperless upload: {e}")
        return jsonify({"error": "Upload failed"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/test', methods=['POST'])
@admin_required
def test_paperless_connection():
    """
    Test connection to Paperless-ngx instance.

    If `url` and `api_token` are provided in the request body, those
    (possibly unsaved) values are tested directly. Otherwise the saved
    site settings are tested.
    """
    conn = None
    try:
        data = request.get_json(silent=True) or {}
        url = (data.get('url') or '').strip()
        api_token = (data.get('api_token') or '').strip()

        paperless_handler = None
        if url and api_token:
            # Test the provided values without requiring them to be saved first
            paperless_handler = PaperlessHandler(url, api_token)
        else:
            conn = get_db_connection()
            paperless_handler = get_paperless_handler(conn)
            release_db_connection(conn)
            conn = None

        if not paperless_handler:
            return jsonify({"error": "Paperless-ngx integration is not enabled or configured"}), 400
        
        success, message = paperless_handler.test_connection()
        
        if success:
            return jsonify({
                "success": True,
                "message": message
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": message
            }), 400
        
    except Exception as e:
        logger.error(f"Error testing Paperless connection: {e}")
        return jsonify({"error": "Connection test failed"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/search', methods=['GET'])
@token_required
def paperless_search():
    """
    Search documents in Paperless-ngx
    """
    conn = None
    try:
        is_admin = request.user.get('is_admin', False)
        visible_ids = None
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        if paperless_handler and not is_admin:
            with conn.cursor() as cur:
                visible_ids = visible_paperless_document_ids(cur, request.user['id'], False)
        release_db_connection(conn)
        conn = None
        
        if not paperless_handler:
            return jsonify({'success': False, 'message': 'Paperless-ngx not configured'}), 400
        
        # Get query parameters
        ordering = request.args.get('ordering', '-created')
        created_gte = request.args.get('created__gte')
        search_query = request.args.get('query', '')
        
        # Get pagination parameters (support both old and new formats)
        limit = request.args.get('limit', request.args.get('page_size', '25'))
        offset = request.args.get('offset', '0')
        page = request.args.get('page', '1')
        
        # Calculate page from offset if needed
        try:
            limit_int = int(limit)
            offset_int = int(offset)
            if offset_int > 0:
                page = str((offset_int // limit_int) + 1)
        except (ValueError, ZeroDivisionError):
            page = '1'
            limit = '25'

        # PPL-07: never forward an unbounded page size to Paperless-ngx;
        # page_size=100000 used to return every matching document at once.
        try:
            limit = str(max(1, min(int(limit), 100)))
        except ValueError:
            limit = '25'
        
        # Build search URL using paperless handler's configuration
        search_url = f"{paperless_handler.base_url.rstrip('/')}/api/documents/"
        params = {
            'ordering': ordering,
            'page_size': limit,
            'page': page
        }
        
        if created_gte:
            # Convert ISO format to Paperless-ngx expected format
            # Remove 'Z' and use format that Paperless-ngx accepts
            try:
                from datetime import datetime, timezone
                # Parse the ISO format and convert to YYYY-MM-DD format
                dt = datetime.fromisoformat(created_gte.replace('Z', '+00:00'))
                # Use date only format for better compatibility
                params['created__gte'] = dt.strftime('%Y-%m-%d')
                logger.info(f"Converted date filter from {created_gte} to {params['created__gte']}")
            except Exception as date_error:
                logger.warning(f"Could not parse date {created_gte}: {date_error}")
                # Fallback: use today's date
                from datetime import datetime
                params['created__gte'] = datetime.now().strftime('%Y-%m-%d')
        if search_query:
            params['query'] = search_query
            
        # Add document type filter
        document_type = request.args.get('document_type', '')
        if document_type:
            params['document_type'] = document_type
            
        # Add tag filter
        tags_filter = request.args.get('tags__id__in', '')
        if tags_filter:
            params['tags__id__in'] = tags_filter
            
        logger.info(f"Searching Paperless documents with params: {params}")
        
        # Make request to Paperless-ngx using the session from paperless handler
        try:
            response = paperless_handler.get(search_url, params=params, timeout=30)
            response.raise_for_status()
        except Exception as e:
            # Log the full error server-side, but never send exception
            # text to the client: a connection error carries the internal
            # Paperless host, port, API path, and query shape (CFG-10).
            logger.error(f"Paperless-ngx search failed: {e}")
            status = getattr(getattr(e, 'response', None), 'status_code', None)
            if status in (401, 403):
                message = 'Paperless-ngx search failed: Paperless-ngx rejected the credentials.'
            else:
                message = 'Paperless-ngx search failed. Check that Paperless-ngx is reachable.'
            return jsonify({'success': False, 'message': message}), 400
        search_result = response.json()

        logger.info(f"Paperless search returned {len(search_result.get('results', []))} documents")

        # Scope results to the requesting user: the shared Paperless token
        # can see every document in the instance, so non-admin users only
        # receive documents they own or reference (GHSA-fv62-3hrm-gf83).
        if not is_admin:
            filtered = [d for d in search_result.get('results', []) if d.get('id') in visible_ids]
            search_result['results'] = filtered
            search_result['count'] = len(filtered)
            search_result['next'] = None
            # PPL-01: the upstream `all` array carries the IDs of every
            # matching document instance-wide, and `previous` carries the
            # internal Paperless URL. Neither may reach a non-admin user,
            # even when their own filtered result set is empty.
            search_result.pop('all', None)
            search_result['previous'] = None

        return jsonify(search_result)
        
    except Exception as e:
        logger.error(f"Error searching Paperless documents: {e}")
        return jsonify({'success': False, 'message': 'An error occurred while searching Paperless documents.'}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/tags', methods=['GET'])
@token_required
def paperless_tags():
    """
    Get tags from Paperless-ngx
    """
    conn = None
    try:
        is_admin = request.user.get('is_admin', False)
        visible_ids = None
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        if paperless_handler and not is_admin:
            with conn.cursor() as cur:
                visible_ids = visible_paperless_document_ids(cur, request.user['id'], False)
        release_db_connection(conn)
        conn = None
        
        if not paperless_handler:
            return jsonify({'success': False, 'message': 'Paperless-ngx integration not available'}), 400
        
        # Make request to Paperless-ngx tags endpoint.
        # Paperless paginates (default 25/page), so follow pages until we
        # have every tag (issue #255: filter showed only the first page).
        try:
            all_tags = []
            url = '/api/tags/?page_size=1000'
            while url:
                response = paperless_handler.get(url, timeout=30)
                response.raise_for_status()
                page = response.json()
                all_tags.extend(page.get('results', []))
                url = _paperless_next_path(page.get('next'))

            # PPL-06: non-admin users only receive tags attached to
            # documents they may see. Without this, any signed-in user
            # learned every instance tag, including tags used only on
            # other users' documents. Batch via id__in so large Paperless
            # instances are not scanned end-to-end per user request.
            if not is_admin:
                if not visible_ids:
                    all_tags = []
                else:
                    used_tag_ids = set()
                    sorted_ids = sorted(visible_ids)
                    batch_size = 50
                    for idx in range(0, len(sorted_ids), batch_size):
                        batch = sorted_ids[idx:idx + batch_size]
                        id_csv = ','.join(str(doc_id) for doc_id in batch)
                        url = f'/api/documents/?id__in={id_csv}&page_size={batch_size}'
                        while url:
                            response = paperless_handler.get(url, timeout=30)
                            response.raise_for_status()
                            page = response.json()
                            for doc in page.get('results', []):
                                if doc.get('id') in visible_ids:
                                    used_tag_ids.update(doc.get('tags') or [])
                            url = _paperless_next_path(page.get('next'))
                    all_tags = [t for t in all_tags if t.get('id') in used_tag_ids]
        except Exception as e:
            # See CFG-10 in paperless_search: exception text can carry
            # the internal Paperless host and path, so log it and reply
            # with a generic message.
            logger.error(f"Paperless-ngx tags failed: {e}")
            status = getattr(getattr(e, 'response', None), 'status_code', None)
            if status in (401, 403):
                message = 'Paperless-ngx tags failed: Paperless-ngx rejected the credentials.'
            else:
                message = 'Paperless-ngx tags failed. Check that Paperless-ngx is reachable.'
            return jsonify({'success': False, 'message': message}), 400
        tags_result = {'results': all_tags, 'count': len(all_tags)}

        logger.info(f"Paperless tags returned {len(all_tags)} tags")

        return jsonify(tags_result)

    except Exception as e:
        logger.error(f"Error fetching Paperless tags: {e}")
        return jsonify({'success': False, 'message': 'An error occurred while fetching Paperless tags.'}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/status', methods=['GET'])
@token_required
def paperless_status():
    """
    Paperless-ngx enabled flag for any signed-in user.

    The warranty forms previously read this flag from the admin-only
    /api/admin/settings endpoint, which returns 403 for non-admins, so
    Paperless browse/link sections were hidden from every non-admin
    user even though search-and-link itself is user-scoped. This
    endpoint exposes only the enabled flag — never the Paperless URL
    or API token — so the UI can show the sections to all users.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT value FROM site_settings WHERE key = 'paperless_enabled'"
            )
            row = cur.fetchone()
        enabled = bool(row and str(row[0]).lower() == 'true')
        return jsonify({'paperless_enabled': 'true' if enabled else 'false'}), 200
    except Exception as e:
        logger.error(f"Error reading Paperless status: {e}")
        return jsonify({'paperless_enabled': 'false'}), 200
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/debug', methods=['GET'])
@admin_required
def paperless_debug():
    """
    Debug endpoint to test Paperless-ngx configuration
    """
    conn = None
    try:
        conn = get_db_connection()
        
        # Check database settings
        with conn.cursor() as cur:
            cur.execute("""
                SELECT key, value FROM site_settings 
                WHERE key IN ('paperless_enabled', 'paperless_url', 'paperless_api_token')
            """)
            settings = {row[0]: row[1] for row in cur.fetchall()}
        
        debug_info = {
            "paperless_enabled": settings.get('paperless_enabled', 'false'),
            "paperless_url": settings.get('paperless_url', ''),
            "paperless_api_token_set": bool(settings.get('paperless_api_token', '').strip()),
            "paperless_handler_available": False,
            "test_connection_result": None
        }
        
        # Try to get paperless handler, then release DB connection before network probe
        paperless_handler = None
        try:
            paperless_handler = get_paperless_handler(conn)
            debug_info["paperless_handler_available"] = paperless_handler is not None
        except Exception as handler_error:
            logger.error(f"Error initializing Paperless handler in debug: {handler_error}")
            debug_info["paperless_handler_error"] = "Failed to initialize Paperless handler"
        finally:
            release_db_connection(conn)
            conn = None

        if paperless_handler:
            try:
                success, message = paperless_handler.test_connection()
                debug_info["test_connection_result"] = {
                    "success": success,
                    "message": message
                }
            except Exception as test_error:
                logger.error(f"Error testing Paperless connection in debug: {test_error}")
                debug_info["test_connection_result"] = {
                    "success": False,
                    "error": "Connection test failed"
                }
        
        return jsonify(debug_info), 200
        
    except Exception as e:
        logger.error(f"Error in Paperless debug: {e}")
        return jsonify({"error": "Debug failed"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/test-upload', methods=['POST'])
@admin_required
def test_file_upload():
    """
    Test file upload mechanism without Paperless-ngx
    """
    try:
        logger.info("Test upload endpoint called")
        logger.info(f"Request files keys: {list(request.files.keys())}")
        logger.info(f"Request form keys: {list(request.form.keys())}")
        
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        uploaded_file = request.files['file']
        logger.info(f"File: {uploaded_file.filename}, size: {uploaded_file.content_length}, type: {uploaded_file.content_type}")
        
        # Read file content to test
        file_content = uploaded_file.read()
        logger.info(f"Successfully read {len(file_content)} bytes")
        
        return jsonify({
            "success": True,
            "message": "File upload test successful",
            "file_info": {
                "filename": uploaded_file.filename,
                "size": len(file_content),
                "content_type": uploaded_file.content_type
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Test upload error: {e}", exc_info=True)
        return jsonify({"error": "Test upload failed"}), 500

@file_bp.route('/paperless/debug-document/<int:document_id>', methods=['GET'])
@admin_required
def paperless_debug_document(document_id: int):
    """
    Debug endpoint to check status of a specific Paperless-ngx document
    """
    conn = None
    try:
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        
        if not paperless_handler:
            return jsonify({"error": "Paperless-ngx integration not available"}), 400
        
        # Query DB references before releasing connection prior to Paperless HTTP calls
        with conn.cursor() as cur:
            cur.execute("""
                SELECT w.id, w.product_name, w.user_id,
                       CASE 
                           WHEN w.paperless_invoice_id = %s THEN 'invoice'
                           WHEN w.paperless_manual_id = %s THEN 'manual'
                           WHEN w.paperless_photo_id = %s THEN 'photo'
                           WHEN w.paperless_other_id = %s THEN 'other'
                           ELSE 'unknown'
                       END as document_type
                FROM warranties w
                WHERE w.paperless_invoice_id = %s OR w.paperless_manual_id = %s 
                   OR w.paperless_photo_id = %s OR w.paperless_other_id = %s
            """, (document_id, document_id, document_id, document_id, 
                  document_id, document_id, document_id, document_id))
            
            db_results = cur.fetchall()
        release_db_connection(conn)
        conn = None

        # Get debug information about the document
        debug_info = paperless_handler.debug_document_status(document_id)
        debug_info['database_references'] = [
            {
                'warranty_id': row[0],
                'product_name': row[1],
                'user_id': row[2],
                'document_type': row[3]
            }
            for row in db_results
        ]
        
        return jsonify(debug_info), 200
        
    except Exception as e:
        logger.error(f"Error in Paperless document debug: {e}")
        return jsonify({"error": "Debug failed"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/cleanup-invalid', methods=['POST'])
@token_required
def cleanup_invalid_paperless_documents():
    """
    Clean up invalid Paperless-ngx document references from the database
    """
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        
        if not paperless_handler:
            return jsonify({"error": "Paperless-ngx integration not available"}), 400
        
        cleanup_results = {
            'checked': 0,
            'invalid_found': 0,
            'cleaned_up': 0,
            'skipped': 0,
            'errors': []
        }
        
        with conn.cursor() as cur:
            # Get all Paperless document IDs for this user (or all if admin)
            if is_admin:
                cur.execute("""
                    SELECT id, product_name, paperless_invoice_id, paperless_manual_id, 
                           paperless_photo_id, paperless_other_id
                    FROM warranties 
                    WHERE paperless_invoice_id IS NOT NULL 
                       OR paperless_manual_id IS NOT NULL 
                       OR paperless_photo_id IS NOT NULL 
                       OR paperless_other_id IS NOT NULL
                """)
            else:
                cur.execute("""
                    SELECT id, product_name, paperless_invoice_id, paperless_manual_id, 
                           paperless_photo_id, paperless_other_id
                    FROM warranties 
                    WHERE user_id = %s 
                      AND (paperless_invoice_id IS NOT NULL 
                           OR paperless_manual_id IS NOT NULL 
                           OR paperless_photo_id IS NOT NULL 
                           OR paperless_other_id IS NOT NULL)
                """, (user_id,))
            
            warranties = cur.fetchall()
        # Release pooled DB connection before performing outbound Paperless checks
        release_db_connection(conn)
        conn = None

        to_clear = []
        for warranty in warranties:
            warranty_id, product_name, invoice_id, manual_id, photo_id, other_id = warranty
            
            # Check each document ID
            document_fields = [
                ('paperless_invoice_id', invoice_id),
                ('paperless_manual_id', manual_id),
                ('paperless_photo_id', photo_id),
                ('paperless_other_id', other_id)
            ]
            
            for field_name, doc_id in document_fields:
                if doc_id is not None:
                    cleanup_results['checked'] += 1
                    
                    try:
                        existence = paperless_handler.document_existence(doc_id)
                        if existence == 'unknown':
                            # Paperless is unreachable or answered
                            # oddly: leave the reference in place and
                            # report it, never unlink on an outage.
                            cleanup_results['skipped'] += 1
                            cleanup_results['errors'].append(
                                f"Could not check document {doc_id}: "
                                "Paperless-ngx is unreachable; "
                                "reference left in place.")
                            logger.warning(
                                f"Cleanup skipped document {doc_id}: "
                                "Paperless-ngx unreachable, reference kept")
                            continue
                        if existence == 'gone':
                            cleanup_results['invalid_found'] += 1
                            logger.info(f"Found invalid Paperless document ID {doc_id} in warranty {warranty_id} ({product_name})")
                            to_clear.append((field_name, warranty_id, doc_id))
                    except Exception as e:
                        logger.error(f"Error checking document {doc_id}: {e}")
                        cleanup_results['errors'].append(f"Error checking document {doc_id}")

        if to_clear:
            conn = get_db_connection()
            with conn.cursor() as cur:
                for field_name, warranty_id, doc_id in to_clear:
                    cur.execute(f"""
                        UPDATE warranties 
                        SET {field_name} = NULL 
                        WHERE id = %s AND {field_name} = %s
                    """, (warranty_id, doc_id))
                    if cur.rowcount > 0:
                        cleanup_results['cleaned_up'] += 1
                        logger.info(f"Cleaned up invalid {field_name} reference for warranty {warranty_id}")
            conn.commit()
        
        message = (
            f"Cleanup complete. Checked {cleanup_results['checked']} documents, "
            f"found {cleanup_results['invalid_found']} invalid, "
            f"cleaned up {cleanup_results['cleaned_up']}.")
        if cleanup_results['skipped']:
            message += (
                f" {cleanup_results['skipped']} could not be checked because "
                "Paperless-ngx was unreachable; those references were left "
                "in place.")
        return jsonify({
            "success": True,
            "message": message,
            "details": cleanup_results
        }), 200
        
    except Exception as e:
        logger.error(f"Error in Paperless cleanup: {e}")
        return jsonify({"error": "Cleanup failed"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless-search-and-link', methods=['POST'])
@token_required
def paperless_search_and_link():
    """Search for a Paperless document by title and link it to a warranty."""

    conn = None
    try:
        logger.info("paperless_search_and_link called by user: %s", request.user)

        data = request.get_json() or {}
        warranty_id = data.get("warranty_id")
        document_type = data.get("document_type")  # 'invoice', 'manual', 'photo', 'other'
        search_title = data.get("search_title")

        logger.info("Search request: warranty_id=%s, document_type=%s, search_title=%s", warranty_id, document_type, search_title)

        if not all([warranty_id, document_type, search_title]):
            return jsonify({"success": False, "message": "Missing required parameters"}), 400

        # Validate document_type
        valid_types = {
            "invoice": "paperless_invoice_id",
            "manual": "paperless_manual_id",
            "photo": "paperless_photo_id",
            "other": "paperless_other_id",
        }

        if document_type not in valid_types:
            return jsonify({"success": False, "message": "Invalid document type"}), 400

        # Fetch Paperless settings and release the pooled DB connection
        # BEFORE performing outbound HTTP search to Paperless-ngx.
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        release_db_connection(conn)
        conn = None

        if not paperless_handler:
            return jsonify({"success": False, "message": "Paperless-ngx not configured"}), 400

        # Search for the document in Paperless-ngx
        success, document_id, message = paperless_handler.find_document_by_title(search_title)
        logger.info("Paperless search result: success=%s, document_id=%s, message=%s", success, document_id, message)

        if not success or not document_id:
            # PPL-05: answer identically to the foreign-owner rejection below
            # so neither status nor message reveals whether a title exists.
            return jsonify({"success": False, "message": "Document not found"}), 404

        # Update warranty with the found document ID
        db_field = valid_types[document_type]

        conn = get_db_connection()
        with conn.cursor() as cursor:
            # The found document must belong to the requesting user (or be
            # unclaimed); linking another user's document is what used to
            # unlock it in serve_paperless_document (GHSA-3h89-rqfj-5674).
            if not user_can_link_paperless_document(
                cursor, request.user["id"], request.user.get("is_admin", False), document_id
            ):
                logger.warning(
                    "User %s tried to link Paperless document %s owned by another user",
                    request.user["id"],
                    document_id,
                )
                # PPL-05: answer exactly as for a missing document, so
                # the status does not reveal that it exists or is owned.
                return jsonify({"success": False, "message": "Document not found"}), 404

            logger.info(
                "Updating warranty %s field %s with document ID %s for user %s",
                warranty_id,
                db_field,
                document_id,
                request.user["id"],
            )

            cursor.execute(
                f"""
                UPDATE warranties
                SET {db_field} = %s
                WHERE id = %s AND user_id = %s
                """,
                (document_id, warranty_id, request.user["id"]),
            )

            if cursor.rowcount == 0:
                logger.warning("No warranty found with ID %s for user %s", warranty_id, request.user["id"])
                conn.rollback()
                return jsonify({"success": False, "message": "Warranty not found or access denied"}), 404

            record_paperless_document_owner(cursor, document_id, request.user["id"])

        conn.commit()

        logger.info("Successfully linked document %s to warranty %s", document_id, warranty_id)

        return jsonify({"success": True, "message": "Document linked successfully", "document_id": document_id})

    except Exception as e:
        logger.error("Error in paperless_search_and_link: %s", e, exc_info=True)
        return jsonify({"success": False, "message": "Internal server error"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/url', methods=['GET'])
@token_required
def get_paperless_url():
    """Get the Paperless-ngx base URL for opening documents directly"""
    conn = None
    try:
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        
        if not paperless_handler:
            return jsonify({'success': False, 'message': 'Paperless-ngx not configured'}), 400
        
        return jsonify({
            'success': True,
            'url': paperless_handler.base_url
        })
        
    except Exception as e:
        logger.error(f"Error getting Paperless URL: {e}")
        return jsonify({'success': False, 'message': 'Failed to retrieve Paperless URL'}), 500
    finally:
        if conn:
            release_db_connection(conn) 