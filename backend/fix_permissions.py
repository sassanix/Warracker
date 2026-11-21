#!/usr/bin/env python3
import os
import sys
import psycopg2
import logging
import time
import stat
import pwd
import grp

from urllib.parse import parse_qsl, unquote, urlparse

from psycopg2.extensions import AsIs

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _quote_ident(name):
    """Quote a PostgreSQL identifier, preserving case (issue #187)."""
    return '"' + str(name).replace('"', '""') + '"'


def _db_parts():
    url = os.environ.get('DATABASE_URL')
    if url:
        p = urlparse(url)
        parts = {
            'host': p.hostname or 'localhost',
            'port': str(p.port) if p.port else '5432',
            'name': (p.path or '').lstrip('/') or 'warranty_db',
            'user': unquote(p.username) if p.username else None,
            'password': unquote(p.password) if p.password else None,
        }
        options = dict(parse_qsl(p.query, keep_blank_values=True))
        if options:
            parts['options'] = options
        return parts
    return {
        'host': os.environ.get('DB_HOST', 'warrackerdb'),
        'port': os.environ.get('DB_PORT', '5432'),
        'name': os.environ.get('DB_NAME', 'warranty_db'),
        'user': os.environ.get('DB_USER'),
        'password': os.environ.get('DB_PASSWORD'),
    }


# PostgreSQL connection details
_DB = _db_parts()
DB_HOST = _DB['host']
DB_PORT = _DB['port']
DB_NAME = _DB['name']
DB_USER = _DB['user']
DB_PASSWORD = _DB['password']

def create_db_connection(max_retries=5, retry_delay=5):
    """Create a database connection with retry logic"""
    if not DB_USER or not DB_PASSWORD:
        raise RuntimeError(
            "Missing required database environment variables: "
            "DB_USER and DB_PASSWORD must be set (or DATABASE_URL must "
            "include a username and password)."
        )
    attempt = 0
    last_exception = None

    while attempt < max_retries:
        try:
            logger.info(f"Attempting to connect to database (attempt {attempt+1}/{max_retries})")
            conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                **_DB.get('options', {}),
            )
            logger.info("Database connection successful")
            return conn
        except Exception as e:
            last_exception = e
            logger.error(f"Database connection error: {e}")
            logger.info(f"Retrying in {retry_delay} seconds...")
            time.sleep(retry_delay)
            attempt += 1

    # If we got here, all connection attempts failed
    logger.error(f"Failed to connect to database after {max_retries} attempts")
    raise last_exception

def fix_upload_folder_permissions():
    """Fix upload folder permissions for warracker user (uid:999, gid:999)"""
    try:
        # Get upload folder path from environment or use default
        upload_folder = os.environ.get('UPLOAD_FOLDER', '/data/uploads')
        warracker_uid = 999
        warracker_gid = 999

        logger.info(f"Checking upload folder permissions: {upload_folder}")

        # Create folder if it doesn't exist
        if not os.path.exists(upload_folder):
            logger.info(f"Creating upload folder: {upload_folder}")
            os.makedirs(upload_folder, mode=0o755, exist_ok=True)
            os.chown(upload_folder, warracker_uid, warracker_gid)
            logger.info(f"Upload folder created with correct permissions")
            return

        # Check current ownership
        stat_info = os.stat(upload_folder)
        current_uid = stat_info.st_uid
        current_gid = stat_info.st_gid

        if current_uid == warracker_uid and current_gid == warracker_gid:
            logger.info(f"Upload folder permissions already correct ({warracker_uid}:{warracker_gid})")
            return

        # Get current owner names for logging
        try:
            current_user = pwd.getpwuid(current_uid).pw_name
            current_group = grp.getgrgid(current_gid).gr_name
            current_owner = f"{current_user}:{current_group} ({current_uid}:{current_gid})"
        except KeyError:
            current_owner = f"{current_uid}:{current_gid}"

        logger.info(f"Fixing upload folder ownership from {current_owner} to warracker:warracker ({warracker_uid}:{warracker_gid})...")

        # Fix ownership recursively
        for root, dirs, files in os.walk(upload_folder):
            os.chown(root, warracker_uid, warracker_gid)
            for directory in dirs:
                os.chown(os.path.join(root, directory), warracker_uid, warracker_gid)
            for file in files:
                os.chown(os.path.join(root, file), warracker_uid, warracker_gid)

        logger.info("Upload folder permissions fixed successfully!")

    except PermissionError as e:
        logger.warning(f"Permission denied when fixing upload folder: {e}")
        logger.warning("This script needs to run with sufficient privileges (e.g., as root)")
    except Exception as e:
        logger.error(f"Error fixing upload folder permissions: {e}")
        # Don't exit - allow database permissions to still run

def fix_database_permissions():
    """Run the fix permissions SQL script"""
    conn = None
    try:
        conn = create_db_connection()
        conn.autocommit = True  # Important for ALTER ROLE commands
        cursor = conn.cursor()

        # Read the fix permissions SQL script
        script_path = os.path.join(os.path.dirname(__file__), 'fix_permissions.sql')
        with open(script_path, 'r') as f:
            sql_script = f.read()

        # Execute the script
        logger.info("Executing fix permissions SQL script...")
        cursor.execute(
            sql_script,
            {
                "db_name": AsIs(_quote_ident(DB_NAME)),
                "db_user": AsIs(_quote_ident(DB_USER)),
            }
        )

        logger.info("Database permissions fixed successfully")

    except Exception as e:
        logger.error(f"Error fixing database permissions: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()

def fix_permissions():
    """Fix both upload folder and database permissions"""
    logger.info("=== Starting Permissions Fix ===")

    # Fix upload folder permissions first (Issue #177)
    fix_upload_folder_permissions()

    # Fix database permissions
    fix_database_permissions()

    logger.info("=== Permissions Fix Completed ===")

if __name__ == "__main__":
    fix_permissions()
