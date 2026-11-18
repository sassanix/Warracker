# backend/config.py
import os
import logging
from datetime import timedelta
from urllib.parse import unquote, urlparse

logger = logging.getLogger(__name__)

def _secret_key_file_paths():
    """Candidate locations for the persisted generated SECRET_KEY, best first.

    The first path lives inside the uploads folder, the one directory the
    shipped compose files and the Unraid template all mount as a volume,
    so a generated key survives container recreation (CFG-02). The file
    is a dotfile no warranty row references, and the file routes only
    serve paths a warranty row references, so it is not downloadable.
    The legacy bare `secret_key` file in the working directory stays as
    a fallback so installs that already generated one keep using it.
    SECRET_KEY_FILE overrides both locations.
    """
    override = os.environ.get('SECRET_KEY_FILE')
    if override:
        return [override]
    upload_folder = os.environ.get('UPLOAD_FOLDER', '/data/uploads')
    return [os.path.join(upload_folder, '.secret_key'), 'secret_key']


def _migrate_secret_key_file(source, target):
    """Copy a legacy key file to the persisted location, best effort.

    Runs when the key was read from the legacy location and the
    persisted location has no key yet, so the first start after an
    upgrade keeps the existing key and future recreations keep it too.
    """
    if source == target or os.path.exists(target):
        return
    try:
        with open(source, 'r') as f:
            secret = f.read().strip()
        if not secret:
            return
        parent = os.path.dirname(target)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(target, 'w') as f:
            f.write(secret)
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass
        logger.info(f"Migrated SECRET_KEY file from {source} to {target}")
    except OSError:
        pass


