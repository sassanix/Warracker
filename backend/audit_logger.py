import ipaddress
import logging
from flask import request
from .db_handler import get_db_connection, release_db_connection

logger = logging.getLogger(__name__)


def _validated_ip(raw_ip):
    """Return a canonical IP string, or None if the value is not a valid IP."""
    if not raw_ip:
        return None
    try:
        return str(ipaddress.ip_address(str(raw_ip).strip()))
    except ValueError:
        return None


def create_audit_log(action, target_type=None, target_id=None, details=None):
    """Helper function to insert a new record into the audit log."""
    user_id = None
    username = 'System'
    ip_address = None

    if request:
        ip_address = _validated_ip(request.remote_addr)
        if hasattr(request, 'user') and request.user:
            user_id = request.user.get('id')
            username = request.user.get('username')

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO audit_log (user_id, username, action, target_type, target_id, details, ip_address)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (user_id, username, action, target_type, str(target_id), details, ip_address))
            conn.commit()
    except Exception as e:
        logger.error(f'Failed to create audit log: {e}')
        if conn:
            conn.rollback()
    finally:
        if conn:
            release_db_connection(conn)



