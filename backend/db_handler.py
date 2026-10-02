# backend/db_handler.py
import os
import psycopg2
from psycopg2 import pool
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# PostgreSQL connection details
DB_HOST = os.environ.get('DB_HOST', 'warrackerdb')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'warranty_db')
DB_USER = os.environ.get('DB_USER', 'warranty_user')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'warranty_password')

connection_pool = None # Global connection pool for this module
# Track the PID that created the current pool to detect post-fork reuse
pool_pid: Optional[int] = None

def _close_stale_pool_if_forked(current_pid: int) -> None:
    """Close any existing pool if it was created in a different process.

    Gunicorn with preload_app=True forks workers after the app (and pool) may be
    initialized. Psycopg2 connections/pools are not fork-safe. If we detect that
    the pool was created in a different PID, we proactively close it in this
    process so a fresh, per-process pool can be created.
    """
    global connection_pool, pool_pid
    if connection_pool is not None and pool_pid is not None and pool_pid != current_pid:
        logger.warning(f"[DB_HANDLER] Detected PID change (pool pid {pool_pid} -> current pid {current_pid}). Closing stale pool and reinitializing...")
        try:
            # Close all connections owned by this (forked) process copy of the pool
            connection_pool.closeall()
        except Exception as close_err:
            logger.warning(f"[DB_HANDLER] Error while closing stale pool in forked process: {close_err}")
        finally:
            connection_pool = None
            pool_pid = None

def init_db_pool(max_retries=5, retry_delay=5):
    global connection_pool, pool_pid # Ensure we're modifying the global variable in this module
    attempt = 0
    last_exception = None
    
    current_pid = os.getpid()
    # If a pool exists but was created in a different PID, ensure we drop it first
    _close_stale_pool_if_forked(current_pid)

    if connection_pool is not None and pool_pid == current_pid:
        logger.info("[DB_HANDLER] Database connection pool already initialized for this process.")
        return connection_pool

    while attempt < max_retries:
        try:
            logger.info(f"[DB_HANDLER] Attempting to initialize database pool (attempt {attempt+1}/{max_retries})")
            # Optimized connection pool for memory efficiency
            connection_pool = pool.SimpleConnectionPool(
                1, 4, # Reduced from 1,10 to 1,4 for memory efficiency
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                # Memory optimization settings
                connect_timeout=10,  # Connection timeout
                application_name='warracker_optimized',  # Identify connections
                # Resilience against stale/dead connections (see issue #239):
                # - statement_timeout bounds any single query so a greenlet can
                #   never block inside libpq forever on a dead connection
                # - TCP keepalives let the OS detect a dead peer on idle conns
                options='-c statement_timeout=30000',
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
            )
            logger.info("[DB_HANDLER] Database connection pool initialized successfully.")
            pool_pid = current_pid
            return connection_pool # Return the pool for external check if needed
        except Exception as e:
            last_exception = e
            logger.error(f"[DB_HANDLER] Database connection pool initialization error: {e}")
            logger.info(f"[DB_HANDLER] Retrying in {retry_delay} seconds...")
            time.sleep(retry_delay)
            attempt += 1
    
    logger.error(f"[DB_HANDLER] Failed to initialize database pool after {max_retries} attempts.")
    if last_exception:
        raise last_exception
    else:
        raise Exception("Unknown error creating database pool")

def get_db_connection():
    global connection_pool, pool_pid
    current_pid = os.getpid()

    # Detect and clean up any forked/stale pool
    _close_stale_pool_if_forked(current_pid)

    if connection_pool is None or pool_pid != current_pid:
        if connection_pool is None:
            logger.info("[DB_HANDLER] Database connection pool not initialized in this process. Initializing now...")
        else:
            logger.warning("[DB_HANDLER] Pool PID mismatch detected. Reinitializing pool for current process...")
        init_db_pool() # Attempt to initialize it for this PID
        if connection_pool is None or pool_pid != current_pid: # If still invalid after attempt
            logger.critical("[DB_HANDLER] CRITICAL: Database pool initialization failed for current process.")
            raise Exception("Database connection pool is not initialized and could not be re-initialized.")
    try:
        return connection_pool.getconn()
    except Exception as e:
        logger.error(f"[DB_HANDLER] Error getting connection from pool: {e}")
        # As a last resort, try reinitializing once in case the pool was invalidated
        try:
            _close_stale_pool_if_forked(os.getpid())
            init_db_pool()
            return connection_pool.getconn()
        except Exception:
            # Re-raise original to preserve context
            raise

