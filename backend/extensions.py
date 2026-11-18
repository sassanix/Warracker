# backend/extensions.py
import logging
import os
from authlib.integrations.flask_client import OAuth
from flask_cors import CORS
from flask_bcrypt import Bcrypt

logger = logging.getLogger(__name__)

# Initialize extensions without app instance
oauth = OAuth()
cors = CORS()
bcrypt = Bcrypt()
babel = None  # Will be initialized in initialize_extensions
db_pool = None  # Database connection pool

def cors_settings():
    """CORS origins and credential support (AUTH-14).

    The shipped topology serves the frontend from the same origin as
    the API, so no cross-origin credentialed access is ever needed by
    the app itself: API authentication is a Bearer token sent in the
    Authorization header, and the Flask session cookie is only used by
    the top-level OIDC redirect flow. Reflecting any Origin with
    credentials support is a latent trap if cookie authentication is
    ever added, so credentials are only enabled for origins the
    operator names explicitly in CORS_ALLOWED_ORIGINS (a comma
    separated list, for example
    https://warracker.example.com,https://app.example.com). With the
    variable unset, any origin may still call the API with a Bearer
    token, but no credentials are honored cross-origin.
    """
    raw = os.environ.get('CORS_ALLOWED_ORIGINS', '')
    origins = [origin.strip() for origin in raw.split(',') if origin.strip()]
    if origins:
        return origins, True
    return '*', False


def initialize_extensions(app):
    """Initialize all extensions with the Flask app object."""
    global babel, db_pool
    
    logger.info("Initializing Flask extensions...")
    
    # Initialize OAuth
    oauth.init_app(app)
    logger.info("OAuth initialized")
    
    # Initialize CORS. Credentials are only honored for origins the
    # operator names in CORS_ALLOWED_ORIGINS; see cors_settings. The
    # default branch sends a literal wildcard origin and no
    # credentials header instead of echoing the request Origin.
    origins, supports_credentials = cors_settings()
    cors.init_app(
        app,
        origins=origins,
        supports_credentials=supports_credentials,
        send_wildcard=(origins == '*'),
    )
    logger.info("CORS initialized")
    
    # Initialize Bcrypt
    bcrypt.init_app(app)
    logger.info("Bcrypt initialized")
    
    # Initialize Babel for localization
    try:
        from .localization import init_babel, get_current_language
        babel = init_babel(app)
        logger.info("Babel localization initialized successfully")
    except ImportError:
        try:
            from localization import init_babel, get_current_language
            babel = init_babel(app)
            logger.info("Babel localization initialized successfully")
        except ImportError as e:
            logger.error(f"Failed to initialize localization: {e}")
            babel = None
    
    # Initialize the database connection pool
    try:
        from .db_handler import init_db_pool
        db_pool = init_db_pool()
        logger.info("Database connection pool initialized successfully")
    except ImportError:
        try:
            from db_handler import init_db_pool
            db_pool = init_db_pool()
            logger.info("Database connection pool initialized successfully")
        except ImportError as e:
            logger.critical(f"CRITICAL: Failed to initialize database pool: {e}")
            raise
    
    # Initialize Apprise notification handler
    try:
        try:
            from .apprise_handler import AppriseNotificationHandler
        except ImportError:
            from apprise_handler import AppriseNotificationHandler
        
        apprise_handler = AppriseNotificationHandler()
        app.config['APPRISE_HANDLER'] = apprise_handler
        app.config['APPRISE_AVAILABLE'] = True
        logger.info("Apprise notification handler initialized successfully")
    except ImportError as e:
        app.config['APPRISE_HANDLER'] = None
        app.config['APPRISE_AVAILABLE'] = False
        logger.warning(f"Apprise not available: {e}. Notification features will be disabled.")
    
    logger.info("All extensions initialized successfully") 