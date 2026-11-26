# backend/warranties_routes.py
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from werkzeug.utils import secure_filename
from datetime import datetime, date
from decimal import Decimal
import os
import json
import csv
import io
from dateutil.relativedelta import relativedelta

# CSV-04: explicit allow-list of unambiguous date formats. The CSV
# importer and the claim endpoints used to accept anything dateutil
# would parse, so "03/04/2024" silently became March 4 (month-first).
# Only ISO dates and named-month dates are accepted; anything else is
# rejected with a clear error naming the accepted formats.
CSV_DATE_FORMATS = (
    '%Y-%m-%d',   # 2024-03-15
    '%d %b %Y',   # 15 Mar 2024
    '%d %B %Y',   # 15 March 2024
    '%b %d, %Y',  # Mar 15, 2024
    '%B %d, %Y',  # March 15, 2024
    '%d %b, %Y',  # 15 Mar, 2024
    '%d %B, %Y',  # 15 March, 2024
    '%b %d %Y',   # Mar 15 2024
    '%B %d %Y',   # March 15 2024
)


def parse_unambiguous_date(value):
    """Parse a date from the explicit allow-list (CSV-04).

    Accepts ISO YYYY-MM-DD and the named-month forms in
    CSV_DATE_FORMATS. A date object or datetime passes through
    unchanged (as a date). Anything else, including ambiguous numeric
    dates such as 03/04/2024, raises ValueError with a message naming
    the accepted formats.
    """
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            "Use YYYY-MM-DD or a named month, such as 15 Mar 2024 or "
            "March 15, 2024.")
    text = value.strip()
    for fmt in CSV_DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(
        f"Date '{text}' is ambiguous or unsupported. Use YYYY-MM-DD or "
        "a named month, such as 15 Mar 2024 or March 15, 2024.")
import mimetypes
from flask import Response
import uuid
import socket
import threading
import time
import ipaddress
import urllib.parse
import requests
from werkzeug.exceptions import RequestEntityTooLarge

# Add pytz import for timezone functionality
import pytz

# Use relative imports for project modules
try:
    from .db_handler import get_db_connection, release_db_connection
    from .auth_utils import token_required, admin_required
    from .paperless_handler import get_paperless_handler
    from .paperless_access import user_can_link_paperless_document, record_paperless_document_owner
    from .utils import allowed_file
except ImportError:
    # Fallback for development environment
    from db_handler import get_db_connection, release_db_connection
    from auth_utils import token_required, admin_required
    from paperless_handler import get_paperless_handler
    from paperless_access import user_can_link_paperless_document, record_paperless_document_owner
    from utils import allowed_file

import logging
logger = logging.getLogger(__name__)

warranties_bp = Blueprint('warranties_bp', __name__)

# Columns that can reference a locally stored file, for the FILE-06
# shared-path check. Every stored value is a relative 'uploads/<name>'
# path. Table and column names come only from this constant, never
# from input, so interpolating them into the check queries is safe.
_FILE_REFERENCE_COLUMNS = (
    ('warranties', 'invoice_path'),
    ('warranties', 'manual_path'),
    ('warranties', 'other_document_path'),
    ('warranties', 'product_photo_path'),
    ('claim_documents', 'file_path'),
)


def _stored_file_disk_path(stored_path):
    """Disk location of a DB-stored file path, or None if it is not a
    local relative path. FILE-05: derived from the configured
    UPLOAD_FOLDER, never the hard-coded /data prefix the delete sites
    used to join, so non-default deployments actually delete bytes."""
    if not stored_path or os.path.isabs(stored_path):
        return None
    name = stored_path[8:] if stored_path.startswith('uploads/') else stored_path
    if not name or '..' in name.split('/'):
        return None
    return os.path.join(current_app.config['UPLOAD_FOLDER'], name)


def _delete_stored_file(cur, stored_path, exclude=None):
    """Remove a stored file's bytes unless another row still needs them.

    FILE-06: two rows can share one stored path (legacy or restored
    data), and deleting the bytes for one orphaned the other. `exclude`
    names the single (table, column, row id) being cleared, which does
    not count as a live reference; when the owning row was already
    deleted, pass no exclusion and the check runs against what remains.
    Best effort, matching the existing delete behavior: a failed
    reference check keeps the file, and removal failures are logged,
    never raised.
    """
    disk_path = _stored_file_disk_path(stored_path)
    if disk_path is None:
        logger.warning(f"Not deleting unresolvable stored file path: {stored_path!r}")
        return
    try:
        for table, column in _FILE_REFERENCE_COLUMNS:
            if exclude and (table, column) == (exclude[0], exclude[1]):
                cur.execute(
                    f"SELECT 1 FROM {table} WHERE {column} = %s AND id != %s LIMIT 1",
                    (stored_path, exclude[2]),
                )
            else:
                cur.execute(
                    f"SELECT 1 FROM {table} WHERE {column} = %s LIMIT 1",
                    (stored_path,),
                )
            if cur.fetchone():
                logger.info(f"Keeping shared stored file: {stored_path} (still referenced)")
                return
    except Exception as e:
        logger.error(f"Reference check failed for stored file {stored_path}: {e}")
        return
    try:
        if os.path.exists(disk_path):
            os.remove(disk_path)
            logger.info(f"Deleted stored file: {disk_path}")
    except OSError as e:
        logger.error(f"Error deleting stored file {disk_path}: {e}")


def unique_upload_filename(original_name, infix=""):
    """Build a collision-proof stored filename.

    The old scheme used a second-resolution timestamp only, so two uploads of
    the same filename within one second overwrote each other. A random suffix
    closes that window.
    """
    safe = secure_filename(original_name)
    stamp = datetime.now().strftime('%Y%m%d%H%M%S')
    return f"{stamp}_{uuid.uuid4().hex[:8]}_{infix}{safe}"

# NAT64 well-known prefix (RFC 6052), NAT64 local-use prefix (RFC 8215),
# and SIIT IPv4-translated prefix (RFC 2765): the low 32 bits embed an IPv4
# address and Python's ipaddress.is_global reports True for them.
_NAT64_WELL_KNOWN_PREFIX = ipaddress.ip_network('64:ff9b::/96')
_NAT64_LOCAL_USE_PREFIX = ipaddress.ip_network('64:ff9b:1::/48')
_IPV4_TRANSLATED_PREFIX = ipaddress.ip_network('::ffff:0:0:0/96')


def _is_strictly_public_unicast(addr):
    """True only for globally routable unicast addresses (never private,
    loopback, link-local, multicast, reserved, or unspecified)."""
    return (
        addr.is_global
        and not addr.is_private
        and not addr.is_loopback
        and not addr.is_link_local
        and not addr.is_multicast
        and not addr.is_reserved
        and not addr.is_unspecified
    )


def _ip_address_is_public(addr):
    """True when an address is a genuine public unicast destination (SSRF-02).

    ipaddress.is_global alone is not enough: it reports True for the NAT64
    prefix (64:ff9b::/96), SIIT IPv4-translated addresses (::ffff:0:0:0/96),
    and multicast ranges (224.0.0.0/4, ff00::/8). Translation prefixes are
    rejected wholesale, and IPv4-mapped / 6to4 / Teredo wrappers must pass
    the strict public-unicast check on both the wrapper and embedded IPv4.
    """
    if addr.version == 6:
        if (
            addr in _NAT64_WELL_KNOWN_PREFIX
            or addr in _NAT64_LOCAL_USE_PREFIX
            or addr in _IPV4_TRANSLATED_PREFIX
        ):
            return False
        mapped = addr.ipv4_mapped
        if mapped is not None:
            return _is_strictly_public_unicast(mapped)
        sixtofour = addr.sixtofour
        if sixtofour is not None:
            return _is_strictly_public_unicast(addr) and _is_strictly_public_unicast(sixtofour)
        teredo = addr.teredo
        if teredo is not None:
            return (
                _is_strictly_public_unicast(addr)
                and _is_strictly_public_unicast(teredo[0])
                and _is_strictly_public_unicast(teredo[1])
            )
    return _is_strictly_public_unicast(addr)


def _validate_http_url(raw_url, field_label="URL"):
    """Validate and normalize an optional user-supplied web URL (M-01).

    Empty/None values pass through unchanged. Control characters and
    non-HTTP(S) schemes (javascript:, data:, vbscript:, file:, ftp:, etc.)
    are rejected with ValueError. Bare hostnames without a scheme (e.g.
    'example.com/item') are normalized to 'https://...' so existing user
    entry habits continue to work without surprises.
    """
    if raw_url is None:
        return None
    if not isinstance(raw_url, str):
        raise ValueError(f"{field_label} must be a valid http:// or https:// URL")
    trimmed = raw_url.strip()
    if not trimmed:
        return ''
    if any(ord(ch) < 0x20 or ord(ch) == 0x7f for ch in trimmed):
        raise ValueError(f"{field_label} contains invalid control characters")
    parsed = urllib.parse.urlparse(trimmed)
    if parsed.scheme:
        if parsed.scheme.lower() not in ('http', 'https') or not parsed.netloc:
            raise ValueError(f"{field_label} must use an http:// or https:// URL")
        return trimmed
    # Reject protocol-relative or ambiguous colon-before-slash strings
    # (e.g. '//evil.com' or 'javascript:alert(1)' obfuscations).
    first_part = trimmed.split('/', 1)[0]
    if trimmed.startswith('//') or ':' in first_part:
        raise ValueError(f"{field_label} must use an http:// or https:// URL")
    candidate = f"https://{trimmed}"
    parsed_candidate = urllib.parse.urlparse(candidate)
    host = parsed_candidate.hostname or ''
    if not parsed_candidate.netloc or ('.' not in host and host.lower() != 'localhost'):
        raise ValueError(f"{field_label} must use an http:// or https:// URL")
    return candidate


class _PhotoHostRejectedError(Exception):
    """A photo URL host failed SSRF validation inside the transport
    adapter. Deliberately not a ValueError: requests converts a
    ValueError raised while building pool keys into InvalidURL,
    which would change the user-facing error message, so the fetch
    loop catches this type and raises the usual ValueError itself."""


