# backend/config.py
import os
import logging
from datetime import timedelta

logger = logging.getLogger(__name__)

def get_try_create_secret():
    secret = os.environ.get('SECRET_KEY')
    if not secret:
        secret_file = 'secret_key'
        if os.path.exists(secret_file):
            secret = open(secret_file, 'r').read().strip()
        else:
            try:
                import base64
                secret = base64.b64encode(os.urandom(32)).decode('ascii')
                with open(secret_file, 'w') as f:
                    f.write(secret)
                logger.info(f"Generated new SECRET_KEY and saved to {secret_file}")
            except Exception:
                secret = 'your_default_secret_key_please_change_in_prod'
    return secret

class Config:
    """Base configuration class."""
    
    # Flask Core Configuration
    SECRET_KEY = get_try_create_secret()
    JWT_EXPIRATION_DELTA = timedelta(hours=int(os.environ.get('JWT_EXPIRATION_HOURS', '24')))
    
    # Security Warning for Default Secret Key
    @staticmethod
    def _check_secret_key():
        if Config.SECRET_KEY == 'your_default_secret_key_please_change_in_prod':
            logger.warning("SECURITY WARNING: Using default SECRET_KEY. Please set a strong SECRET_KEY environment variable in production.")
    
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
    USE_X_SENDFILE = True  # Let nginx handle file serving
    
    @staticmethod
    def init_app(app):
        """Initialize configuration-specific settings."""
        Config._check_secret_key()

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
        missing_db_vars = [
            var for var in ('DB_USER', 'DB_PASSWORD', 'DB_ADMIN_USER', 'DB_ADMIN_PASSWORD')
            if not app.config.get(var)
        ]
        if missing_db_vars:
            raise RuntimeError(f"Missing required database environment variables: {', '.join(missing_db_vars)}")

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