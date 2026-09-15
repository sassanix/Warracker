# backend/oidc_handler.py
import os
import uuid
from datetime import datetime, UTC # Ensure timedelta is imported if used, though not in this snippet
from flask import Blueprint, jsonify, redirect, url_for, current_app, request, session

# Import shared extensions and utilities
try:
    # Try relative imports (when modules are in same directory)
    from .extensions import oauth
    from .db_handler import get_db_connection, release_db_connection
    from .auth_utils import generate_token
except ImportError:
    # Fallback to direct imports
    from extensions import oauth
    from db_handler import get_db_connection, release_db_connection
    from auth_utils import generate_token

import logging
logger = logging.getLogger(__name__) # Or use current_app.logger inside routes

oidc_bp = Blueprint('oidc', __name__) # url_prefix will be set when registering in app.py

def init_oidc_client(current_app_instance, db_conn_func, db_release_func):
    """Function to initialize OIDC client based on settings"""
    from .extensions import oauth

    logger.info("[FACTORY OIDC_INIT] Attempting to initialize OIDC client...")
    conn = None
    oidc_db_settings = {}
    try:
        conn = db_conn_func()
        if conn:
            with conn.cursor() as cur:
                cur.execute("SELECT key, value FROM site_settings WHERE key LIKE 'oidc_%%'")
                for row in cur.fetchall():
                    oidc_db_settings[row[0]] = row[1]

                # Mask sensitive values for logging (inline, no external dependency)
                safe_settings = {k: ('***REDACTED***' if 'secret' in k.lower() or 'password' in k.lower() or 'token' in k.lower() else v)
                                for k, v in oidc_db_settings.items()}
                logger.info(f"[FACTORY OIDC_INIT] Fetched OIDC settings from DB: {safe_settings}")
        else:
            logger.error("[FACTORY OIDC_INIT] Database connection failed, cannot fetch OIDC settings from DB.")
    except Exception as e:
        logger.error(f"[FACTORY OIDC_INIT] Error fetching OIDC settings from DB: {e}. Proceeding without DB settings.")
    finally:
        if conn:
            db_release_func(conn)

    # Priority: Environment Variable > Database Setting > Hardcoded Default
    # Check Environment Variable first for OIDC enabled
    oidc_enabled_from_env = os.environ.get('OIDC_ENABLED')
    if oidc_enabled_from_env is not None:
        # If the environment variable is set (even to 'false'), it takes highest priority
        is_enabled = oidc_enabled_from_env.lower() == 'true'
    else:
        # If no environment variable, fall back to the database setting
        oidc_enabled_from_db = oidc_db_settings.get('oidc_enabled', 'false')  # Default to 'false' if not in DB
        is_enabled = oidc_enabled_from_db.lower() == 'true'

    current_app_instance.config['OIDC_ENABLED'] = is_enabled
    logger.info(f"[FACTORY OIDC_INIT] OIDC enabled status: {is_enabled}")

    if is_enabled:
        # Apply same precedence logic to all OIDC settings
        provider_name = os.environ.get('OIDC_PROVIDER_NAME', oidc_db_settings.get('oidc_provider_name', 'oidc'))
        client_id = os.environ.get('OIDC_CLIENT_ID', oidc_db_settings.get('oidc_client_id', ''))
        client_secret = os.environ.get('OIDC_CLIENT_SECRET', oidc_db_settings.get('oidc_client_secret', ''))
        if os.environ.get('OIDC_CLIENT_SECRET_FILE'):
            client_secret = open(os.environ.get('OIDC_CLIENT_SECRET_FILE'), 'r').read().strip()
        issuer_url = os.environ.get('OIDC_ISSUER_URL', oidc_db_settings.get('oidc_issuer_url', ''))
        scope = os.environ.get('OIDC_SCOPE', oidc_db_settings.get('oidc_scope', 'openid email profile'))

        current_app_instance.config['OIDC_PROVIDER_NAME'] = provider_name

        if client_id and client_secret and issuer_url:
            logger.info(f"[FACTORY OIDC_INIT] Registering OIDC client '{provider_name}' with Authlib.")

            oauth.register(
                name=provider_name,
                client_id=client_id,
                client_secret=client_secret,
                server_metadata_url=f"{issuer_url.rstrip('/')}/.well-known/openid-configuration",
                client_kwargs={'scope': scope},
                override=True
            )
            logger.info(f"[FACTORY OIDC_INIT] OIDC client '{provider_name}' registered successfully.")
        else:
            logger.warning("[FACTORY OIDC_INIT] OIDC is enabled, but critical parameters are missing. OIDC login will be unavailable.")
            current_app_instance.config['OIDC_ENABLED'] = False
    else:
        current_app_instance.config['OIDC_PROVIDER_NAME'] = None
        logger.info("[FACTORY OIDC_INIT] OIDC is disabled.")


