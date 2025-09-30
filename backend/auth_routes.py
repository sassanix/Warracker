# backend/auth_routes.py
# Updated: 2025-01-24 - Fixed API endpoints for notifications
from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, timedelta
import uuid
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os
import pytz
import psycopg2

# Use relative imports for project modules
try:
    from . import db_handler, notifications
    from .auth_utils import generate_token, token_required, is_valid_email, is_valid_password
    from .localization import SUPPORTED_LANGUAGES
except ImportError:
    # Fallback for development environment
    import db_handler, notifications
    from auth_utils import generate_token, token_required, is_valid_email, is_valid_password
    from localization import SUPPORTED_LANGUAGES

# Import bcrypt from extensions since it's initialized with the app
try:
    from .extensions import bcrypt
except ImportError:
    # Fallback for development environment
    from extensions import bcrypt

auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    conn = None
    try:
        data = request.get_json()
        
        # Check if registration is enabled
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Check if settings table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'site_settings'
                )
            """)
            table_exists = cur.fetchone()[0]
            
            registration_enabled = True
            if table_exists:
                # Get registration_enabled setting
                cur.execute("SELECT value FROM site_settings WHERE key = 'registration_enabled'")
                result = cur.fetchone()
                
                if result:
                    registration_enabled = result[0].lower() == 'true'
            
            # Check if there are any users (first user can register regardless of setting)
            cur.execute('SELECT COUNT(*) FROM users')
            user_count = cur.fetchone()[0]
            
            # If registration is disabled and this is not the first user, return error
            if not registration_enabled and user_count > 0:
                return jsonify({'message': 'Registration is currently disabled!'}), 403
        
        # Validate required fields
        required_fields = ['username', 'email', 'password']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({'message': f'{field} is required!'}), 400
        
        username = data['username']
        email = data['email']
        password = data['password']
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        
        # Validate email format
        if not is_valid_email(email):
            return jsonify({'message': 'Invalid email format!'}), 400
        
        # Validate password strength
        if not is_valid_password(password):
            return jsonify({'message': 'Password must be at least 8 characters and include uppercase, lowercase, and numbers!'}), 400
        
        # Hash the password
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        
        with conn.cursor() as cur:
            # Check if username or email already exists
            cur.execute('SELECT id FROM users WHERE username = %s OR email = %s', (username, email))
            existing_user = cur.fetchone()
            
            if existing_user:
                return jsonify({'message': 'Username or email already exists!'}), 409
            
            # Check if this is the first user (who will be an admin and owner)
            cur.execute('SELECT COUNT(*) FROM users')
            user_count = cur.fetchone()[0]
            is_admin = user_count == 0
            is_owner = user_count == 0  # First user is also the owner
            
            # Insert new user
            cur.execute(
                'INSERT INTO users (username, email, password_hash, first_name, last_name, is_admin, is_owner) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id',
                (username, email, password_hash, first_name, last_name, is_admin, is_owner)
            )
            user_id = cur.fetchone()[0]
            
            # Log owner creation for transparency
            if is_owner:
                current_app.logger.info(f"✅ First user registered: {username} ({email}) - automatically set as admin and owner")
            
            # Generate token
            token = generate_token(user_id)
            
            # Update last login
            cur.execute('UPDATE users SET last_login = %s WHERE id = %s', (datetime.utcnow(), user_id))
            
            # Store session info
            ip_address = request.remote_addr
            user_agent = request.headers.get('User-Agent', '')
            session_token = str(uuid.uuid4())
            expires_at = datetime.utcnow() + current_app.config['JWT_EXPIRATION_DELTA']
            
            cur.execute(
                'INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address, user_agent, login_method) VALUES (%s, %s, %s, %s, %s, %s)',
                (user_id, session_token, expires_at, ip_address, user_agent, 'local')
            )
            
            conn.commit()
            
            return jsonify({
                'message': 'User registered successfully!',
                'token': token,
                'user': {
                    'id': user_id,
                    'username': username,
                    'email': email,
                    'is_admin': is_admin
                }
            }), 201
    except Exception as e:
        current_app.logger.error(f"Registration error: {e}")
        if conn:
            conn.rollback()
        return jsonify({'message': 'Registration failed!'}), 500
    finally:
        if conn:
            db_handler.release_db_connection(conn)

@auth_bp.route('/login', methods=['POST'])
def login():
    conn = None
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('username') or not data.get('password'):
            return jsonify({'message': 'Username and password are required!'}), 400
        
        username = data['username']
        password = data['password']
        
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Check if user exists - include is_admin in the query
            cur.execute('SELECT id, username, email, password_hash, is_active, is_admin FROM users WHERE username = %s OR email = %s', (username, username))
            user = cur.fetchone()
            
            if not user or not bcrypt.check_password_hash(user[3], password):
                return jsonify({'message': 'Invalid username or password!'}), 401
            
            if not user[4]:  # is_active
                return jsonify({'message': 'Account is inactive!'}), 401
            
            user_id = user[0]
            
            # Generate token
            token = generate_token(user_id)
            
            # Update last login
            cur.execute('UPDATE users SET last_login = %s WHERE id = %s', (datetime.utcnow(), user_id))
            
            # Store session info
            ip_address = request.remote_addr
            user_agent = request.headers.get('User-Agent', '')
            session_token = str(uuid.uuid4())
            expires_at = datetime.utcnow() + current_app.config['JWT_EXPIRATION_DELTA']
            
            cur.execute(
                'INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address, user_agent, login_method) VALUES (%s, %s, %s, %s, %s, %s)',
                (user_id, session_token, expires_at, ip_address, user_agent, 'local')
            )
            
            conn.commit()
            
            return jsonify({
                'message': 'Login successful!',
                'token': token,
                'user': {
                    'id': user_id,
                    'username': user[1],
                    'email': user[2],
                    'is_admin': user[5]  # Include is_admin flag
                }
            }), 200
    except Exception as e:
        current_app.logger.error(f"Login error: {e}")
        if conn:
            conn.rollback()
        return jsonify({'message': 'Login failed!'}), 500
    finally:
        if conn:
            db_handler.release_db_connection(conn)

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout():
    conn = None
    try:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        else:
            return jsonify({'message': 'No token provided!'}), 400
        
        user_id = request.user['id']
        
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Invalidate all sessions for this user
            cur.execute('DELETE FROM user_sessions WHERE user_id = %s', (user_id,))
            conn.commit()
            
            return jsonify({'message': 'Logout successful!'}), 200
    except Exception as e:
        current_app.logger.error(f"Logout error: {e}")
        if conn:
            conn.rollback()
        return jsonify({'message': 'Logout failed!'}), 500
    finally:
        if conn:
            db_handler.release_db_connection(conn)

@auth_bp.route('/validate-token', methods=['GET'])
@token_required
def validate_token():
    """Validate JWT token and return user info"""
    try:
        # If we got here, the token is valid (token_required decorator validated it)
        return jsonify({
            'valid': True,
            'user': {
                'id': request.user['id'],
                'username': request.user['username'],
                'email': request.user['email'],
                'is_admin': request.user['is_admin'],
                'is_owner': request.user.get('is_owner', False)
            },
            'message': 'Token is valid'
        }), 200
    except Exception as e:
        current_app.logger.error(f"Token validation error: {e}")
        return jsonify({
            'valid': False,
            'message': 'Invalid token'
        }), 401

@auth_bp.route('/user', methods=['GET'])
@token_required
def get_user():
    conn = None
    try:
        user_id = request.user['id'] # Get user ID from the decorator

        # --- ADD DATABASE QUERY ---
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Try to get user with is_owner column, fall back to without it if column doesn't exist
            try:
                cur.execute(
                    'SELECT id, username, email, first_name, last_name, is_admin, is_owner FROM users WHERE id = %s',
                    (user_id,)
                )
                user_data = cur.fetchone()
                has_owner_column = True
                columns = ['id', 'username', 'email', 'first_name', 'last_name', 'is_admin', 'is_owner']
            except Exception as e:
                # If the query fails (likely because is_owner column doesn't exist), rollback and try again
                current_app.logger.warning(f"Failed to query with is_owner column in get_user, falling back: {e}")
                conn.rollback()  # Rollback the failed transaction
                cur.execute(
                    'SELECT id, username, email, first_name, last_name, is_admin FROM users WHERE id = %s',
                    (user_id,)
                )
                user_data = cur.fetchone()
                has_owner_column = False
                columns = ['id', 'username', 'email', 'first_name', 'last_name', 'is_admin']
        # --- END DATABASE QUERY ---

        if not user_data:
             return jsonify({'message': 'User not found!'}), 404

        # Map database columns to a dictionary
        user_info = dict(zip(columns, user_data))
        
        # Add is_owner field if it wasn't included in the query
        if not has_owner_column:
            user_info['is_owner'] = False

        # Return the full user information
        return jsonify(user_info), 200

    except Exception as e:
        current_app.logger.error(f"Get user error: {e}")
        return jsonify({'message': 'Failed to retrieve user information!'}), 500
    finally:
        # Release the connection back to the pool
        if conn:
            db_handler.release_db_connection(conn)

@auth_bp.route('/password/reset-request', methods=['POST'])
def request_password_reset():
    conn = None
    try:
        data = request.get_json()
        
        if not data.get('email'):
            return jsonify({'message': 'Email is required!'}), 400
        
        email = data['email']
        
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Check if user exists
            cur.execute('SELECT id FROM users WHERE email = %s', (email,))
            user = cur.fetchone()
            
            if not user:
                # Don't reveal if email exists or not for security
                return jsonify({'message': 'If your email is registered, you will receive a password reset link.'}), 200
            
            user_id = user[0]
            
            # Generate reset token
            reset_token = str(uuid.uuid4())
            expires_at = datetime.utcnow() + timedelta(hours=24)
            
            # Delete any existing tokens for this user
            cur.execute('DELETE FROM password_reset_tokens WHERE user_id = %s', (user_id,))
            
            # Insert new token
            cur.execute(
                'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (%s, %s, %s)',
                (user_id, reset_token, expires_at)
            )
            
            conn.commit()

            # Get email base URL from settings with correct precedence
            # Priority: Environment Variable > Database Setting > Hardcoded Default
            email_base_url = os.environ.get('APP_BASE_URL')
            if email_base_url is None:
                # Fall back to database setting if environment variable is not set
                email_base_url = 'http://localhost:8080' # Default fallback
                try:
                    cur.execute("SELECT value FROM site_settings WHERE key = 'email_base_url'")
                    result = cur.fetchone()
                    if result:
                        email_base_url = result[0]
                    else:
                        current_app.logger.warning("email_base_url setting not found for password reset, using default.")
                except Exception as e:
                     current_app.logger.error(f"Error fetching email_base_url from settings for password reset: {e}. Using default.")
            
            # Ensure base URL doesn't end with a slash
            email_base_url = email_base_url.rstrip('/')

            # Construct the full reset link
            reset_link = f"{email_base_url}/reset-password.html?token={reset_token}" # Use base URL and correct page
            
            # Send password reset email
            current_app.logger.info(f"Password reset requested for user {user_id}. Preparing to send email.")
            try:
                send_password_reset_email(email, reset_link)
                current_app.logger.info(f"Password reset email initiated for {email}")
            except Exception as e:
                current_app.logger.error(f"Failed to send password reset email to {email}: {e}")
                # Even if email fails, don't tell the user. 
                # This prevents leaking information about registered emails or email server issues.
                # The user journey remains the same: "If registered, you'll get an email."
            
            # Always return success to the user, regardless of email success/failure
            return jsonify({
                'message': 'If your email is registered, you will receive a password reset link.'
            }), 200

    except Exception as e:
        current_app.logger.error(f"Password reset request error: {e}")
        if conn:
            conn.rollback()
        return jsonify({'message': 'Password reset request failed!'}), 500
    finally:
        if conn:
            db_handler.release_db_connection(conn)

@auth_bp.route('/status', methods=['GET'])
def auth_status():
    return jsonify({
        "authentication_required": True,
        "message": "Authentication is required for most endpoints"
    })

@auth_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile():
    user_id = request.user['id']
    
    try:
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'message': 'No input data provided'}), 400

        # Extract fields
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        new_email = data.get('email', '').strip()

        # Validate input
        if not first_name or not last_name:
            return jsonify({'message': 'First name and last name are required'}), 400

        # Get database connection
        conn = db_handler.get_db_connection()
        cursor = conn.cursor()

        try:
            update_fields = ["first_name = %s", "last_name = %s"]
            update_params = [first_name, last_name]

            # Handle email change
            if new_email:
                if not is_valid_email(new_email):
                    conn.rollback()
                    return jsonify({'message': 'Invalid email format!'}), 400

                # Check if the new email is different from the current one
                cursor.execute("SELECT email FROM users WHERE id = %s", (user_id,))
                current_email_tuple = cursor.fetchone()
                if not current_email_tuple:
                    conn.rollback()
                    return jsonify({'message': 'User not found while fetching current email.'}), 404
                current_email = current_email_tuple[0]

                if new_email.lower() != current_email.lower():
                    # Check if the new email is already in use by another user
                    cursor.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s) AND id != %s", (new_email, user_id))
                    if cursor.fetchone():
                        conn.rollback()
                        return jsonify({'message': 'This email address is already in use by another account.'}), 409
                    update_fields.append("email = %s")
                    update_params.append(new_email)

            update_query_string = ", ".join(update_fields)
            final_query = f"""
                UPDATE users 
                SET {update_query_string}
                WHERE id = %s 
                RETURNING id, username, email, first_name, last_name, created_at
                """
            cursor.execute(final_query, tuple(update_params + [user_id]))

            # Get updated user data
            user_data = cursor.fetchone()
            if not user_data:
                conn.rollback()
                return jsonify({'message': 'User not found'}), 404

            conn.commit()

            user = {
                'id': user_data[0],
                'username': user_data[1],
                'email': user_data[2],
                'first_name': user_data[3],
                'last_name': user_data[4],
                'created_at': user_data[5].isoformat() if user_data[5] else None
            }
            return jsonify(user), 200

        except Exception as e:
            conn.rollback()
            current_app.logger.error(f"Database error in update_profile: {str(e)}")
            return jsonify({'message': 'Database error occurred'}), 500
        finally:
            cursor.close()
            db_handler.release_db_connection(conn)

    except Exception as e:
        current_app.logger.error(f"Error in update_profile: {str(e)}")
        return jsonify({'message': 'An error occurred while updating profile'}), 500

@auth_bp.route('/account', methods=['DELETE'])
@token_required
def delete_account():
    user_id = request.user['id']
    
    try:
        # Get database connection
        conn = db_handler.get_db_connection()
        cursor = conn.cursor()
        
        try:
            # Begin transaction
            cursor.execute("BEGIN")
            
            # Check if the current user is the owner
            try:
                cursor.execute('SELECT is_owner FROM users WHERE id = %s', (user_id,))
                user_data = cursor.fetchone()
                is_owner = user_data[0] if user_data and len(user_data) > 0 else False
            except Exception as e:
                # If the query fails (likely because is_owner column doesn't exist), try without it
                current_app.logger.warning(f"Failed to query with is_owner column in delete_account, falling back: {e}")
                cursor.execute("ROLLBACK")  # Rollback the failed transaction
                cursor.execute("BEGIN")     # Start a new transaction
                is_owner = False
            
            if is_owner:
                cursor.execute("ROLLBACK")
                return jsonify({'message': 'The application owner cannot delete their own account. Please transfer ownership first.'}), 403
            
            # Delete user's warranties
            cursor.execute("DELETE FROM warranties WHERE user_id = %s", (user_id,))
            
            # Delete user's reset tokens if any
            cursor.execute("DELETE FROM password_reset_tokens WHERE user_id = %s", (user_id,))
            
            # Delete user's sessions if any
            cursor.execute('DELETE FROM user_sessions WHERE user_id = %s', (user_id,))
            sessions_deleted = cursor.rowcount
            current_app.logger.info(f"Deleted {sessions_deleted} sessions belonging to user {user_id}")

            # Delete user's tags
            cursor.execute('DELETE FROM tags WHERE user_id = %s', (user_id,))
            tags_deleted = cursor.rowcount
            current_app.logger.info(f"Deleted {tags_deleted} tags belonging to user {user_id}")

            # Delete user
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            user_deleted = cursor.rowcount
            current_app.logger.info(f"Deleted user {user_id}, affected rows: {user_deleted}")
            
            # Commit transaction
            cursor.execute("COMMIT")
            
            return jsonify({'message': 'Account deleted successfully'}), 200
            
        except Exception as e:
            cursor.execute("ROLLBACK")
            current_app.logger.error(f"Database error in delete_account: {str(e)}")
            return jsonify({'message': 'Database error occurred'}), 500
        finally:
            cursor.close()
            db_handler.release_db_connection(conn)
            
    except Exception as e:
        current_app.logger.error(f"Error in delete_account: {str(e)}")
        return jsonify({'message': 'An error occurred while deleting account'}), 500

# Helper function for checking currency column
def has_currency_symbol_column(cursor):
    """Check if user_preferences table has currency_symbol column"""
    try:
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='user_preferences' 
            AND column_name='currency_symbol'
        """)
        return cursor.fetchone() is not None
    except Exception:
        return False

