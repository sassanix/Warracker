"""
Warranty Expiration Notification System
Updated: 2025-01-24 - Fixed scheduler initialization in application factory

This module handles all notification-related functionality for the Warracker application,
including email notifications, scheduling, and Apprise integration.
"""

import os
import threading
import time
import atexit
import smtplib
import logging
from datetime import datetime, date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from threading import Lock
from decimal import Decimal

import pytz
from pytz import timezone as pytz_timezone
from flask import current_app

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    BACKGROUND_SCHEDULER_AVAILABLE = True
except ImportError:
    BACKGROUND_SCHEDULER_AVAILABLE = False
    BackgroundScheduler = None

try:
    from apscheduler.schedulers.gevent import GeventScheduler
    GEVENT_SCHEDULER_AVAILABLE = True
except ImportError:
    GEVENT_SCHEDULER_AVAILABLE = False
    GeventScheduler = None

# Import database functions
try:
    from .db_handler import get_site_setting
    DB_HANDLER_IMPORTED = True
except ImportError:
    try:
        from db_handler import get_site_setting
        DB_HANDLER_IMPORTED = True
    except ImportError:
        DB_HANDLER_IMPORTED = False
        def get_site_setting(key, default=None):
            return default

# Configure logging
logger = logging.getLogger(__name__)

# Global variables for notification management
notification_lock = threading.Lock()
last_notification_sent = {}
scheduler = None
scheduler_initialized = False
scheduler_retry_attempted = False

# Apprise integration (will be set by app.py if available)
APPRISE_AVAILABLE = False
apprise_handler = None

def set_apprise_handler(handler):
    """Set the Apprise handler if available"""
    global APPRISE_AVAILABLE, apprise_handler
    APPRISE_AVAILABLE = handler is not None
    apprise_handler = handler