@oidc_bp.route('/oidc/login') # Original path was /api/oidc/login
def oidc_login_route():
    if not current_app.config.get('OIDC_ENABLED'):
        logger.warning("[OIDC_HANDLER] OIDC login attempt while OIDC is disabled.")
        return jsonify({'message': 'OIDC (SSO) login is not enabled.'}), 403

    oidc_provider_name = current_app.config.get('OIDC_PROVIDER_NAME')
    if not oidc_provider_name:
        logger.error("[OIDC_HANDLER] OIDC is enabled but provider name not configured.")
        return jsonify({'message': 'OIDC provider not configured correctly.'}), 500

    # Corrected url_for to use blueprint name
    redirect_uri = url_for('oidc.oidc_callback_route', _external=True)

    # HTTPS check for production
    if os.environ.get('FLASK_ENV') == 'production' and not redirect_uri.startswith('https'):
        redirect_uri = redirect_uri.replace('http://', 'https://', 1)

    logger.info(f"[OIDC_HANDLER] /oidc/login redirect_uri: {redirect_uri}")
    return oauth.create_client(oidc_provider_name).authorize_redirect(redirect_uri)

@oidc_bp.route('/oidc/callback') # Original path was /api/oidc/callback
def oidc_callback_route():
    if not current_app.config.get('OIDC_ENABLED'):
        logger.warning("[OIDC_HANDLER] OIDC callback received while OIDC is disabled.")
        frontend_login_url = os.environ.get('FRONTEND_URL', current_app.config.get('APP_BASE_URL', 'http://localhost:8080')).rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=oidc_disabled")

    oidc_provider_name = current_app.config.get('OIDC_PROVIDER_NAME')
    if not oidc_provider_name:
        logger.error("[OIDC_HANDLER] OIDC provider name not configured for callback.")
        frontend_login_url = os.environ.get('FRONTEND_URL', current_app.config.get('APP_BASE_URL', 'http://localhost:8080')).rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=oidc_misconfigured")

    client = oauth.create_client(oidc_provider_name)
    try:
        token_data = client.authorize_access_token()
    except Exception as e:
        logger.error(f"[OIDC_HANDLER] OIDC callback error authorizing access token: {e}")
        frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=token_exchange_failed")

    if not token_data:
        logger.error("[OIDC_HANDLER] OIDC callback: Failed to retrieve access token.")
        frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=token_missing")

    token_id_claims = token_data.get('userinfo')
    if not token_id_claims:
        logger.error("[OIDC_HANDLER] OIDC callback: Failed to retrieve token userinfo.")
        frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=userinfo_missing")

    try:
        userinfo = client.userinfo(token=token_data)
    except Exception as e:
        logger.error(f"[OIDC_HANDLER] OIDC callback error fetching userinfo: {e}")
        frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=userinfo_fetch_failed")

    if not userinfo:
        logger.error("[OIDC_HANDLER] OIDC callback: Failed to retrieve userinfo.")
        frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=userinfo_missing")

    oidc_subject = token_id_claims.get('sub')
    oidc_issuer = token_id_claims.get('iss')

    if not oidc_subject:
        logger.error("[OIDC_HANDLER] OIDC callback: 'sub' (subject) missing in token userinfo.")
        frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=subject_missing")

    email = token_id_claims.get('email') or userinfo.get('email')

    first_name = token_id_claims.get('given_name') or userinfo.get('given_name', '')
    last_name = token_id_claims.get('family_name') or userinfo.get('family_name', '')

    if not first_name and not last_name:
        first_name = token_id_claims.get('name') or userinfo.get('name', '')

    user_groups = token_id_claims.get('groups') or userinfo.get('groups') or []

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check for existing OIDC user
            cur.execute("SELECT id, username, email, first_name, last_name, is_admin FROM users WHERE oidc_sub = %s AND oidc_issuer = %s AND is_active = TRUE",
                        (oidc_subject, oidc_issuer))
            user_db_data = cur.fetchone()

            user_id = None
            is_new_user = False

            admin_oidc_group = os.environ.get('OIDC_ADMIN_GROUP')
            if not admin_oidc_group:
                cur.execute("SELECT value FROM site_settings WHERE key = 'admin_oidc_group'")
                result = cur.fetchone()
                if result:
                    admin_oidc_group = result[0]

            if user_db_data:
                user_id = user_db_data[0]
                logger.info(f"[OIDC_HANDLER] Existing OIDC user found with ID {user_id} for sub {oidc_subject}")

                # Update any changed user info
                if email and email != user_db_data[2]:
                    cur.execute('UPDATE users SET email = %s WHERE id = %s', (email, user_id))
                    logger.info(f"[OIDC_HANDLER] Updated email for OIDC user ID {user_id} to {email}")
                if first_name and first_name != user_db_data[3]:
                    cur.execute('UPDATE users SET first_name = %s WHERE id = %s', (first_name, user_id))
                    logger.info(f"[OIDC_HANDLER] Updated first name for OIDC user ID {user_id} to {first_name}")
                if last_name and last_name != user_db_data[4]:
                    cur.execute('UPDATE users SET last_name = %s WHERE id = %s', (last_name, user_id))
                    logger.info(f"[OIDC_HANDLER] Updated last name for OIDC user ID {user_id} to {last_name}")
                if admin_oidc_group:
                    is_admin = admin_oidc_group in user_groups
                    if is_admin != user_db_data[5]:
                        cur.execute('UPDATE users SET is_admin = %s WHERE id = %s', (is_admin, user_id))
                        logger.info(f"[OIDC_HANDLER] Updated admin status for OIDC user ID {user_id} to {is_admin} based on group membership.")
            else:
                # Check if registration is enabled before creating new users
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

                # If registration is disabled and this is not the first user, deny SSO signup
                if not registration_enabled and user_count > 0:
                    logger.warning(f"[OIDC_HANDLER] New OIDC user registration denied - registrations are disabled. Subject: {oidc_subject}")
                    frontend_login_url = os.environ.get('FRONTEND_URL', current_app.config.get('APP_BASE_URL', 'http://localhost:8080')).rstrip('/') + "/login.html"
                    return redirect(f"{frontend_login_url}?oidc_error=registration_disabled")

                # New user provisioning
                is_new_user = True
                if not email:
                    logger.error("[OIDC_HANDLER] 'email' missing in userinfo for new OIDC user.")
                    frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
                    return redirect(f"{frontend_login_url}?oidc_error=email_missing_for_new_user")

                # Check for email conflict with local account
                cur.execute("SELECT id FROM users WHERE email = %s AND (oidc_sub IS NULL OR oidc_issuer IS NULL)", (email,))
                if cur.fetchone():
                    logger.warning(f"[OIDC_HANDLER] Email {email} already exists for a local account. OIDC user cannot be created.")
                    frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
                    return redirect(f"{frontend_login_url}?oidc_error=email_conflict_local_account")

                username = token_id_claims.get('preferred_username') or userinfo.get('preferred_username') or \
                            token_id_claims.get('name') or userinfo.get('name') or \
                            email.split('@')[0]
                # Ensure username uniqueness
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                if cur.fetchone():
                    username = f"{username}_{str(uuid.uuid4())[:4]}" # Short random suffix

                cur.execute('SELECT COUNT(*) FROM users')
                user_count = cur.fetchone()[0]

                if admin_oidc_group:
                    is_admin = admin_oidc_group in user_groups
                    if is_admin:
                        logger.info(f"[OIDC_HANDLER] New OIDC user {username} granted admin via OIDC group '{admin_oidc_group}'.")
                else:
                    # Determine admin status: first user OR email matches configured admin email
                    is_first_user_admin = (user_count == 0)

                    admin_email_from_env = current_app.config.get('ADMIN_EMAIL', '').lower()
                    oidc_user_email_lower = email.lower() if email else ''

                    is_email_match_admin = False
                    if admin_email_from_env and oidc_user_email_lower == admin_email_from_env:
                        is_email_match_admin = True
                        logger.info(f"[OIDC_HANDLER] New OIDC user email {oidc_user_email_lower} matches ADMIN_EMAIL {admin_email_from_env}.")

                    is_admin = is_first_user_admin or is_email_match_admin

                    if is_admin and not is_first_user_admin:
                        logger.info(f"[OIDC_HANDLER] Granting admin rights to new OIDC user {oidc_user_email_lower} based on email match.")
                    elif is_first_user_admin:
                        logger.info(f"[OIDC_HANDLER] Granting admin rights to new OIDC user {oidc_user_email_lower} as they are the first user.")

                is_owner = user_count == 0
                is_admin = is_admin or is_owner

                # Insert new OIDC user
                cur.execute(
                    """INSERT INTO users (username, email, first_name, last_name, is_admin, is_owner, oidc_sub, oidc_issuer, is_active)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE) RETURNING id""",
                    (username, email, first_name, last_name, is_admin, is_owner, oidc_subject, oidc_issuer)
                )
                user_id = cur.fetchone()[0]
                logger.info(f"[OIDC_HANDLER] New OIDC user created with ID {user_id} for sub {oidc_subject}")

            if user_id:
                app_session_token = generate_token(user_id) # Generate app-specific JWT

                # Update last login timestamp
                cur.execute('UPDATE users SET last_login = %s WHERE id = %s', (datetime.now(UTC), user_id))

                # Log OIDC session in user_sessions table
                ip_address = request.remote_addr
                user_agent = request.headers.get('User-Agent', '')
                # Use a different UUID for session_token in DB if needed, or re-use app_session_token if appropriate for your session model
                db_session_token = str(uuid.uuid4())
                expires_at = datetime.now(UTC) + current_app.config['JWT_EXPIRATION_DELTA']

                cur.execute(
                    'INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address, user_agent, login_method) VALUES (%s, %s, %s, %s, %s, %s)',
                    (user_id, db_session_token, expires_at, ip_address, user_agent, 'oidc')
                )
                conn.commit()

                frontend_url = os.environ.get('FRONTEND_URL', current_app.config.get('APP_BASE_URL', 'http://localhost:8080')).rstrip('/')
                redirect_target = f"{frontend_url}/auth-redirect.html?token={app_session_token}"
                if is_new_user:
                    redirect_target += "&new_user=true"

                logger.info(f"[OIDC_HANDLER] /oidc/callback redirecting to frontend: {redirect_target}")
                return redirect(redirect_target)
            else:
                logger.error("[OIDC_HANDLER] /oidc/callback User ID not established after DB ops.")
                frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
                return redirect(f"{frontend_login_url}?oidc_error=user_processing_failed")

    except Exception as e: # Catch more specific psycopg2.Error if preferred
        logger.error(f"[OIDC_HANDLER] OIDC callback: Database or general error: {e}", exc_info=True)
        if conn: conn.rollback()
        frontend_login_url = os.environ.get('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + "/login.html"
        return redirect(f"{frontend_login_url}?oidc_error=internal_error")
    finally:
        if conn: release_db_connection(conn)

@oidc_bp.route('/auth/oidc-status', methods=['GET']) # Path relative to blueprint's url_prefix
def get_oidc_status_route():
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get OIDC settings including the new oidc_only_mode
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('oidc_enabled', 'oidc_only_mode', 'oidc_provider_name')")
            settings = {row[0]: row[1] for row in cur.fetchall()}

            # Apply same precedence logic as init_oidc_client()
            # Priority: Environment Variable > Database Setting > Hardcoded Default

            # Check OIDC enabled status with correct precedence
            oidc_enabled_from_env = os.environ.get('OIDC_ENABLED')
            if oidc_enabled_from_env is not None:
                oidc_is_enabled = oidc_enabled_from_env.lower() == 'true'
            else:
                oidc_is_enabled = settings.get('oidc_enabled', 'false').lower() == 'true'

            # Check OIDC only mode with correct precedence
            oidc_only_mode_from_env = os.environ.get('OIDC_ONLY_MODE')
            if oidc_only_mode_from_env is not None:
                oidc_only_mode = oidc_only_mode_from_env.lower() == 'true'
            else:
                oidc_only_mode = settings.get('oidc_only_mode', 'false').lower() == 'true'

            # Check provider name with correct precedence
            oidc_provider_name_from_env = os.environ.get('OIDC_PROVIDER_NAME')
            if oidc_provider_name_from_env is not None:
                oidc_provider_name = oidc_provider_name_from_env.capitalize()
            else:
                raw_name = settings.get('oidc_provider_name', 'SSO Provider')
                oidc_provider_name = raw_name.capitalize() if raw_name else 'SSO Provider'

            return jsonify({
                "oidc_enabled": oidc_is_enabled,
                "oidc_only_mode": oidc_only_mode,
                "oidc_provider_display_name": oidc_provider_name
            }), 200
    except Exception as e:
        logger.error(f"[OIDC_HANDLER] Error fetching OIDC status: {e}")
        # On error, check environment variables as fallback
        oidc_enabled_from_env = os.environ.get('OIDC_ENABLED')
        oidc_only_mode_from_env = os.environ.get('OIDC_ONLY_MODE')
        oidc_provider_name_from_env = os.environ.get('OIDC_PROVIDER_NAME')

        return jsonify({
            "oidc_enabled": oidc_enabled_from_env.lower() == 'true' if oidc_enabled_from_env else False,
            "oidc_only_mode": oidc_only_mode_from_env.lower() == 'true' if oidc_only_mode_from_env else False,
            "oidc_provider_display_name": oidc_provider_name_from_env.capitalize() if oidc_provider_name_from_env else "SSO Provider"
        }), 200
    finally:
        if conn:
            release_db_connection(conn)