# Note: re and pytz are already imported at the top

def is_valid_timezone(tz):
    """Validate if a timezone string is valid"""
    try:
        pytz.timezone(tz)
        return True
    except pytz.exceptions.UnknownTimeZoneError:
        return False

@auth_bp.route('/registration-status', methods=['GET'])
def check_registration_status():
    """Check if registration is enabled"""
    conn = None
    try:
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Check if settings table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'site_settings'
                )
            """)
            table_exists = cur.fetchone()[0]
            
            if not table_exists:
                # If table doesn't exist, registration is enabled by default
                return jsonify({"enabled": True}), 200
            
            # Get registration_enabled setting
            cur.execute("SELECT value FROM site_settings WHERE key = 'registration_enabled'")
            result = cur.fetchone()
            
            if not result:
                # If setting doesn't exist, registration is enabled by default
                return jsonify({"enabled": True}), 200
            
            registration_enabled = result[0].lower() == 'true'
            
            return jsonify({"enabled": registration_enabled}), 200
    except Exception as e:
        current_app.logger.error(f"Error checking registration status: {e}")
        return jsonify({"enabled": True}), 200  # Default to enabled on error
    finally:
        if conn:
            db_handler.release_db_connection(conn)

@auth_bp.route('/password/reset', methods=['POST'])
def reset_password():
    conn = None
    try:
        data = request.get_json()
        
        if not data.get('token') or not data.get('password'):
            return jsonify({'message': 'Token and password are required!'}), 400
        
        token = data['token']
        password = data['password']
        
        # Validate password strength
        if not is_valid_password(password):
            return jsonify({'message': 'Password must be at least 8 characters and include uppercase, lowercase, and numbers!'}), 400
        
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Check if token exists and is valid
            cur.execute('SELECT user_id, expires_at FROM password_reset_tokens WHERE token = %s', (token,))
            token_info = cur.fetchone()
            
            if not token_info or token_info[1] < datetime.utcnow():
                return jsonify({'message': 'Invalid or expired token!'}), 400
            
            user_id = token_info[0]
            
            # Hash the new password
            password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
            
            # Update user's password
            cur.execute('UPDATE users SET password_hash = %s WHERE id = %s', (password_hash, user_id))
            
            # Delete the used token
            cur.execute('DELETE FROM password_reset_tokens WHERE token = %s', (token,))
            
            conn.commit()
            
            return jsonify({'message': 'Password reset successful!'}), 200
    except Exception as e:
        current_app.logger.error(f"Password reset error: {e}")
        if conn:
            conn.rollback()
        return jsonify({'message': 'Password reset failed!'}), 500
    finally:
        if conn:
            db_handler.release_db_connection(conn)

@auth_bp.route('/password/change', methods=['POST'])
@token_required
def change_password():
    """Allow logged-in users to change their password"""
    conn = None
    try:
        data = request.get_json()
        
        if not data.get('current_password') or not data.get('new_password'):
            return jsonify({'message': 'Current password and new password are required!'}), 400
        
        current_password = data['current_password']
        new_password = data['new_password']
        user_id = request.user['id']  # Get user ID from the token_required decorator
        
        # Validate new password strength
        if not is_valid_password(new_password):
            return jsonify({'message': 'New password must be at least 8 characters and include uppercase, lowercase, and numbers!'}), 400
        
        conn = db_handler.get_db_connection()
        with conn.cursor() as cur:
            # Get the user's current password hash
            cur.execute('SELECT password_hash FROM users WHERE id = %s', (user_id,))
            user_data = cur.fetchone()
            
            if not user_data:
                return jsonify({'message': 'User not found!'}), 404
            
            current_password_hash = user_data[0]
            
            # Verify the current password
            if not bcrypt.check_password_hash(current_password_hash, current_password):
                return jsonify({'message': 'Incorrect current password!'}), 401
            
            # Hash the new password
            new_password_hash = bcrypt.generate_password_hash(new_password).decode('utf-8')
            
            # Update the password in the database
            cur.execute('UPDATE users SET password_hash = %s WHERE id = %s', (new_password_hash, user_id))
            
            conn.commit()
            
            return jsonify({'message': 'Password changed successfully!'}), 200
            
    except Exception as e:
        current_app.logger.error(f"Password change error: {e}")
        if conn:
            conn.rollback()
        return jsonify({'message': 'Failed to change password!'}), 500
    finally:
        if conn:
            db_handler.release_db_connection(conn)

# Helper functions for email functionality
def send_password_reset_email(recipient_email, reset_link):
    """Sends the password reset email."""
    current_app.logger.info(f"Attempting to send password reset email to {recipient_email}")
    
    try:
        smtp_host = os.environ.get('SMTP_HOST', 'localhost')
        smtp_port = int(os.environ.get('SMTP_PORT', 1025))
        smtp_username = os.environ.get('SMTP_USERNAME')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_use_tls = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
        smtp_use_ssl = os.environ.get('SMTP_USE_SSL', 'false').lower() == 'true'
        sender_email = os.environ.get('SMTP_SENDER_EMAIL', 'noreply@warracker.com')
        app_name = "Warracker"
        
        subject = f"Password Reset - {app_name}"
        
        app_base_url = os.environ.get('APP_BASE_URL', request.url_root.rstrip('/'))
        
        html_content = f"""
        <html>
            <body>
                <p>Hello,</p>
                <p>You have requested a password reset for your {app_name} account.</p>
                <p>Please click the link below to reset your password:</p>
                <p><a href="{reset_link}">Reset Password</a></p>
                <p>If you did not request this password reset, please ignore this email.</p>
                <p>This link will expire in 24 hours.</p>
                <p>Thanks,<br>The {app_name} Team</p>
            </body>
        </html>
        """

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg.attach(MIMEText(html_content, 'html'))

        current_app.logger.info(f"Attempting to send password reset email to {recipient_email} via {smtp_host}:{smtp_port}")

        server = None
        current_app.logger.info(f"Attempting SMTP connection to {smtp_host}:{smtp_port}")
        if smtp_port == 465:
            current_app.logger.info("Using SMTP_SSL for port 465.")
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        else:
            current_app.logger.info(f"Using SMTP for port {smtp_port}.")
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            if smtp_use_tls:
                current_app.logger.info("Attempting to start TLS (server.starttls()).")
                server.starttls()
                current_app.logger.info("STARTTLS successful.")
        
        if smtp_username and smtp_password:
            current_app.logger.info(f"Logging in with username: {smtp_username}")
            server.login(smtp_username, smtp_password)
            current_app.logger.info("SMTP login successful.")
            
        server.sendmail(sender_email, recipient_email, msg.as_string())
        server.quit()
        current_app.logger.info(f"Password reset email sent successfully to {recipient_email}")
        return True
    except Exception as e:
        current_app.logger.error(f"Error sending password reset email: {e}")
        return False

@auth_bp.route('/preferences', methods=['GET'])
@token_required
def get_preferences():
    """Get user preferences with default values"""
    user_id = request.user['id']
    try:
        conn = db_handler.get_db_connection()
        cursor = conn.cursor()
        
        try:
            # Check if user_preferences table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'user_preferences'
                )
            """)
            table_exists = cursor.fetchone()[0]
            
            if not table_exists:
                # Return default preferences if table doesn't exist
                default_preferences = {
                    'email_notifications': True,
                    'default_view': 'grid',
                    'theme': 'light',
                    'expiring_soon_days': 30,
                    'notification_frequency': 'daily',
                    'notification_time': '09:00',
                    'timezone': 'UTC',
                    'notification_channel': 'email',
                    'currency_symbol': '$',
                    'date_format': 'MDY',
                    'paperless_view_in_app': False
                }
                return jsonify(default_preferences), 200
            
            # Get user preferences with language preference from users table
            cursor.execute("""
                SELECT up.email_notifications, up.default_view, up.theme, up.expiring_soon_days, 
                       up.notification_frequency, up.notification_time, up.timezone, up.currency_symbol, up.date_format, up.notification_channel, up.apprise_notification_time, up.apprise_notification_frequency, up.apprise_timezone, up.currency_position, up.paperless_view_in_app,
                       u.preferred_language
                FROM user_preferences up
                JOIN users u ON up.user_id = u.id
                WHERE up.user_id = %s
            """, (user_id,))
            
            preferences_data = cursor.fetchone()
            
            if preferences_data:
                preferences = {
                    'email_notifications': preferences_data[0],
                    'default_view': preferences_data[1],
                    'theme': preferences_data[2],
                    'expiring_soon_days': preferences_data[3],
                    'notification_frequency': preferences_data[4],
                    'notification_time': preferences_data[5],
                    'timezone': preferences_data[6],
                    'currency_symbol': preferences_data[7] if preferences_data[7] else '$',
                    'date_format': preferences_data[8] if preferences_data[8] else 'MDY',
                    'notification_channel': preferences_data[9] if preferences_data[9] else 'email',
                    'apprise_notification_time': preferences_data[10] if preferences_data[10] else '09:00',
                    'apprise_notification_frequency': preferences_data[11] if preferences_data[11] else 'daily',
                    'apprise_timezone': preferences_data[12] if preferences_data[12] else 'UTC',
                    'currency_position': preferences_data[13] if preferences_data[13] else 'left',
                    'paperless_view_in_app': preferences_data[14] if len(preferences_data) > 14 and preferences_data[14] is not None else False,
                    'preferred_language': preferences_data[15] if len(preferences_data) > 15 and preferences_data[15] else 'en'
                }
            else:
                # Create default preferences for user, but get language from users table
                cursor.execute("SELECT preferred_language FROM users WHERE id = %s", (user_id,))
                user_lang = cursor.fetchone()
                preferred_language = user_lang[0] if user_lang and user_lang[0] else 'en'
                
                default_preferences = {
                    'email_notifications': True,
                    'default_view': 'grid',
                    'theme': 'light',
                    'expiring_soon_days': 30,
                    'notification_frequency': 'daily',
                    'notification_time': '09:00',
                    'timezone': 'UTC',
                    'notification_channel': 'email',
                    'currency_symbol': '$',
                    'date_format': 'MDY',
                    'currency_position': 'left',
                    'paperless_view_in_app': False,
                    'preferred_language': preferred_language
                }
                preferences = default_preferences
            
            return jsonify(preferences), 200
            
        except Exception as e:
            current_app.logger.error(f"Database error in get_preferences: {str(e)}")
            default_preferences = {
                'email_notifications': True,
                'default_view': 'grid',
                'theme': 'light',
                'expiring_soon_days': 30,
                'notification_frequency': 'daily',
                'notification_time': '09:00',
                'timezone': 'UTC',
                'notification_channel': 'email',
                'currency_symbol': '$',
                'date_format': 'MDY',
                'currency_position': 'left',
                'paperless_view_in_app': False,
                'preferred_language': 'en'
            }
            return jsonify(default_preferences), 200
        finally:
            cursor.close()
            db_handler.release_db_connection(conn)
            
    except Exception as e:
        current_app.logger.error(f"Error in get_preferences: {str(e)}")
        default_preferences = {
            'email_notifications': True,
            'default_view': 'grid',
            'theme': 'light',
            'expiring_soon_days': 30,
            'notification_frequency': 'daily',
            'notification_time': '09:00',
            'timezone': 'UTC',
            'notification_channel': 'email',
            'currency_symbol': '$',
            'date_format': 'MDY',
            'currency_position': 'left',
            'paperless_view_in_app': False,
            'preferred_language': 'en'
        }
        return jsonify(default_preferences), 200

