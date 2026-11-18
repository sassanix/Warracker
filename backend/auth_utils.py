# backend/auth_utils.py
import jwt
import uuid
from datetime import datetime, UTC, timedelta
from flask import current_app, request, jsonify
from functools import wraps
from werkzeug.exceptions import HTTPException
import re

# IMPORTANT: We need to import db_handler here for the decorators
try:
    from . import db_handler
except ImportError:
    import db_handler

# AUTH-07: one advisory lock key serializing first-user provisioning.
# Two concurrent first registrations (local or OIDC) both saw zero users
# and both became owners. Taking this lock before the user-count check
# makes the check-and-insert atomic across workers and processes.
FIRST_USER_LOCK_KEY = 20261118


def acquire_first_user_lock(cur):
    """Take the transaction-scoped advisory lock for first-user checks.

    pg_advisory_xact_lock blocks until held, then releases at commit or
    rollback, so a connection returned to the pool can never hold it.
    Call it inside the registration transaction, before re-reading the
    user count and inserting.
    """
    cur.execute("SELECT pg_advisory_xact_lock(%s)", (FIRST_USER_LOCK_KEY,))


def generate_token(user_id):
    """Generate a JWT token for the user.

    Returns (token, jti). The jti (AUTH-01) is a per-login session id:
    callers store it as the user_sessions.session_token so a token can
    be revoked by deleting its session row (logout, password change,
    password reset). Tokens minted before this existed carry no jti and
    are grandfathered by token_required until their 24h expiry.
    """
    jti = str(uuid.uuid4())
    payload = {
        'exp': datetime.now(UTC) + current_app.config['JWT_EXPIRATION_DELTA'],
        'iat': datetime.now(UTC),
        'sub': str(user_id),
        'jti': jti,
    }
    return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256'), jti

def decode_token(token):
    """Decode a JWT token and return the user_id"""
    payload = decode_token_payload(token)
    return payload['sub'] if payload else None

def decode_token_payload(token):
    """Decode a JWT token and return the full payload, or None."""
    try:
        return jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None  # Token has expired
    except jwt.InvalidTokenError:
        return None  # Invalid token

def token_required(f):
    """Decorator to protect routes that require authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        # If no token in header, check form data for POST requests
        if not token and request.method == 'POST':
            token = request.form.get('auth_token')  # Check form data
        
        # If still no token, check URL query parameters
        if not token:
            token = request.args.get('token')  # Check query parameters
            
        # If no token is provided
        if not token:
            current_app.logger.warning(f"Authentication attempt without token: {request.path}")
            return jsonify({'message': 'Authentication token is missing!'}), 401
        
        # Decode the token
        payload = decode_token_payload(token)
        user_id = payload['sub'] if payload else None
        if not user_id:
            current_app.logger.warning(f"Invalid token used for: {request.path}")
            return jsonify({'message': 'Invalid or expired token!'}), 401

        # AUTH-01: a token carrying a jti is bound to its session row.
        # Logout, password change, and password reset delete session rows,
        # so a revoked token fails here even though its signature and
        # expiry are still valid. Tokens minted before jti existed carry
        # no jti; they are grandfathered until their 24h expiry.
        session_jti = payload.get('jti') if payload else None

        # Check if user exists.
        # Release the connection before calling the route. Holding it, with
        # its transaction open, for the whole request doubled the connections
        # each request needed and could exhaust the pool under load.
        conn = None
        session_revoked = False
        try:
            conn = db_handler.get_db_connection()
            with conn.cursor() as cur:
                # Try to get user with is_owner column, fall back to without it if column doesn't exist
                try:
                    cur.execute('SELECT id, username, email, is_admin, is_owner, oidc_sub FROM users WHERE id = %s AND is_active = TRUE', (user_id,))
                    user = cur.fetchone()
                    has_owner_column = True
                except Exception as e:
                    # If the query fails (likely because is_owner column doesn't exist), rollback and try again
                    current_app.logger.warning(f"Failed to query with is_owner column, falling back: {e}")
                    conn.rollback()  # Rollback the failed transaction
                    cur.execute('SELECT id, username, email, is_admin FROM users WHERE id = %s AND is_active = TRUE', (user_id,))
                    user = cur.fetchone()
                    has_owner_column = False
                if user and session_jti:
                    # expires_at is stored timezone-naive in UTC; compare
                    # against UTC explicitly so a non-UTC database
                    # timezone cannot stretch a session.
                    cur.execute(
                        'SELECT 1 FROM user_sessions WHERE user_id = %s '
                        'AND session_token = %s '
                        'AND expires_at > (NOW() AT TIME ZONE \'UTC\')',
                        (user[0], session_jti))
                    if not cur.fetchone():
                        session_revoked = True
                        user = None
            conn.rollback()  # end the read-only transaction before releasing
        except HTTPException:
            # Let HTTP errors (e.g. 413 from oversized uploads) propagate to
            # the app's error handlers instead of being masked as a 500 here.
            raise
        except Exception as e:
            current_app.logger.error(f"Authentication error: {e}")
            return jsonify({'message': 'Authentication error!'}), 500
        finally:
            if conn:
                db_handler.release_db_connection(conn)

        if not user:
            if session_revoked:
                return jsonify({'message': 'Session expired or revoked!'}), 401
            return jsonify({'message': 'User not found or inactive!'}), 401

        # Add user info to request context
        request.user = {
            'id': user[0],
            'username': user[1],
            'email': user[2],
            'is_admin': user[3],
            'session_jti': session_jti,
        }

        if has_owner_column:
            request.user.update({
                'is_owner': user[4],
                'oidc_managed': user[5] is not None
            })

        try:
            return f(*args, **kwargs)
        except HTTPException:
            raise
        except Exception:
            current_app.logger.exception(f"Unhandled error in {request.path}")
            return jsonify({'message': 'Authentication error!'}), 500

    return decorated

def admin_required(f):
    """Decorator to protect routes that require admin privileges"""
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if not request.user.get('is_admin', False):
            current_app.logger.error(f"User {request.user.get('username')} is not an admin")
            return jsonify({'message': 'Admin privileges required!'}), 403
        
        return f(*args, **kwargs)
    
    return decorated

def is_valid_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def is_valid_password(password):
    """Validate password strength"""
    # At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    if len(password) < 8:
        return False
    if not re.search(r'[A-Z]', password):
        return False
    if not re.search(r'[a-z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    return True


def is_password_too_long(password):
    """bcrypt rejects passwords longer than 72 bytes with ValueError — check
    up front so callers can return 400 instead of surfacing a 500."""
    return len(password.encode('utf-8')) > 72

 