def get_try_create_secret():
    secret = os.environ.get('SECRET_KEY')
    if secret:
        return secret
    paths = _secret_key_file_paths()
    for path in paths:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    secret = f.read().strip()
                if secret:
                    _migrate_secret_key_file(path, paths[0])
                    return secret
            except OSError:
                continue
    # No usable key anywhere: generate one and persist it. If no key file
    # location is writable, fail closed (CFG-03): there is no fallback to
    # a known key, because a token forged with a public key would be
    # accepted. The operator must set SECRET_KEY or fix the permissions.
    import base64
    secret = base64.b64encode(os.urandom(32)).decode('ascii')
    for path in paths:
        try:
            parent = os.path.dirname(path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(path, 'w') as f:
                f.write(secret)
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
            logger.info(f"Generated new SECRET_KEY and saved to {path}")
            return secret
        except OSError:
            continue
    raise RuntimeError(
        "Could not persist a generated SECRET_KEY: none of the key file "
        f"locations ({', '.join(paths)}) is writable. Set the SECRET_KEY "
        "environment variable or make one of those locations writable."
    )

class Config:
    """Base configuration class."""
    
    # Flask Core Configuration
    SECRET_KEY = get_try_create_secret()
    JWT_EXPIRATION_DELTA = timedelta(hours=int(os.environ.get('JWT_EXPIRATION_HOURS', '24')))
    
    # Database Configuration
    DB_HOST = os.environ.get('DB_HOST', 'warrackerdb')
    DB_NAME = os.environ.get('DB_NAME', 'warranty_db')
    DB_USER = os.environ.get('DB_USER')
    DB_PASSWORD = os.environ.get('DB_PASSWORD')
    DB_ADMIN_USER = os.environ.get('DB_ADMIN_USER')
    DB_ADMIN_PASSWORD = os.environ.get('DB_ADMIN_PASSWORD')
    
    # File Upload Configuration
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', '/data/uploads')
    DEFAULT_MAX_UPLOAD_MB = 32
    
    @staticmethod
    def _get_max_upload_mb():
        try:
            max_upload_mb = int(os.environ.get('MAX_UPLOAD_MB', Config.DEFAULT_MAX_UPLOAD_MB))
            if max_upload_mb <= 0:
                max_upload_mb = Config.DEFAULT_MAX_UPLOAD_MB
                logger.warning(f"MAX_UPLOAD_MB was invalid, defaulting to {Config.DEFAULT_MAX_UPLOAD_MB}MB.")
        except ValueError:
            max_upload_mb = Config.DEFAULT_MAX_UPLOAD_MB
            logger.warning(f"MAX_UPLOAD_MB was not a valid integer, defaulting to {Config.DEFAULT_MAX_UPLOAD_MB}MB.")
        
        logger.info(f"Max upload file size set to: {max_upload_mb}MB")
        return max_upload_mb
    
    # Email Configuration
    EMAIL_CHANGE_TOKEN_EXPIRATION_HOURS = 24
    EMAIL_CHANGE_VERIFICATION_ENDPOINT = '/verify-email-change.html'
    
    # Performance and Memory Optimization
    JSON_SORT_KEYS = False
    JSONIFY_PRETTYPRINT_REGULAR = False
    SEND_FILE_MAX_AGE_DEFAULT = 31536000  # Cache static files for 1 year
    PROPAGATE_EXCEPTIONS = True
    
    # Session Configuration
    SESSION_COOKIE_SECURE = False  # Set to True in production with HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 3600  # 1 hour session timeout
    
    # Request Handling Optimization
    MAX_COOKIE_SIZE = 4093  # Slightly under 4KB limit
    USE_X_SENDFILE = False  # Serve files directly via Flask; nginx is not configured to handle X-Sendfile
    
    DB_VARS = ('DB_USER', 'DB_PASSWORD', 'DB_ADMIN_USER', 'DB_ADMIN_PASSWORD')

    @staticmethod
    def _missing_db_vars(app):
        """Return required database credential variables with no value.

        DATABASE_URL can supply the application user and password, as it
        already takes precedence in the database handlers. The separate
        admin credentials remain required because migrations use them to
        manage the application role.
        """
        if app.config.get('TESTING'):
            return []

        values = {var: app.config.get(var) for var in Config.DB_VARS}
        database_url = os.environ.get('DATABASE_URL')
        if database_url:
            parsed = urlparse(database_url)
            if parsed.username and not values['DB_USER']:
                values['DB_USER'] = unquote(parsed.username)
            if parsed.password and not values['DB_PASSWORD']:
                values['DB_PASSWORD'] = unquote(parsed.password)

        return [var for var, value in values.items() if not value]

    @staticmethod
    def _validate_db_vars(app):
        missing_vars = Config._missing_db_vars(app)
        if missing_vars:
            raise RuntimeError(
                "Missing required database environment variables: "
                + ', '.join(missing_vars)
                + ". Set DB_USER, DB_PASSWORD, DB_ADMIN_USER, and "
                "DB_ADMIN_PASSWORD in your environment or .env file."
            )

    @staticmethod
    def _upgrade_session_cookie_secure(app):
        """Emit the session cookie with Secure when the deployment serves HTTPS.

        The default configuration is DevelopmentConfig, whose session
        cookie has no Secure flag (CFG-01c). Flipping the default to the
        production config would break plain-HTTP installs, whose browsers
        would refuse to store a Secure cookie and break the OIDC login
        flow state kept in the session. Instead, upgrade to Secure when
        the deployment's own public URL uses https, which the operator
        already configures for login redirects. This only ever adds the
        flag, never removes a Secure setting the active config provides.
        """
        if app.config.get('SESSION_COOKIE_SECURE'):
            return
        base_url = os.environ.get('FRONTEND_URL') or os.environ.get('APP_BASE_URL') or ''
        if urlparse(base_url).scheme == 'https':
            app.config['SESSION_COOKIE_SECURE'] = True
            logger.info("Session cookie Secure flag enabled (deployment URL uses https).")

    @staticmethod
    def init_app(app):
        """Initialize configuration-specific settings."""
        Config._validate_db_vars(app)
        Config._upgrade_session_cookie_secure(app)

        if not os.path.exists(Config.UPLOAD_FOLDER):
            try:
                os.makedirs(Config.UPLOAD_FOLDER)
                logger.info(f"Created upload folder at {Config.UPLOAD_FOLDER}")
            except Exception as e:
                logger.error(f"Failed to create upload folder at {Config.UPLOAD_FOLDER}: {e}")
        
        # Set upload configuration
        max_upload_mb = Config._get_max_upload_mb()
        app.config['MAX_CONTENT_LENGTH'] = max_upload_mb * 1024 * 1024
        
        # Log configuration status
        logger.info("Application configuration initialized successfully")

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    
    @staticmethod
    def init_app(app):
        Config.init_app(app)
        logger.info("Development configuration loaded")

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    
    # Production-specific session settings
    SESSION_COOKIE_SECURE = True  # HTTPS only in production
    
    @staticmethod
    def init_app(app):
        Config.init_app(app)
        logger.info("Production configuration loaded")

class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    DEBUG = True
    
    # Use in-memory database for testing
    DB_HOST = 'localhost'
    DB_NAME = 'warranty_test'
    
    @staticmethod
    def init_app(app):
        Config.init_app(app)
        logger.info("Testing configuration loaded")

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
} 