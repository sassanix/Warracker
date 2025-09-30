# backend/file_routes.py
from flask import Blueprint, request, jsonify, current_app, send_from_directory, Response
import os
import mimetypes
import logging

# Use try-except pattern for imports to handle both Docker and development environments
try:
    from . import db_handler
    from .auth_utils import token_required, admin_required
    from .paperless_handler import get_paperless_handler
    from .utils import allowed_file
    from .db_handler import get_db_connection, release_db_connection
except ImportError:
    import db_handler
    from auth_utils import token_required, admin_required
    from paperless_handler import get_paperless_handler
    from utils import allowed_file
    from db_handler import get_db_connection, release_db_connection

# Create the file routes blueprint
file_bp = Blueprint('file_bp', __name__)

# Set up logging
logger = logging.getLogger(__name__)

# ============================
# Local File Serving Routes
# ============================

@file_bp.route('/files/<path:filename>', methods=['GET', 'POST'])
@token_required
def serve_file(filename):
    """Basic secure file serving with authentication."""
    try:
        logger.info(f"File access request for {filename} by user {request.user['id']}")
        
        if not filename.startswith('uploads/'):
            logger.warning(f"Attempted access to non-uploads file: {filename}")
            return jsonify({"message": "Access denied"}), 403
            
        # Remove 'uploads/' prefix for send_from_directory
        file_path = filename[8:] if filename.startswith('uploads/') else filename
        
        return send_from_directory('/data/uploads', file_path)
    except Exception as e:
        logger.error(f"Error serving file {filename}: {e}")
        return jsonify({"message": "Error accessing file"}), 500

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

        # Security check for path traversal
        if '..' in filename or filename.startswith('/'):
            logger.warning(f"[SECURE_FILE] Potential path traversal attempt detected: {filename} by user {request.user['id']}")
            return jsonify({"message": "Invalid file path"}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            db_search_path = f"uploads/{filename}"
            logger.info(f"[SECURE_FILE] Searching DB for paths like: '{db_search_path}' (repr: {repr(db_search_path)})")
            query = """
                SELECT w.id, w.user_id
                FROM warranties w
                WHERE w.invoice_path = %s OR w.manual_path = %s OR w.other_document_path = %s OR w.product_photo_path = %s
            """
            cur.execute(query, (db_search_path, db_search_path, db_search_path, db_search_path))
            results = cur.fetchall()
            logger.info(f"[SECURE_FILE] DB query results for '{db_search_path}': {results}")

            user_id = request.user['id']
            is_admin = request.user.get('is_admin', False)
            authorized = is_admin
            logger.info(f"[SECURE_FILE] Initial authorization (is_admin={is_admin}): {authorized}")

            # Check for ownership authorization
            if not authorized and results:
                for warranty_id_db, warranty_user_id_db in results:
                    logger.info(f"[SECURE_FILE] Checking ownership: warranty_id={warranty_id_db}, owner_id={warranty_user_id_db}, current_user_id={user_id}")
                    if warranty_user_id_db == user_id:
                        authorized = True
                        logger.info(f"[SECURE_FILE] Ownership confirmed for warranty_id={warranty_id_db}")
                        break
            
            # Check global view permissions for shared documents (photos, invoices, manuals)
            if not authorized and results:
                for warranty_id_db, warranty_user_id_db in results:
                    # Check if the requested file is a product photo, invoice, or manual for the given warranty
                    cur.execute('SELECT product_photo_path, invoice_path, manual_path FROM warranties WHERE id = %s', (warranty_id_db,))
                    warranty_files = cur.fetchone()
                    # Check if the file path is one of the globally viewable document types
                    if warranty_files and db_search_path in warranty_files:
                        # This is a shared document type - check global view settings
                        cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
                        settings = {row[0]: row[1] for row in cur.fetchall()}
                        
                        global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
                        admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
                        
                        if global_view_enabled and (not admin_only or is_admin):
                            authorized = True
                            logger.info(f"[SECURE_FILE] Global view access granted for shared document: {filename}")
                            break
            
            if not authorized:
                logger.warning(f"[SECURE_FILE] Unauthorized file access attempt: '{filename}' (repr: {repr(filename)}) by user {user_id}. DB results count: {len(results) if results else 'None'}")
                return jsonify({"message": "You are not authorized to access this file"}), 403
            
            logger.info(f"[SECURE_FILE] User {user_id} authorized for file '{filename}'. Attempting to serve from /data/uploads.")
            
            # Construct the full file path
            target_file_path_for_send = os.path.join('/data/uploads', filename)
            logger.info(f"[SECURE_FILE] Path for verification: '{target_file_path_for_send}' (repr: {repr(target_file_path_for_send)})")
            
            # Enhanced file existence and readability checks
            if not os.path.exists(target_file_path_for_send):
                logger.error(f"[SECURE_FILE] File '{target_file_path_for_send}' does not exist")
                try:
                    dir_contents = os.listdir('/data/uploads')
                    logger.info(f"[SECURE_FILE] Contents of /data/uploads: {dir_contents}")
                except Exception as list_err:
                    logger.error(f"[SECURE_FILE] Error listing /data/uploads: {list_err}")
                return jsonify({"message": "File not found"}), 404
            
            if not os.path.isfile(target_file_path_for_send):
                logger.error(f"[SECURE_FILE] Path '{target_file_path_for_send}' exists but is not a file")
                return jsonify({"message": "Invalid file"}), 400
            
            # Check file size and readability
            try:
                file_size = os.path.getsize(target_file_path_for_send)
                logger.info(f"[SECURE_FILE] File size: {file_size} bytes")
                
                # Verify we can read the file
                with open(target_file_path_for_send, 'rb') as f:
                    # Try to read first byte to ensure file is readable
                    f.read(1)
                    f.seek(0)  # Reset file pointer
                    
            except (OSError, IOError) as e:
                logger.error(f"[SECURE_FILE] Cannot read file '{target_file_path_for_send}': {e}")
                return jsonify({"message": "File read error"}), 500
            
            # Use Flask's send_from_directory with enhanced error handling
            try:
                # Get MIME type
                mimetype, _ = mimetypes.guess_type(target_file_path_for_send)
                if not mimetype:
                    mimetype = 'application/octet-stream'
                
                logger.info(f"[SECURE_FILE] Serving file with size {file_size} bytes, mimetype: {mimetype}")
                
                # Use streaming for ALL files to prevent Content-Length mismatches
                logger.info(f"[SECURE_FILE] Using streaming response for file: {filename}")
                
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
                    mimetype=mimetype,
                    headers={
                        'Content-Length': str(file_size),
                        'Content-Disposition': f'inline; filename="{os.path.basename(filename)}"',
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
        
        # Get database connection
        conn = get_db_connection()
        
        # Find warranty that has this Paperless document ID
        with conn.cursor() as cur:
            cur.execute("""
                SELECT w.id, w.user_id
                FROM warranties w
                WHERE w.paperless_invoice_id = %s OR w.paperless_manual_id = %s 
                   OR w.paperless_photo_id = %s OR w.paperless_other_id = %s
            """, (paperless_id, paperless_id, paperless_id, paperless_id))
            
            results = cur.fetchall()
            
            if not results:
                logger.warning(f"[PAPERLESS_FILE] No warranty found with Paperless document ID {paperless_id}")
                return jsonify({"message": "Document not found"}), 404
            
            # Check authorization
            authorized = is_admin
            if not authorized:
                for warranty_id_db, warranty_user_id_db in results:
                    if warranty_user_id_db == user_id:
                        authorized = True
                        break
            
            # Check global view for shared documents (photos, invoices, manuals)
            if not authorized:
                cur.execute("""
                    SELECT w.id, w.user_id
                    FROM warranties w
                    WHERE w.paperless_photo_id = %s OR w.paperless_invoice_id = %s OR w.paperless_manual_id = %s
                """, (paperless_id, paperless_id, paperless_id))
                shared_doc_results = cur.fetchall()
                
                if shared_doc_results:
                    # Get global view settings
                    cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
                    settings = {row[0]: row[1] for row in cur.fetchall()}
                    
                    global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
                    admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
                    
                    if global_view_enabled and (not admin_only or is_admin):
                        authorized = True
                        logger.info(f"[PAPERLESS_FILE] Global view access granted for shared Paperless document: {paperless_id}")
            
            if not authorized:
                logger.warning(f"[PAPERLESS_FILE] Unauthorized access to Paperless document {paperless_id} by user {user_id}")
                return jsonify({"message": "You are not authorized to access this document"}), 403
        
        # Get Paperless handler and retrieve document
        paperless_handler = get_paperless_handler(conn)
        if not paperless_handler:
            return jsonify({"message": "Paperless-ngx integration not available"}), 503
        
        # Get document from Paperless-ngx
        success, content, message, content_type = paperless_handler.get_document_preview(paperless_id)
        
        if not success:
            logger.error(f"[PAPERLESS_FILE] Failed to retrieve document {paperless_id}: {message}")
            return jsonify({"message": message}), 404
        
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
        
        # Return streaming response
        response = Response(
            generate(),
            mimetype=content_type or 'application/octet-stream',
            headers={
                'Content-Length': str(len(content)),
                'Content-Disposition': f'inline; filename="paperless_document_{paperless_id}"',
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
        
        # Get Paperless handler
        conn = get_db_connection()
        logger.info("Database connection acquired")
        
        paperless_handler = get_paperless_handler(conn)
        logger.info(f"Paperless handler: {paperless_handler is not None}")
        
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
            return jsonify({"error": f"Error reading file: {str(file_read_error)}"}), 400
        
        # Upload to Paperless-ngx
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
            return jsonify({"error": f"Upload to Paperless-ngx failed: {str(upload_error)}"}), 500
        
        if success:
            logger.info("Upload successful")
            return jsonify({
                "success": True,
                "document_id": document_id,
                "message": message
            }), 200
        else:
            logger.warning(f"Upload failed: {message}")
            return jsonify({
                "success": False,
                "document_id": document_id,
                "error": message
            }), 200
            
    except Exception as e:
        logger.error(f"Error in Paperless upload: {e}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/test', methods=['POST'])
@admin_required
def test_paperless_connection():
    """
    Test connection to Paperless-ngx instance
    """
    conn = None
    try:
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        
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
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        
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
            # Provide user-friendly error on auth failures
            return jsonify({
                'success': False,
                'message': f'Paperless-ngx search failed: {str(e)}'
            }), 400
        search_result = response.json()
        
        logger.info(f"Paperless search returned {len(search_result.get('results', []))} documents")
        
        return jsonify(search_result)
        
    except Exception as e:
        logger.error(f"Error searching Paperless documents: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
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
        conn = get_db_connection()
        paperless_handler = get_paperless_handler(conn)
        
        if not paperless_handler:
            return jsonify({'success': False, 'message': 'Paperless-ngx integration not available'}), 400
        
        # Make request to Paperless-ngx tags endpoint
        try:
            response = paperless_handler.get('/api/tags/', timeout=30)
            response.raise_for_status()
        except Exception as e:
            return jsonify({'success': False, 'message': f'Paperless-ngx tags failed: {str(e)}'}), 400
        tags_result = response.json()
        
        logger.info(f"Paperless tags returned {len(tags_result.get('results', []))} tags")
        
        return jsonify(tags_result)
        
    except Exception as e:
        logger.error(f"Error fetching Paperless tags: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/debug', methods=['GET'])
@token_required
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
        
        # Try to get paperless handler
        try:
            paperless_handler = get_paperless_handler(conn)
            debug_info["paperless_handler_available"] = paperless_handler is not None
            
            if paperless_handler:
                # Test connection
                try:
                    success, message = paperless_handler.test_connection()
                    debug_info["test_connection_result"] = {
                        "success": success,
                        "message": message
                    }
                except Exception as test_error:
                    debug_info["test_connection_result"] = {
                        "success": False,
                        "error": str(test_error)
                    }
        except Exception as handler_error:
            debug_info["paperless_handler_error"] = str(handler_error)
        
        return jsonify(debug_info), 200
        
    except Exception as e:
        logger.error(f"Error in Paperless debug: {e}")
        return jsonify({"error": f"Debug failed: {str(e)}"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless/test-upload', methods=['POST'])
@token_required
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
        return jsonify({"error": f"Test upload failed: {str(e)}"}), 500

@file_bp.route('/paperless/debug-document/<int:document_id>', methods=['GET'])
@token_required
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
        
        # Get debug information about the document
        debug_info = paperless_handler.debug_document_status(document_id)
        
        # Also check if this document ID exists in our database
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
        return jsonify({"error": f"Debug failed: {str(e)}"}), 500
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
                            if not paperless_handler.document_exists(doc_id):
                                cleanup_results['invalid_found'] += 1
                                logger.info(f"Found invalid Paperless document ID {doc_id} in warranty {warranty_id} ({product_name})")
                                
                                # Clear the invalid reference
                                cur.execute(f"""
                                    UPDATE warranties 
                                    SET {field_name} = NULL 
                                    WHERE id = %s
                                """, (warranty_id,))
                                
                                cleanup_results['cleaned_up'] += 1
                                logger.info(f"Cleaned up invalid {field_name} reference for warranty {warranty_id}")
                                
                        except Exception as e:
                            error_msg = f"Error checking document {doc_id}: {str(e)}"
                            cleanup_results['errors'].append(error_msg)
                            logger.error(error_msg)
            
            conn.commit()
        
        return jsonify({
            "success": True,
            "message": f"Cleanup complete. Checked {cleanup_results['checked']} documents, found {cleanup_results['invalid_found']} invalid, cleaned up {cleanup_results['cleaned_up']}.",
            "details": cleanup_results
        }), 200
        
    except Exception as e:
        logger.error(f"Error in Paperless cleanup: {e}")
        return jsonify({"error": f"Cleanup failed: {str(e)}"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@file_bp.route('/paperless-search-and-link', methods=['POST'])
@token_required
def paperless_search_and_link():
    """Search for a Paperless document by title and link it to a warranty."""

    conn = None  # Single connection for the full request lifecycle
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

        # Get DB connection once and reuse it throughout
        conn = get_db_connection()

        # Obtain Paperless handler (uses same connection to fetch settings)
        paperless_handler = get_paperless_handler(conn)
        if not paperless_handler:
            return jsonify({"success": False, "message": "Paperless-ngx not configured"}), 400

        # Search for the document in Paperless-ngx
        success, document_id, message = paperless_handler.find_document_by_title(search_title)
        logger.info("Paperless search result: success=%s, document_id=%s, message=%s", success, document_id, message)

        if not success or not document_id:
            return jsonify({"success": False, "message": f"Document not found: {message}"}), 404

        # Update warranty with the found document ID
        db_field = valid_types[document_type]

        with conn.cursor() as cursor:
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
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        if conn:
            release_db_connection(conn) 