class _PinnedPhotoAdapter(requests.adapters.HTTPAdapter):
    """Transport adapter for the product-photo fetch (SSRF-01).

    The old guard resolved the hostname, checked the addresses, and
    then let requests resolve the hostname again at connect time, so
    a DNS answer that changed between the two lookups could steer
    the connection to an address the guard never saw. This adapter
    resolves each hop hostname exactly once with socket.getaddrinfo,
    requires every returned address to be public (unless the
    deployment sets ALLOW_PRIVATE_PHOTO_URLS), and connects to the
    first public address. The validated address is the connected
    address. There is no failover: a failed connect is a fetch
    failure, never a fresh lookup.
    """

    def __init__(self, allow_private=False, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._allow_private = allow_private

    def _resolve_and_pin(self, hostname):
        """One resolve-validate-pin cycle for a hop hostname.
        Returns the IP string to connect to.

        Every returned address is validated against the public-address
        guard so a mixed public/private answer is always rejected. When
        a dual-stack host returns both IPv6 and IPv4 addresses, prefer
        IPv4 so standard IPv4-only Docker containers do not fail with
        ENETUNREACH on an unreachable AAAA record, while IPv6-only hosts
        still connect via their validated IPv6 address.
        """
        try:
            infos = socket.getaddrinfo(hostname, None)
        except Exception:
            raise _PhotoHostRejectedError(hostname)
        if not infos:
            raise _PhotoHostRejectedError(hostname)
        first_any = None
        first_ipv4 = None
        for info in infos:
            try:
                addr = ipaddress.ip_address(info[4][0])
            except ValueError:
                raise _PhotoHostRejectedError(hostname)
            if not self._allow_private and not _ip_address_is_public(addr):
                raise _PhotoHostRejectedError(hostname)
            if first_any is None:
                first_any = info[4][0]
            if first_ipv4 is None and addr.version == 4:
                first_ipv4 = info[4][0]
        return first_ipv4 or first_any

    def build_connection_pool_key_attributes(self, request, verify,
                                             cert=None):
        parsed = urllib.parse.urlparse(request.url)
        hostname = parsed.hostname
        if not hostname:
            raise _PhotoHostRejectedError(hostname)
        pinned = self._resolve_and_pin(hostname)
        host_params, pool_kwargs = super().build_connection_pool_key_attributes(
            request, verify, cert)
        host_params["host"] = pinned
        if parsed.scheme == "https":
            # The pool is keyed by the pinned IP, so without these the
            # connection would present the IP as SNI and verify the
            # certificate against it. The pool key also carries both
            # values, so two hostnames pinned to one IP never share a
            # pool.
            pool_kwargs["server_hostname"] = hostname
            pool_kwargs["assert_hostname"] = hostname
        return host_params, pool_kwargs

    def add_headers(self, request, **kwargs):
        parsed = urllib.parse.urlparse(request.url)
        hostname = parsed.hostname
        if hostname:
            host = hostname
            if ":" in host and not host.startswith("["):
                host = f"[{host}]"
            port = parsed.port
            default = {"http": 80, "https": 443}.get(parsed.scheme)
            if port is not None and port != default:
                host = f"{host}:{port}"
            request.headers["Host"] = host


def _detect_image_extension(data):
    """Magic-byte image sniffing (the upload path checks extensions only;
    a fetched file has no trustworthy name, so check the content)."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return '.png'
    if data[:3] == b'\xff\xd8\xff':
        return '.jpg'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return '.gif'
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return '.webp'
    return None

def _interrupt_photo_fetch(resp):
    """Interrupt a blocked streamed read (SSRF-03). Closing the response
    does not wake a thread blocked in recv, and the pooled connection's
    sock is already detached by the time the response streams, so the
    socket is reached through the response's read buffer
    (raw._fp.fp.raw._sock). Shutting it down makes the blocked read
    return, so the deadline check fires. Best effort: any failure
    leaves the per-chunk deadline check and the per-read timeout as
    the backstop."""
    try:
        sock = resp.raw._fp.fp.raw._sock
        if sock is not None:
            sock.shutdown(socket.SHUT_RDWR)
    except Exception:
        pass
    try:
        resp.close()
    except Exception:
        pass


def download_product_photo(url):
    """Fetch an image from a user-supplied URL for use as a product photo.
    Returns (bytes, extension). Raises ValueError with a user-facing message."""
    current = (url or '').strip()
    if not current:
        raise ValueError("Photo URL is empty.")
    max_bytes = current_app.config.get('MAX_CONTENT_LENGTH') or 32 * 1024 * 1024
    # SSRF-03: one total deadline for the whole fetch, redirects and body
    # reads included. The per-read timeout alone let a server dripping
    # one chunk every few seconds hold a fetch open indefinitely.
    total_timeout = current_app.config.get('PHOTO_FETCH_TIMEOUT_SECONDS') or 60
    deadline = time.monotonic() + total_timeout
    # One session for the whole fetch (redirect hops included), with the
    # pinning adapter mounted. The session is fresh per fetch, so no
    # pool is ever shared with another fetch or hostname.
    session = requests.Session()
    # Never route the fetch through an environment proxy: a proxy
    # would resolve the hostname itself, which is a second DNS lookup
    # the pinning exists to prevent.
    session.trust_env = False
    adapter = _PinnedPhotoAdapter(
        allow_private=bool(current_app.config.get('ALLOW_PRIVATE_PHOTO_URLS')))
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    try:
        for _ in range(4):
            parsed = urllib.parse.urlparse(current)
            if parsed.scheme not in ('http', 'https') or not parsed.hostname:
                raise ValueError("Photo URL must be a valid http(s) URL.")
            if time.monotonic() >= deadline:
                raise ValueError("Timed out fetching the photo URL.")
            try:
                resp = session.get(current, timeout=min(10, deadline - time.monotonic()),
                                   stream=True, allow_redirects=False,
                                   headers={'User-Agent': 'Warracker photo fetch'})
            except _PhotoHostRejectedError:
                raise ValueError("Photo URL must point to a public address.")
            except requests.RequestException:
                raise ValueError("Could not fetch the photo URL.")
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get('Location')
                resp.close()
                if not location:
                    raise ValueError("Could not fetch the photo URL.")
                current = urllib.parse.urljoin(current, location)
                continue
            if resp.status_code != 200:
                resp.close()
                raise ValueError("Could not fetch the photo URL.")
            buf = bytearray()
            # A per-chunk deadline check alone does not bound a slow drip:
            # a read for a full chunk blocks until the chunk fills or the
            # connection closes, so the check may never run. A timer shuts
            # the socket down at the deadline, which unblocks the read;
            # the post-loop check then turns a shutdown-caused end of
            # stream into the timeout error instead of accepting bytes
            # that arrived after the deadline.
            timer = threading.Timer(
                max(0.0, deadline - time.monotonic()),
                _interrupt_photo_fetch, args=(resp,))
            timer.daemon = True
            timer.start()
            try:
                for chunk in resp.iter_content(chunk_size=65536):
                    if time.monotonic() >= deadline:
                        raise ValueError("Timed out fetching the photo URL.")
                    if len(buf) + len(chunk) > max_bytes:
                        raise ValueError("Photo URL file is too large.")
                    buf.extend(chunk)
            except requests.RequestException:
                if time.monotonic() >= deadline:
                    raise ValueError("Timed out fetching the photo URL.")
                raise ValueError("Could not fetch the photo URL.")
            finally:
                timer.cancel()
                resp.close()
            if time.monotonic() >= deadline:
                raise ValueError("Timed out fetching the photo URL.")
            ext = _detect_image_extension(buf)
            if not ext:
                raise ValueError("Product photo must be an image file (PNG, JPG, JPEG, WEBP, GIF)")
            return bytes(buf), ext
        raise ValueError("Too many redirects fetching the photo URL.")
    finally:
        session.close()

# Map of currency symbols to ISO codes (mirrors frontend js/lib/currency.js).
# Used to resolve a user's preferred currency symbol to a code for new warranties.
SYMBOL_TO_CURRENCY_CODE = {
    '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
    '₹': 'INR', '₩': 'KRW', 'CHF': 'CHF', 'C$': 'CAD',
    'A$': 'AUD', 'kr': 'SEK', 'zł': 'PLN', 'Kč': 'CZK',
    'Ft': 'HUF', '₽': 'RUB', 'R$': 'BRL', '₪': 'ILS',
    '₺': 'TRY', 'NZ$': 'NZD', 'лв': 'BGN', 'lei': 'RON',
    'kn': 'HRK', 'S/': 'PEN', 'Bs': 'VES', 'R': 'ZAR',
    '₦': 'NGN', 'KSh': 'KES', '₵': 'GHS', 'DH': 'MAD',
    'DT': 'TND', 'AED': 'AED', 'SR': 'SAR', 'QR': 'QAR',
    'KD': 'KWD', 'BD': 'BHD', 'OR': 'OMR', 'JD': 'JOD',
    'LL': 'LBP', '﷼': 'IRR', '₨': 'PKR', '৳': 'BDT',
    'Nu': 'BTN', '฿': 'THB', '₫': 'VND', '₭': 'LAK',
    '៛': 'KHR', 'RM': 'MYR', 'S$': 'SGD', 'Rp': 'IDR',
    '₱': 'PHP', 'NT$': 'TWD', 'HK$': 'HKD', 'MOP': 'MOP',
    '₮': 'MNT', '₸': 'KZT', 'soʻm': 'UZS', 'SM': 'TJS',
    'с': 'KGS', 'T': 'TMT', '؋': 'AFN', '֏': 'AMD',
    '₼': 'AZN', '₾': 'GEL', '₴': 'UAH', 'Br': 'BYN',
    'дин': 'RSD', 'ден': 'MKD', 'KM': 'BAM', 'FJ$': 'FJD',
    'SI$': 'SBD', 'T$': 'TOP', 'VT': 'VUV', 'WS$': 'WST',
    '₣': 'XPF'
}

def get_user_currency_code(user_id):
    """Return the user's preferred currency code, falling back to 'USD'."""
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT currency_symbol FROM user_preferences WHERE user_id = %s", (user_id,))
                row = cur.fetchone()
                if row and row[0]:
                    return SYMBOL_TO_CURRENCY_CODE.get(row[0], 'USD')
        finally:
            release_db_connection(conn)
    except Exception as e:
        logger.warning(f"Could not load preferred currency for user {user_id}: {e}")
    return 'USD'



def convert_decimals(obj):
    """Recursively convert Decimal objects to float in dicts/lists for JSON serialization."""
    if isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

@warranties_bp.route('/warranties', methods=['GET'])
@token_required
def get_warranties():
    conn = None
    try:
        user_id = request.user['id']
        # is_admin = request.user.get('is_admin', False) # Removed admin check

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Always fetch warranties belonging to the logged-in user
            # Removed the if is_admin: block
            # Replaced warranty_years with warranty_duration_years, warranty_duration_months, warranty_duration_days
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, w.product_url, w.notes,
                    w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, w.vendor, w.warranty_type,
                    w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number, w.voided_at,
                    CASE
                        WHEN COUNT(c.id) = 0 THEN 'NO_CLAIMS'
                        WHEN BOOL_OR(c.status IN ('Submitted', 'In Progress')) THEN 'OPEN'
                        ELSE 'FINISHED'
                    END AS claim_status_summary,
                    (SELECT COUNT(*) FROM warranty_expiry_history h WHERE h.warranty_id = w.id) AS expiry_change_count,
                    (SELECT COUNT(*) FROM warranty_note_entries n WHERE n.warranty_id = w.id) AS note_entry_count
                FROM warranties w
                LEFT JOIN warranty_claims c ON w.id = c.warranty_id
                WHERE w.user_id = %s AND w.archived_at IS NULL
                GROUP BY w.id
                ORDER BY CASE WHEN w.is_lifetime THEN 1 ELSE 0 END, w.expiration_date NULLS LAST, w.product_name
            ''', (user_id,))
                
            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []
            
            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)
                
                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers
                
                # Get tags for this warranty (show all associated tags the user can see via warranty access)
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s -- Removed user_id/is_admin filter here
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags
                
                warranties_list.append(warranty_dict)
                
            return jsonify(warranties_list)
    except Exception as e:
        current_app.logger.error(f"Error retrieving warranties: {e}")
        return jsonify({"error": "Failed to retrieve warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/archived', methods=['GET'])
@token_required
def get_archived_warranties():
    conn = None
    try:
        user_id = request.user['id']

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, w.product_url, w.notes,
                    w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, w.vendor, w.warranty_type,
                    w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number, w.voided_at,
                    CASE
                        WHEN COUNT(c.id) = 0 THEN 'NO_CLAIMS'
                        WHEN BOOL_OR(c.status IN ('Submitted', 'In Progress')) THEN 'OPEN'
                        ELSE 'FINISHED'
                    END AS claim_status_summary,
                    (SELECT COUNT(*) FROM warranty_expiry_history h WHERE h.warranty_id = w.id) AS expiry_change_count,
                    (SELECT COUNT(*) FROM warranty_note_entries n WHERE n.warranty_id = w.id) AS note_entry_count
                FROM warranties w
                LEFT JOIN warranty_claims c ON w.id = c.warranty_id
                WHERE w.user_id = %s AND w.archived_at IS NOT NULL
                GROUP BY w.id
                ORDER BY w.archived_at DESC NULLS LAST, w.updated_at DESC NULLS LAST, w.product_name
            ''', (user_id,))

            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []

            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)

                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers

                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags

                warranties_list.append(warranty_dict)

            return jsonify(warranties_list)
    except Exception as e:
        current_app.logger.error(f"Error retrieving archived warranties: {e}")
        return jsonify({"error": "Failed to retrieve archived warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties', methods=['POST'])
@token_required
def add_warranty():
    conn = None
    try:
        # Validate input data
        if not request.form.get('product_name', '').strip():
            return jsonify({"error": "Product name is required"}), 400

        if len(request.form.get('product_name')) > 255:
            return jsonify({"error": "Product name must be 255 characters or less",
                            "code": "product_name_too_long"}), 400

        for serial_number in request.form.getlist('serial_numbers[]'):
            if len(serial_number) > 255:
                return jsonify({"error": "Serial number must be 255 characters or less",
                                "code": "serial_number_too_long"}), 400
            
        if not request.form.get('purchase_date'):
            return jsonify({"error": "Purchase date is required"}), 400

        # Handle lifetime warranty
        is_lifetime = request.form.get('is_lifetime', 'false').lower() == 'true'
        expiration_date = None
        warranty_duration_years = 0
        warranty_duration_months = 0
        warranty_duration_days = 0

        if not is_lifetime:
            # Check if exact expiration date is provided
            exact_expiration_date = request.form.get('exact_expiration_date')
            
            if exact_expiration_date:
                # Use exact expiration date provided by user
                try:
                    expiration_date = datetime.strptime(exact_expiration_date, '%Y-%m-%d').date()
                    logger.info(f"Using exact expiration date: {expiration_date}")
                    # Set duration fields to 0 when using exact date
                    warranty_duration_years = 0
                    warranty_duration_months = 0
                    warranty_duration_days = 0
                except ValueError:
                    return jsonify({"error": "Invalid exact expiration date format. Use YYYY-MM-DD"}), 400
            else:
                # Use duration-based calculation (existing logic)
                try:
                    # Handle empty strings explicitly, default to 0
                    years_str = request.form.get('warranty_duration_years', '0')
                    months_str = request.form.get('warranty_duration_months', '0')
                    days_str = request.form.get('warranty_duration_days', '0')
                    
                    warranty_duration_years = int(years_str) if years_str else 0
                    warranty_duration_months = int(months_str) if months_str else 0
                    warranty_duration_days = int(days_str) if days_str else 0

                    if warranty_duration_years < 0 or warranty_duration_months < 0 or warranty_duration_days < 0:
                        return jsonify({"error": "Warranty duration components cannot be negative."}), 400
                    if warranty_duration_years == 0 and warranty_duration_months == 0 and warranty_duration_days == 0:
                        return jsonify({"error": "Warranty duration must be specified for non-lifetime warranties."}), 400
                    if warranty_duration_years > 999:
                         return jsonify({"error": "Warranty years must be 999 or less"}), 400

                except ValueError:
                    return jsonify({"error": "Warranty duration components must be valid numbers."}), 400
        
        # Process the data
        product_name = request.form['product_name']
        purchase_date_str = request.form['purchase_date']
        serial_numbers = request.form.getlist('serial_numbers[]')
        product_url = request.form.get('product_url', '')
        user_id = request.user['id']
        notes = request.form.get('notes', '')
        vendor = request.form.get('vendor', None)
        warranty_type = request.form.get('warranty_type', None)
        model_number = request.form.get('model_number', None)
        
        # Get URL fields for documents and validate HTTP(S) schemes (M-01)
        invoice_url = request.form.get('invoice_url', None)
        manual_url = request.form.get('manual_url', None)
        other_document_url = request.form.get('other_document_url', None)
        try:
            product_url = _validate_http_url(product_url, "Product URL")
            invoice_url = _validate_http_url(invoice_url, "Invoice URL")
            manual_url = _validate_http_url(manual_url, "Manual URL")
            other_document_url = _validate_http_url(other_document_url, "Other document URL")
        except ValueError as url_err:
            return jsonify({"error": str(url_err)}), 400
        
        # Get tag IDs if provided
        tag_ids = []
        if request.form.get('tag_ids'):
            try:
                tag_ids = json.loads(request.form.get('tag_ids'))
                if not isinstance(tag_ids, list):
                    return jsonify({"error": "tag_ids must be a JSON array"}), 400
            except json.JSONDecodeError:
                return jsonify({"error": "tag_ids must be a valid JSON array"}), 400
        
        # Handle purchase price (optional)
        purchase_price = None
        if request.form.get('purchase_price'):
            try:
                purchase_price = float(request.form.get('purchase_price'))
                if purchase_price < 0:
                    return jsonify({"error": "Purchase price cannot be negative"}), 400
            except ValueError:
                return jsonify({"error": "Purchase price must be a valid number"}), 400
        
        # Handle currency (optional, defaults to the user's preferred currency)
        currency = request.form.get('currency') or get_user_currency_code(user_id)
        # Validate currency code
        valid_currencies = [
            'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'KRW', 'CHF', 'CAD', 'AUD',
            'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'RUB',
            'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'VES', 'ZAR', 'EGP', 'NGN',
            'KES', 'GHS', 'MAD', 'TND', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR',
            'JOD', 'LBP', 'ILS', 'TRY', 'IRR', 'PKR', 'BDT', 'LKR', 'NPR', 'BTN',
            'MMK', 'THB', 'VND', 'LAK', 'KHR', 'MYR', 'SGD', 'IDR', 'PHP', 'TWD',
            'HKD', 'MOP', 'KPW', 'MNT', 'KZT', 'UZS', 'TJS', 'KGS', 'TMT', 'AFN',
            'AMD', 'AZN', 'GEL', 'MDL', 'UAH', 'BYN', 'RSD', 'MKD', 'ALL', 'BAM',
            'ISK', 'FJD', 'PGK', 'SBD', 'TOP', 'VUV', 'WST', 'XPF', 'NZD'
        ]
        if currency not in valid_currencies:
            return jsonify({"error": f"Invalid currency code: {currency}"}), 400
        
        try:
            purchase_date = datetime.strptime(purchase_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
            
        # Calculate expiration date only if not lifetime
        if not is_lifetime:
            # Check if exact expiration date is provided
            exact_expiration_date = request.form.get('exact_expiration_date')
            
            if exact_expiration_date:
                # Use exact expiration date provided by user
                try:
                    expiration_date = datetime.strptime(exact_expiration_date, '%Y-%m-%d').date()
                    logger.info(f"Using exact expiration date: {expiration_date}")
                except ValueError:
                    return jsonify({"error": "Invalid exact expiration date format. Use YYYY-MM-DD"}), 400
            elif warranty_duration_years > 0 or warranty_duration_months > 0 or warranty_duration_days > 0:
                # Use duration-based calculation
                try:
                    expiration_date = purchase_date + relativedelta(
                        years=warranty_duration_years,
                        months=warranty_duration_months,
                        days=warranty_duration_days
                    )
                    logger.info(f"Calculated expiration date: {expiration_date} from years={warranty_duration_years}, months={warranty_duration_months}, days={warranty_duration_days}")
                except Exception as calc_err:
                    logger.error(f"Error calculating expiration date: {calc_err}")
                    return jsonify({"error": "Failed to calculate expiration date from duration components"}), 500
            else:
                # Neither exact date nor duration provided
                return jsonify({"error": "Either exact expiration date or warranty duration must be specified for non-lifetime warranties."}), 400

        # Expiration date cannot precede the purchase date
        if expiration_date is not None and expiration_date < purchase_date:
            return jsonify({"error": "Expiration date cannot be before purchase date",
                            "code": "expiration_before_purchase"}), 400

        # Handle Paperless-ngx document IDs if provided (check before file uploads)
        paperless_invoice_id = request.form.get('paperless_invoice_id')
        paperless_manual_id = request.form.get('paperless_manual_id')
        paperless_photo_id = request.form.get('paperless_photo_id')
        paperless_other_id = request.form.get('paperless_other_id')

        # Convert empty strings to None for database insertion
        paperless_invoice_id = int(paperless_invoice_id) if paperless_invoice_id and paperless_invoice_id.strip() else None
        paperless_manual_id = int(paperless_manual_id) if paperless_manual_id and paperless_manual_id.strip() else None
        paperless_photo_id = int(paperless_photo_id) if paperless_photo_id and paperless_photo_id.strip() else None
        paperless_other_id = int(paperless_other_id) if paperless_other_id and paperless_other_id.strip() else None

        # A Paperless document may only be linked by the user who owns it in
        # Warracker; naming another user's document id used to be enough to
        # download it afterwards (GHSA-fv62-3hrm-gf83). Unclaimed documents
        # are claimed by the first user who links them.
        _paperless_ids = [pid for pid in (paperless_invoice_id, paperless_manual_id,
                                          paperless_photo_id, paperless_other_id) if pid is not None]
        if _paperless_ids:
            _vconn = get_db_connection()
            try:
                with _vconn.cursor() as _vcur:
                    for _pid in _paperless_ids:
                        if not user_can_link_paperless_document(
                                _vcur, user_id, request.user.get('is_admin', False), _pid):
                            return jsonify({"error": "You are not authorized to link one of the specified Paperless documents",
                                            "code": "paperless_document_not_owned"}), 403
            finally:
                release_db_connection(_vconn)

        # Handle invoice file upload (only if not stored in Paperless-ngx)
        db_invoice_path = None
        if not paperless_invoice_id and 'invoice' in request.files:
            invoice = request.files['invoice']
            if invoice.filename != '':
                if not allowed_file(invoice.filename):
                    return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
                    
                filename = unique_upload_filename(invoice.filename)
                invoice_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                
                logger.info(f"Attempting to save invoice to: {invoice_path}")
                try:
                    invoice.save(invoice_path)
                    db_invoice_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved invoice: {db_invoice_path}")
                except Exception as e:
                    logger.error(f"Error saving invoice {filename} to {invoice_path}: {e}")
                    # Optionally, decide if you want to return an error here or continue
                    return jsonify({"error": "Failed to save invoice."}), 500
        elif paperless_invoice_id:
            logger.info(f"Invoice stored in Paperless-ngx with ID: {paperless_invoice_id}")
        
        # Handle manual file upload (only if not stored in Paperless-ngx)
        db_manual_path = None
        if not paperless_manual_id and 'manual' in request.files:
            manual = request.files['manual']
            if manual.filename != '':
                if not allowed_file(manual.filename):
                    return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
                    
                filename = unique_upload_filename(manual.filename, "manual_")
                manual_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                logger.info(f"Attempting to save manual to: {manual_path}")
                try:
                    manual.save(manual_path)
                    db_manual_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved manual: {db_manual_path}")
                except Exception as e:
                    logger.error(f"Error saving manual {filename} to {manual_path}: {e}")
                    return jsonify({"error": "Failed to save manual."}), 500
        elif paperless_manual_id:
            logger.info(f"Manual stored in Paperless-ngx with ID: {paperless_manual_id}")
        
        # Handle other_document file upload (only if not stored in Paperless-ngx)
        db_other_document_path = None
        if not paperless_other_id and 'other_document' in request.files:
            other_document = request.files['other_document']
            if other_document.filename != '':
                if not allowed_file(other_document.filename):
                    return jsonify({"error": "File type not allowed for other document. Use PDF, PNG, JPG, JPEG, ZIP, or RAR"}), 400
                    
                filename = unique_upload_filename(other_document.filename, "other_")
                other_document_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                logger.info(f"Attempting to save other_document to: {other_document_path_on_disk}")
                try:
                    other_document.save(other_document_path_on_disk)
                    db_other_document_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved other_document: {db_other_document_path}")
                except Exception as e:
                    logger.error(f"Error saving other_document {filename} to {other_document_path_on_disk}: {e}")
                    return jsonify({"error": "Failed to save other_document."}), 500
        elif paperless_other_id:
            logger.info(f"Other document stored in Paperless-ngx with ID: {paperless_other_id}")

        # Handle product photo file upload (only if not stored in Paperless-ngx)
        db_product_photo_path = None
        if not paperless_photo_id and 'product_photo' in request.files:
            product_photo = request.files['product_photo']
            if product_photo.filename != '':
                # Check if it's an image file
                if not (product_photo.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif'))):
                    return jsonify({"error": "Product photo must be an image file (PNG, JPG, JPEG, WEBP, GIF)"}), 400
                    
                filename = unique_upload_filename(product_photo.filename, "photo_")
                product_photo_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                logger.info(f"Attempting to save product_photo to: {product_photo_path_on_disk}")
                try:
                    product_photo.save(product_photo_path_on_disk)
                    db_product_photo_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved product_photo: {db_product_photo_path}")
                except Exception as e:
                    logger.error(f"Error saving product_photo {filename} to {product_photo_path_on_disk}: {e}")
                    return jsonify({"error": "Failed to save product_photo."}), 500
        elif paperless_photo_id:
            logger.info(f"Product photo stored in Paperless-ngx with ID: {paperless_photo_id}")

        # Product photo by URL (#207): only when no file was uploaded and the
        # photo is not coming from Paperless. The image is downloaded once and
        # stored like an upload, so every later view uses the normal path.
        product_photo_url = (request.form.get('product_photo_url') or '').strip()
        if not db_product_photo_path and not paperless_photo_id and product_photo_url:
            try:
                photo_bytes, photo_ext = download_product_photo(product_photo_url)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400
            filename = unique_upload_filename(f"downloaded{photo_ext}", "photo_")
            product_photo_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            try:
                with open(product_photo_path_on_disk, 'wb') as fh:
                    fh.write(photo_bytes)
                db_product_photo_path = os.path.join('uploads', filename)
                logger.info(f"Successfully saved product_photo from URL: {db_product_photo_path}")
            except Exception as e:
                logger.error(f"Error saving product_photo from URL {filename}: {e}")
                return jsonify({"error": "Failed to save product_photo."}), 500



        # Save to database
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Insert warranty
            cur.execute('''
                INSERT INTO warranties (
                    product_name, purchase_date, expiration_date, 
                    invoice_path, manual_path, other_document_path, product_url, purchase_price, user_id, is_lifetime, notes, vendor, warranty_type,
                    warranty_duration_years, warranty_duration_months, warranty_duration_days, product_photo_path, currency,
                    paperless_invoice_id, paperless_manual_id, paperless_photo_id, paperless_other_id,
                    invoice_url, manual_url, other_document_url, model_number
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            ''', (
                product_name, purchase_date, expiration_date,
                db_invoice_path, db_manual_path, db_other_document_path, product_url, purchase_price, user_id, is_lifetime, notes, vendor, warranty_type,
                warranty_duration_years, warranty_duration_months, warranty_duration_days, db_product_photo_path, currency,
                paperless_invoice_id, paperless_manual_id, paperless_photo_id, paperless_other_id,
                invoice_url, manual_url, other_document_url, model_number
            ))
            warranty_id = cur.fetchone()[0]

            # Claim ownership of any Paperless documents linked above
            for _pid in (paperless_invoice_id, paperless_manual_id,
                         paperless_photo_id, paperless_other_id):
                if _pid is not None:
                    record_paperless_document_owner(cur, _pid, user_id)

            # Insert serial numbers
            if serial_numbers:
                for serial_number in serial_numbers:
                    if serial_number.strip():  # Only insert non-empty serial numbers
                        cur.execute('''
                            INSERT INTO serial_numbers (warranty_id, serial_number)
                            VALUES (%s, %s)
                        ''', (warranty_id, serial_number.strip()))
            
            # Insert tags if provided
            if tag_ids:
                for tag_id in tag_ids:
                    # Verify tag exists and belongs to this user (FILE-03):
                    # linking another user's tag by ID disclosed its name
                    # and color. The tag picker only ever shows own tags.
                    cur.execute('SELECT id FROM tags WHERE id = %s AND user_id = %s', (tag_id, user_id))
                    if cur.fetchone():
                        cur.execute('''
                            INSERT INTO warranty_tags (warranty_id, tag_id)
                            VALUES (%s, %s)
                        ''', (warranty_id, tag_id))
                    else:
                        logger.warning(f"Skipping non-existent or foreign tag ID: {tag_id}")
            
            conn.commit()
            
        return jsonify({
            'message': 'Warranty added successfully',
            'id': warranty_id
        }), 201
        
    except RequestEntityTooLarge:
        # Let the app-wide 413 handler produce the JSON response
        raise
    except Exception as e:
        logger.error(f"Error adding warranty: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to add warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/<int:warranty_id>/archive', methods=['PATCH'])
@token_required
def toggle_archive_warranty(warranty_id):
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)

        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be valid JSON"}), 400
        archived_flag = data.get('archived')
        if archived_flag is None:
            return jsonify({"error": "Missing 'archived' boolean in request body"}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Ensure warranty exists and belongs to user unless admin
            if is_admin:
                cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', (warranty_id, user_id))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Warranty not found or permission denied"}), 404

            if archived_flag is True:
                cur.execute('UPDATE warranties SET archived_at = NOW(), updated_at = NOW() WHERE id = %s', (warranty_id,))
            else:
                cur.execute('UPDATE warranties SET archived_at = NULL, updated_at = NOW() WHERE id = %s', (warranty_id,))

            conn.commit()

        return jsonify({"message": "Archive status updated", "archived": bool(archived_flag)})
    except Exception as e:
        current_app.logger.error(f"Error toggling archive status: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to update archive status"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>/void', methods=['PATCH'])
@token_required
def toggle_void_warranty(warranty_id):
    """Manually terminate (void) or restore a warranty (issue #250).

    Voiding marks the warranty inactive without deleting it or changing its
    expiration date. Voided warranties stay in the list with a Void status,
    and are excluded from totals, active counts, and expiry notifications.
    """
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)

        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be valid JSON"}), 400
        voided_flag = data.get('voided')
        if voided_flag is None:
            return jsonify({"error": "Missing 'voided' boolean in request body"}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Ensure warranty exists and belongs to user unless admin
            if is_admin:
                cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', (warranty_id, user_id))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Warranty not found or permission denied"}), 404

            if voided_flag is True:
                cur.execute('UPDATE warranties SET voided_at = NOW(), updated_at = NOW() WHERE id = %s', (warranty_id,))
            else:
                cur.execute('UPDATE warranties SET voided_at = NULL, updated_at = NOW() WHERE id = %s', (warranty_id,))

            conn.commit()

        return jsonify({"message": "Void status updated", "voided": bool(voided_flag)})
    except Exception as e:
        current_app.logger.error(f"Error toggling void status: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to update void status"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>', methods=['DELETE'])
@token_required
def delete_warranty(warranty_id):
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user['is_admin']
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if warranty exists and belongs to the user
            if is_admin:
                cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', (warranty_id, user_id))
                
            warranty = cur.fetchone()
            
            if not warranty:
                return jsonify({"error": "Warranty not found or you don't have permission to delete it"}), 404
            
            # First get the file paths to delete the files
            cur.execute('SELECT invoice_path, manual_path, other_document_path, product_photo_path FROM warranties WHERE id = %s', (warranty_id,))
            result = cur.fetchone()
            
            invoice_path = result[0]
            manual_path = result[1]
            other_document_path = result[2]
            product_photo_path = result[3]

            # Claim document files (issue #148) — the rows cascade on delete,
            # so collect their paths first
            cur.execute('''
                SELECT d.file_path FROM claim_documents d
                JOIN warranty_claims c ON d.claim_id = c.id
                WHERE c.warranty_id = %s AND d.file_path IS NOT NULL
            ''', (warranty_id,))
            claim_document_paths = [row[0] for row in cur.fetchall()]

            # Delete the warranty from database
            cur.execute('DELETE FROM warranties WHERE id = %s', (warranty_id,))
            deleted_rows = cur.rowcount
            conn.commit()
            
            # Delete the invoice file if it exists
            if invoice_path:
                _delete_stored_file(cur, invoice_path)
            
            # Delete the manual file if it exists
            if manual_path:
                _delete_stored_file(cur, manual_path)
            
            # Delete the other_document file if it exists
            if other_document_path:
                _delete_stored_file(cur, other_document_path)
            
            # Delete the product photo file if it exists
            if product_photo_path:
                _delete_stored_file(cur, product_photo_path)

            # Delete claim document files (rows already cascaded)
            for claim_doc_path in claim_document_paths:
                _delete_stored_file(cur, claim_doc_path)

            return jsonify({"message": "Warranty deleted successfully"}), 200
            
    except Exception as e:
        logger.error(f"Error deleting warranty: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to delete warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/<int:warranty_id>', methods=['PUT'])
@token_required
def update_warranty(warranty_id):
    # --- Log function entry ---
    logger.info(f"Entering update_warranty function for ID: {warranty_id}") 
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user['is_admin']
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if warranty exists and belongs to the user
            if is_admin:
                cur.execute('SELECT id, currency, expiration_date, is_lifetime FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute('SELECT id, currency, expiration_date, is_lifetime FROM warranties WHERE id = %s AND user_id = %s', (warranty_id, user_id))
            warranty = cur.fetchone()
            if not warranty:
                return jsonify({"error": "Warranty not found or you don't have permission to update it"}), 404
            existing_currency = warranty[1] if len(warranty) > 1 else None
            existing_expiration_date = warranty[2] if len(warranty) > 2 else None
            existing_is_lifetime = bool(warranty[3]) if len(warranty) > 3 else False

            # --- PATCH: Support JSON-only notes update ---
            if request.is_json and 'notes' in request.json and len(request.json) == 1:
                notes = request.json.get('notes', None)
                cur.execute("UPDATE warranties SET notes = %s, updated_at = NOW() WHERE id = %s", (notes, warranty_id))
                conn.commit()
                return jsonify({"message": "Notes updated successfully"}), 200

            # --- Otherwise, continue with the original (form-based) update logic ---
            # Validate input data similar to the add_warranty route
            if not request.form.get('product_name', '').strip():
                return jsonify({"error": "Product name is required"}), 400
            if len(request.form.get('product_name')) > 255:
                return jsonify({"error": "Product name must be 255 characters or less",
                                "code": "product_name_too_long"}), 400
            for serial_number in request.form.getlist('serial_numbers[]'):
                if len(serial_number) > 255:
                    return jsonify({"error": "Serial number must be 255 characters or less",
                                    "code": "serial_number_too_long"}), 400
            raw_expiry_reason = request.form.get('expiry_change_reason')
            expiry_change_reason = raw_expiry_reason.strip() if raw_expiry_reason else None
            if expiry_change_reason and len(expiry_change_reason) > 255:
                return jsonify({"error": "Expiry change reason must be 255 characters or less",
                                "code": "expiry_change_reason_too_long"}), 400
            if not request.form.get('purchase_date'):
                return jsonify({"error": "Purchase date is required"}), 400
            logger.info(f"Received update request for warranty {warranty_id}")
            logger.info(f"Received update request for warranty {warranty_id}")
            is_lifetime = request.form.get('is_lifetime', 'false').lower() == 'true'
            logger.info(f"Parsed is_lifetime as: {is_lifetime}")
            purchase_date_str = request.form['purchase_date']
            try:
                purchase_date = datetime.strptime(purchase_date_str, '%Y-%m-%d').date() # Use .date()
            except ValueError:
                return jsonify({"error": "Invalid date format for purchase date. Use YYYY-MM-DD"}), 400

            expiration_date = None
            warranty_duration_years = 0
            warranty_duration_months = 0
            warranty_duration_days = 0

            if not is_lifetime:
                # Check if exact expiration date is provided
                exact_expiration_date = request.form.get('exact_expiration_date')
                
                if exact_expiration_date:
                    # Use exact expiration date provided by user
                    try:
                        expiration_date = datetime.strptime(exact_expiration_date, '%Y-%m-%d').date()
                        logger.info(f"Using exact expiration date: {expiration_date}")
                        # Set duration fields to 0 when using exact date
                        warranty_duration_years = 0
                        warranty_duration_months = 0
                        warranty_duration_days = 0
                    except ValueError:
                        return jsonify({"error": "Invalid exact expiration date format. Use YYYY-MM-DD"}), 400
                else:
                    # Use duration-based calculation (existing logic)
                    try:
                        # Handle empty strings explicitly, default to 0
                        years_str = request.form.get('warranty_duration_years', '0')
                        months_str = request.form.get('warranty_duration_months', '0')
                        days_str = request.form.get('warranty_duration_days', '0')
                        
                        warranty_duration_years = int(years_str) if years_str else 0
                        warranty_duration_months = int(months_str) if months_str else 0
                        warranty_duration_days = int(days_str) if days_str else 0

                        if warranty_duration_years < 0 or warranty_duration_months < 0 or warranty_duration_days < 0:
                            return jsonify({"error": "Warranty duration components cannot be negative."}), 400
                        if warranty_duration_years == 0 and warranty_duration_months == 0 and warranty_duration_days == 0:
                            return jsonify({"error": "Warranty duration must be specified for non-lifetime warranties."}), 400
                        if warranty_duration_years > 999:
                             return jsonify({"error": "Warranty years must be 999 or less"}), 400

                    except ValueError:
                        return jsonify({"error": "Warranty duration components must be valid numbers."}), 400
                
                # Calculate expiration date based on duration only if exact date wasn't provided
                if not exact_expiration_date:
                    if warranty_duration_years > 0 or warranty_duration_months > 0 or warranty_duration_days > 0:
                        try:
                            expiration_date = purchase_date + relativedelta(
                                years=warranty_duration_years,
                                months=warranty_duration_months,
                                days=warranty_duration_days
                            )
                            logger.info(f"Calculated expiration date: {expiration_date} from years={warranty_duration_years}, months={warranty_duration_months}, days={warranty_duration_days}")
                        except Exception as calc_err:
                            logger.error(f"Error calculating expiration date: {calc_err}")
                            return jsonify({"error": "Failed to calculate expiration date from duration components"}), 500
                    else:
                        return jsonify({"error": "Either exact expiration date or warranty duration must be specified for non-lifetime warranties."}), 400

            # Expiration date cannot precede the purchase date
            if expiration_date is not None and expiration_date < purchase_date:
                return jsonify({"error": "Expiration date cannot be before purchase date",
                                "code": "expiration_before_purchase"}), 400

            logger.info(f"Calculated values: Y={warranty_duration_years}, M={warranty_duration_months}, D={warranty_duration_days}, expiration_date={expiration_date}")
            product_name = request.form['product_name']
            serial_numbers = request.form.getlist('serial_numbers[]') # Ensure correct parsing for lists
            product_url = request.form.get('product_url', '')
            notes = request.form.get('notes', None)
            vendor = request.form.get('vendor', None)
            warranty_type = request.form.get('warranty_type', None)
            model_number = request.form.get('model_number', None)
            
            # Get URL fields for documents and validate HTTP(S) schemes (M-01)
            invoice_url = request.form.get('invoice_url', None)
            manual_url = request.form.get('manual_url', None)
            other_document_url = request.form.get('other_document_url', None)
            try:
                product_url = _validate_http_url(product_url, "Product URL")
                invoice_url = _validate_http_url(invoice_url, "Invoice URL")
                manual_url = _validate_http_url(manual_url, "Manual URL")
                other_document_url = _validate_http_url(other_document_url, "Other document URL")
            except ValueError as url_err:
                return jsonify({"error": str(url_err)}), 400
            tag_ids = []
            if request.form.get('tag_ids'):
                try:
                    tag_ids = json.loads(request.form.get('tag_ids'))
                    if not isinstance(tag_ids, list):
                        return jsonify({"error": "tag_ids must be a JSON array"}), 400
                except json.JSONDecodeError:
                    return jsonify({"error": "tag_ids must be a valid JSON array"}), 400
            purchase_price = None
            if request.form.get('purchase_price'):
                try:
                    purchase_price = float(request.form.get('purchase_price'))
                    if purchase_price < 0:
                        return jsonify({"error": "Purchase price cannot be negative"}), 400
                except ValueError:
                    return jsonify({"error": "Purchase price must be a valid number"}), 400
            
            # Handle currency (optional, keep existing, else user's preferred currency)
            currency = request.form.get('currency') or existing_currency or get_user_currency_code(user_id)
            # Validate currency code
            valid_currencies = [
                'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'KRW', 'CHF', 'CAD', 'AUD',
                'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'RUB',
                'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'VES', 'ZAR', 'EGP', 'NGN',
                'KES', 'GHS', 'MAD', 'TND', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR',
                'JOD', 'LBP', 'ILS', 'TRY', 'IRR', 'PKR', 'BDT', 'LKR', 'NPR', 'BTN',
                'MMK', 'THB', 'VND', 'LAK', 'KHR', 'MYR', 'SGD', 'IDR', 'PHP', 'TWD',
                'HKD', 'MOP', 'KPW', 'MNT', 'KZT', 'UZS', 'TJS', 'KGS', 'TMT', 'AFN',
                'AMD', 'AZN', 'GEL', 'MDL', 'UAH', 'BYN', 'RSD', 'MKD', 'ALL', 'BAM',
                'ISK', 'FJD', 'PGK', 'SBD', 'TOP', 'VUV', 'WST', 'XPF', 'NZD'
            ]
            if currency not in valid_currencies:
                return jsonify({"error": f"Invalid currency code: {currency}"}), 400

            # Handle Paperless-ngx document IDs
            paperless_invoice_id = request.form.get('paperless_invoice_id')
            paperless_manual_id = request.form.get('paperless_manual_id')
            paperless_photo_id = request.form.get('paperless_photo_id')
            paperless_other_id = request.form.get('paperless_other_id')

            logger.info(f"[UPDATE] Received Paperless IDs: invoice={paperless_invoice_id}, manual={paperless_manual_id}, photo={paperless_photo_id}, other={paperless_other_id}")

            # Convert to integers if provided, otherwise None
            paperless_invoice_id = int(paperless_invoice_id) if paperless_invoice_id and paperless_invoice_id.strip() else None
            paperless_manual_id = int(paperless_manual_id) if paperless_manual_id and paperless_manual_id.strip() else None
            paperless_photo_id = int(paperless_photo_id) if paperless_photo_id and paperless_photo_id.strip() else None
            paperless_other_id = int(paperless_other_id) if paperless_other_id and paperless_other_id.strip() else None

            logger.info(f"[UPDATE] Converted Paperless IDs: invoice={paperless_invoice_id}, manual={paperless_manual_id}, photo={paperless_photo_id}, other={paperless_other_id}")

            # Validate uploaded file extensions up front before touching disk or
            # running outbound photo URL downloads.
            if not paperless_invoice_id and 'invoice' in request.files and request.files['invoice'].filename != '':
                if not allowed_file(request.files['invoice'].filename):
                    return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
            if not paperless_manual_id and 'manual' in request.files and request.files['manual'].filename != '':
                if not allowed_file(request.files['manual'].filename):
                    return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
            if not paperless_other_id and 'other_document' in request.files and request.files['other_document'].filename != '':
                if not allowed_file(request.files['other_document'].filename):
                    return jsonify({"error": "File type not allowed for other document. Use PDF, PNG, JPG, JPEG, ZIP, or RAR"}), 400
            has_uploaded_photo = (
                not paperless_photo_id
                and 'product_photo' in request.files
                and request.files['product_photo'].filename != ''
            )
            if has_uploaded_photo:
                if not (request.files['product_photo'].filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif'))):
                    return jsonify({"error": "Product photo must be an image file (PNG, JPG, JPEG, WEBP, GIF)"}), 400

            # Same linking rule as warranty creation: a Paperless document
            # owned by another user cannot be linked (GHSA-fv62-3hrm-gf83).
            # Ownership of newly linked documents is recorded just before
            # the final commit below.
            for _pid in (paperless_invoice_id, paperless_manual_id,
                         paperless_photo_id, paperless_other_id):
                if _pid is not None and not user_can_link_paperless_document(cur, user_id, is_admin, _pid):
                    return jsonify({"error": "You are not authorized to link one of the specified Paperless documents",
                                    "code": "paperless_document_not_owned"}), 403

            # Fetch existing file paths while holding the initial connection.
            cur.execute(
                'SELECT invoice_path, manual_path, other_document_path, product_photo_path '
                'FROM warranties WHERE id = %s',
                (warranty_id,),
            )
            old_paths_row = cur.fetchone() or (None, None, None, None)
            old_invoice_path, old_manual_path, old_other_document_path, old_product_photo_path = old_paths_row

        # Product photo by URL (#207): download BEFORE holding a pooled DB
        # connection open for the update transaction so slow hosts cannot
        # starve the connection pool.
        product_photo_url = (request.form.get('product_photo_url') or '').strip()
        downloaded_photo = None
        if (not has_uploaded_photo and not paperless_photo_id and product_photo_url
                and request.form.get('delete_product_photo', 'false').lower() != 'true'):
            release_db_connection(conn)
            conn = None
            try:
                downloaded_photo = download_product_photo(product_photo_url)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400
            conn = get_db_connection()

        newly_saved_files = []
        deferred_deletes = []

        def _cleanup_new_files():
            for saved_path in newly_saved_files:
                try:
                    if os.path.exists(saved_path):
                        os.remove(saved_path)
                except OSError as cleanup_err:
                    logger.error(f"Error cleaning up newly saved file {saved_path}: {cleanup_err}")

        try:
            with conn.cursor() as cur:
                # File handling for invoice
                db_invoice_path = None
                if not paperless_invoice_id and 'invoice' in request.files:
                    invoice = request.files['invoice']
                    if invoice.filename != '':
                        if old_invoice_path:
                            deferred_deletes.append((old_invoice_path, ('warranties', 'invoice_path', warranty_id)))
                        filename = unique_upload_filename(invoice.filename)
                        invoice_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                        logger.info(f"Attempting to save updated invoice to: {invoice_path}")
                        try:
                            invoice.save(invoice_path)
                            newly_saved_files.append(invoice_path)
                            db_invoice_path = os.path.join('uploads', filename)
                            logger.info(f"Successfully saved updated invoice: {db_invoice_path}")
                        except Exception as e:
                            logger.error(f"Error saving updated invoice {filename} to {invoice_path}: {e}")
                            _cleanup_new_files()
                            return jsonify({"error": "Failed to save updated invoice"}), 500
                elif paperless_invoice_id:
                    logger.info(f"Invoice updated to Paperless-ngx with ID: {paperless_invoice_id}")
                    if old_invoice_path:
                        deferred_deletes.append((old_invoice_path, ('warranties', 'invoice_path', warranty_id)))
                    db_invoice_path = None
                elif request.form.get('delete_invoice', 'false').lower() == 'true':
                    if old_invoice_path:
                        deferred_deletes.append((old_invoice_path, ('warranties', 'invoice_path', warranty_id)))
                    db_invoice_path = None

                # File handling for manual
                db_manual_path = None
                if not paperless_manual_id and 'manual' in request.files:
                    manual = request.files['manual']
                    if manual.filename != '':
                        if old_manual_path:
                            deferred_deletes.append((old_manual_path, ('warranties', 'manual_path', warranty_id)))
                        filename = unique_upload_filename(manual.filename, "manual_")
                        manual_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                        logger.info(f"Attempting to save updated manual to: {manual_path}")
                        try:
                            manual.save(manual_path)
                            newly_saved_files.append(manual_path)
                            db_manual_path = os.path.join('uploads', filename)
                            logger.info(f"Successfully saved updated manual: {db_manual_path}")
                        except Exception as e:
                            logger.error(f"Error saving updated manual {filename} to {manual_path}: {e}")
                            _cleanup_new_files()
                            return jsonify({"error": "Failed to save updated manual"}), 500
                elif paperless_manual_id:
                    logger.info(f"Manual updated to Paperless-ngx with ID: {paperless_manual_id}")
                    if old_manual_path:
                        deferred_deletes.append((old_manual_path, ('warranties', 'manual_path', warranty_id)))
                    db_manual_path = None
                elif request.form.get('delete_manual', 'false').lower() == 'true':
                    if old_manual_path:
                        deferred_deletes.append((old_manual_path, ('warranties', 'manual_path', warranty_id)))
                    db_manual_path = None

                # File handling for other document
                db_other_document_path = None
                if not paperless_other_id and 'other_document' in request.files:
                    other_document = request.files['other_document']
                    if other_document.filename != '':
                        if old_other_document_path:
                            deferred_deletes.append((old_other_document_path, ('warranties', 'other_document_path', warranty_id)))
                        filename = unique_upload_filename(other_document.filename, "other_")
                        other_document_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                        logger.info(f"Attempting to save updated other_document to: {other_document_path_on_disk}")
                        try:
                            other_document.save(other_document_path_on_disk)
                            newly_saved_files.append(other_document_path_on_disk)
                            db_other_document_path = os.path.join('uploads', filename)
                            logger.info(f"Successfully saved updated other_document: {db_other_document_path}")
                        except Exception as e:
                            logger.error(f"Error saving updated other_document {filename} to {other_document_path_on_disk}: {e}")
                            _cleanup_new_files()
                            return jsonify({"error": "Failed to save updated other document"}), 500
                elif paperless_other_id:
                    logger.info(f"Other document updated to Paperless-ngx with ID: {paperless_other_id}")
                    if old_other_document_path:
                        deferred_deletes.append((old_other_document_path, ('warranties', 'other_document_path', warranty_id)))
                    db_other_document_path = None
                elif request.form.get('delete_other_document', 'false').lower() == 'true':
                    if old_other_document_path:
                        deferred_deletes.append((old_other_document_path, ('warranties', 'other_document_path', warranty_id)))
                    db_other_document_path = None

                # Handle product photo file upload (only if not stored in Paperless-ngx)
                db_product_photo_path = None
                if has_uploaded_photo:
                    product_photo = request.files['product_photo']
                    if old_product_photo_path:
                        deferred_deletes.append((old_product_photo_path, ('warranties', 'product_photo_path', warranty_id)))
                    filename = unique_upload_filename(product_photo.filename, "photo_")
                    product_photo_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    logger.info(f"Attempting to save updated product_photo to: {product_photo_path_on_disk}")
                    try:
                        product_photo.save(product_photo_path_on_disk)
                        newly_saved_files.append(product_photo_path_on_disk)
                        db_product_photo_path = os.path.join('uploads', filename)
                        logger.info(f"Successfully saved updated product_photo: {db_product_photo_path}")
                    except Exception as e:
                        logger.error(f"Error saving updated product_photo {filename} to {product_photo_path_on_disk}: {e}")
                        _cleanup_new_files()
                        return jsonify({"error": "Failed to save updated product photo"}), 500
                elif paperless_photo_id:
                    logger.info(f"Product photo updated to Paperless-ngx with ID: {paperless_photo_id}")
                    if old_product_photo_path:
                        deferred_deletes.append((old_product_photo_path, ('warranties', 'product_photo_path', warranty_id)))
                    db_product_photo_path = None
                elif request.form.get('delete_product_photo', 'false').lower() == 'true':
                    if old_product_photo_path:
                        deferred_deletes.append((old_product_photo_path, ('warranties', 'product_photo_path', warranty_id)))
                    db_product_photo_path = None
                elif downloaded_photo is not None:
                    photo_bytes, photo_ext = downloaded_photo
                    if old_product_photo_path:
                        deferred_deletes.append((old_product_photo_path, ('warranties', 'product_photo_path', warranty_id)))
                    filename = unique_upload_filename(f"downloaded{photo_ext}", "photo_")
                    product_photo_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    try:
                        with open(product_photo_path_on_disk, 'wb') as fh:
                            fh.write(photo_bytes)
                        newly_saved_files.append(product_photo_path_on_disk)
                        db_product_photo_path = os.path.join('uploads', filename)
                        logger.info(f"Successfully saved updated product_photo from URL: {db_product_photo_path}")
                    except Exception as e:
                        logger.error(f"Error saving updated product_photo from URL {filename}: {e}")
                        _cleanup_new_files()
                        return jsonify({"error": "Failed to save product photo"}), 500

                # Prepare update parameters
                update_params = {
                    'product_name': product_name,
                    'purchase_date': purchase_date,
                    'is_lifetime': is_lifetime,
                    'warranty_duration_years': warranty_duration_years,
                    'warranty_duration_months': warranty_duration_months,
                    'warranty_duration_days': warranty_duration_days,
                    'expiration_date': expiration_date, # Will be None if lifetime
                    'product_url': product_url,
                    'purchase_price': purchase_price,
                    'vendor': vendor,
                    'warranty_type': warranty_type,
                    'currency': currency,
                    'model_number': model_number
                }
                sql_fields = []
                sql_values = []
                for key, value in update_params.items():
                    sql_fields.append(f"{key} = %s")
                    sql_values.append(value)
                if notes is not None:
                    sql_fields.append("notes = %s")
                    sql_values.append(notes)
                if db_invoice_path is not None:
                    sql_fields.append("invoice_path = %s")
                    sql_values.append(db_invoice_path)
                elif paperless_invoice_id is not None:
                    sql_fields.append("invoice_path = NULL")
                elif 'delete_invoice' in request.form and request.form.get('delete_invoice', 'false').lower() == 'true':
                    sql_fields.append("invoice_path = NULL")
                    sql_fields.append("paperless_invoice_id = NULL")  # Also clear Paperless ID
                if db_manual_path is not None:
                    sql_fields.append("manual_path = %s")
                    sql_values.append(db_manual_path)
                elif paperless_manual_id is not None:
                    sql_fields.append("manual_path = NULL")
                elif 'delete_manual' in request.form and request.form.get('delete_manual', 'false').lower() == 'true':
                    sql_fields.append("manual_path = NULL")
                    sql_fields.append("paperless_manual_id = NULL")  # Also clear Paperless ID
                if db_other_document_path is not None:
                    sql_fields.append("other_document_path = %s")
                    sql_values.append(db_other_document_path)
                elif paperless_other_id is not None:
                    sql_fields.append("other_document_path = NULL")
                elif 'delete_other_document' in request.form and request.form.get('delete_other_document', 'false').lower() == 'true':
                    sql_fields.append("other_document_path = NULL")
                    sql_fields.append("paperless_other_id = NULL")  # Also clear Paperless ID
                if db_product_photo_path is not None:
                    sql_fields.append("product_photo_path = %s")
                    sql_values.append(db_product_photo_path)
                elif paperless_photo_id is not None:
                    sql_fields.append("product_photo_path = NULL")
                elif 'delete_product_photo' in request.form and request.form.get('delete_product_photo', 'false').lower() == 'true':
                    sql_fields.append("product_photo_path = NULL")
                    sql_fields.append("paperless_photo_id = NULL")  # Also clear Paperless ID

                # Handle Paperless-ngx document IDs
                if paperless_invoice_id is not None:
                    sql_fields.append("paperless_invoice_id = %s")
                    sql_values.append(paperless_invoice_id)
                if paperless_manual_id is not None:
                    sql_fields.append("paperless_manual_id = %s")
                    sql_values.append(paperless_manual_id)
                if paperless_photo_id is not None:
                    sql_fields.append("paperless_photo_id = %s")
                    sql_values.append(paperless_photo_id)
                if paperless_other_id is not None:
                    sql_fields.append("paperless_other_id = %s")
                    sql_values.append(paperless_other_id)

                # Handle URL fields for documents (validated above)
                if 'invoice_url' in request.form:
                    sql_fields.append("invoice_url = %s")
                    sql_values.append(invoice_url)
                if 'manual_url' in request.form:
                    sql_fields.append("manual_url = %s")
                    sql_values.append(manual_url)
                if 'other_document_url' in request.form:
                    sql_fields.append("other_document_url = %s")
                    sql_values.append(other_document_url)

                sql_fields.append("updated_at = NOW()") # Use SQL function, no parameter needed
                sql_values.append(warranty_id)
                update_sql = f"UPDATE warranties SET {', '.join(sql_fields)} WHERE id = %s"
                cur.execute(update_sql, sql_values)
                logger.info(f"Updated warranty with SQL: {update_sql}")
                logger.info(f"Parameters: {sql_values}")

                # Record expiration date or lifetime transitions (issue #209)
                new_is_lifetime = bool(is_lifetime)
                expiry_changed = (
                    existing_is_lifetime != new_is_lifetime
                    or (not existing_is_lifetime and not new_is_lifetime and existing_expiration_date != expiration_date)
                )
                if expiry_changed:
                    cur.execute('''
                        INSERT INTO warranty_expiry_history (
                            warranty_id,
                            previous_expiration_date,
                            new_expiration_date,
                            previous_is_lifetime,
                            new_is_lifetime,
                            reason,
                            changed_by_user_id
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ''', (
                        warranty_id,
                        existing_expiration_date,
                        expiration_date,
                        existing_is_lifetime,
                        new_is_lifetime,
                        expiry_change_reason,
                        user_id,
                    ))
                
                # Update serial numbers
                cur.execute('DELETE FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                if serial_numbers:
                    for serial_number in serial_numbers:
                        if serial_number.strip():  # Only insert non-empty serial numbers
                            cur.execute('''
                                INSERT INTO serial_numbers (warranty_id, serial_number)
                                VALUES (%s, %s)
                            ''', (warranty_id, serial_number.strip()))
                
                # Update tags if provided
                if tag_ids is not None:
                    # Remove existing tags
                    cur.execute('DELETE FROM warranty_tags WHERE warranty_id = %s', (warranty_id,))
                    
                    # Add new tags
                    for tag_id in tag_ids:
                        # Verify tag exists and belongs to this user (FILE-03).
                        cur.execute('SELECT id FROM tags WHERE id = %s AND user_id = %s', (tag_id, user_id))
                        if cur.fetchone():
                            cur.execute('''
                                INSERT INTO warranty_tags (warranty_id, tag_id)
                                VALUES (%s, %s)
                            ''', (warranty_id, tag_id))
                        else:
                            logger.warning(f"Skipping non-existent or foreign tag ID: {tag_id}")

                # Claim ownership of any Paperless documents linked above
                for _pid in (paperless_invoice_id, paperless_manual_id,
                             paperless_photo_id, paperless_other_id):
                    if _pid is not None:
                        record_paperless_document_owner(cur, _pid, user_id)

                conn.commit()

                # Delete replaced/removed old files ONLY after the DB commit
                # succeeds, so a failed update never causes permanent file loss.
                if deferred_deletes:
                    for old_path, _exclude in deferred_deletes:
                        _delete_stored_file(cur, old_path)
                    # Close the read-only reference-check transaction before
                    # returning the connection to the pool.
                    conn.rollback()

                return jsonify({"message": "Warranty updated successfully"}), 200
        except Exception:
            _cleanup_new_files()
            raise
            
    except RequestEntityTooLarge:
        # Let the app-wide 413 handler produce the JSON response
        raise
    except Exception as e:
        logger.error(f"Error updating warranty: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to update warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/import', methods=['POST'])
@token_required
def import_warranties():
    if 'csv_file' not in request.files:
        return jsonify({"error": "No CSV file provided"}), 400

    file = request.files['csv_file']

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not file.filename.lower().endswith('.csv'):
        return jsonify({"error": "Invalid file type. Please upload a .csv file"}), 400

    user_id = request.user['id']
    conn = None
    imported_count = 0
    failed_rows = []
    used_name_date_pairs = set()  # Track names used in this import for a given purchase_date
    row_number = 1 # Start from 1 for header

    # Required and optional CSV headers
    REQUIRED_CSV_HEADERS = ['ProductName', 'PurchaseDate']
    OPTIONAL_CSV_HEADERS = [
        'ExpirationDate', 'IsLifetime', 'PurchasePrice', 'SerialNumber', 'ProductURL', 'Tags', 'Vendor', 'WarrantyType',
        'WarrantyDurationYears', 'WarrantyDurationMonths', 'WarrantyDurationDays',
        'Notes', 'Currency', 'ModelNumber',
    ]

    def _parse_list_field(raw):
        """Parse a Tags/SerialNumber cell. New exports JSON-encode the list
        (so values containing commas round-trip); fall back to comma-split
        for hand-written or legacy files."""
        raw = (raw or '').strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except (ValueError, TypeError):
            pass
        return [x.strip() for x in raw.split(',') if x.strip()]

    try:
        # Read the file content. utf-8-sig strips a BOM, which Excel and
        # other tools commonly prepend (issue #236: the first header then
        # reads as '\ufeffProductName' and fails validation).
        stream = io.StringIO(file.stream.read().decode("utf-8-sig"), newline=None)
        csv_reader = csv.DictReader(stream)

        # Normalize headers: strip whitespace/BOM remnants and match
        # case-insensitively against the documented header names.
        canonical = {h.lower(): h for h in REQUIRED_CSV_HEADERS + OPTIONAL_CSV_HEADERS}
        normalized_fieldnames = []
        for h in (csv_reader.fieldnames or []):
            key = (h or '').strip().lower()
            normalized_fieldnames.append(canonical.get(key, (h or '').strip()))
        csv_reader.fieldnames = normalized_fieldnames

        # Validate headers
        headers = csv_reader.fieldnames
        # Check required headers first
        missing_required = [h for h in REQUIRED_CSV_HEADERS if h not in headers]
        if missing_required:
            return jsonify({"error": f"Missing required CSV columns: {', '.join(missing_required)}"}), 400
        
        # Check for unknown headers
        known_headers = set(REQUIRED_CSV_HEADERS + OPTIONAL_CSV_HEADERS)
        unknown_headers = [h for h in headers if h not in known_headers]
        if unknown_headers:
            logger.warning(f"CSV file contains unknown headers which will be ignored: {', '.join(unknown_headers)}")

        conn = get_db_connection()
        conn.autocommit = False # Start transaction

        with conn.cursor() as cur:
            # CSV-03: next suffix to try per (base name, purchase date).
            # The duplicate search used to restart at (1) for every row,
            # so a same-name import re-checked every earlier suffix for
            # each row: O(n^2) database checks. Resuming where the last
            # row left off makes it O(n); the loop still verifies each
            # candidate against the database, so the renaming result is
            # unchanged.
            next_suffix = {}

            MAX_CSV_IMPORT_ROWS = 10000
            for row in csv_reader:
                row_number += 1 # Increment for each data row (header is row 1)
                if row_number > MAX_CSV_IMPORT_ROWS:
                    conn.rollback()
                    return jsonify({
                        "error": f"CSV import exceeds maximum of {MAX_CSV_IMPORT_ROWS} rows."
                    }), 400
                errors = []
                processed_row = {}

                try:
                    # CSV-01: one savepoint per row. A database error in
                    # a row (for example an over-long serial aborting the
                    # transaction) used to poison the whole import: the
                    # commit at the end rolled everything back while the
                    # API still reported the rows imported before the
                    # failure. Rolling back to the savepoint confines the
                    # failure to its row, so success_count is accurate.
                    cur.execute('SAVEPOINT csv_row')

                    # --- Data Extraction and Basic Validation ---
                    product_name = (row.get('ProductName') or '').strip()
                    purchase_date_str = (row.get('PurchaseDate') or '').strip()
                    is_lifetime_str = (row.get('IsLifetime') or 'false').strip().lower()
                    
                    # New duration fields
                    warranty_duration_years_str = (row.get('WarrantyDurationYears') or '0').strip()
                    warranty_duration_months_str = (row.get('WarrantyDurationMonths') or '0').strip()
                    warranty_duration_days_str = (row.get('WarrantyDurationDays') or '0').strip()
                    
                    purchase_price_str = (row.get('PurchasePrice') or '').strip()
                    serial_numbers_str = (row.get('SerialNumber') or '').strip()
                    product_url = (row.get('ProductURL') or '').strip()
                    tags_str = (row.get('Tags') or '').strip() # Get Tags string
                    vendor = (row.get('Vendor') or '').strip() # Extract Vendor
                    warranty_type = (row.get('WarrantyType') or '').strip() # Extract Warranty Type
                    expiration_date_str = (row.get('ExpirationDate') or '').strip()
                    notes = (row.get('Notes') or '').strip() or None # Extract Notes
                    model_number = (row.get('ModelNumber') or '').strip() or None # Extract Model Number
                    currency_str = (row.get('Currency') or '').strip().upper() # Extract Currency

                    if not product_name:
                        errors.append("ProductName is required.")
                    if len(product_name) > 255:
                        errors.append("ProductName must be 255 characters or less.")
                    if not purchase_date_str:
                        errors.append("PurchaseDate is required.")
                    if product_url:
                        try:
                            product_url = _validate_http_url(product_url, "ProductURL")
                        except ValueError as url_err:
                            errors.append(str(url_err))

                    # --- Type/Format Validation --- 
                    try:
                        purchase_date = parse_unambiguous_date(purchase_date_str)
                    except ValueError as e:
                        errors.append(f"Invalid PurchaseDate format. {e}")
                        purchase_date = None # Set to None to prevent further errors

                    is_lifetime = is_lifetime_str == 'true'
                    expiration_date = None
                    warranty_duration_years = 0
                    warranty_duration_months = 0
                    warranty_duration_days = 0

                    if not is_lifetime:
                        try:
                            warranty_duration_years = int(warranty_duration_years_str) if warranty_duration_years_str else 0
                            warranty_duration_months = int(warranty_duration_months_str) if warranty_duration_months_str else 0
                            warranty_duration_days = int(warranty_duration_days_str) if warranty_duration_days_str else 0

                            if warranty_duration_years < 0 or warranty_duration_months < 0 or warranty_duration_days < 0:
                                errors.append("Warranty duration components cannot be negative.")
                            if (
                                warranty_duration_years == 0 and
                                warranty_duration_months == 0 and
                                warranty_duration_days == 0 and
                                not expiration_date_str
                            ):
                                errors.append("Either duration (Years, Months, Days) or an ExpirationDate is required unless IsLifetime is TRUE.")
                            if warranty_duration_years > 999:
                                errors.append("WarrantyDurationYears must be 999 or less.")
                        except ValueError:
                            errors.append("WarrantyDurationYears, WarrantyDurationMonths, WarrantyDurationDays must be valid numbers.")
                    
                    purchase_price = None
                    if purchase_price_str:
                        try:
                            purchase_price = float(purchase_price_str)
                            if purchase_price < 0:
                                errors.append("PurchasePrice cannot be negative.")
                        except ValueError:
                            errors.append("PurchasePrice must be a valid number.")

                    # Calculate expiration date if valid
                    if not errors and not is_lifetime and purchase_date:
                        expiration_date_str = (row.get('ExpirationDate') or '').strip()
                        # Check if duration is zero and an exact expiration date is provided
                        if (
                            warranty_duration_years == 0 and
                            warranty_duration_months == 0 and
                            warranty_duration_days == 0 and
                            expiration_date_str
                        ):
                            try:
                                expiration_date = parse_unambiguous_date(expiration_date_str)
                                if expiration_date < purchase_date:
                                    errors.append("ExpirationDate cannot be before PurchaseDate.")
                            except ValueError as e:
                                errors.append(f"Invalid ExpirationDate format. {e}")
                        # Existing duration calculation logic
                        elif (
                            warranty_duration_years > 0 or
                            warranty_duration_months > 0 or
                            warranty_duration_days > 0
                        ):
                            try:
                                expiration_date = purchase_date + relativedelta(
                                    years=warranty_duration_years,
                                    months=warranty_duration_months,
                                    days=warranty_duration_days
                                )
                            except Exception as calc_err:
                                logger.error(f"[Import] Error calculating expiration date for row {row_number}: {calc_err}")
                                errors.append("Failed to calculate expiration date from duration components.")
                                expiration_date = None
                        # If no duration and no exact date is provided for a non-lifetime warranty
                        else:
                            errors.append("Either duration (Years, Months, Days) or an ExpirationDate is required unless IsLifetime is TRUE.")

                    # Split serial numbers (JSON list from new exports, comma-separated legacy)
                    serial_numbers = _parse_list_field(serial_numbers_str)

                    # --- Process Tags --- 
                    tag_ids_to_link = []
                    if tags_str:
                        tag_names = _parse_list_field(tags_str)
                        if tag_names:
                            # Find existing tag IDs (case-insensitive) for THIS USER
                            placeholders = ', '.join(['%s'] * len(tag_names))
                            # Include user_id in the lookup
                            sql = f"SELECT id, LOWER(name) FROM tags WHERE LOWER(name) IN ({placeholders}) AND user_id = %s"
                            cur.execute(sql, [name.lower() for name in tag_names] + [user_id]) # Add user_id
                            existing_tags = {name_lower: tag_id for tag_id, name_lower in cur.fetchall()}
                            
                            processed_tag_ids = []
                            tags_to_create = []
                            
                            for name in tag_names:
                                name_lower = name.lower()
                                if name_lower in existing_tags:
                                    processed_tag_ids.append(existing_tags[name_lower])
                                else:
                                    # Avoid queuing the same new tag multiple times within the same row
                                    if name_lower not in [t['name_lower'] for t in tags_to_create]:
                                        tags_to_create.append({'name': name, 'name_lower': name_lower})
                            
                            # Create tags that don't exist for this user
                            if tags_to_create:
                                default_color = '#808080' # Default color for new tags
                                for tag_data in tags_to_create:
                                    cur.execute('SAVEPOINT csv_tag_insert')
                                    try:
                                        # Insert new tag with default color, preserving original case for name, AND user_id
                                        cur.execute(
                                            "INSERT INTO tags (name, color, user_id) VALUES (%s, %s, %s) RETURNING id",
                                            (tag_data['name'], default_color, user_id) # Add user_id
                                        )
                                        new_tag_id = cur.fetchone()[0]
                                        cur.execute('RELEASE SAVEPOINT csv_tag_insert')
                                        processed_tag_ids.append(new_tag_id)
                                        logger.info(f"Created new tag '{(tag_data['name'])}' with ID {new_tag_id} for user {user_id} during CSV import.")
                                    except Exception as tag_insert_err:
                                        # Roll back the failed sub-statement so the transaction
                                        # stays usable before the fallback SELECT.
                                        cur.execute('ROLLBACK TO SAVEPOINT csv_tag_insert')
                                        cur.execute('RELEASE SAVEPOINT csv_tag_insert')
                                        logger.error(f"Error creating tag '{(tag_data['name'])}' for user {user_id} during import: {tag_insert_err}")
                                        # Attempt to fetch the ID again in case it was created by another process
                                        cur.execute("SELECT id FROM tags WHERE LOWER(name) = %s AND user_id = %s", (tag_data['name_lower'], user_id))
                                        existing_id_result = cur.fetchone()
                                        if existing_id_result:
                                            processed_tag_ids.append(existing_id_result[0])
                                        else:
                                             # Add error to the row if tag creation failed and wasn't found
                                            errors.append(f"Failed to create or find tag: {(tag_data['name'])}")
                                            
                            # Consolidate tag IDs to link
                            if processed_tag_ids:
                                tag_ids_to_link = list(set(processed_tag_ids)) # Ensure unique IDs

                    # --- Check for Duplicates and auto-append suffix --- 
                    if not errors and product_name and purchase_date:
                        def is_name_taken(name_candidate):
                            cur.execute(
                                "SELECT 1 FROM warranties WHERE user_id = %s AND product_name = %s AND purchase_date = %s LIMIT 1",
                                (user_id, name_candidate, purchase_date)
                            )
                            return cur.fetchone() is not None or (name_candidate, purchase_date) in used_name_date_pairs

                        if is_name_taken(product_name):
                            base_name = product_name
                            suffix_index = next_suffix.get(
                                (base_name, purchase_date), 1)
                            while True:
                                candidate_name = f"{base_name} ({suffix_index})"
                                if not is_name_taken(candidate_name):
                                    logger.info(f"[Import] Duplicate detected for row {row_number}. Renaming '{base_name}' to '{candidate_name}' for purchase date {purchase_date}.")
                                    product_name = candidate_name
                                    next_suffix[(base_name, purchase_date)] = (
                                        suffix_index + 1)
                                    break
                                suffix_index += 1
                    
                    # --- If errors, roll back any row-scoped work (e.g. tags) and skip row ---
                    if errors:
                        cur.execute('ROLLBACK TO SAVEPOINT csv_row')
                        cur.execute('RELEASE SAVEPOINT csv_row')
                        failed_rows.append({"row": row_number, "errors": errors})
                        continue

                    # --- Get user's preferred currency code ---
                    user_currency_code = 'USD'  # Default fallback
                    try:
                        # Get user's preferred currency symbol from their preferences
                        cur.execute("""
                            SELECT currency_symbol FROM user_preferences 
                            WHERE user_id = %s
                        """, (user_id,))
                        currency_result = cur.fetchone()
                        
                        if currency_result and currency_result[0]:
                            user_symbol = currency_result[0]
                            # Map common currency symbols to currency codes (same as frontend logic)
                            symbol_to_currency_map = {
                                '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
                                '₹': 'INR', '₩': 'KRW', 'CHF': 'CHF', 'C$': 'CAD',
                                'A$': 'AUD', 'kr': 'SEK', 'zł': 'PLN', 'Kč': 'CZK',
                                'Ft': 'HUF', '₽': 'RUB', 'R$': 'BRL', '₦': 'NGN',
                                '₪': 'ILS', '₺': 'TRY', '₨': 'PKR', '৳': 'BDT',
                                '฿': 'THB', '₫': 'VND', 'RM': 'MYR', 'S$': 'SGD',
                                'Rp': 'IDR', '₱': 'PHP', 'NT$': 'TWD', 'HK$': 'HKD',
                                '₮': 'MNT', '₸': 'KZT', '₼': 'AZN', '₾': 'GEL',
                                '₴': 'UAH', 'NZ$': 'NZD', 'лв': 'BGN', 'lei': 'RON',
                                'kn': 'HRK', 'S/': 'PEN', 'Bs': 'VES', 'R': 'ZAR',
                                'KSh': 'KES', '₵': 'GHS', 'DH': 'MAD', 'DT': 'TND',
                                'AED': 'AED', 'SR': 'SAR', 'QR': 'QAR', 'KD': 'KWD',
                                'BD': 'BHD', 'OR': 'OMR', 'JD': 'JOD', 'LL': 'LBP',
                                '﷼': 'IRR', 'Nu': 'BTN', '₭': 'LAK', '៛': 'KHR',
                                'MOP': 'MOP', 'soʻm': 'UZS', 'SM': 'TJS', 'с': 'KGS',
                                'T': 'TMT', '؋': 'AFN', '֏': 'AMD', 'Br': 'BYN',
                                'дин': 'RSD', 'ден': 'MKD', 'KM': 'BAM', 'FJ$': 'FJD',
                                'SI$': 'SBD', 'T$': 'TOP', 'VT': 'VUV', 'WS$': 'WST',
                                '₣': 'XPF'
                            }
                            
                            if user_symbol in symbol_to_currency_map:
                                user_currency_code = symbol_to_currency_map[user_symbol]
                                logger.info(f"[Import] Using user's preferred currency: {user_symbol} -> {user_currency_code} for user {user_id}")
                            else:
                                logger.info(f"[Import] Unknown currency symbol '{user_symbol}' for user {user_id}, defaulting to USD")
                        else:
                            logger.info(f"[Import] No currency preference found for user {user_id}, defaulting to USD")
                    except Exception as currency_err:
                        logger.error(f"[Import] Error getting user currency preference: {currency_err}, defaulting to USD")

                    # --- Resolve row currency: explicit Currency column wins when valid ---
                    row_currency = user_currency_code
                    if currency_str:
                        # Validate against the CHECK constraint's code list
                        if currency_str in (
                            'USD','EUR','GBP','JPY','CNY','INR','KRW','CHF','CAD','AUD',
                            'SEK','NOK','DKK','PLN','CZK','HUF','BGN','RON','HRK','RUB',
                            'BRL','MXN','ARS','CLP','COP','PEN','VES','ZAR','EGP','NGN',
                            'KES','GHS','MAD','TND','AED','SAR','QAR','KWD','BHD','OMR',
                            'JOD','LBP','ILS','TRY','IRR','PKR','BDT','LKR','NPR','BTN',
                            'MMK','THB','VND','LAK','KHR','MYR','SGD','IDR','PHP','TWD',
                            'HKD','MOP','KPW','MNT','KZT','UZS','KGS','TMT','AFN','AMD',
                            'AZN','GEL','MDL','UAH','BYN','RSD','MKD','ALL','BAM','ISK',
                            'FJD','PGK','SBD','TOP','VUV','WST','XPF','NZD'
                        ):
                            row_currency = currency_str
                        else:
                            logger.warning(f"[Import] Row {row_number}: unknown currency '{currency_str}', using {user_currency_code}")

                    # --- Insert into Database --- 
                    cur.execute("""
                        INSERT INTO warranties (
                            product_name, purchase_date, expiration_date, 
                            product_url, purchase_price, user_id, is_lifetime, vendor, warranty_type,
                            warranty_duration_years, warranty_duration_months, warranty_duration_days, currency,
                            notes, model_number
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        product_name, purchase_date, expiration_date,
                        product_url, purchase_price, user_id, is_lifetime, vendor, warranty_type,
                        warranty_duration_years, warranty_duration_months, warranty_duration_days, row_currency,
                        notes, model_number
                    ))
                    warranty_id = cur.fetchone()[0]

                    # Insert serial numbers
                    if serial_numbers:
                        for serial_number in serial_numbers:
                            cur.execute("""
                                INSERT INTO serial_numbers (warranty_id, serial_number)
                                VALUES (%s, %s)
                            """, (warranty_id, serial_number))
                    
                    # Link tags
                    if tag_ids_to_link:
                        for tag_id in tag_ids_to_link:
                             cur.execute("""
                                INSERT INTO warranty_tags (warranty_id, tag_id)
                                VALUES (%s, %s)
                                ON CONFLICT (warranty_id, tag_id) DO NOTHING -- Avoid errors if somehow duplicated
                            """, (warranty_id, tag_id))

                    # Track the used name+date pair to avoid collisions within the same CSV import
                    used_name_date_pairs.add((product_name, purchase_date))

                    imported_count += 1
                    cur.execute('RELEASE SAVEPOINT csv_row')

                except Exception as e:
                    logger.error(f"Error processing CSV row {row_number}: {e}")
                    failed_rows.append({"row": row_number, "errors": ["Internal processing error while importing row"]})
                    # Roll the failed row back to its savepoint so the
                    # transaction stays usable for the remaining rows.
                    try:
                        cur.execute('ROLLBACK TO SAVEPOINT csv_row')
                        cur.execute('RELEASE SAVEPOINT csv_row')
                    except Exception as savepoint_err:
                        logger.error(f"Error rolling back CSV row {row_number} to savepoint: {savepoint_err}")

            # --- Transaction Commit/Rollback --- 
            if imported_count > 0 and failed_rows:
                # Partial success: commit successful rows and return 200 with error details for failed rows
                conn.commit()
                final_success_count = imported_count
                final_failure_count = len(failed_rows)
                return jsonify({
                    "message": "CSV processed with some errors.",
                    "success_count": final_success_count,
                    "failure_count": final_failure_count,
                    "errors": failed_rows
                }), 200
            elif imported_count == 0 and failed_rows:
                # All rows failed: rollback and return 400
                conn.rollback()
                final_success_count = 0
                final_failure_count = len(failed_rows)
                return jsonify({
                    "error": "Import failed due to errors in all rows. No warranties were imported.",
                    "success_count": 0,
                    "failure_count": final_failure_count,
                    "errors": failed_rows
                }), 400
            else:
                # All rows succeeded
                conn.commit()
                final_success_count = imported_count
                final_failure_count = len(failed_rows)

        return jsonify({
            "message": "CSV processed.",
            "success_count": final_success_count,
            "failure_count": final_failure_count,
            "errors": failed_rows
        }), 200

    except csv.Error as e:
        if conn:
            conn.rollback()
        logger.error(f"CSV parsing error during import: {e}")
        return jsonify({"error": "CSV file could not be parsed: a field exceeds the maximum allowed size.",
                        "code": "csv_field_too_large"}), 400
    except Exception as e:
        if conn:
            conn.rollback() # Rollback on general error
        logger.error(f"Error importing CSV: {e}")
        return jsonify({"error": "Failed to import CSV"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/admin/warranties', methods=['GET'])
@admin_required
def get_all_warranties():
    """Get all warranties from all users (admin only)"""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all warranties from all users with user information (exclude archived by default)
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                    w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url,
                    u.username, u.email, u.first_name, u.last_name,
                    CASE
                        WHEN COUNT(c.id) = 0 THEN 'NO_CLAIMS'
                        WHEN BOOL_OR(c.status IN ('Submitted', 'In Progress')) THEN 'OPEN'
                        ELSE 'FINISHED'
                    END AS claim_status_summary,
                    (SELECT COUNT(*) FROM warranty_expiry_history h WHERE h.warranty_id = w.id) AS expiry_change_count,
                    (SELECT COUNT(*) FROM warranty_note_entries n WHERE n.warranty_id = w.id) AS note_entry_count
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                LEFT JOIN warranty_claims c ON w.id = c.warranty_id
                WHERE w.archived_at IS NULL
                GROUP BY w.id, u.id
                ORDER BY u.username, CASE WHEN w.is_lifetime THEN 1 ELSE 0 END, w.expiration_date NULLS LAST, w.product_name
            ''')
                
            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []
            
            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)
                
                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers
                
                # Get tags for this warranty
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags
                
                # Add user display name for better UI
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''
                
                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'
                
                warranties_list.append(warranty_dict)
                
            return jsonify(warranties_list)
    except Exception as e:
        logger.error(f"Error retrieving all warranties: {e}")
        return jsonify({"error": "Failed to retrieve all warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/global', methods=['GET'])
@token_required
def get_global_warranties():
    """Get all warranties from all users (public view for all authenticated users)"""
    conn = None
    try:
        # Check if global view is enabled for this user
        user_id = request.user['id']
        user_is_admin = request.user.get('is_admin', False)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get both global view settings
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
            settings = {row[0]: row[1] for row in cur.fetchall()}
            
            # Check if global view is enabled at all
            global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
            if not global_view_enabled:
                return jsonify({"error": "Global view is disabled by administrator"}), 403
            
            # Check if global view is restricted to admins only
            admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
            if admin_only and not user_is_admin:
                return jsonify({"error": "Global view is restricted to administrators only"}), 403
        
        # Release the connection since we'll get a new one below
        release_db_connection(conn)
        conn = None
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all warranties from all users with user information (exclude archived for default view)
            # Use correlated subqueries for claim status to avoid GROUP BY collapsing or miscounting
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                    w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number, w.voided_at,
                    u.username, u.email, u.first_name, u.last_name,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id AND c.status IN ('Submitted', 'In Progress')
                        ) THEN 'OPEN'
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id
                        ) THEN 'FINISHED'
                        ELSE 'NO_CLAIMS'
                    END AS claim_status_summary,
                    (SELECT COUNT(*) FROM warranty_expiry_history h WHERE h.warranty_id = w.id) AS expiry_change_count,
                    (SELECT COUNT(*) FROM warranty_note_entries n WHERE n.warranty_id = w.id) AS note_entry_count
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                WHERE w.archived_at IS NULL
                ORDER BY u.username, CASE WHEN w.is_lifetime THEN 1 ELSE 0 END, w.expiration_date NULLS LAST, w.product_name
            ''')
                
            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []
            
            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)
                
                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers
                
                # Get tags for this warranty
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags
                
                # Add user display name for better UI
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''
                
                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'

                # Do not expose another user's email address or private
                # "other document" references in global view to non-admins.
                if not user_is_admin and warranty_dict.get('user_id') != user_id:
                    warranty_dict.pop('email', None)
                    warranty_dict['other_document_path'] = None
                    warranty_dict['other_document_url'] = None
                    warranty_dict['paperless_other_id'] = None
                
                warranties_list.append(warranty_dict)
                
            return jsonify(warranties_list)
    except Exception as e:
        logger.error(f"Error retrieving global warranties: {e}")
        return jsonify({"error": "Failed to retrieve global warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/warranties/global/archived', methods=['GET'])
@token_required
def get_global_warranties_archived():
    """Get archived warranties from all users (public view for all authenticated users)"""
    conn = None
    try:
        # Check if global view is enabled for this user
        user_id = request.user['id']
        user_is_admin = request.user.get('is_admin', False)

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get both global view settings
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
            settings = {row[0]: row[1] for row in cur.fetchall()}

            # Check if global view is enabled at all
            global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
            if not global_view_enabled:
                return jsonify({"error": "Global view is disabled by administrator"}), 403

            # Check if global view is restricted to admins only
            admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
            if admin_only and not user_is_admin:
                return jsonify({"error": "Global view is restricted to administrators only"}), 403

        # Release the connection since we'll get a new one below
        release_db_connection(conn)
        conn = None
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get archived warranties from all users with user information
            # Use correlated subqueries for claim status to avoid GROUP BY collapsing or miscounting
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                    w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number, w.voided_at,
                    u.username, u.email, u.first_name, u.last_name,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id AND c.status IN ('Submitted', 'In Progress')
                        ) THEN 'OPEN'
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id
                        ) THEN 'FINISHED'
                        ELSE 'NO_CLAIMS'
                    END AS claim_status_summary,
                    (SELECT COUNT(*) FROM warranty_expiry_history h WHERE h.warranty_id = w.id) AS expiry_change_count,
                    (SELECT COUNT(*) FROM warranty_note_entries n WHERE n.warranty_id = w.id) AS note_entry_count
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                WHERE w.archived_at IS NOT NULL
                ORDER BY w.archived_at DESC NULLS LAST, w.updated_at DESC NULLS LAST, w.product_name
            ''')

            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []

            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)

                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers

                # Get tags for this warranty
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags

                # Add user display name for better UI
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''

                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'

                # Do not expose another user's email address or private
                # "other document" references in global view to non-admins.
                if not user_is_admin and warranty_dict.get('user_id') != user_id:
                    warranty_dict.pop('email', None)
                    warranty_dict['other_document_path'] = None
                    warranty_dict['other_document_url'] = None
                    warranty_dict['paperless_other_id'] = None

                warranties_list.append(warranty_dict)

            return jsonify(warranties_list)
    except Exception as e:
        logger.error(f"Error retrieving archived global warranties: {e}")
        return jsonify({"error": "Failed to retrieve archived global warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/currencies', methods=['GET'])
@token_required
def get_currencies():
    """Get list of available currencies with their symbols"""
    try:
        currencies = [
            {'code': 'USD', 'name': 'US Dollar', 'symbol': '$'},
            {'code': 'EUR', 'name': 'Euro', 'symbol': '€'},
            {'code': 'GBP', 'name': 'British Pound', 'symbol': '£'},
            {'code': 'JPY', 'name': 'Japanese Yen', 'symbol': '¥'},
            {'code': 'CNY', 'name': 'Chinese Yuan', 'symbol': '¥'},
            {'code': 'INR', 'name': 'Indian Rupee', 'symbol': '₹'},
            {'code': 'KRW', 'name': 'South Korean Won', 'symbol': '₩'},
            {'code': 'CHF', 'name': 'Swiss Franc', 'symbol': 'CHF'},
            {'code': 'CAD', 'name': 'Canadian Dollar', 'symbol': 'C$'},
            {'code': 'AUD', 'name': 'Australian Dollar', 'symbol': 'A$'},
            {'code': 'SEK', 'name': 'Swedish Krona', 'symbol': 'kr'},
            {'code': 'NOK', 'name': 'Norwegian Krone', 'symbol': 'kr'},
            {'code': 'DKK', 'name': 'Danish Krone', 'symbol': 'kr'},
            {'code': 'PLN', 'name': 'Polish Złoty', 'symbol': 'zł'},
            {'code': 'CZK', 'name': 'Czech Koruna', 'symbol': 'Kč'},
            {'code': 'HUF', 'name': 'Hungarian Forint', 'symbol': 'Ft'},
            {'code': 'BGN', 'name': 'Bulgarian Lev', 'symbol': 'лв'},
            {'code': 'RON', 'name': 'Romanian Leu', 'symbol': 'lei'},
            {'code': 'HRK', 'name': 'Croatian Kuna', 'symbol': 'kn'},
            {'code': 'RUB', 'name': 'Russian Ruble', 'symbol': '₽'},
            {'code': 'BRL', 'name': 'Brazilian Real', 'symbol': 'R$'},
            {'code': 'MXN', 'name': 'Mexican Peso', 'symbol': '$'},
            {'code': 'ARS', 'name': 'Argentine Peso', 'symbol': '$'},
            {'code': 'CLP', 'name': 'Chilean Peso', 'symbol': '$'},
            {'code': 'COP', 'name': 'Colombian Peso', 'symbol': '$'},
            {'code': 'PEN', 'name': 'Peruvian Sol', 'symbol': 'S/'},
            {'code': 'VES', 'name': 'Venezuelan Bolívar', 'symbol': 'Bs'},
            {'code': 'ZAR', 'name': 'South African Rand', 'symbol': 'R'},
            {'code': 'EGP', 'name': 'Egyptian Pound', 'symbol': '£'},
            {'code': 'NGN', 'name': 'Nigerian Naira', 'symbol': '₦'},
            {'code': 'KES', 'name': 'Kenyan Shilling', 'symbol': 'KSh'},
            {'code': 'GHS', 'name': 'Ghanaian Cedi', 'symbol': '₵'},
            {'code': 'MAD', 'name': 'Moroccan Dirham', 'symbol': 'DH'},
            {'code': 'TND', 'name': 'Tunisian Dinar', 'symbol': 'DT'},
            {'code': 'AED', 'name': 'UAE Dirham', 'symbol': 'AED'},
            {'code': 'SAR', 'name': 'Saudi Riyal', 'symbol': 'SR'},
            {'code': 'QAR', 'name': 'Qatari Riyal', 'symbol': 'QR'},
            {'code': 'KWD', 'name': 'Kuwaiti Dinar', 'symbol': 'KD'},
            {'code': 'BHD', 'name': 'Bahraini Dinar', 'symbol': 'BD'},
            {'code': 'OMR', 'name': 'Omani Rial', 'symbol': 'OR'},
            {'code': 'JOD', 'name': 'Jordanian Dinar', 'symbol': 'JD'},
            {'code': 'LBP', 'name': 'Lebanese Pound', 'symbol': 'LL'},
            {'code': 'ILS', 'name': 'Israeli Shekel', 'symbol': '₪'},
            {'code': 'TRY', 'name': 'Turkish Lira', 'symbol': '₺'},
            {'code': 'IRR', 'name': 'Iranian Rial', 'symbol': '﷼'},
            {'code': 'PKR', 'name': 'Pakistani Rupee', 'symbol': '₨'},
            {'code': 'BDT', 'name': 'Bangladeshi Taka', 'symbol': '৳'},
            {'code': 'LKR', 'name': 'Sri Lankan Rupee', 'symbol': 'Rs'},
            {'code': 'NPR', 'name': 'Nepalese Rupee', 'symbol': 'Rs'},
            {'code': 'BTN', 'name': 'Bhutanese Ngultrum', 'symbol': 'Nu'},
            {'code': 'MMK', 'name': 'Myanmar Kyat', 'symbol': 'K'},
            {'code': 'THB', 'name': 'Thai Baht', 'symbol': '฿'},
            {'code': 'VND', 'name': 'Vietnamese Dong', 'symbol': '₫'},
            {'code': 'LAK', 'name': 'Lao Kip', 'symbol': '₭'},
            {'code': 'KHR', 'name': 'Cambodian Riel', 'symbol': '៛'},
            {'code': 'MYR', 'name': 'Malaysian Ringgit', 'symbol': 'RM'},
            {'code': 'SGD', 'name': 'Singapore Dollar', 'symbol': 'S$'},
            {'code': 'IDR', 'name': 'Indonesian Rupiah', 'symbol': 'Rp'},
            {'code': 'PHP', 'name': 'Philippine Peso', 'symbol': '₱'},
            {'code': 'TWD', 'name': 'Taiwan Dollar', 'symbol': 'NT$'},
            {'code': 'HKD', 'name': 'Hong Kong Dollar', 'symbol': 'HK$'},
            {'code': 'MOP', 'name': 'Macanese Pataca', 'symbol': 'MOP'},
            {'code': 'KPW', 'name': 'North Korean Won', 'symbol': '₩'},
            {'code': 'MNT', 'name': 'Mongolian Tugrik', 'symbol': '₮'},
            {'code': 'KZT', 'name': 'Kazakhstani Tenge', 'symbol': '₸'},
            {'code': 'UZS', 'name': 'Uzbekistani Som', 'symbol': 'soʻm'},
            {'code': 'TJS', 'name': 'Tajikistani Somoni', 'symbol': 'SM'},
            {'code': 'KGS', 'name': 'Kyrgyzstani Som', 'symbol': 'с'},
            {'code': 'TMT', 'name': 'Turkmenistani Manat', 'symbol': 'T'},
            {'code': 'AFN', 'name': 'Afghan Afghani', 'symbol': '؋'},
            {'code': 'AMD', 'name': 'Armenian Dram', 'symbol': '֏'},
            {'code': 'AZN', 'name': 'Azerbaijani Manat', 'symbol': '₼'},
            {'code': 'GEL', 'name': 'Georgian Lari', 'symbol': '₾'},
            {'code': 'MDL', 'name': 'Moldovan Leu', 'symbol': 'L'},
            {'code': 'UAH', 'name': 'Ukrainian Hryvnia', 'symbol': '₴'},
            {'code': 'BYN', 'name': 'Belarusian Ruble', 'symbol': 'Br'},
            {'code': 'RSD', 'name': 'Serbian Dinar', 'symbol': 'дин'},
            {'code': 'MKD', 'name': 'Macedonian Denar', 'symbol': 'ден'},
            {'code': 'ALL', 'name': 'Albanian Lek', 'symbol': 'L'},
            {'code': 'BAM', 'name': 'Bosnia-Herzegovina Mark', 'symbol': 'KM'},
            {'code': 'ISK', 'name': 'Icelandic Króna', 'symbol': 'kr'},
            {'code': 'FJD', 'name': 'Fijian Dollar', 'symbol': 'FJ$'},
            {'code': 'PGK', 'name': 'Papua New Guinea Kina', 'symbol': 'K'},
            {'code': 'SBD', 'name': 'Solomon Islands Dollar', 'symbol': 'SI$'},
            {'code': 'TOP', 'name': 'Tongan Paʻanga', 'symbol': 'T$'},
            {'code': 'VUV', 'name': 'Vanuatu Vatu', 'symbol': 'VT'},
            {'code': 'WST', 'name': 'Samoan Tala', 'symbol': 'WS$'},
            {'code': 'XPF', 'name': 'CFP Franc', 'symbol': '₣'},
            {'code': 'NZD', 'name': 'New Zealand Dollar', 'symbol': 'NZ$'}
        ]
        
        return jsonify(currencies)
        
    except Exception as e:
        logger.error(f"Error getting currencies: {e}")
        return jsonify([{'code': 'USD', 'name': 'US Dollar', 'symbol': '$'}]), 500


@warranties_bp.route('/debug/warranty/<int:warranty_id>', methods=['GET'])
@token_required
def get_warranty_debug(warranty_id):
    """Get detailed information about a specific warranty (for debugging/status page)"""
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Admins may view any warranty. Non-admins may too when global
            # view is enabled and not restricted to admins, matching the
            # list and claims endpoints and the shared-instance design:
            # with global view on, any user sees all users' information.
            # Otherwise a non-admin is restricted to their own warranties.
            can_view_all = is_admin
            if not is_admin:
                cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
                settings = {row[0]: row[1] for row in cur.fetchall()}
                global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
                admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
                can_view_all = global_view_enabled and not admin_only

            # Check if warranty exists and user has access to it
            if can_view_all:
                cur.execute('''
                    SELECT w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                           w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                           w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, 
                           w.product_photo_path, w.currency, w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                           u.username, u.email, u.first_name, u.last_name,
                           (SELECT COUNT(*) FROM warranty_expiry_history h WHERE h.warranty_id = w.id) AS expiry_change_count,
                    (SELECT COUNT(*) FROM warranty_note_entries n WHERE n.warranty_id = w.id) AS note_entry_count
                    FROM warranties w
                    JOIN users u ON w.user_id = u.id
                    WHERE w.id = %s
                ''', (warranty_id,))
            else:
                cur.execute('''
                    SELECT w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                           w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                           w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, 
                           w.product_photo_path, w.currency, w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                           u.username, u.email, u.first_name, u.last_name,
                           (SELECT COUNT(*) FROM warranty_expiry_history h WHERE h.warranty_id = w.id) AS expiry_change_count,
                    (SELECT COUNT(*) FROM warranty_note_entries n WHERE n.warranty_id = w.id) AS note_entry_count
                    FROM warranties w
                    JOIN users u ON w.user_id = u.id
                    WHERE w.id = %s AND w.user_id = %s
                ''', (warranty_id, user_id))
            
            warranty = cur.fetchone()
            
            if not warranty:
                return jsonify({"error": "Warranty not found or you don't have permission to access it"}), 404
            
            # Convert to dictionary
            columns = [desc[0] for desc in cur.description]
            warranty_dict = dict(zip(columns, warranty))
            
            # Convert date objects to ISO format strings for JSON serialization
            for key, value in warranty_dict.items():
                if isinstance(value, (datetime, date)):
                    warranty_dict[key] = value.isoformat()
                # Convert Decimal objects to float for JSON serialization
                elif isinstance(value, Decimal):
                    warranty_dict[key] = float(value)
            
            # Get serial numbers for this warranty
            cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
            serial_numbers = [row[0] for row in cur.fetchall()]
            warranty_dict['serial_numbers'] = serial_numbers
            
            # Get tags for this warranty
            cur.execute('''
                SELECT t.id, t.name, t.color
                FROM tags t
                JOIN warranty_tags wt ON t.id = wt.tag_id
                WHERE wt.warranty_id = %s
                ORDER BY t.name
            ''', (warranty_id,))
            tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
            warranty_dict['tags'] = tags
            
            # Add user display name for better UI (if admin is viewing)
            if is_admin:
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''
                
                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'

            # Do not expose another user's email address or private
            # "other document" references in global view to non-admins.
            if not is_admin and warranty_dict.get('user_id') != user_id:
                warranty_dict.pop('email', None)
                warranty_dict['other_document_path'] = None
                if 'other_document_url' in warranty_dict:
                    warranty_dict['other_document_url'] = None
                warranty_dict['paperless_other_id'] = None
            
            return jsonify(warranty_dict)
            
    except Exception as e:
        logger.error(f"Error retrieving warranty {warranty_id}: {e}")
        return jsonify({"error": "Failed to retrieve warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/warranties/<int:warranty_id>/expiry-history', methods=['GET'])
@token_required
def get_warranty_expiry_history(warranty_id):
    """Get recorded expiration date / lifetime changes for a warranty (issue #209)."""
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Match get_warranty_debug access rules: owner, admin, or any
            # authenticated user when global view is enabled and not admin-only.
            can_view_all = is_admin
            if not is_admin:
                cur.execute(
                    "SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')"
                )
                settings = {row[0]: row[1] for row in cur.fetchall()}
                global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
                admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
                can_view_all = global_view_enabled and not admin_only

            if can_view_all:
                cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute(
                    'SELECT id FROM warranties WHERE id = %s AND user_id = %s',
                    (warranty_id, user_id),
                )
            if not cur.fetchone():
                return jsonify({"error": "Warranty not found or access denied"}), 404

            cur.execute('''
                SELECT
                    h.id,
                    h.warranty_id,
                    h.previous_expiration_date,
                    h.new_expiration_date,
                    h.previous_is_lifetime,
                    h.new_is_lifetime,
                    h.reason,
                    h.changed_at,
                    u.first_name,
                    u.last_name,
                    u.username
                FROM warranty_expiry_history h
                LEFT JOIN users u ON h.changed_by_user_id = u.id
                WHERE h.warranty_id = %s
                ORDER BY h.changed_at DESC, h.id DESC
            ''', (warranty_id,))

            history = []
            for row in cur.fetchall():
                first_name = row[8].strip() if row[8] else ''
                last_name = row[9].strip() if row[9] else ''
                username = row[10].strip() if row[10] else ''
                if first_name and last_name:
                    changed_by = f"{first_name} {last_name}"
                elif first_name:
                    changed_by = first_name
                elif username:
                    changed_by = username
                else:
                    changed_by = None

                history.append({
                    'id': row[0],
                    'warranty_id': row[1],
                    'previous_expiration_date': row[2].isoformat() if row[2] else None,
                    'new_expiration_date': row[3].isoformat() if row[3] else None,
                    'previous_is_lifetime': bool(row[4]),
                    'new_is_lifetime': bool(row[5]),
                    'reason': row[6],
                    'changed_at': row[7].isoformat() if row[7] else None,
                    'changed_by': changed_by,
                })

            return jsonify(history), 200
    except Exception as e:
        logger.error(f"Error retrieving expiry history for warranty {warranty_id}: {e}")
        return jsonify({"error": "Failed to retrieve expiry history"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/timezones', methods=['GET'])
@token_required
def get_timezones():
    """Get list of available timezones grouped by region"""
    try:
        # Get all timezones and group them by region
        all_timezones = pytz.all_timezones
        grouped_timezones = {}
        
        for tz in sorted(all_timezones):
            # Skip deprecated/non-standard timezones
            if '/' not in tz or tz.startswith(('Etc/', 'SystemV/', 'US/', 'posix/', 'right/')):
                continue
                
            region = tz.split('/')[0]
            if region not in grouped_timezones:
                grouped_timezones[region] = []
            
            # Create display name (replace underscores with spaces)
            display_name = tz.split('/', 1)[1].replace('_', ' ')
            grouped_timezones[region].append({
                'value': tz,
                'label': display_name,
                'full_name': tz
            })
        
        # Convert to frontend expected format: array of objects with region and timezones
        timezone_groups_array = []
        for region, timezones in grouped_timezones.items():
            timezone_groups_array.append({
                'region': region,
                'timezones': timezones
            })
        
        return jsonify(timezone_groups_array), 200
        
    except Exception as e:
        logger.error(f"Error getting timezones: {e}")
        # Return a basic fallback list in correct format
        fallback_timezones = [
            {
                'region': 'UTC',
                'timezones': [{'value': 'UTC', 'label': 'UTC', 'full_name': 'UTC'}]
            },
            {
                'region': 'America',
                'timezones': [
                    {'value': 'America/New_York', 'label': 'New York', 'full_name': 'America/New_York'},
                    {'value': 'America/Chicago', 'label': 'Chicago', 'full_name': 'America/Chicago'},
                    {'value': 'America/Denver', 'label': 'Denver', 'full_name': 'America/Denver'},
                    {'value': 'America/Los_Angeles', 'label': 'Los Angeles', 'full_name': 'America/Los_Angeles'},
                    {'value': 'America/Halifax', 'label': 'Halifax', 'full_name': 'America/Halifax'}
                ]
            },
            {
                'region': 'Europe',
                'timezones': [
                    {'value': 'Europe/London', 'label': 'London', 'full_name': 'Europe/London'},
                    {'value': 'Europe/Paris', 'label': 'Paris', 'full_name': 'Europe/Paris'},
                    {'value': 'Europe/Berlin', 'label': 'Berlin', 'full_name': 'Europe/Berlin'}
                ]
            }
        ]
        return jsonify(fallback_timezones), 200

@warranties_bp.route('/locales', methods=['GET'])
def get_locales():
    """Get list of supported locales/languages"""
    try:
        # Import the supported languages from localization
        try:
            from .localization import SUPPORTED_LANGUAGES
        except ImportError:
            from localization import SUPPORTED_LANGUAGES
        
        # Language code to name mapping
        language_names = {
            'en': 'English',
            'fr': 'Français',
            'es': 'Español', 
            'de': 'Deutsch',
            'it': 'Italiano',
            'cs': 'Čeština',
            'nl': 'Nederlands',
            'hi': 'हिन्दी',
            'fa': 'فارسی',
            'ar': 'العربية',
            'ru': 'Русский',
            'uk': 'Українська',
            'zh_CN': '简体中文',
            'zh_HK': '繁體中文',
            'ja': '日本語',
            'pt': 'Português',
            'ko': '한국어',
            'tr': 'Türkçe',
            'pl': 'Polski',
            'he': 'עברית'
        }
        
        locales = []
        for lang_code in SUPPORTED_LANGUAGES:
            locales.append({
                'code': lang_code,
                'name': language_names.get(lang_code, lang_code),
                'native_name': language_names.get(lang_code, lang_code)
            })
        
        return jsonify(locales), 200
        
    except ImportError:
        # Fallback if localization module is not available
        fallback_locales = [
            {'code': 'en', 'name': 'English', 'native_name': 'English'},
            {'code': 'fr', 'name': 'French', 'native_name': 'Français'},
            {'code': 'es', 'name': 'Spanish', 'native_name': 'Español'},
            {'code': 'de', 'name': 'German', 'native_name': 'Deutsch'}
        ]
        return jsonify(fallback_locales), 200
    except Exception as e:
        logger.error(f"Error getting locales: {e}")
        return jsonify([{'code': 'en', 'name': 'English', 'native_name': 'English'}]), 500

# ====== WARRANTY CLAIMS ENDPOINTS ======

@warranties_bp.route('/warranties/<int:warranty_id>/claims', methods=['POST'])
@token_required
def create_claim(warranty_id):
    """Create a new warranty claim"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Verify warranty exists and user owns it
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, product_name, voided_at FROM warranties
            WHERE id = %s AND user_id = %s
        """, (warranty_id, user_id))

        warranty = cur.fetchone()
        if not warranty:
            return jsonify({'error': 'Warranty not found or access denied'}), 404

        # A voided warranty's coverage is dead, so it cannot gain new
        # claims. Claims recorded before the void stay editable.
        if warranty[2] is not None:
            return jsonify({
                'error': 'Claims cannot be added to a voided warranty. Un-void the warranty first.',
                'code': 'warranty_voided',
            }), 400
        
        # Validate required fields
        claim_date = data.get('claim_date')
        status = data.get('status', 'Submitted')

        # Process optional fields, converting empty strings to None for the database
        claim_number_raw = data.get('claim_number')
        claim_number = claim_number_raw.strip() if claim_number_raw else None

        description_raw = data.get('description')
        description = description_raw.strip() if description_raw else None

        resolution_raw = data.get('resolution')
        resolution = resolution_raw.strip() if resolution_raw else None

        resolution_date = data.get('resolution_date')

        if not claim_date:
            return jsonify({'error': 'Claim date is required'}), 400

        # Parse dates
        try:
            parsed_claim_date = parse_unambiguous_date(claim_date)
        except (ValueError, TypeError) as e:
            return jsonify({'error': f'Invalid claim date format. {e}'}), 400

        parsed_resolution_date = None
        if resolution_date:
            try:
                parsed_resolution_date = parse_unambiguous_date(resolution_date)
            except (ValueError, TypeError) as e:
                return jsonify({'error': f'Invalid resolution date format. {e}'}), 400

        # Validate status
        valid_statuses = ['Submitted', 'In Progress', 'Approved', 'Denied', 'Resolved', 'Cancelled']
        if status not in valid_statuses:
            return jsonify({'error': f"Invalid claim status. Must be one of: {', '.join(valid_statuses)}",
                            'code': 'invalid_claim_status',
                            'valid_statuses': valid_statuses}), 400

        # Insert new claim
        cur.execute("""
            INSERT INTO warranty_claims 
            (warranty_id, claim_date, status, claim_number, description, resolution, resolution_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at, updated_at
        """, (warranty_id, parsed_claim_date, status, claim_number, description, 
              resolution, parsed_resolution_date))
        
        result = cur.fetchone()
        claim_id = result[0]
        created_at = result[1]
        updated_at = result[2]
        
        conn.commit()
        
        # Return the created claim
        claim = {
            'id': claim_id,
            'warranty_id': warranty_id,
            'claim_date': parsed_claim_date.isoformat(),
            'status': status,
            'claim_number': claim_number,
            'description': description,
            'resolution': resolution,
            'resolution_date': parsed_resolution_date.isoformat() if parsed_resolution_date else None,
            'created_at': created_at.isoformat() if created_at else None,
            'updated_at': updated_at.isoformat() if updated_at else None,
            'documents': []
        }
        
        logger.info(f"Created claim {claim_id} for warranty {warranty_id} by user {user_id}")
        return jsonify(claim), 201
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error creating claim: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>/claims', methods=['GET'])
@token_required
def get_claims(warranty_id):
    """Get all claims for a warranty"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # First check if warranty exists and user owns it
        cur.execute("""
            SELECT id, product_name, user_id FROM warranties 
            WHERE id = %s AND user_id = %s
        """, (warranty_id, user_id))
        
        warranty = cur.fetchone()
        
        # If user doesn't own the warranty, check if global view access is allowed
        if not warranty:
            # Check if global view is enabled and user has access
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
            settings = {row[0]: row[1] for row in cur.fetchall()}
            
            global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
            admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
            
            # Check if user has global view access
            if not global_view_enabled or (admin_only and not is_admin):
                return jsonify({'error': 'Warranty not found or access denied'}), 404
            
            # Check if warranty exists (regardless of ownership)
            cur.execute("""
                SELECT id, product_name, user_id FROM warranties 
                WHERE id = %s
            """, (warranty_id,))
            
            warranty = cur.fetchone()
            if not warranty:
                return jsonify({'error': 'Warranty not found'}), 404
        
        # Get all claims for this warranty
        cur.execute("""
            SELECT id, warranty_id, claim_date, status, claim_number, description, 
                   resolution, resolution_date, created_at, updated_at
            FROM warranty_claims 
            WHERE warranty_id = %s
            ORDER BY claim_date DESC, created_at DESC
        """, (warranty_id,))
        
        claims = []
        for row in cur.fetchall():
            claim = {
                'id': row[0],
                'warranty_id': row[1],
                'claim_date': row[2].isoformat() if row[2] else None,
                'status': row[3],
                'claim_number': row[4],
                'description': row[5],
                'resolution': row[6],
                'resolution_date': row[7].isoformat() if row[7] else None,
                'created_at': row[8].isoformat() if row[8] else None,
                'updated_at': row[9].isoformat() if row[9] else None
            }
            claims.append(claim)

        # Embed each claim's documents (issue #148) in one extra query.
        # Documents are owner/admin-only even under global view, so
        # global-view readers get the claims without document metadata.
        if claims:
            if warranty[2] == user_id or is_admin:
                claim_ids = [c['id'] for c in claims]
                cur.execute("""
                    SELECT id, claim_id, original_filename, file_path, paperless_document_id, created_at
                    FROM claim_documents
                    WHERE claim_id = ANY(%s)
                    ORDER BY created_at, id
                """, (claim_ids,))
                docs_by_claim = {}
                for drow in cur.fetchall():
                    doc = {
                        'id': drow[0],
                        'claim_id': drow[1],
                        'original_filename': drow[2],
                        'file_path': drow[3],
                        'paperless_document_id': drow[4],
                        'created_at': drow[5].isoformat() if drow[5] else None
                    }
                    docs_by_claim.setdefault(drow[1], []).append(doc)
                for claim in claims:
                    claim['documents'] = docs_by_claim.get(claim['id'], [])
            else:
                for claim in claims:
                    claim['documents'] = []

        return jsonify(claims), 200
        
    except Exception as e:
        logger.error(f"Error getting claims: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)


def _warranty_viewable_by(cur, warranty_id, user_id, is_admin):
    """Return the warranty's (id, user_id) row if the caller may view it.

    Admins and owners always may. Other users may only when global view
    is enabled and not restricted to admins, matching get_warranty_debug
    and get_claims. Returns None both when the warranty does not exist
    and when the caller may not view it, so callers answer 404 in either
    case without revealing which one it is.
    """
    cur.execute("SELECT id, user_id FROM warranties WHERE id = %s", (warranty_id,))
    row = cur.fetchone()
    if not row:
        return None
    if is_admin or row[1] == user_id:
        return row
    cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
    settings = {r[0]: r[1] for r in cur.fetchall()}
    global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
    admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
    if global_view_enabled and not admin_only:
        return row
    return None


def _note_entry_dict(row):
    return {
        'id': row[0],
        'warranty_id': row[1],
        'user_id': row[2],
        'username': row[3],
        'text': row[4],
        'created_at': row[5].isoformat() if row[5] else None,
    }


@warranties_bp.route('/warranties/<int:warranty_id>/notes', methods=['GET'])
@token_required
def get_warranty_note_entries(warranty_id):
    """List the team note entries on a warranty, oldest first.

    Viewable by anyone who may view the warranty: the owner, an admin,
    or any authenticated user when global view allows it.
    """
    conn = None
    cur = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        conn = get_db_connection()
        cur = conn.cursor()
        if not _warranty_viewable_by(cur, warranty_id, user_id, is_admin):
            return jsonify({'error': 'Warranty not found'}), 404
        cur.execute("""
            SELECT e.id, e.warranty_id, e.user_id, u.username, e.note_text, e.created_at
            FROM warranty_note_entries e
            JOIN users u ON e.user_id = u.id
            WHERE e.warranty_id = %s
            ORDER BY e.created_at ASC, e.id ASC
        """, (warranty_id,))
        return jsonify([_note_entry_dict(row) for row in cur.fetchall()]), 200
    except Exception as e:
        logger.error(f"Error getting note entries: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/warranties/<int:warranty_id>/notes', methods=['POST'])
@token_required
def create_warranty_note_entry(warranty_id):
    """Add a team note entry to a warranty.

    Allowed for anyone who may view the warranty. The entry is attributed
    to the caller with the current time; the warranty's own notes field
    is untouched.
    """
    conn = None
    cur = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({'error': 'No data provided'}), 400
        text = data.get('text')
        if not isinstance(text, str) or not text.strip():
            return jsonify({'error': 'Note text is required'}), 400
        text = text.strip()
        if len(text) > 5000:
            return jsonify({'error': 'Note text must be 5000 characters or fewer'}), 400
        conn = get_db_connection()
        cur = conn.cursor()
        if not _warranty_viewable_by(cur, warranty_id, user_id, is_admin):
            return jsonify({'error': 'Warranty not found'}), 404
        cur.execute("""
            INSERT INTO warranty_note_entries (warranty_id, user_id, note_text)
            VALUES (%s, %s, %s)
            RETURNING id, created_at
        """, (warranty_id, user_id, text))
        entry_id, created_at = cur.fetchone()
        conn.commit()
        return jsonify({
            'id': entry_id,
            'warranty_id': warranty_id,
            'user_id': user_id,
            'username': request.user.get('username'),
            'text': text,
            'created_at': created_at.isoformat() if created_at else None,
        }), 201
    except Exception as e:
        logger.error(f"Error creating note entry: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/warranties/<int:warranty_id>/notes/<int:entry_id>', methods=['DELETE'])
@token_required
def delete_warranty_note_entry(warranty_id, entry_id):
    """Delete a team note entry.

    Allowed for the entry's author, the warranty owner, or an admin.
    """
    conn = None
    cur = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        conn = get_db_connection()
        cur = conn.cursor()
        warranty = _warranty_viewable_by(cur, warranty_id, user_id, is_admin)
        if not warranty:
            return jsonify({'error': 'Warranty not found'}), 404
        cur.execute("""
            SELECT id, user_id FROM warranty_note_entries
            WHERE id = %s AND warranty_id = %s
        """, (entry_id, warranty_id))
        entry = cur.fetchone()
        if not entry:
            return jsonify({'error': 'Note entry not found'}), 404
        if not (is_admin or entry[1] == user_id or warranty[1] == user_id):
            return jsonify({'error': 'Only the entry author, the warranty owner, or an admin may delete this note'}), 403
        cur.execute("DELETE FROM warranty_note_entries WHERE id = %s", (entry_id,))
        conn.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error deleting note entry: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>/claims/<int:claim_id>', methods=['PUT'])
@token_required
def update_claim(warranty_id, claim_id):
    """Update a warranty claim"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Verify warranty exists and user owns it
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT w.id, w.product_name 
            FROM warranties w
            JOIN warranty_claims c ON w.id = c.warranty_id
            WHERE w.id = %s AND c.id = %s AND w.user_id = %s
        """, (warranty_id, claim_id, user_id))
        
        result = cur.fetchone()
        if not result:
            return jsonify({'error': 'Warranty or claim not found or access denied'}), 404
        
        # Get current claim data
        cur.execute("""
            SELECT claim_date, status, claim_number, description, resolution, resolution_date
            FROM warranty_claims 
            WHERE id = %s AND warranty_id = %s
        """, (claim_id, warranty_id))
        
        current_claim = cur.fetchone()
        if not current_claim:
            return jsonify({'error': 'Claim not found'}), 404
        
        # Update fields (keep existing values if not provided)
        claim_date = data.get('claim_date')
        status = data.get('status', current_claim[1])
        claim_number = data.get('claim_number', current_claim[2])
        description = data.get('description', current_claim[3])
        resolution = data.get('resolution', current_claim[4])
        resolution_date = data.get('resolution_date', current_claim[5])
        
        # Parse dates
        if claim_date:
            try:
                parsed_claim_date = parse_unambiguous_date(claim_date)
            except (ValueError, TypeError) as e:
                return jsonify({'error': f'Invalid claim date format. {e}'}), 400
        else:
            parsed_claim_date = current_claim[0]
            
        if resolution_date:
            try:
                parsed_resolution_date = parse_unambiguous_date(resolution_date)
            except (ValueError, TypeError) as e:
                return jsonify({'error': f'Invalid resolution date format. {e}'}), 400
        else:
            parsed_resolution_date = current_claim[5]
        
        # Validate status
        valid_statuses = ['Submitted', 'In Progress', 'Approved', 'Denied', 'Resolved', 'Cancelled']
        if status not in valid_statuses:
            return jsonify({'error': f"Invalid claim status. Must be one of: {', '.join(valid_statuses)}",
                            'code': 'invalid_claim_status',
                            'valid_statuses': valid_statuses}), 400

        # Handle empty strings as None
        claim_number = claim_number.strip() if claim_number else None
        description = description.strip() if description else None
        resolution = resolution.strip() if resolution else None
        
        # Update the claim
        cur.execute("""
            UPDATE warranty_claims 
            SET claim_date = %s, status = %s, claim_number = %s, description = %s, 
                resolution = %s, resolution_date = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND warranty_id = %s
            RETURNING updated_at
        """, (parsed_claim_date, status, claim_number, description, resolution, 
              parsed_resolution_date, claim_id, warranty_id))
        
        updated_at = cur.fetchone()[0]
        conn.commit()
        
        # Return updated claim
        claim = {
            'id': claim_id,
            'warranty_id': warranty_id,
            'claim_date': parsed_claim_date.isoformat() if parsed_claim_date else None,
            'status': status,
            'claim_number': claim_number,
            'description': description,
            'resolution': resolution,
            'resolution_date': parsed_resolution_date.isoformat() if parsed_resolution_date else None,
            'updated_at': updated_at.isoformat() if updated_at else None
        }
        
        logger.info(f"Updated claim {claim_id} for warranty {warranty_id} by user {user_id}")
        return jsonify(claim), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error updating claim: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>/claims/<int:claim_id>', methods=['DELETE'])
@token_required
def delete_claim(warranty_id, claim_id):
    """Delete a warranty claim"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        # Verify warranty exists and user owns it
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT w.id, w.product_name 
            FROM warranties w
            JOIN warranty_claims c ON w.id = c.warranty_id
            WHERE w.id = %s AND c.id = %s AND w.user_id = %s
        """, (warranty_id, claim_id, user_id))
        
        result = cur.fetchone()
        if not result:
            return jsonify({'error': 'Warranty or claim not found or access denied'}), 404

        # Remember attached local files so they can be removed with the claim
        # (the claim_documents rows themselves cascade on delete)
        cur.execute("""
            SELECT file_path FROM claim_documents
            WHERE claim_id = %s AND file_path IS NOT NULL
        """, (claim_id,))
        document_files = [row[0] for row in cur.fetchall()]

        # Delete the claim
        cur.execute("""
            DELETE FROM warranty_claims
            WHERE id = %s AND warranty_id = %s
        """, (claim_id, warranty_id))

        if cur.rowcount == 0:
            return jsonify({'error': 'Claim not found'}), 404

        conn.commit()

        for doc_file in document_files:
            _delete_stored_file(cur, doc_file)
        
        logger.info(f"Deleted claim {claim_id} for warranty {warranty_id} by user {user_id}")
        return jsonify({'message': 'Claim deleted successfully'}), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error deleting claim: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

 

# ============================
# Claim Documents (issue #148)
# ============================

def _serialize_claim_document(row):
    """Serialize a claim_documents row (id, claim_id, original_filename,
    file_path, paperless_document_id, created_at)."""
    return {
        'id': row[0],
        'claim_id': row[1],
        'original_filename': row[2],
        'file_path': row[3],
        'paperless_document_id': row[4],
        'created_at': row[5].isoformat() if row[5] else None
    }


def _verify_claim_ownership(cur, warranty_id, claim_id, user_id):
    """True when the user owns the warranty the claim belongs to."""
    cur.execute("""
        SELECT w.id
        FROM warranties w
        JOIN warranty_claims c ON w.id = c.warranty_id
        WHERE w.id = %s AND c.id = %s AND w.user_id = %s
    """, (warranty_id, claim_id, user_id))
    return cur.fetchone() is not None


@warranties_bp.route('/warranties/<int:warranty_id>/claims/<int:claim_id>/documents', methods=['POST'])
@token_required
def add_claim_document(warranty_id, claim_id):
    """Attach a document to a claim: a local file upload, or a link to an
    existing Paperless-ngx document (paperless_document_id form field)."""
    conn = None
    cur = None

    try:
        user_id = request.user['id']
        conn = get_db_connection()
        cur = conn.cursor()

        if not _verify_claim_ownership(cur, warranty_id, claim_id, user_id):
            return jsonify({'error': 'Warranty or claim not found or access denied'}), 404

        paperless_document_id = None
        raw_pid = request.form.get('paperless_document_id')
        if raw_pid:
            try:
                paperless_document_id = int(raw_pid)
            except (TypeError, ValueError):
                return jsonify({'error': 'Invalid paperless_document_id'}), 400

        # Claim documents follow the same Paperless linking rule as
        # warranties: another user's document cannot be linked here either
        # (GHSA-fv62-3hrm-gf83 / GHSA-3h89-rqfj-5674 via the claims path).
        if paperless_document_id is not None and not user_can_link_paperless_document(
                cur, user_id, request.user.get('is_admin', False), paperless_document_id):
            return jsonify({'error': 'You are not authorized to link this Paperless document',
                            'code': 'paperless_document_not_owned'}), 403

        db_file_path = None
        original_filename = None

        if paperless_document_id is not None:
            # Link an existing Paperless document; the local file input is ignored.
            original_filename = (request.form.get('original_filename') or '').strip() \
                or f'Paperless document {paperless_document_id}'
        elif 'file' in request.files and request.files['file'].filename:
            upload = request.files['file']
            if not allowed_file(upload.filename):
                return jsonify({'error': 'File type not allowed',
                                'code': 'file_type_not_allowed'}), 400
            filename = unique_upload_filename(upload.filename, infix="claim_")
            full_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            try:
                upload.save(full_path)
            except OSError as e:
                logger.error(f"Error saving claim document {filename}: {e}")
                return jsonify({'error': 'Could not save the uploaded file'}), 500
            db_file_path = os.path.join('uploads', filename)
            original_filename = upload.filename
        else:
            return jsonify({'error': 'No file or paperless_document_id provided'}), 400

        if len(original_filename) > 255:
            original_filename = original_filename[:255]

        cur.execute("""
            INSERT INTO claim_documents
            (claim_id, original_filename, file_path, paperless_document_id)
            VALUES (%s, %s, %s, %s)
            RETURNING id, claim_id, original_filename, file_path, paperless_document_id, created_at
        """, (claim_id, original_filename, db_file_path, paperless_document_id))

        document = _serialize_claim_document(cur.fetchone())
        if paperless_document_id is not None:
            record_paperless_document_owner(cur, paperless_document_id, user_id)
        conn.commit()

        logger.info(f"Added document {document['id']} to claim {claim_id} by user {user_id}")
        return jsonify(document), 201

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error adding claim document: {e}")
        return jsonify({'error': 'Internal server error'}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/warranties/<int:warranty_id>/claims/<int:claim_id>/documents', methods=['GET'])
@token_required
def get_claim_documents(warranty_id, claim_id):
    """List a claim's documents. Owner and admins only: claim documents are
    private even under global view, and their metadata (filenames, linked
    Paperless ids) stays private with them."""
    conn = None
    cur = None

    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        conn = get_db_connection()
        cur = conn.cursor()

        # The claim must exist under this warranty
        cur.execute("""
            SELECT w.user_id FROM warranties w
            JOIN warranty_claims c ON w.id = c.warranty_id
            WHERE w.id = %s AND c.id = %s
        """, (warranty_id, claim_id))
        owner_row = cur.fetchone()
        if not owner_row:
            return jsonify({'error': 'Warranty or claim not found'}), 404

        if owner_row[0] != user_id and not is_admin:
            return jsonify({'error': 'Warranty or claim not found or access denied'}), 404

        cur.execute("""
            SELECT id, claim_id, original_filename, file_path, paperless_document_id, created_at
            FROM claim_documents
            WHERE claim_id = %s
            ORDER BY created_at, id
        """, (claim_id,))

        return jsonify([_serialize_claim_document(row) for row in cur.fetchall()]), 200

    except Exception as e:
        logger.error(f"Error getting claim documents: {e}")
        return jsonify({'error': 'Internal server error'}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/warranties/<int:warranty_id>/claims/<int:claim_id>/documents/<int:document_id>', methods=['DELETE'])
@token_required
def delete_claim_document(warranty_id, claim_id, document_id):
    """Remove a document from a claim. Local files are deleted from disk;
    Paperless documents are only unlinked (never deleted from Paperless)."""
    conn = None
    cur = None

    try:
        user_id = request.user['id']
        conn = get_db_connection()
        cur = conn.cursor()

        if not _verify_claim_ownership(cur, warranty_id, claim_id, user_id):
            return jsonify({'error': 'Warranty or claim not found or access denied'}), 404

        cur.execute("""
            SELECT file_path FROM claim_documents
            WHERE id = %s AND claim_id = %s
        """, (document_id, claim_id))
        row = cur.fetchone()
        if not row:
            return jsonify({'error': 'Document not found'}), 404
        file_path = row[0]

        cur.execute("DELETE FROM claim_documents WHERE id = %s AND claim_id = %s",
                    (document_id, claim_id))
        conn.commit()

        _delete_stored_file(cur, file_path)

        logger.info(f"Deleted document {document_id} from claim {claim_id} by user {user_id}")
        return jsonify({'message': 'Document deleted successfully'}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error deleting claim document: {e}")
        return jsonify({'error': 'Internal server error'}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)