def get_expiring_warranties(get_db_connection, release_db_connection):
    """Get warranties that are expiring soon for notification purposes"""
    conn = None
    try:
        # Add retry logic for database connections in scheduled context
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                conn = get_db_connection()
                # Test the connection
                with conn.cursor() as test_cur:
                    test_cur.execute("SELECT 1")
                    test_cur.fetchone()
                break  # Connection is good, exit retry loop
            except Exception as conn_error:
                logger.warning(f"Database connection attempt {attempt + 1} failed in get_expiring_warranties: {conn_error}")
                if conn:
                    try:
                        release_db_connection(conn)
                    except:
                        pass
                conn = None
                
                if attempt < max_retries - 1:
                    logger.info(f"Retrying database connection in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                else:
                    logger.error("All database connection attempts failed in get_expiring_warranties")
                    return []
        
        today = date.today()

        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    u.id, -- Select user_id
                    u.email,
                    u.first_name,
                    w.product_name,
                    w.expiration_date,
                    COALESCE(up.expiring_soon_days, 30) AS expiring_soon_days
                FROM
                    warranties w
                JOIN
                    users u ON w.user_id = u.id
                LEFT JOIN
                    user_preferences up ON u.id = up.user_id
                WHERE
                    w.is_lifetime = FALSE
                    AND w.expiration_date > %s
                    AND w.expiration_date <= (%s::date + (COALESCE(up.expiring_soon_days, 30) || ' days')::interval)::date
                    AND w.archived_at IS NULL
                    AND u.is_active = TRUE;
            """, (today, today))

            expiring_warranties = []
            for row in cur.fetchall():
                user_id, email, first_name, product_name, expiration_date, expiring_soon_days = row
                expiration_date_str = expiration_date.strftime('%Y-%m-%d')
                expiring_warranties.append({
                    'user_id': user_id,
                    'email': email,
                    'first_name': first_name or 'User',  # Default if first_name is NULL
                    'product_name': product_name,
                    'expiration_date': expiration_date_str,
                })

            return expiring_warranties

    except Exception as e:
        logger.error(f"Error retrieving expiring warranties: {e}")
        return []  # Return an empty list on error
    finally:
        if conn:
            release_db_connection(conn)

def format_expiration_email(user, warranties, get_db_connection, release_db_connection):
    """
    Format an email notification for expiring warranties.
    Returns a MIMEMultipart email object with both text and HTML versions.
    """
    subject = "Warracker: Upcoming Warranty Expirations"
    
    # Get email base URL from settings with correct precedence
    # Priority: Environment Variable > Database Setting > Hardcoded Default
    email_base_url = os.environ.get('APP_BASE_URL')
    if email_base_url is None:
        # Fall back to database setting if environment variable is not set
        conn = None
        email_base_url = 'http://localhost:8080'  # Default fallback
        try:
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM site_settings WHERE key = 'email_base_url'")
                result = cur.fetchone()
                if result:
                    email_base_url = result[0]
                else:
                    logger.warning("email_base_url setting not found, using default.")
        except Exception as e:
            logger.error(f"Error fetching email_base_url from settings: {e}. Using default.")
        finally:
            if conn:
                release_db_connection(conn)
    
    # Ensure base URL doesn't end with a slash
    email_base_url = email_base_url.rstrip('/')
    
    # Create both plain text and HTML versions of the email body
    text_body = f"Hello {user['first_name']},\\n\\n"
    text_body += "The following warranties are expiring soon:\\n\\n"
    
    html_body = f"""\
    <html>
      <head></head>
      <body>
        <p>Hello {user['first_name']},</p>
        <p>The following warranties are expiring soon:</p>
        <table border="1" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th style="padding: 8px; text-align: left;">Product Name</th>
              <th style="padding: 8px; text-align: left;">Expiration Date</th>
            </tr>
          </thead>
          <tbody>
    """

    for warranty in warranties:
        text_body += f"- {warranty['product_name']} (expires on {warranty['expiration_date']})\\n"
        html_body += f"""\
            <tr>
              <td style="padding: 8px;">{warranty['product_name']}</td>
              <td style="padding: 8px;">{warranty['expiration_date']}</td>
            </tr>
        """

    text_body += "\\nLog in to Warracker to view details:\\n"
    text_body += f"{email_base_url}\\n\\n"
    text_body += "Manage your notification settings:\\n"
    text_body += f"{email_base_url}/settings-new.html\\n"

    html_body += f"""\
          </tbody>
        </table>
        <p>Log in to <a href="{email_base_url}">Warracker</a> to view details.</p> 
        <p>Manage your notification settings <a href="{email_base_url}/settings-new.html">here</a>.</p>
      </body>
    </html>
    """

    # Create a MIMEMultipart object for both text and HTML
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    # use SMTP_FROM_ADDRESS if provided, otherwise use SMTP_USERNAME or a default value as below
    _from_address = os.environ.get('SMTP_FROM_ADDRESS')
    if _from_address is None:
        _from_address = os.environ.get('SMTP_USERNAME', 'notifications@warracker.com')
    msg['From'] = _from_address
    msg['To'] = user['email']

    part1 = MIMEText(text_body, 'plain')
    part2 = MIMEText(html_body, 'html')

    msg.attach(part1)
    msg.attach(part2)

    return msg

def is_notification_due(utc_now, notification_time, timezone, channel_name, user_id):
    """Check if a notification is due for a user based on their timezone and preferences"""
    try:
        user_tz = pytz_timezone(timezone or 'UTC')
        user_local_time = utc_now.replace(tzinfo=pytz.UTC).astimezone(user_tz)
        time_hour, time_minute = map(int, notification_time.split(':'))
        
        user_minutes = time_hour * 60 + time_minute
        current_minutes = user_local_time.hour * 60 + user_local_time.minute
        time_diff = current_minutes - user_minutes
        
        # Handle day rollovers
        if time_diff < -720:  # More than 12 hours behind, probably crossed midnight
            time_diff += 1440
        elif time_diff > 720:  # More than 12 hours ahead, probably went backward over midnight  
            time_diff -= 1440

        if 0 <= time_diff <= 2:
            current_date = user_local_time.strftime('%Y-%m-%d')
            last_sent_key = f"{channel_name}_{user_id}_{current_date}"
            if last_sent_key not in last_notification_sent:
                last_notification_sent[last_sent_key] = True
                logger.info(f"User {user_id} eligible for {channel_name} notification at their local time {notification_time} ({timezone}). Time diff: {time_diff} minutes")
                return True
    except Exception as e:
        logger.error(f"Error processing timezone for user {user_id}: {e}")
    return False

def process_email_notifications(all_warranties, eligible_user_ids, is_manual, get_db_connection, release_db_connection):
    """Process and send email notifications"""
    logger.info(f"Processing email notifications for {len(eligible_user_ids)} eligible users")
    
    # Group warranties by user
    users_warranties = {}
    for warranty in all_warranties:
        user_id = warranty['user_id']
        email = warranty['email']
        
        # Check if user should receive notifications
        if not is_manual and user_id not in eligible_user_ids:
            continue
            
        if email not in users_warranties:
            users_warranties[email] = {
                'user_id': user_id,
                'first_name': warranty['first_name'],
                'warranties': []
            }
        users_warranties[email]['warranties'].append(warranty)
    
    if not users_warranties:
        logger.info("No users to notify via email")
        return
        
    # Get SMTP settings from environment variables
    smtp_host = os.environ.get('SMTP_HOST', 'localhost')
    smtp_port = int(os.environ.get('SMTP_PORT', '1025'))
    smtp_username = os.environ.get('SMTP_USERNAME', 'notifications@warracker.com')
    smtp_password = os.environ.get('SMTP_PASSWORD', '')
    smtp_use_tls_env = os.environ.get('SMTP_USE_TLS', 'not_set').lower()
    
    # For manual triggers, check email preferences
    email_enabled_users = set()
    if is_manual:
        conn_manual = None
        try:
            conn_manual = get_db_connection()
            with conn_manual.cursor() as cur:
                cur.execute("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name='user_preferences' AND column_name='notification_channel'
                """)
                has_channel_column = bool(cur.fetchone())
                
                if has_channel_column:
                    cur.execute("""
                        SELECT DISTINCT u.id 
                        FROM users u
                        JOIN user_preferences up ON u.id = up.user_id
                        WHERE u.is_active = TRUE 
                        AND up.notification_channel IN ('email', 'both')
                    """)
                    email_enabled_users = set(row[0] for row in cur.fetchall())
                else:
                    email_enabled_users = set(user_data.get('user_id') for user_data in users_warranties.values())
        except Exception as e:
            logger.error(f"Error checking email preferences for manual trigger: {e}")
            email_enabled_users = set(user_data.get('user_id') for user_data in users_warranties.values())
        finally:
            if conn_manual:
                release_db_connection(conn_manual)
    
    # Send emails
    try:
        logger.info(f"Attempting SMTP connection to {smtp_host}:{smtp_port}")
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            
            should_use_starttls = False
            if smtp_port == 587:
                should_use_starttls = (smtp_use_tls_env != 'false')
            elif smtp_use_tls_env == 'true':
                should_use_starttls = True

            if should_use_starttls:
                server.starttls()
        
        if smtp_username and smtp_password:
            server.login(smtp_username, smtp_password)

        emails_sent = 0
        utc_now = datetime.utcnow()
        timestamp = int(utc_now.timestamp())
        
        for email, user_data in users_warranties.items():
            user_id_to_check = user_data.get('user_id')
            
            # For manual triggers, check if user has email notifications enabled
            if is_manual and user_id_to_check not in email_enabled_users:
                continue
            
            # For manual triggers, check if we've sent recently
            if is_manual and email in last_notification_sent:
                last_sent = last_notification_sent[email]
                if timestamp - last_sent < 120:
                    continue
            
            msg = format_expiration_email(
                {'first_name': user_data['first_name'], 'email': email},
                user_data['warranties'],
                get_db_connection,
                release_db_connection
            )
            try:
                server.sendmail(smtp_username, email, msg.as_string())
                last_notification_sent[email] = timestamp
                emails_sent += 1
                logger.info(f"Email sent to {email} for {len(user_data['warranties'])} warranties")
            except Exception as e:
                logger.error(f"Error sending email to {email}: {e}")
        
        logger.info(f"Email process completed. Sent {emails_sent} emails")
        server.quit()
        
    except Exception as e:
        logger.error(f"Error connecting to SMTP server: {e}")