def release_db_connection(conn):
    global connection_pool
    if connection_pool:
        try:
            connection_pool.putconn(conn)
        except Exception as e:
            logger.error(f"[DB_HANDLER] Error releasing connection to pool: {e}. Connection state: {conn.closed if conn else 'N/A'}")
            # If putconn fails, the connection might be broken or the pool is in a bad state.
            # Attempt to close the connection directly as a fallback.
            if conn and not conn.closed:
                try:
                    conn.close()
                    logger.info("[DB_HANDLER] Connection closed directly after putconn failure.")
                except Exception as close_err:
                    logger.error(f"[DB_HANDLER] Error closing connection directly after putconn failed: {close_err}")
    else:
        logger.warning("[DB_HANDLER] Connection pool is None, cannot release connection to pool. Attempting to close directly.")
        if conn and not conn.closed:
            try:
                conn.close()
            except Exception as e:
                logger.error(f"[DB_HANDLER] Error closing connection directly (pool was None): {e}")

def get_site_setting(setting_name: str, default_value: str = '') -> str:
    """Get a site setting value from the database"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT value FROM site_settings WHERE key = %s",
            (setting_name,)
        )
        result = cursor.fetchone()
        cursor.close()
        
        if result:
            return result[0] if result[0] is not None else default_value
        return default_value
        
    except Exception as e:
        logger.error(f"Error getting site setting {setting_name}: {e}")
        return default_value
    finally:
        if conn:
            release_db_connection(conn)

def get_expiring_warranties(days: int) -> List[Dict]:
    """Get warranties expiring within the specified number of days"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Calculate the date range
        today = datetime.now().date()
        end_date = today + timedelta(days=days)
        
        # Query for non-lifetime warranties expiring within the specified days
        # Include warranties expiring from today up to the target date
        cursor.execute("""
            SELECT 
                id, product_name, expiration_date, user_id,
                purchase_date, vendor, warranty_type, notes
            FROM warranties 
            WHERE is_lifetime = false 
            AND expiration_date BETWEEN %s AND %s
            ORDER BY user_id, expiration_date, product_name
        """, (today, end_date))
        
        results = cursor.fetchall()
        cursor.close()
        
        warranties = []
        for row in results:
            warranty = {
                'id': row[0],
                'product_name': row[1],
                'expiration_date': row[2].isoformat() if row[2] else None,
                'user_id': row[3],
                'purchase_date': row[4].isoformat() if row[4] else None,
                'vendor': row[5],
                'warranty_type': row[6],
                'notes': row[7]
            }
            warranties.append(warranty)
        
        logger.info(f"Found {len(warranties)} warranties expiring in {days} days")
        return warranties
        
    except Exception as e:
        logger.error(f"Error getting expiring warranties for {days} days: {e}")
        return []
    finally:
        if conn:
            release_db_connection(conn)

def get_all_expiring_warranties(max_days: int = 30) -> Dict[int, List[Dict]]:
    """Get all warranties expiring within max_days, grouped by days until expiration"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        today = datetime.now().date()
        max_date = today + timedelta(days=max_days)
        
        cursor.execute("""
            SELECT 
                id, product_name, expiration_date, user_id,
                purchase_date, vendor, warranty_type, notes,
                (expiration_date - %s) as days_until_expiry
            FROM warranties 
            WHERE is_lifetime = false 
            AND expiration_date BETWEEN %s AND %s
            ORDER BY expiration_date, product_name
        """, (today, today, max_date))
        
        results = cursor.fetchall()
        cursor.close()
        
        # Group by days until expiry
        grouped_warranties = {}
        for row in results:
            days_until = row[8].days if row[8] else 0
            
            if days_until not in grouped_warranties:
                grouped_warranties[days_until] = []
            
            warranty = {
                'id': row[0],
                'product_name': row[1],
                'expiration_date': row[2].isoformat() if row[2] else None,
                'user_id': row[3],
                'purchase_date': row[4].isoformat() if row[4] else None,
                'vendor': row[5],
                'warranty_type': row[6],
                'notes': row[7],
                'days_until_expiry': days_until
            }
            grouped_warranties[days_until].append(warranty)
        
        return grouped_warranties
        
    except Exception as e:
        logger.error(f"Error getting all expiring warranties: {e}")
        return {}
    finally:
        if conn:
            release_db_connection(conn)

def update_site_setting(setting_name: str, setting_value: str) -> bool:
    """Update a site setting in the database"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO site_settings (key, value) 
            VALUES (%s, %s)
            ON CONFLICT (key) 
            DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
        """, (setting_name, setting_value))
        
        conn.commit()
        cursor.close()
        return True
        
    except Exception as e:
        logger.error(f"Error updating site setting {setting_name}: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            release_db_connection(conn) 