@auth_bp.route('/preferences', methods=['PUT'])
@token_required
def update_preferences():
    """Update user preferences"""
    user_id = request.user['id']
    try:
        data = request.get_json()
        if not data:
            return jsonify({'message': 'No input data provided'}), 400
        
        # Basic validation
        default_view = data.get('default_view')
        theme = data.get('theme')
        expiring_soon_days = data.get('expiring_soon_days')
        currency_symbol = data.get('currency_symbol')
        currency_position = data.get('currency_position')
        date_format = data.get('date_format')
        notification_channel = data.get('notification_channel')
        notification_frequency = data.get('notification_frequency')
        notification_time = data.get('notification_time')
        apprise_notification_time = data.get('apprise_notification_time')
        apprise_notification_frequency = data.get('apprise_notification_frequency')
        timezone = data.get('timezone')
        apprise_timezone = data.get('apprise_timezone')
        paperless_view_in_app = data.get('paperless_view_in_app')
        preferred_language = data.get('preferred_language')
        
        if default_view and default_view not in ['grid', 'list', 'table']:
            return jsonify({'message': 'Invalid default view'}), 400
        if theme and theme not in ['light', 'dark']:
            return jsonify({'message': 'Invalid theme'}), 400
        if expiring_soon_days is not None:
            try:
                expiring_soon_days = int(expiring_soon_days)
                if expiring_soon_days < 1 or expiring_soon_days > 365:
                    return jsonify({'message': 'Expiring soon days must be between 1 and 365'}), 400
            except ValueError:
                return jsonify({'message': 'Expiring soon days must be a valid number'}), 400
        if currency_symbol and len(currency_symbol) > 8:
            return jsonify({'message': 'Currency symbol must be 8 characters or less'}), 400
        if currency_position and currency_position not in ['left', 'right']:
            return jsonify({'message': 'Invalid currency position'}), 400
        if date_format and date_format not in ['MDY', 'DMY', 'YMD', 'MDY_WORDS', 'DMY_WORDS', 'YMD_WORDS']:
            return jsonify({'message': 'Invalid date format'}), 400
        if notification_channel and notification_channel not in ['none', 'email', 'apprise', 'both']:
            return jsonify({'message': 'Invalid notification channel'}), 400
        if paperless_view_in_app is not None and not isinstance(paperless_view_in_app, bool):
            return jsonify({'message': 'paperless_view_in_app must be a boolean'}), 400
        if preferred_language and preferred_language not in SUPPORTED_LANGUAGES:
            return jsonify({'message': 'Invalid language preference'}), 400
        
        conn = db_handler.get_db_connection()
        cursor = conn.cursor()
        
        try:
            # Check if preferences exist
            cursor.execute("SELECT 1 FROM user_preferences WHERE user_id = %s", (user_id,))
            preferences_exist = cursor.fetchone() is not None
            
            if preferences_exist:
                # Update existing preferences
                update_fields = []
                update_values = []
                
                if default_view:
                    update_fields.append("default_view = %s")
                    update_values.append(default_view)
                if theme:
                    update_fields.append("theme = %s")
                    update_values.append(theme)
                if expiring_soon_days is not None:
                    update_fields.append("expiring_soon_days = %s")
                    update_values.append(expiring_soon_days)
                if currency_symbol is not None:
                    update_fields.append("currency_symbol = %s")
                    update_values.append(currency_symbol)
                if currency_position is not None:
                    update_fields.append("currency_position = %s")
                    update_values.append(currency_position)
                if date_format is not None:
                    update_fields.append("date_format = %s")
                    update_values.append(date_format)
                if notification_channel is not None:
                    update_fields.append("notification_channel = %s")
                    update_values.append(notification_channel)
                if notification_frequency is not None:
                    update_fields.append("notification_frequency = %s")
                    update_values.append(notification_frequency)
                if notification_time is not None:
                    update_fields.append("notification_time = %s")
                    update_values.append(notification_time)
                if apprise_notification_time is not None:
                    update_fields.append("apprise_notification_time = %s")
                    update_values.append(apprise_notification_time)
                if apprise_notification_frequency is not None:
                    update_fields.append("apprise_notification_frequency = %s")
                    update_values.append(apprise_notification_frequency)
                if timezone is not None:
                    update_fields.append("timezone = %s")
                    update_values.append(timezone)
                if apprise_timezone is not None:
                    update_fields.append("apprise_timezone = %s")
                    update_values.append(apprise_timezone)
                if paperless_view_in_app is not None:
                    update_fields.append("paperless_view_in_app = %s")
                    update_values.append(paperless_view_in_app)
                
                if update_fields:
                    update_query = f"UPDATE user_preferences SET {', '.join(update_fields)} WHERE user_id = %s"
                    cursor.execute(update_query, update_values + [user_id])
                
                # Update language preference in users table separately
                if preferred_language is not None:
                    cursor.execute("UPDATE users SET preferred_language = %s WHERE id = %s", (preferred_language, user_id))
            else:
                # Insert new preferences
                cursor.execute("""
                    INSERT INTO user_preferences (user_id, default_view, theme, expiring_soon_days, currency_symbol, currency_position, date_format, notification_channel, notification_frequency, notification_time, apprise_notification_time, apprise_notification_frequency, timezone, apprise_timezone, paperless_view_in_app)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (user_id, default_view or 'grid', theme or 'light', expiring_soon_days or 30, currency_symbol or '$', currency_position or 'left', date_format or 'MDY', notification_channel or 'email', notification_frequency or 'daily', notification_time or '09:00', apprise_notification_time or '09:00', apprise_notification_frequency or 'daily', timezone or 'UTC', apprise_timezone or 'UTC', paperless_view_in_app if paperless_view_in_app is not None else False))
                
                # Update language preference in users table separately
                if preferred_language is not None:
                    cursor.execute("UPDATE users SET preferred_language = %s WHERE id = %s", (preferred_language, user_id))
            
            conn.commit()
            
            # Return updated preferences with language preference
            cursor.execute("""
                SELECT up.email_notifications, up.default_view, up.theme, up.expiring_soon_days, 
                       up.notification_frequency, up.notification_time, up.timezone, up.currency_symbol, up.date_format, up.notification_channel, up.apprise_notification_time, up.apprise_notification_frequency, up.apprise_timezone, up.currency_position, up.paperless_view_in_app,
                       u.preferred_language
                FROM user_preferences up
                JOIN users u ON up.user_id = u.id
                WHERE up.user_id = %s
            """, (user_id,))
            
            preferences_data = cursor.fetchone()
            
            if preferences_data:
                preferences = {
                    'email_notifications': preferences_data[0],
                    'default_view': preferences_data[1],
                    'theme': preferences_data[2],
                    'expiring_soon_days': preferences_data[3],
                    'notification_frequency': preferences_data[4],
                    'notification_time': preferences_data[5],
                    'timezone': preferences_data[6],
                    'currency_symbol': preferences_data[7] if preferences_data[7] else '$',
                    'date_format': preferences_data[8] if preferences_data[8] else 'MDY',
                    'notification_channel': preferences_data[9] if preferences_data[9] else 'email',
                    'apprise_notification_time': preferences_data[10] if preferences_data[10] else '09:00',
                    'apprise_notification_frequency': preferences_data[11] if preferences_data[11] else 'daily',
                    'apprise_timezone': preferences_data[12] if preferences_data[12] else 'UTC',
                    'currency_position': preferences_data[13] if preferences_data[13] else 'left',
                    'paperless_view_in_app': preferences_data[14] if len(preferences_data) > 14 and preferences_data[14] is not None else False,
                    'preferred_language': preferences_data[15] if len(preferences_data) > 15 and preferences_data[15] else 'en'
                }
            else:
                preferences = {
                    'email_notifications': True,
                    'default_view': default_view or 'grid',
                    'theme': theme or 'light',
                    'expiring_soon_days': expiring_soon_days or 30,
                    'notification_frequency': notification_frequency or 'daily',
                    'notification_time': notification_time or '09:00',
                    'timezone': timezone or 'UTC',
                    'notification_channel': notification_channel or 'email',
                    'currency_symbol': currency_symbol or '$',
                    'date_format': date_format or 'MDY',
                    'currency_position': currency_position or 'left',
                    'apprise_notification_time': apprise_notification_time or '09:00',
                    'apprise_notification_frequency': apprise_notification_frequency or 'daily',
                    'apprise_timezone': apprise_timezone or 'UTC',
                    'paperless_view_in_app': paperless_view_in_app if paperless_view_in_app is not None else False,
                    'preferred_language': preferred_language or 'en'
                }
            
            return jsonify(preferences), 200
            
        except Exception as e:
            conn.rollback()
            current_app.logger.error(f"Database error in update_preferences: {str(e)}")
            return jsonify({'message': 'Database error occurred'}), 500
        finally:
            cursor.close()
            db_handler.release_db_connection(conn)
            
    except Exception as e:
        current_app.logger.error(f"Error in update_preferences: {str(e)}")
        return jsonify({'message': 'An error occurred while updating preferences'}), 500

# Additional helper functions for email changes
def generate_secure_token(length=40):
    """Generates a cryptographically secure random string token."""
    return uuid.uuid4().hex + uuid.uuid4().hex[:length-len(uuid.uuid4().hex)]

@auth_bp.route('/change-email', methods=['POST'])
@token_required
def request_email_change():
    """Request email change with verification"""
    current_user_id = request.user['id']
    data = request.get_json()
    new_email = data.get('new_email')
    password = data.get('password')

    if not new_email or not password:
        return jsonify({'message': 'New email and password are required'}), 400

    if not is_valid_email(new_email):
        return jsonify({'message': 'Invalid new email format'}), 400

    conn = None
    try:
        conn = db_handler.get_db_connection()
        cur = conn.cursor()

        # Fetch current user's password hash and current email
        cur.execute("SELECT password_hash, email FROM users WHERE id = %s", (current_user_id,))
        user_data = cur.fetchone()

        if not user_data:
            return jsonify({'message': 'User not found'}), 404

        current_password_hash, current_email = user_data

        if not bcrypt.check_password_hash(current_password_hash, password):
            return jsonify({'message': 'Incorrect password'}), 401
            
        if new_email.lower() == current_email.lower():
            return jsonify({'message': 'New email cannot be the same as the current email'}), 400

        # Check if the new email is already in use by another user
        cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (new_email.lower(), current_user_id))
        if cur.fetchone():
            return jsonify({'message': 'This email address is already in use by another account.'}), 409

        # For simplicity, just update the email directly without verification
        # In a production system, you would implement email verification here
        cur.execute("UPDATE users SET email = %s WHERE id = %s", (new_email, current_user_id))
        conn.commit()

        return jsonify({'message': 'Email address updated successfully.'}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        current_app.logger.error(f"Error changing email: {e}")
        return jsonify({'message': 'An unexpected error occurred.'}), 500
    finally:
        if conn:
            cur.close()
            db_handler.release_db_connection(conn)

@auth_bp.route('/verify-email-change', methods=['POST'])
def verify_email_change():
    """Verify email change (simplified version)"""
    data = request.get_json()
    verification_token = data.get('token')

    if not verification_token:
        return jsonify({'message': 'Verification token is required'}), 400

    # For simplicity, return a basic response
    # In a full implementation, this would verify the token and update the email
    return jsonify({'message': 'Email verification functionality not fully implemented in this simplified version'}), 501

@auth_bp.route('/user/language-preference', methods=['PUT'])
@token_required
def update_language_preference():
    """Update user language preference"""
    user_id = request.user['id']
    try:
        data = request.get_json()
        if not data:
            return jsonify({'message': 'No input data provided'}), 400
        
        preferred_language = data.get('preferred_language')
        if not preferred_language:
            return jsonify({'message': 'Language preference is required'}), 400
        
        if preferred_language not in SUPPORTED_LANGUAGES:
            return jsonify({'message': f'Invalid language preference. Supported languages: {", ".join(SUPPORTED_LANGUAGES)}'}), 400
        
        # Update user's preferred language in database
        conn = db_handler.get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("UPDATE users SET preferred_language = %s WHERE id = %s", (preferred_language, user_id))
                conn.commit()
                
            return jsonify({'message': 'Language preference updated successfully'}), 200
            
        except Exception as e:
            current_app.logger.error(f"Error updating language preference for user {user_id}: {e}")
            conn.rollback()
            return jsonify({'message': 'Failed to update language preference'}), 500
        finally:
            db_handler.release_db_connection(conn)
            
    except Exception as e:
        current_app.logger.error(f"Error processing language preference update: {e}")
        return jsonify({'message': 'Internal server error'}), 500