def process_apprise_notifications(all_warranties, eligible_user_ids, is_manual, get_db_connection, release_db_connection):
    """Process and send Apprise notifications"""
    # ---> FIX: Get the handler from the application context <---
    apprise_handler = current_app.config.get('APPRISE_HANDLER')

    if not apprise_handler:
        logger.info("Apprise handler not found in app config, skipping Apprise notifications.")
        return

    if is_manual:
        logger.debug("Manual trigger: Skipping Apprise notifications (use dedicated Apprise endpoint for manual Apprise notifications)")
        return

    logger.info(f"Processing Apprise notifications for {len(eligible_user_ids)} eligible users.")
    
    try:
        # Reload configuration to ensure we have the latest settings from the database
        apprise_handler.reload_configuration()
        
        if not apprise_handler.is_available():
            logger.info("Apprise is not enabled or configured, skipping.")
            return

        if not eligible_user_ids:
            logger.info("No users eligible for Apprise notifications")
            return

        # Filter warranties for eligible users
        warranties_for_apprise = [w for w in all_warranties if w['user_id'] in eligible_user_ids]
        
        if not warranties_for_apprise:
            logger.info("No expiring warranties for Apprise-eligible users.")
            return

        # Get the Apprise notification settings
        notification_mode = get_site_setting('apprise_notification_mode', 'global')
        warranty_scope = get_site_setting('apprise_warranty_scope', 'all')
        logger.info(f"Apprise notification mode set to: '{notification_mode}', warranty scope: '{warranty_scope}'")
        
        # Apply warranty scope filtering
        if warranty_scope == 'admin':
            admin_user_id = None
            conn_scope = None
            try:
                conn_scope = get_db_connection()
                with conn_scope.cursor() as cur:
                    cur.execute("SELECT id FROM users WHERE is_owner = TRUE LIMIT 1")
                    owner_result = cur.fetchone()
                    if owner_result:
                        admin_user_id = owner_result[0]
                    else:
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
                original_count = len(warranties_for_apprise)
                warranties_for_apprise = [w for w in warranties_for_apprise if w['user_id'] == admin_user_id]
                logger.info(f"Warranty scope 'admin': Filtered from {original_count} to {len(warranties_for_apprise)} warranties")
            else:
                logger.warning("Warranty scope 'admin' requested but no admin user found, including all warranties")
        
        if not warranties_for_apprise:
            logger.info("No expiring warranties after scope filtering")
            return

        logger.info(f"Processing Apprise notifications in {notification_mode.upper()} mode for {len(warranties_for_apprise)} warranties")
        
        if notification_mode == 'global':
            # GLOBAL MODE: Send one consolidated notification
            logger.info("Sending GLOBAL Apprise notification")
            success = apprise_handler.send_global_expiration_notification(warranties_for_apprise)
            logger.info(f"Global Apprise notification result: {'Success' if success else 'Failed'}")
        
        elif notification_mode == 'individual':
            # INDIVIDUAL MODE: Send one notification per user
            logger.info("Sending INDIVIDUAL Apprise notifications")
            sent_count = 0
            error_count = 0
            
            # Group warranties by user
            user_warranties = {}
            for w in warranties_for_apprise:
                uid = w['user_id']
                if uid not in user_warranties:
                    user_warranties[uid] = []
                user_warranties[uid].append(w)
            
            # Send notification for each user
            for user_id, warranties in user_warranties.items():
                try:
                    success = apprise_handler.send_individual_expiration_notification(user_id, warranties, get_db_connection, release_db_connection)
                    if success:
                        sent_count += 1
                        logger.info(f"Individual Apprise notification sent for user {user_id}")
                    else:
                        error_count += 1
                        logger.warning(f"Individual Apprise notification failed for user {user_id}")
                except Exception as e:
                    logger.error(f"Error sending individual Apprise notification for user {user_id}: {e}")
                    error_count += 1
            
            logger.info(f"Individual Apprise notifications completed: {sent_count} sent, {error_count} errors")
        
        else:
            logger.warning(f"Unknown Apprise notification mode: '{notification_mode}'. Skipping Apprise notifications.")
        
    except Exception as e:
        logger.error(f"Error sending Apprise notifications: {e}")

