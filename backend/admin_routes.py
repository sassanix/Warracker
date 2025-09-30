from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, date
import os
import logging

# Use try-except pattern for imports to handle both Docker and development environments
try:
    from . import db_handler
    from . import notifications
    from .auth_utils import admin_required
    from .apprise_handler import apprise_handler, APPRISE_AVAILABLE
    from .db_handler import get_db_connection, release_db_connection
except ImportError:
    import db_handler
    import notifications
    from auth_utils import admin_required
    from apprise_handler import apprise_handler, APPRISE_AVAILABLE
    from db_handler import get_db_connection, release_db_connection

# Create the admin blueprint
admin_bp = Blueprint('admin_bp', __name__)

# Set up logging
logger = logging.getLogger(__name__)

# Helper functions can be added here if needed

# ============================
# User Management Routes
# ============================

@admin_bp.route('/users', methods=['GET'])
@admin_required
def get_all_users():
    """Get all users (admin only)"""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Try to get users with is_owner column, fall back to without it if column doesn't exist
            try:
                cur.execute('''
                    SELECT id, username, email, first_name, last_name, is_active, is_admin, is_owner, created_at, last_login 
                    FROM users 
                    ORDER BY created_at DESC
                ''')
                users = cur.fetchall()
                has_owner_column = True
            except Exception as e:
                # If the query fails (likely because is_owner column doesn't exist), rollback and try again
                logger.warning(f"Failed to query with is_owner column in get_all_users, falling back: {e}")
                conn.rollback()  # Rollback the failed transaction
                cur.execute('''
                    SELECT id, username, email, first_name, last_name, is_active, is_admin, created_at, last_login 
                    FROM users 
                    ORDER BY created_at DESC
                ''')
                users = cur.fetchall()
                has_owner_column = False
                
            columns = [desc[0] for desc in cur.description]
            users_list = []
            
            for row in users:
                user_dict = dict(zip(columns, row))
                
                # Add is_owner field if it wasn't included in the query
                if not has_owner_column:
                    user_dict['is_owner'] = False
                
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in user_dict.items():
                    if isinstance(value, (datetime, date)):
                        user_dict[key] = value.isoformat() if value else None
                
                users_list.append(user_dict)
                
            return jsonify(users_list), 200
    except Exception as e:
        logger.error(f"Error retrieving users: {e}")
        return jsonify({"message": "Failed to retrieve users"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update user details (admin only)"""
    conn = None
    try:
        # Prevent modifying self
        if user_id == request.user['id']:
            return jsonify({"message": "Cannot modify your own admin status"}), 403
        
        data = request.get_json()
        
        # Use regular connection since db_user now has superuser privileges
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if user exists and if they are the owner
            try:
                cur.execute('SELECT id, is_owner FROM users WHERE id = %s', (user_id,))
                user = cur.fetchone()
                is_owner = user[1] if user and len(user) > 1 else False
            except Exception as e:
                # If the query fails (likely because is_owner column doesn't exist), rollback and try again
                logger.warning(f"Failed to query with is_owner column in update_user, falling back: {e}")
                conn.rollback()  # Rollback the failed transaction
                cur.execute('SELECT id FROM users WHERE id = %s', (user_id,))
                user = cur.fetchone()
                is_owner = False
            
            if not user:
                return jsonify({"message": "User not found"}), 404
            
            # Check if the user being updated is the owner
            if is_owner:
                # If the user is the owner, prevent demotion or deactivation
                if 'is_admin' in data and data['is_admin'] is False:
                    return jsonify({"message": "The application owner cannot be demoted from admin status."}), 403
                if 'is_active' in data and data['is_active'] is False:
                    return jsonify({"message": "The application owner's account cannot be deactivated."}), 403
            
            # Update fields
            updates = []
            params = []
            
            if 'is_admin' in data:
                updates.append('is_admin = %s')
                params.append(bool(data['is_admin']))
            
            if 'is_active' in data:
                updates.append('is_active = %s')
                params.append(bool(data['is_active']))
            
            if not updates:
                return jsonify({"message": "No fields to update"}), 400
            
            # Build and execute update query
            query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
            params.append(user_id)
            
            cur.execute(query, params)
            conn.commit()
            
            return jsonify({"message": "User updated successfully"}), 200
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        if conn:
            conn.rollback()
        return jsonify({"message": f"Failed to update user: {str(e)}"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete a user (admin only)"""
    conn = None
    try:
        logger.info(f"Delete user request received for user_id: {user_id}")
        
        # Prevent deleting self
        if user_id == request.user['id']:
            logger.warning(f"User {request.user['username']} attempted to delete their own account")
            return jsonify({"message": "Cannot delete your own account through admin API"}), 403
        
        # Use regular connection since db_user now has superuser privileges
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if user exists and if they are the owner
            try:
                cur.execute('SELECT id, username, is_owner FROM users WHERE id = %s', (user_id,))
                user = cur.fetchone()
                is_owner = user[2] if user and len(user) > 2 else False
            except Exception as e:
                # If the query fails (likely because is_owner column doesn't exist), rollback and try again
                logger.warning(f"Failed to query with is_owner column in delete_user, falling back: {e}")
                conn.rollback()  # Rollback the failed transaction
                cur.execute('SELECT id, username FROM users WHERE id = %s', (user_id,))
                user = cur.fetchone()
                is_owner = False
            
            if not user:
                logger.warning(f"User with ID {user_id} not found")
                return jsonify({"message": "User not found"}), 404
            
            # Check if the user to be deleted is the owner
            if is_owner:
                logger.warning(f"Admin {request.user['id']} attempted to delete the application owner (user_id: {user_id})")
                return jsonify({"message": "The application owner cannot be deleted."}), 403
            
            logger.info(f"Deleting user {user[1]} (ID: {user[0]})")
            
            # Delete user's warranties first
            cur.execute('DELETE FROM warranties WHERE user_id = %s', (user_id,))
            warranties_deleted = cur.rowcount
            logger.info(f"Deleted {warranties_deleted} warranties belonging to user {user_id}")
            
            # Delete user's password reset tokens if any
            cur.execute('DELETE FROM password_reset_tokens WHERE user_id = %s', (user_id,))
            tokens_deleted = cur.rowcount
            logger.info(f"Deleted {tokens_deleted} password reset tokens belonging to user {user_id}")
            
            # Delete user's sessions if any
            cur.execute('DELETE FROM user_sessions WHERE user_id = %s', (user_id,))
            sessions_deleted = cur.rowcount
            logger.info(f"Deleted {sessions_deleted} sessions belonging to user {user_id}")

            # Delete user's tags
            cur.execute('DELETE FROM tags WHERE user_id = %s', (user_id,))
            tags_deleted = cur.rowcount
            logger.info(f"Deleted {tags_deleted} tags belonging to user {user_id}")

            # Delete user
            cur.execute('DELETE FROM users WHERE id = %s', (user_id,))
            user_deleted = cur.rowcount
            logger.info(f"Deleted user {user_id}, affected rows: {user_deleted}")
            
            conn.commit()
            logger.info(f"User {user_id} deleted successfully")
            
            return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        if conn:
            conn.rollback()
        return jsonify({"message": f"Failed to delete user: {str(e)}"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@admin_bp.route('/transfer-ownership', methods=['POST'])
@admin_required
def transfer_ownership():
    """Transfer application ownership to another admin user (owner only)"""
    # 1. Security Check: Only the current owner can initiate a transfer.
    # If is_owner column doesn't exist yet, this feature is not available
    if not request.user.get('is_owner'):
        return jsonify({"message": "Ownership transfer feature is not available. Please run the database migration first."}), 403

    data = request.get_json()
    new_owner_id = data.get('new_owner_id')
    current_owner_id = request.user['id']

    if not new_owner_id:
        return jsonify({"message": "New owner ID is required."}), 400

    if int(new_owner_id) == current_owner_id:
        return jsonify({"message": "Cannot transfer ownership to yourself."}), 400

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # 2. Validate the new owner
            cur.execute("SELECT id, is_admin, is_active FROM users WHERE id = %s", (new_owner_id,))
            new_owner = cur.fetchone()

            if not new_owner:
                return jsonify({"message": "The selected user does not exist."}), 404
            
            if not new_owner[1]: # is_admin is false
                 return jsonify({"message": "Ownership can only be transferred to another admin user."}), 400

            if not new_owner[2]: # is_active is false
                return jsonify({"message": "Cannot transfer ownership to an inactive user."}), 400

            # 3. Perform the transfer within a database transaction
            # This ensures both updates succeed or both fail.
            logger.info(f"Ownership transfer initiated by user {current_owner_id} to user {new_owner_id}.")
            
            # Demote current owner to a regular admin
            try:
                cur.execute("UPDATE users SET is_owner = FALSE WHERE id = %s", (current_owner_id,))
                
                # Promote the new user to be the owner (and ensure they remain admin)
                cur.execute("UPDATE users SET is_owner = TRUE, is_admin = TRUE WHERE id = %s", (new_owner_id,))
            except Exception as e:
                logger.error(f"Error updating ownership in database: {e}")
                return jsonify({"message": "Ownership transfer feature is not available. Please run the database migration first."}), 500
            
            conn.commit()
            
            logger.info(f"Ownership successfully transferred from {current_owner_id} to {new_owner_id}.")
            return jsonify({"message": "Ownership transferred successfully."}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error during ownership transfer: {e}")
        return jsonify({"message": "An error occurred during ownership transfer. The operation has been rolled back."}), 500
    finally:
        if conn:
            release_db_connection(conn)

@admin_bp.route('/fix-owner-role', methods=['POST'])
@admin_required  
def fix_owner_role():
    """Temporary endpoint to manually fix owner role - can be removed after fix"""
    try:
        # Import ensure_owner_exists if available
        try:
            from .db_handler import ensure_owner_exists
        except ImportError:
            from db_handler import ensure_owner_exists
        
        ensure_owner_exists()
        return jsonify({'success': True, 'message': 'Owner role fix attempted. Check logs for results.'}), 200
    except Exception as e:
        logger.error(f"Error in fix_owner_role endpoint: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500 

# ============================
# Site Settings Routes
# ============================

@admin_bp.route('/settings', methods=['GET'])
@admin_required
def get_site_settings():
    """Get site settings (admin only)"""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if settings table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'site_settings'
                )
            """)
            table_exists = cur.fetchone()[0]
            
            # Create settings table if it doesn't exist
            if not table_exists:
                cur.execute("""
                    CREATE TABLE site_settings (
                        key VARCHAR(255) PRIMARY KEY,
                        value TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.commit()
            
            # Get all settings
            cur.execute('SELECT key, value FROM site_settings')
            raw_settings = {row[0]: row[1] for row in cur.fetchall()}
            
            # Define default values for all settings managed here
            # OIDC Client Secret is write-only from admin UI, not directly exposed via GET
            default_site_settings = {
                'registration_enabled': 'true',
                'email_base_url': os.environ.get('APP_BASE_URL', 'http://localhost:8080'), # Default to APP_BASE_URL
                'global_view_enabled': 'true',  # Global warranty view feature
                'global_view_admin_only': 'false',  # Restrict global view to admins only
                'oidc_enabled': 'false',
                'oidc_only_mode': 'false',  # Force OIDC-only login (hide traditional login form)
                'oidc_provider_name': 'oidc',
                'oidc_client_id': '',
                # 'oidc_client_secret': '', # Not returned
                'oidc_issuer_url': '',
                'oidc_scope': 'openid email profile',
                # Apprise default settings
                'apprise_enabled': 'false',
                'apprise_urls': '',
                'apprise_expiration_days': '7,30',
                'apprise_notification_time': '09:00',
                'apprise_title_prefix': '[Warracker]',
                # Paperless-ngx integration settings
                'paperless_enabled': 'false',
                'paperless_url': '',
                # 'paperless_api_token': '', # Not returned directly
            }

            settings_to_return = {}
            needs_commit = False

            # First, add all existing settings from the database
            for key, value in raw_settings.items():
                # Skip returning sensitive secrets directly
                if key in ['oidc_client_secret', 'paperless_api_token']:
                    continue
                
                # For boolean-like string settings, ensure they are 'true' or 'false'
                if key in ['registration_enabled', 'oidc_enabled', 'oidc_only_mode', 'apprise_enabled', 'global_view_enabled', 'global_view_admin_only', 'paperless_enabled']:
                    settings_to_return[key] = 'true' if value.lower() == 'true' else 'false'
                else:
                    settings_to_return[key] = value

            # Then, add defaults for any missing settings
            for key, default_value in default_site_settings.items():
                if key not in settings_to_return and key not in ['oidc_client_secret', 'paperless_api_token']:
                    settings_to_return[key] = default_value
                    # Insert default if missing (except for secrets)
                    cur.execute(
                        'INSERT INTO site_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING',
                        (key, default_value)
                    )
                    needs_commit = True
            
            # Indicate if secrets are set without revealing them
            settings_to_return['oidc_client_secret_set'] = bool(raw_settings.get('oidc_client_secret'))
            settings_to_return['paperless_api_token_set'] = bool(raw_settings.get('paperless_api_token'))

            if needs_commit:
                conn.commit()
            
            return jsonify(settings_to_return), 200
    except Exception as e:
        logger.error(f"Error retrieving site settings: {e}")
        return jsonify({"message": "Failed to retrieve site settings"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@admin_bp.route('/settings', methods=['PUT'])
@admin_required
def update_site_settings():
    """Update site settings (admin only)"""
    conn = None
    try:
        data = request.get_json()
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if settings table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'site_settings'
                )
            """)
            table_exists = cur.fetchone()[0]
            
            # Create settings table if it doesn't exist
            if not table_exists:
                cur.execute("""
                    CREATE TABLE site_settings (
                        key VARCHAR(255) PRIMARY KEY,
                        value TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
            
            # Update settings
            updated_keys = []
            requires_restart = False
            for key, value in data.items():
                # Sanitize boolean-like string values
                if key in ['registration_enabled', 'oidc_enabled', 'oidc_only_mode', 'global_view_enabled', 'global_view_admin_only', 'paperless_enabled']:
                    value = 'true' if str(value).lower() == 'true' else 'false'
                
                # Check if it's an OIDC related key that requires restart
                if key.startswith('oidc_'):
                    requires_restart = True
                
                # For sensitive secrets, only update if a non-empty value is provided
                # An empty string could mean "clear" or "no change" - admin UI should clarify
                # For now, if key is a secret and value is empty, we skip update to avoid accidental clearing.
                # The admin UI should send a specific placeholder if they intend to clear it, or not send the key.
                if key in ['oidc_client_secret', 'paperless_api_token'] and not value: # If an empty secret is passed, don't update
                    logger.info(f"Skipping update for {key} as value is empty.")
                    continue


                cur.execute("""
                    INSERT INTO site_settings (key, value, updated_at) 
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (key) 
                    DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
                """, (key, str(value))) # Ensure value is string
                updated_keys.append(key)
            
            conn.commit()
            
            response_message = "Settings updated successfully."
            oidc_settings_changed = any(k.startswith('oidc_') for k in updated_keys)

            if oidc_settings_changed:
                logger.info("OIDC related settings changed, re-initializing OIDC client...")
                try:
                    # Import init_oidc_client function
                    try:
                        from .oidc_handler import init_oidc_client
                    except ImportError:
                        from oidc_handler import init_oidc_client
                    
                    with current_app.app_context(): # Ensure app context for init_oidc_client
                        init_oidc_client(current_app, get_db_connection, release_db_connection)
                    logger.info("OIDC client re-initialized successfully after settings update.")
                    response_message = "Settings updated successfully. OIDC configuration has been re-applied."
                except Exception as oidc_reinit_err:
                    logger.error(f"Error re-initializing OIDC client after settings update: {oidc_reinit_err}")
                    response_message = "Settings updated, but OIDC re-configuration failed. A manual restart might be needed for OIDC changes to take effect."
            elif requires_restart: # This case might be redundant if all oidc_ keys trigger the above
                response_message += " An application restart is required for some settings to take full effect."
            
            return jsonify({"message": response_message}), 200
    except Exception as e:
        logger.error(f"Error updating site settings: {e}")
        if conn:
            conn.rollback()
        return jsonify({"message": "Failed to update site settings"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

# ============================
# Notification & Scheduler Routes
# ============================

@admin_bp.route('/send-notifications', methods=['POST'])
@admin_required
def trigger_notifications():
    """
    Admin-only endpoint to manually trigger warranty expiration notifications.
    Useful for testing and for sending notifications outside the scheduled time.
    """
    try:
        logger.info(f"Manual notification trigger requested by admin user {request.user['id']}")
        result, status_code = notifications.trigger_notifications_manually(get_db_connection, release_db_connection)
        return jsonify(result), status_code
    except Exception as e:
        error_msg = f"Error triggering notifications: {str(e)}"
        logger.error(error_msg)
        return jsonify({'message': 'Failed to trigger notifications', 'error': error_msg}), 500

@admin_bp.route('/scheduler-status', methods=['GET'])
@admin_required
def get_scheduler_status():
    """
    Admin-only endpoint to check scheduler status and configuration.
    """
    try:
        status = notifications.get_scheduler_status()
        return jsonify(status), 200
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        return jsonify({'error': f'Failed to get scheduler status: {str(e)}'}), 500

# ============================
# Apprise Admin Routes
# ============================

@admin_bp.route('/apprise/test', methods=['POST'])
@admin_required
def test_apprise_notification():
    """Send a test Apprise notification"""
    if not APPRISE_AVAILABLE or apprise_handler is None:
        return jsonify({'success': False, 'message': 'Apprise notifications are not available'}), 503
    
    try:
        data = request.get_json()
        test_url = data.get('test_url') if data else None
        
        success = apprise_handler.send_test_notification(test_url)
        
        if success:
            return jsonify({'success': True, 'message': 'Test notification sent successfully'}), 200
        else:
            return jsonify({'success': False, 'message': 'Failed to send test notification'}), 400
            
    except Exception as e:
        logger.error(f"Error sending test Apprise notification: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@admin_bp.route('/apprise/validate-url', methods=['POST'])
@admin_required
def validate_apprise_url():
    """Validate an Apprise notification URL"""
    if not APPRISE_AVAILABLE or apprise_handler is None:
        return jsonify({'valid': False, 'message': 'Apprise notifications are not available'}), 503
    
    try:
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({'valid': False, 'message': 'URL is required'}), 400
        
        is_valid = apprise_handler.validate_url(url)
        
        return jsonify({
            'valid': is_valid,
            'message': 'URL is valid' if is_valid else 'URL is invalid or unsupported'
        }), 200
        
    except Exception as e:
        logger.error(f"Error validating Apprise URL: {e}")
        return jsonify({'valid': False, 'message': f'Error: {str(e)}'}), 500

@admin_bp.route('/apprise/supported-services', methods=['GET'])
@admin_required
def get_supported_apprise_services():
    """Get list of supported Apprise services"""
    if not APPRISE_AVAILABLE or apprise_handler is None:
        return jsonify({'services': [], 'message': 'Apprise notifications are not available'}), 503
    
    try:
        services = apprise_handler.get_supported_services()
        return jsonify({'services': services}), 200
        
    except Exception as e:
        logger.error(f"Error getting supported Apprise services: {e}")
        return jsonify({'services': [], 'message': f'Error: {str(e)}'}), 500

@admin_bp.route('/apprise/send-expiration', methods=['POST'])
@admin_required
def trigger_apprise_expiration_notifications():
    """Manually trigger Apprise expiration notifications with warranty scope filtering"""
    if not APPRISE_AVAILABLE or apprise_handler is None:
        return jsonify({'success': False, 'message': 'Apprise notifications are not available'}), 503
    
    try:
        # Get warranty scope setting to determine which warranties to include
        conn = None
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM site_settings WHERE key = 'apprise_warranty_scope'")
                result = cur.fetchone()
                warranty_scope = result[0] if result else 'all'
        except Exception as e:
            logger.error(f"Error fetching warranty scope setting: {e}")
            warranty_scope = 'all'  # Default fallback
        finally:
            if conn:
                release_db_connection(conn)
        
        # Get eligible user IDs based on warranty scope
        eligible_user_ids = None  # None means all users
        
        if warranty_scope == 'admin':
            # Get admin user ID (first check if there's an owner, otherwise find first admin)
            admin_user_id = None
            conn_scope = None
            try:
                conn_scope = get_db_connection()
                with conn_scope.cursor() as cur:
                    # First try to find the owner
                    cur.execute("SELECT id FROM users WHERE is_owner = TRUE LIMIT 1")
                    owner_result = cur.fetchone()
                    if owner_result:
                        admin_user_id = owner_result[0]
                    else:
                        # Fallback to first admin if no owner found
                        cur.execute("SELECT id FROM users WHERE is_admin = TRUE ORDER BY id LIMIT 1")
                        admin_result = cur.fetchone()
                        if admin_result:
                            admin_user_id = admin_result[0]
            except Exception as e:
                logger.error(f"Error finding admin user ID for warranty scope filtering: {e}")
            finally:
                if conn_scope:
                    release_db_connection(conn_scope)
            
            if admin_user_id:
                eligible_user_ids = [admin_user_id]
                logger.info(f"Warranty scope 'admin': Limiting notifications to admin user ID {admin_user_id}")
            else:
                logger.warning("Warranty scope 'admin' requested but no admin user found, including all users")
        
        logger.info(f"Triggering Apprise notifications with warranty scope: '{warranty_scope}', eligible users: {eligible_user_ids}")
        
        # Send notifications with user filtering
        results = apprise_handler.send_expiration_notifications(eligible_user_ids=eligible_user_ids)
        
        return jsonify({
            'success': True,
            'message': f'Notifications processed: {results["sent"]} sent, {results["errors"]} errors',
            'results': results,
            'warranty_scope': warranty_scope
        }), 200
        
    except Exception as e:
        logger.error(f"Error triggering Apprise expiration notifications: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@admin_bp.route('/apprise/reload-config', methods=['POST'])
@admin_required
def reload_apprise_configuration():
    """Reload Apprise configuration from database and environment"""
    if not APPRISE_AVAILABLE or apprise_handler is None:
        return jsonify({'success': False, 'message': 'Apprise notifications are not available'}), 503
    
    try:
        apprise_handler.reload_configuration()
        
        return jsonify({
            'success': True,
            'message': 'Apprise configuration reloaded successfully',
            'enabled': apprise_handler.enabled,
            'urls_configured': len(apprise_handler.notification_urls)
        }), 200
        
    except Exception as e:
        logger.error(f"Error reloading Apprise configuration: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@admin_bp.route('/apprise/send-custom', methods=['POST'])
@admin_required
def send_custom_apprise_notification():
    """Send a custom Apprise notification"""
    if not APPRISE_AVAILABLE or apprise_handler is None:
        return jsonify({'success': False, 'message': 'Apprise notifications are not available'}), 503
    
    try:
        data = request.get_json()
        title = data.get('title')
        message = data.get('message')
        urls = data.get('urls')  # Optional: specific URLs to send to
        
        if not title or not message:
            return jsonify({'success': False, 'message': 'Title and message are required'}), 400
        
        success = apprise_handler.send_custom_notification(title, message, urls)
        
        if success:
            return jsonify({'success': True, 'message': 'Custom notification sent successfully'}), 200
        else:
            return jsonify({'success': False, 'message': 'Failed to send custom notification'}), 400
            
    except Exception as e:
        logger.error(f"Error sending custom Apprise notification: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@admin_bp.route('/apprise/status', methods=['GET'])
@admin_required
def get_apprise_status():
    """Get current Apprise configuration status"""
    if not APPRISE_AVAILABLE or apprise_handler is None:
        return jsonify({
            'available': False,
            'enabled': False,
            'message': 'Apprise library is not installed or not available'
        }), 503
    
    try:
        # Get detailed status from the handler
        status = apprise_handler.get_status()
        
        # Add additional fields for backward compatibility
        status.update({
            'expiration_days': apprise_handler.expiration_days,
            'notification_time': apprise_handler.notification_time,
            'title_prefix': apprise_handler.title_prefix,
            'message': 'Apprise is available and configured' if status.get('available') else status.get('error', 'Unknown error')
        })
        
        return jsonify(status), 200
        
    except Exception as e:
        logger.error(f"Error getting Apprise status: {e}")
        return jsonify({
            'available': False,
            'enabled': False,
            'message': f'Error: {str(e)}'
        }), 500 