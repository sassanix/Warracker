"""
Backend Localization Handler
Manages server-side translations using Flask-Babel
"""

from flask import request, session
from flask_babel import Babel, gettext, ngettext, lazy_gettext
import os
import logging

logger = logging.getLogger(__name__)

# Supported languages
SUPPORTED_LANGUAGES = ['en', 'he','fr', 'es', 'de', 'it', 'cs', 'nl', 'hi', 'fa', 'ar', 'ru', 'uk', 'zh_CN', 'zh_HK', 'ja', 'pt', 'ko']
DEFAULT_LANGUAGE = 'en'

# Global babel instance
babel = None

def init_babel(app):
    """Initialize Babel with Flask app"""
    global babel
    
    # Configure Babel
    app.config['LANGUAGES'] = {
        'en': 'English',
        'he': 'Hebrew',        
        'fr': 'Français',
        'es': 'Español',
        'de': 'Deutsch',
        'it': 'Italiano',
        'cs': 'Čeština',
        'nl': 'Nederlands',
        'hi': 'हिन्दी',
        'fa': 'فارسی',
        'ar': 'العربية',
        'ru': 'Русский',
        'uk': 'Українська',
        'zh_CN': '简体中文',
        'zh_HK': '繁體中文',
        'ja': '日本語',
        'pt': 'Português',
        'ko': '한국어'
    }
    app.config['BABEL_DEFAULT_LOCALE'] = DEFAULT_LANGUAGE
    app.config['BABEL_DEFAULT_TIMEZONE'] = 'UTC'
    
    babel = Babel()
    babel.init_app(app, locale_selector=get_current_language)
    
    logger.info("Babel initialized successfully")
    return babel

def get_current_language():
    """Get current language from various sources"""
    
    # 1. Check URL parameter (for testing)
    if request and request.args.get('lang') in SUPPORTED_LANGUAGES:
        return request.args.get('lang')
    
    # 2. Check cookie
    if request and request.cookies.get('lang') in SUPPORTED_LANGUAGES:
        return request.cookies.get('lang')
    
    # 3. Check session
    if session.get('language') in SUPPORTED_LANGUAGES:
        return session.get('language')
    
    # 4. Check user preferences (if authenticated)
    try:
        from backend.auth_utils import get_current_user_info
        user_info = get_current_user_info()
        if user_info and user_info.get('preferred_language') in SUPPORTED_LANGUAGES:
            return user_info['preferred_language']
    except:
        pass  # User not authenticated or error getting user info
    
    # 5. Check Accept-Language header
    if request:
        browser_lang = request.accept_languages.best_match(SUPPORTED_LANGUAGES)
        if browser_lang:
            return browser_lang
    
    # 6. Fallback to default
    return DEFAULT_LANGUAGE

def set_language(language):
    """Set language for current session"""
    if language in SUPPORTED_LANGUAGES:
        session['language'] = language
        return True
    return False

def get_supported_languages():
    """Get list of supported languages"""
    return SUPPORTED_LANGUAGES

def is_supported_language(language):
    """Check if language is supported"""
    return language in SUPPORTED_LANGUAGES

# Convenience functions for translations
def _(text):
    """Translate text (alias for gettext)"""
    return gettext(text)

def _n(singular, plural, num):
    """Translate text with pluralization (alias for ngettext)"""
    return ngettext(singular, plural, num)

def _l(text):
    """Lazy translation (alias for lazy_gettext)"""
    return lazy_gettext(text)

# Common translations for the application
COMMON_TRANSLATIONS = {
    # Authentication
    'login': _l('Login'),
    'logout': _l('Logout'),
    'register': _l('Register'),
    'username': _l('Username'),
    'password': _l('Password'),
    'email': _l('Email'),
    'first_name': _l('First Name'),
    'last_name': _l('Last Name'),
    
    # Navigation
    'home': _l('Home'),
    'settings': _l('Settings'),
    'status': _l('Status'),
    'about': _l('About'),
    
    # Common actions
    'save': _l('Save'),
    'cancel': _l('Cancel'),
    'delete': _l('Delete'),
    'edit': _l('Edit'),
    'search': _l('Search'),
    'export': _l('Export'),
    'import': _l('Import'),
    
    # Messages
    'success': _l('Success'),
    'error': _l('Error'),
    'warning': _l('Warning'),
    'loading': _l('Loading...'),
    'saved_successfully': _l('Saved successfully'),
    'deleted_successfully': _l('Deleted successfully'),
    'invalid_request': _l('Invalid request'),
    'unauthorized': _l('Unauthorized'),
    'not_found': _l('Not found'),
    'server_error': _l('Server error'),
    
    # Warranties
    'warranties': _l('Warranties'),
    'warranty': _l('Warranty'),
    'product_name': _l('Product Name'),
    'purchase_date': _l('Purchase Date'),
    'warranty_duration': _l('Warranty Duration'),
    'expiration_date': _l('Expiration Date'),
    'vendor': _l('Vendor'),
    'status': _l('Status'),
    'active': _l('Active'),
    'expired': _l('Expired'),
    'expiring_soon': _l('Expiring Soon'),
    'lifetime': _l('Lifetime'),
}

def get_translation(key, default=None):
    """Get translation for a key with fallback"""
    if key in COMMON_TRANSLATIONS:
        return str(COMMON_TRANSLATIONS[key])
    return default or key

def format_error_message(error_type, details=None):
    """Format error messages with localization"""
    error_messages = {
        'validation_error': _('Validation error'),
        'authentication_error': _('Authentication error'),
        'authorization_error': _('Authorization error'),
        'not_found_error': _('Resource not found'),
        'server_error': _('Internal server error'),
        'file_too_large': _('File is too large'),
        'invalid_file_type': _('Invalid file type'),
    }
    
    message = error_messages.get(error_type, _('An error occurred'))
    if details:
        message += f": {details}"
    
    return message
