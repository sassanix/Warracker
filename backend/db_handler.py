# backend/db_handler.py
import os
import psycopg2
from psycopg2 import pool, extensions
import logging
import time
import threading  # cooperative under gevent: gunicorn_config.py calls monkey.patch_all()
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# PostgreSQL connection details
# DATABASE_URL (e.g. postgresql://user:pass@host:5432/dbname) takes precedence
# over the individual DB_* variables when set (issue #108).
DATABASE_URL = os.environ.get('DATABASE_URL')
DB_HOST = os.environ.get('DB_HOST', 'warrackerdb')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'warranty_db')
DB_USER = os.environ.get('DB_USER')
DB_PASSWORD = os.environ.get('DB_PASSWORD')

def _require_db_credentials():
    if not DATABASE_URL and (not DB_USER or not DB_PASSWORD):
        raise RuntimeError(
            "Missing required database environment variables: "
            "DB_USER and DB_PASSWORD must be set when DATABASE_URL is not used."
        )

def _connection_kwargs():
    """psycopg2 connection kwargs: DATABASE_URL wins over DB_* parts."""
    _require_db_credentials()
    if DATABASE_URL:
        return {'dsn': DATABASE_URL}
    return {
        'host': DB_HOST,
        'port': DB_PORT,
        'database': DB_NAME,
        'user': DB_USER,
        'password': DB_PASSWORD,
    }

# Connection pool settings (per worker process).
# DB_POOL_MAX: most connections a worker holds at once.
# DB_POOL_MIN: idle connections kept open. psycopg2 closes a returned connection
#   when this many are already idle, so a value below DB_POOL_MAX means
#   reconnecting under load; it defaults to DB_POOL_MAX.
# DB_POOL_WAIT_SECONDS: how long a request waits for a free connection before
#   failing with "connection pool exhausted".
DB_POOL_MAX = int(os.environ.get('DB_POOL_MAX', '10'))
DB_POOL_MIN = min(int(os.environ.get('DB_POOL_MIN', str(DB_POOL_MAX))), DB_POOL_MAX)
DB_POOL_WAIT_SECONDS = float(os.environ.get('DB_POOL_WAIT_SECONDS', '30'))

connection_pool = None # Global connection pool for this module
# Track the PID that created the current pool to detect post-fork reuse
pool_pid: Optional[int] = None
# Caps checkouts at DB_POOL_MAX so callers wait for a free connection instead
# of failing straight away.
_pool_slots: Optional[threading.BoundedSemaphore] = None
# Connections handed out by get_db_connection(), mapped to the pool and
# semaphore they came from, so each is returned exactly once, to its own pool.
_checked_out: Dict[int, Tuple[pool.AbstractConnectionPool, threading.BoundedSemaphore]] = {}
# Serialises pool creation. Under gevent, the first requests on a new worker
# (for example after a max_requests restart) would otherwise each create a pool.
_init_lock = threading.Lock()

def _close_stale_pool_if_forked(current_pid: int) -> None:
    """Close any existing pool if it was created in a different process.

    Gunicorn with preload_app=True forks workers after the app (and pool) may be
    initialized. Psycopg2 connections/pools are not fork-safe. If we detect that
    the pool was created in a different PID, we proactively close it in this
    process so a fresh, per-process pool can be created.
    """
    global connection_pool, pool_pid, _pool_slots
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
            _pool_slots = None
            _checked_out.clear()

def init_db_pool(max_retries=5, retry_delay=5):
    global connection_pool, pool_pid, _pool_slots # Ensure we're modifying the global variable in this module
    attempt = 0
    last_exception = None
    
    current_pid = os.getpid()
    # If a pool exists but was created in a different PID, ensure we drop it first
    _close_stale_pool_if_forked(current_pid)

    if connection_pool is not None and pool_pid == current_pid:
        logger.info("[DB_HANDLER] Database connection pool already initialized for this process.")
        return connection_pool

    _require_db_credentials()

    while attempt < max_retries:
        try:
            logger.info(f"[DB_HANDLER] Attempting to initialize database pool (attempt {attempt+1}/{max_retries})")
            # ThreadedConnectionPool locks around getconn/putconn, which keeps
            # concurrent greenlets from opening more than DB_POOL_MAX connections.
            connection_pool = pool.ThreadedConnectionPool(
                DB_POOL_MIN, DB_POOL_MAX,
                **_connection_kwargs(),
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
            logger.info(f"[DB_HANDLER] Database connection pool initialized successfully (min {DB_POOL_MIN}, max {DB_POOL_MAX}).")
            pool_pid = current_pid
            _pool_slots = threading.BoundedSemaphore(DB_POOL_MAX)
            _checked_out.clear()
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
        with _init_lock:
            if connection_pool is None or pool_pid != current_pid:
                if connection_pool is None:
                    logger.info("[DB_HANDLER] Database connection pool not initialized in this process. Initializing now...")
                else:
                    logger.warning("[DB_HANDLER] Pool PID mismatch detected. Reinitializing pool for current process...")
                init_db_pool() # Attempt to initialize it for this PID
        if connection_pool is None or pool_pid != current_pid: # If still invalid after attempt
            logger.critical("[DB_HANDLER] CRITICAL: Database pool initialization failed for current process.")
            raise Exception("Database connection pool is not initialized and could not be re-initialized.")
    # Use the pool and its semaphore as a pair, even if the globals change
    # before the connection is released.
    the_pool, slots = connection_pool, _pool_slots
    if not slots.acquire(timeout=DB_POOL_WAIT_SECONDS):
        logger.error(f"[DB_HANDLER] Error getting connection from pool: connection pool exhausted (waited {DB_POOL_WAIT_SECONDS}s)")
        raise pool.PoolError("connection pool exhausted")
    try:
        conn = the_pool.getconn()
        if conn.closed:  # closed by the server since it was last used: replace it
            the_pool.putconn(conn, close=True)
            conn = the_pool.getconn()
    except Exception as e:
        slots.release()
        logger.error(f"[DB_HANDLER] Error getting connection from pool: {e}")
        raise
    _checked_out[id(conn)] = (the_pool, slots)
    return conn

def release_db_connection(conn):
    if conn is None:
        return
    key = id(conn)
    owner = _checked_out.pop(key, None)
    if owner is None:
        # Already released (some code paths release twice). Returning or
        # closing it again could close a connection another request now holds.
        return
    the_pool, slots = owner
    try:
        broken = conn.closed or conn.info.transaction_status == extensions.TRANSACTION_STATUS_UNKNOWN
        if not broken and conn.info.transaction_status != extensions.TRANSACTION_STATUS_IDLE:
            try:
                conn.rollback()
            except Exception as e:
                logger.warning(f"[DB_HANDLER] Rollback on release failed, discarding connection: {e}")
                broken = True
        the_pool.putconn(conn, close=broken)
    except Exception as e:
        logger.error(f"[DB_HANDLER] Error releasing connection to pool: {e}. Discarding it.")
        try:
            the_pool.putconn(conn, close=True)
        except Exception:
            try:
                if not conn.closed:
                    conn.close()
            except Exception:
                pass
    finally:
        try:
            slots.release()
        except ValueError:
            pass

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