def send_expiration_notifications(manual_trigger=False, get_db_connection=None, release_db_connection=None):
    """
    Main function to send warranty expiration notifications.
    Refactored for better separation of email and Apprise notification logic.
    Now properly manages database connections for the entire job execution.
    
    Args:
        manual_trigger (bool): Whether this function was triggered manually (vs scheduled)
        get_db_connection: Database connection function
        release_db_connection: Database connection release function
    """
    if get_db_connection is None or release_db_connection is None:
        logger.error("Database connection functions not provided")
        return

    if not notification_lock.acquire(blocking=False):
        logger.info("Notification job already running, skipping")
        return

    conn = None
    try:
        logger.info("Starting expiration notification process")
        # Acquire a fresh database connection for this entire job run
        conn = get_db_connection()
        
        users_to_notify_email = set()
        users_to_notify_apprise = set()

        if not manual_trigger:
            with conn.cursor() as cur:
                utc_now = datetime.utcnow()
                
                # Check if required columns exist for dynamic query building
                cur.execute("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name='user_preferences' 
                    AND column_name IN ('notification_channel', 'apprise_notification_time', 'apprise_timezone')
                """)
                existing_columns = [row[0] for row in cur.fetchall()]
                
                has_notification_channel = 'notification_channel' in existing_columns
                has_apprise_notification_time = 'apprise_notification_time' in existing_columns
                has_apprise_timezone = 'apprise_timezone' in existing_columns
                
                # Build dynamic query based on available columns
                select_fields = [
                    "u.id", 
                    "u.email",
                    "up.notification_time",
                    "up.timezone",
                    "up.notification_frequency"
                ]
                
                if has_apprise_notification_time:
                    select_fields.append("up.apprise_notification_time")
                else:
                    select_fields.append("up.notification_time as apprise_notification_time")
                
                if has_apprise_timezone:
                    select_fields.append("up.apprise_timezone")
                else:
                    select_fields.append("up.timezone as apprise_timezone")
                
                if has_notification_channel:
                    select_fields.append("up.notification_channel")
                    where_clause = "WHERE u.is_active = TRUE AND up.notification_channel != 'none'"
                else:
                    select_fields.append("'email' as notification_channel")
                    where_clause = "WHERE u.is_active = TRUE"
                
                query = f"""
                    SELECT {', '.join(select_fields)}
                    FROM users u
                    JOIN user_preferences up ON u.id = up.user_id
                    {where_clause}
                """
                cur.execute(query)
                eligible_users = cur.fetchall()

                for user in eligible_users:
                    try:
                        user_id, email, email_time, tz, frequency, apprise_time, apprise_tz, channel = user
                        
                        # Check Email Eligibility
                        if channel in ['email', 'both']:
                            # Check frequency
                            should_send = False
                            user_tz = pytz_timezone(tz or 'UTC')
                            user_local_time = utc_now.replace(tzinfo=pytz.UTC).astimezone(user_tz)
                            
                            if frequency == 'daily':
                                should_send = True
                            elif frequency == 'weekly' and user_local_time.weekday() == 0:
                                should_send = True
                            elif frequency == 'monthly' and user_local_time.day == 1:
                                should_send = True
                            
                            if should_send and is_notification_due(utc_now, email_time, tz, 'email', user_id):
                                users_to_notify_email.add(user_id)
                        
                        # Check Apprise Eligibility
                        if channel in ['apprise', 'both']:
                            # Use separate frequency check for Apprise if available
                            should_send_apprise = True  # Default to daily for now
                            if is_notification_due(utc_now, apprise_time, apprise_tz or tz, 'apprise', user_id):
                                users_to_notify_apprise.add(user_id)

                    except Exception as e:
                        logger.error(f"Error processing user {user}: {e}")
                        continue

        if not users_to_notify_email and not users_to_notify_apprise and not manual_trigger:
            logger.info("No users are scheduled for notifications at this time")
            return

        # Get expiring warranties using the connection functions
        expiring_warranties = get_expiring_warranties(get_db_connection, release_db_connection)
        if not expiring_warranties:
            logger.info("No expiring warranties found.")
            return

        # --- Process Email Notifications ---
        if manual_trigger or users_to_notify_email:
            process_email_notifications(expiring_warranties, users_to_notify_email, manual_trigger, get_db_connection, release_db_connection)

        # --- Process Apprise Notifications ---
        if manual_trigger or users_to_notify_apprise:
            process_apprise_notifications(expiring_warranties, users_to_notify_apprise, manual_trigger, get_db_connection, release_db_connection)

    except Exception as e:
        logger.error(f"Error in send_expiration_notifications: {e}")
    finally:
        # Ensure the connection is always released
        if conn:
            release_db_connection(conn)
        notification_lock.release()

def should_run_scheduler():
    """Check if this is the main process that should run the scheduler."""
    # This environment variable is set by the post_fork hook in gunicorn_config.py
    worker_id = os.environ.get('GUNICORN_WORKER_ID')

    # Case 1: Multi-worker environment (e.g., 'optimized', 'performance' modes).
    # The worker_id is explicitly set. Only worker '0' should run the scheduler.
    if worker_id is not None:
        if worker_id == '0':
            logger.info(f"✅ Scheduler will run in this primary worker (ID: {worker_id}).")
            return True
        else:
            logger.info(f"ℹ️ Scheduler will NOT run in this secondary worker (ID: {worker_id}).")
            return False

    # Case 2: Single-worker environment (e.g., 'ultra-light' mode or Flask dev server).
    # The worker_id is not set (is None). In this case, the single worker must run the scheduler.
    logger.info(f"✅ Scheduler will run: Single-worker environment detected (Worker ID not set).")
    return True

def init_scheduler(app, get_db_connection, release_db_connection):
    """Initialize the scheduler if this is the appropriate worker"""
    global scheduler, scheduler_initialized
    
    if should_run_scheduler():
        try:
            # Initialize scheduler if not already done
            if scheduler is None:
                # First try GeventScheduler if gevent is available and we're in a gevent worker
                worker_class = os.environ.get('GUNICORN_WORKER_CLASS', '')
                
                if GEVENT_SCHEDULER_AVAILABLE and worker_class == 'gevent':
                    try:
                        scheduler = GeventScheduler(
                            job_defaults={
                                'coalesce': True,
                                'max_instances': 1,
                                'misfire_grace_time': 300
                            }
                        )
                        logger.info("Using GeventScheduler for gevent worker compatibility")
                    except Exception as gevent_error:
                        logger.warning(f"Failed to initialize GeventScheduler: {gevent_error}")
                        logger.info("Falling back to BackgroundScheduler")
                        if BACKGROUND_SCHEDULER_AVAILABLE:
                            scheduler = BackgroundScheduler(
                                job_defaults={
                                    'coalesce': True,
                                    'max_instances': 1,
                                    'misfire_grace_time': 300
                                }
                            )
                            logger.info("Using BackgroundScheduler (GeventScheduler fallback)")
                        else:
                            logger.error("BackgroundScheduler not available for fallback")
                            return False
                else:
                    if BACKGROUND_SCHEDULER_AVAILABLE:
                        scheduler = BackgroundScheduler(
                            job_defaults={
                                'coalesce': True,
                                'max_instances': 1,
                                'misfire_grace_time': 300
                            }
                        )
                        if worker_class == 'gevent':
                            logger.info("Using BackgroundScheduler with gevent worker (GeventScheduler not available)")
                        else:
                            logger.info(f"Using BackgroundScheduler with {worker_class} worker")
                    else:
                        logger.error("No scheduler available (BackgroundScheduler not found)")
                        return False
            
            # ---> FIX: Create a wrapper that pushes an app context <---
            def notification_job_with_context():
                with app.app_context():
                    send_expiration_notifications(
                        manual_trigger=False,
                        get_db_connection=get_db_connection,
                        release_db_connection=release_db_connection
                    )

            # Schedule the new context-aware wrapper
            scheduler.add_job(func=notification_job_with_context, trigger="interval", minutes=2, id='notification_job')
            scheduler.start()
            logger.info("✅ Notification scheduler started - checking every 2 minutes")
            
            # Add a shutdown hook
            atexit.register(lambda: scheduler.shutdown())
            scheduler_initialized = True
            return True
        except Exception as e:
            logger.error(f"❌ Failed to start scheduler: {e}")
            scheduler_initialized = False
            return False
    else:
        logger.info("ℹ️ Scheduler not started in this worker")
        scheduler_initialized = False
        return False

def ensure_scheduler_initialized(get_db_connection, release_db_connection):
    """Ensure scheduler is initialized on the first request if it wasn't at startup"""
    global scheduler_initialized, scheduler_retry_attempted
    if not scheduler_initialized and not scheduler_retry_attempted:
        logger.info("Retrying scheduler initialization on first request...")
        scheduler_initialized = init_scheduler(get_db_connection, release_db_connection)
        scheduler_retry_attempted = True

def get_scheduler_status():
    """Get current scheduler status for admin endpoints"""
    global scheduler_initialized, scheduler_retry_attempted
    
    worker_id = os.environ.get('GUNICORN_WORKER_ID', 'unknown')
    worker_name = os.environ.get('GUNICORN_WORKER_PROCESS_NAME', 'unknown')
    worker_class = os.environ.get('GUNICORN_WORKER_CLASS', 'unknown')
    
    scheduler_jobs = []
    scheduler_running = False
    
    if scheduler and hasattr(scheduler, 'get_jobs'):
        try:
            jobs = scheduler.get_jobs()
            scheduler_running = scheduler.running
            scheduler_jobs = [
                {
                    'id': job.id,
                    'next_run_time': job.next_run_time.isoformat() if job.next_run_time else None,
                    'trigger': str(job.trigger)
                }
                for job in jobs
            ]
        except Exception as e:
            logger.error(f"Error getting scheduler jobs: {e}")
    
    return {
        'scheduler_initialized': scheduler_initialized,
        'scheduler_retry_attempted': scheduler_retry_attempted,
        'scheduler_running': scheduler_running,
        'scheduler_jobs': scheduler_jobs,
        'worker_info': {
            'worker_id': worker_id,
            'worker_name': worker_name,
            'worker_class': worker_class,
            'should_run_scheduler': should_run_scheduler()
        },
        'environment_vars': {
            key: value for key, value in os.environ.items() 
            if key.startswith('GUNICORN_') or key in ['WARRACKER_MEMORY_MODE']
        }
    }

def trigger_notifications_manually(get_db_connection, release_db_connection):
    """Manually trigger warranty expiration notifications"""
    try:
        logger.info("Manual notification trigger requested")
        send_expiration_notifications(
            manual_trigger=True,
            get_db_connection=get_db_connection,
            release_db_connection=release_db_connection
        )
        return {'message': 'Notifications triggered successfully'}, 200
    except Exception as e:
        error_msg = f"Error triggering notifications: {str(e)}"
        logger.error(error_msg)
        return {'message': 'Failed to trigger notifications', 'error': error_msg}, 500
