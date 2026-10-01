from flask import Blueprint, request, jsonify, current_app
from datetime import date, timedelta
from decimal import Decimal
import logging

# Use try-except pattern for imports to handle both Docker and development environments
try:
    from . import db_handler
    from .auth_utils import token_required
    from .db_handler import get_db_connection, release_db_connection
except ImportError:
    import db_handler
    from auth_utils import token_required
    from db_handler import get_db_connection, release_db_connection

# Create the statistics blueprint
statistics_bp = Blueprint('statistics_bp', __name__)

# Set up logging
logger = logging.getLogger(__name__)

# Helper function
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

# ============================
# Statistics Routes
# ============================

@statistics_bp.route('/statistics', methods=['GET'])
@token_required
def get_statistics():
    user_id = request.user['id']
    conn = None

    try:
        conn = get_db_connection()
        today = date.today()

        # Fetch user preference for expiring soon days
        expiring_soon_days = 30 # Default value
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT expiring_soon_days FROM user_preferences WHERE user_id = %s", (user_id,))
                result = cur.fetchone()
                if result and result[0] is not None:
                    expiring_soon_days = result[0]
                    logger.info(f"Using custom expiring soon days: {expiring_soon_days} for user {user_id}")
                else:
                    logger.info(f"Using default expiring soon days: {expiring_soon_days} for user {user_id}")
        except Exception as pref_err:
             # Log error fetching preference but continue with default
            logger.error(f"Error fetching expiring_soon_days preference for user {user_id}: {pref_err}. Using default 30 days.")

        expiring_soon_date = today + timedelta(days=expiring_soon_days)
        ninety_days_later = today + timedelta(days=90) # Keep timeline fixed or make configurable? For now, keep at 90.

        # Build base query based on role
        from_clause = "FROM warranties w"
        where_clause = ""
        params = []
        active_where = "AND"

        if not request.user.get('is_admin', False):
            where_clause = "WHERE w.user_id = %s"
            params = [user_id]
            active_where = "AND"
        else:
            # Admin should only see their own warranties
            where_clause = "WHERE w.user_id = %s"
            params = [user_id]
            active_where = "AND"
        
        with conn.cursor() as cur:
            # Get total count (excluding archived)
            cur.execute(f"SELECT COUNT(*) {from_clause} {where_clause} AND w.archived_at IS NULL", params)
            total_count = cur.fetchone()[0]
            logger.info(f"Total warranties: {total_count}")

            # Get archived count
            cur.execute(f"SELECT COUNT(*) {from_clause} {where_clause} AND w.archived_at IS NOT NULL", params)
            archived_count = cur.fetchone()[0]
            logger.info(f"Archived warranties: {archived_count}")
            
            # Get active count (includes lifetime, excludes archived)
            cur.execute(f"SELECT COUNT(*) {from_clause} {where_clause} {active_where if where_clause else 'WHERE'} (w.is_lifetime = TRUE OR w.expiration_date > %s) AND w.archived_at IS NULL", params + [today])
            active_count = cur.fetchone()[0]
            logger.info(f"Active warranties: {active_count}")
            
            # Get expired count (excludes lifetime and archived)
            cur.execute(f"SELECT COUNT(*) {from_clause} {where_clause} {active_where if where_clause else 'WHERE'} w.is_lifetime = FALSE AND w.expiration_date <= %s AND w.archived_at IS NULL", params + [today])
            expired_count = cur.fetchone()[0]
            logger.info(f"Expired warranties: {expired_count}")
            
            # Get expiring soon count (excludes lifetime and archived) using user preference
            cur.execute(f"""SELECT COUNT(*) {from_clause} {where_clause} {active_where if where_clause else 'WHERE'}
                          w.is_lifetime = FALSE AND w.expiration_date > %s AND w.expiration_date <= %s AND w.archived_at IS NULL""",
                      params + [today, expiring_soon_date])
            expiring_soon_count = cur.fetchone()[0]
            logger.info(f"Expiring soon ({expiring_soon_days} days) warranties: {expiring_soon_count}")
            
            # Get expiration timeline (next 90 days, excluding lifetime)
            cur.execute(f"""
                SELECT 
                    EXTRACT(YEAR FROM expiration_date) as year,
                    EXTRACT(MONTH FROM expiration_date) as month,
                    COUNT(*) as count
                {from_clause} 
                {where_clause} {active_where if where_clause else 'WHERE'} 
                w.is_lifetime = FALSE AND w.expiration_date > %s AND w.expiration_date <= %s AND w.archived_at IS NULL
                GROUP BY EXTRACT(YEAR FROM expiration_date), EXTRACT(MONTH FROM expiration_date)
                ORDER BY year, month
            """, params + [today, ninety_days_later])
            
            timeline = []
            for row in cur.fetchall():
                year = int(row[0])
                month = int(row[1])
                count = row[2]
                timeline.append({
                    "year": year,
                    "month": month,
                    "count": count
                })
            
            # Get recent expiring warranties (using user preference +/- 30 days for range, excluding lifetime)
            # We'll keep the window around today somewhat fixed for 'recent', maybe +/- 30 days is still reasonable? Or should this also use expiring_soon_days?
            # Let's adjust the recent window based on the preference for now: N days ago to N days later
            days_ago_for_recent = today - timedelta(days=expiring_soon_days)
            days_later_for_recent = expiring_soon_date # Same as the expiring soon cutoff
            cur.execute(f"""
                SELECT
                    id, product_name, purchase_date, 
                    warranty_duration_years, warranty_duration_months, warranty_duration_days,
                    expiration_date, invoice_path, manual_path, other_document_path, product_url, purchase_price, is_lifetime
                {from_clause}
                {where_clause} {active_where if where_clause else 'WHERE'}
                w.is_lifetime = FALSE AND w.expiration_date >= %s AND w.expiration_date <= %s AND w.archived_at IS NULL
                ORDER BY expiration_date
                LIMIT 10
            """, params + [days_ago_for_recent, days_later_for_recent])
            
            columns = [desc[0] for desc in cur.description]
            recent_warranties = []
            
            for row in cur.fetchall():
                warranty = dict(zip(columns, row))
                
                # Convert dates to string format
                if warranty['purchase_date']:
                    warranty['purchase_date'] = warranty['purchase_date'].isoformat()
                if warranty['expiration_date']:
                    warranty['expiration_date'] = warranty['expiration_date'].isoformat()
                
                # Convert Decimal objects to float for JSON serialization
                if warranty.get('purchase_price') and isinstance(warranty['purchase_price'], Decimal):
                    warranty['purchase_price'] = float(warranty['purchase_price'])
                    
                recent_warranties.append(warranty)
            
            # *** ADD CODE TO FETCH ALL WARRANTIES ***
            logger.info(f"Fetching all warranties for user {user_id}...")
            cur.execute(f"""
                SELECT
                    id, product_name, purchase_date, 
                    warranty_duration_years, warranty_duration_months, warranty_duration_days,
                    expiration_date, invoice_path, manual_path, other_document_path, product_url, purchase_price, is_lifetime,
                    model_number,
                    (archived_at IS NOT NULL) AS is_archived
                {from_clause}
                {where_clause}
                ORDER BY expiration_date DESC
            """, params)

            all_columns = [desc[0] for desc in cur.description]
            all_warranties_list = []

            for row in cur.fetchall():
                warranty = dict(zip(all_columns, row))
                
                # Convert dates to string format
                if warranty.get('purchase_date') and isinstance(warranty['purchase_date'], date):
                    warranty['purchase_date'] = warranty['purchase_date'].isoformat()
                if warranty.get('expiration_date') and isinstance(warranty['expiration_date'], date):
                    warranty['expiration_date'] = warranty['expiration_date'].isoformat()
                
                # Convert Decimal objects to float for JSON serialization
                if warranty.get('purchase_price') and isinstance(warranty['purchase_price'], Decimal):
                    warranty['purchase_price'] = float(warranty['purchase_price'])
                    
                all_warranties_list.append(warranty)
            logger.info(f"Fetched {len(all_warranties_list)} total warranties.")
            # *** END OF ADDED CODE ***

            statistics = {
                'total': total_count,
                'active': active_count,
                'expired': expired_count,
                'expiring_soon': expiring_soon_count,
                'archived': archived_count,
                'timeline': timeline,
                'recent_warranties': recent_warranties,
                'all_warranties': all_warranties_list  # <-- Add the new list here
            }
            
            return jsonify(convert_decimals(statistics))
    
    except Exception as e:
        logger.error(f"Error getting warranty statistics: {e}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        if conn:
            release_db_connection(conn)

@statistics_bp.route('/statistics/global', methods=['GET'])
@token_required
def get_global_statistics():
    """Get global warranty statistics for all users (with proper permissions check)"""
    conn = None
    try:
        # Check if global view is enabled for this user
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

        # Get user's expiring soon days preference (for consistency)
        user_id = request.user['id']
        expiring_soon_days = 30  # Default value
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT expiring_soon_days FROM user_preferences WHERE user_id = %s", (user_id,))
                result = cur.fetchone()
                if result and result[0] is not None:
                    expiring_soon_days = result[0]
        except Exception as pref_err:
            logger.error(f"Error fetching expiring_soon_days preference for user {user_id}: {pref_err}. Using default 30 days.")

        today = date.today()
        expiring_soon_date = today + timedelta(days=expiring_soon_days)
        ninety_days_later = today + timedelta(days=90)
        
        with conn.cursor() as cur:
            # Global statistics query - all warranties from all users
            
            # Get total count (excluding archived)
            cur.execute("SELECT COUNT(*) FROM warranties w WHERE w.archived_at IS NULL")
            total_count = cur.fetchone()[0]

            # Get archived count
            cur.execute("SELECT COUNT(*) FROM warranties w WHERE w.archived_at IS NOT NULL")
            archived_count = cur.fetchone()[0]
            
            # Get active count (includes lifetime, excludes archived)
            cur.execute("SELECT COUNT(*) FROM warranties w WHERE (w.is_lifetime = TRUE OR w.expiration_date > %s) AND w.archived_at IS NULL", (today,))
            active_count = cur.fetchone()[0]
            
            # Get expired count (excludes lifetime and archived)
            cur.execute("SELECT COUNT(*) FROM warranties w WHERE w.is_lifetime = FALSE AND w.expiration_date <= %s AND w.archived_at IS NULL", (today,))
            expired_count = cur.fetchone()[0]
            
            # Get expiring soon count (excludes lifetime and archived)
            cur.execute("""SELECT COUNT(*) FROM warranties w WHERE
                          w.is_lifetime = FALSE AND w.expiration_date > %s AND w.expiration_date <= %s AND w.archived_at IS NULL""",
                      (today, expiring_soon_date))
            expiring_soon_count = cur.fetchone()[0]
            
            # Get expiration timeline (next 90 days, excluding lifetime)
            cur.execute("""
                SELECT 
                    EXTRACT(YEAR FROM expiration_date) as year,
                    EXTRACT(MONTH FROM expiration_date) as month,
                    COUNT(*) as count
                FROM warranties w 
                WHERE w.is_lifetime = FALSE AND w.expiration_date > %s AND w.expiration_date <= %s AND w.archived_at IS NULL
                GROUP BY EXTRACT(YEAR FROM expiration_date), EXTRACT(MONTH FROM expiration_date)
                ORDER BY year, month
            """, (today, ninety_days_later))
            
            timeline = []
            for row in cur.fetchall():
                year = int(row[0])
                month = int(row[1])
                count = row[2]
                timeline.append({
                    "year": year,
                    "month": month,
                    "count": count
                })
            
            # Get recent expiring warranties with user information
            days_ago_for_recent = today - timedelta(days=expiring_soon_days)
            days_later_for_recent = expiring_soon_date
            cur.execute("""
                SELECT
                    w.id, w.product_name, w.purchase_date, 
                    w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days,
                    w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.purchase_price, w.is_lifetime,
                    u.username, u.email, u.first_name, u.last_name
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                WHERE w.is_lifetime = FALSE AND w.expiration_date >= %s AND w.expiration_date <= %s AND w.archived_at IS NULL
                ORDER BY w.expiration_date
                LIMIT 10
            """, (days_ago_for_recent, days_later_for_recent))
            
            columns = [desc[0] for desc in cur.description]
            recent_warranties = []
            
            for row in cur.fetchall():
                warranty = dict(zip(columns, row))
                
                # Convert dates to string format
                if warranty['purchase_date']:
                    warranty['purchase_date'] = warranty['purchase_date'].isoformat()
                if warranty['expiration_date']:
                    warranty['expiration_date'] = warranty['expiration_date'].isoformat()
                
                # Convert Decimal objects to float for JSON serialization
                if warranty.get('purchase_price') and isinstance(warranty['purchase_price'], Decimal):
                    warranty['purchase_price'] = float(warranty['purchase_price'])
                
                # Add user display information
                first_name = warranty.get('first_name', '').strip() if warranty.get('first_name') else ''
                last_name = warranty.get('last_name', '').strip() if warranty.get('last_name') else ''
                username = warranty.get('username', '').strip() if warranty.get('username') else ''
                
                if first_name and last_name:
                    display_name = f"{first_name} {last_name}"
                elif first_name:
                    display_name = first_name
                elif username:
                    display_name = username
                else:
                    display_name = 'Unknown User'
                
                warranty['user_display_name'] = display_name
                    
                recent_warranties.append(warranty)
            
            # Get all warranties with user information
            cur.execute("""
                SELECT
                    w.id, w.product_name, w.purchase_date, 
                    w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days,
                    w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.purchase_price, w.is_lifetime,
                    u.username, u.email, u.first_name, u.last_name,
                    w.model_number,
                    (w.archived_at IS NOT NULL) AS is_archived
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                ORDER BY w.expiration_date DESC
            """)

            all_columns = [desc[0] for desc in cur.description]
            all_warranties_list = []

            for row in cur.fetchall():
                warranty = dict(zip(all_columns, row))
                
                # Convert dates to string format
                if warranty.get('purchase_date') and isinstance(warranty['purchase_date'], date):
                    warranty['purchase_date'] = warranty['purchase_date'].isoformat()
                if warranty.get('expiration_date') and isinstance(warranty['expiration_date'], date):
                    warranty['expiration_date'] = warranty['expiration_date'].isoformat()
                
                # Convert Decimal objects to float for JSON serialization
                if warranty.get('purchase_price') and isinstance(warranty['purchase_price'], Decimal):
                    warranty['purchase_price'] = float(warranty['purchase_price'])
                
                # Add user display name for better UI
                first_name = warranty.get('first_name', '').strip() if warranty.get('first_name') else ''
                last_name = warranty.get('last_name', '').strip() if warranty.get('last_name') else ''
                username = warranty.get('username', '').strip() if warranty.get('username') else ''
                
                if first_name and last_name:
                    display_name = f"{first_name} {last_name}"
                elif first_name:
                    display_name = first_name
                elif username:
                    display_name = username
                else:
                    display_name = 'Unknown User'
                
                warranty['user_display_name'] = display_name
                    
                all_warranties_list.append(warranty)

            statistics = {
                'total': total_count,
                'active': active_count,
                'expired': expired_count,
                'expiring_soon': expiring_soon_count,
                'archived': archived_count,
                'timeline': timeline,
                'recent_warranties': recent_warranties,
                'all_warranties': all_warranties_list
            }
            
            return jsonify(convert_decimals(statistics))
    
    except Exception as e:
        logger.error(f"Error getting global warranty statistics: {e}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        if conn:
            release_db_connection(conn)


@statistics_bp.route('/settings/global-view-status', methods=['GET'])
@token_required
def check_global_view_status():
    """Check if global view is enabled for the current user"""
    conn = None
    try:
        user_is_admin = request.user.get('is_admin', False)
        
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
            
            if not table_exists:
                # If table doesn't exist, global view is enabled by default
                return jsonify({"enabled": True}), 200
            
            # Get both global view settings
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
            settings = {row[0]: row[1] for row in cur.fetchall()}
            
            # Check if global view is enabled at all
            global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
            if not global_view_enabled:
                return jsonify({"enabled": False}), 200
            
            # Check if global view is restricted to admins only
            admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
            if admin_only and not user_is_admin:
                return jsonify({"enabled": False}), 200
            
            # Global view is enabled for this user
            return jsonify({"enabled": True}), 200
            
    except Exception as e:
        logger.error(f"Error checking global view status: {e}")
        # Default to enabled on error for admins, disabled for non-admins
        user_is_admin = request.user.get('is_admin', False)
        return jsonify({"enabled": user_is_admin}), 500
    finally:
        if conn:
            release_db_connection(conn) 