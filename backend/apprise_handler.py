"""
Apprise Notification Handler for Warracker
Handles sending notifications via Apprise for warranty expirations and other events

Apprise 2 note: notify() returns an AppriseResult object instead of the
1.x True/False/None. bool(result) is True only when every target was
delivered to, which matches how Warracker has always read the result,
and every notify() return below is coerced with bool() so the handler
methods keep their documented bool contract.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional

# Global flag to track Apprise availability
APPRISE_AVAILABLE = False
apprise = None

# Try to import apprise with detailed error handling
try:
    import apprise
    APPRISE_AVAILABLE = True
    print("✅ Apprise successfully imported")
except ImportError as e:
    print(f"❌ Failed to import apprise: {e}")
    print("   Apprise notifications will be disabled")
except Exception as e:
    print(f"❌ Unexpected error importing apprise: {e}")
    print("   Apprise notifications will be disabled")

# Import database functions with fallback
DB_FUNCTIONS_IMPORTED = False
try:
    # Try backend.db_handler first (Docker environment)
    from backend.db_handler import get_site_setting, get_expiring_warranties
    DB_FUNCTIONS_IMPORTED = True
    print("✅ Database functions imported from backend.db_handler")
except ImportError:
    try:
        # Fallback to db_handler (development environment)
        from db_handler import get_site_setting, get_expiring_warranties
        DB_FUNCTIONS_IMPORTED = True
        print("✅ Database functions imported from db_handler")
    except ImportError as e:
        print(f"❌ Failed to import database functions: {e}")
        print("   Creating dummy functions - expiration notifications will not work")
        # Create dummy functions to prevent app crash
        def get_site_setting(key, default=None):
            return default
        def get_expiring_warranties(days):
            print(f"⚠️  Dummy get_expiring_warranties called with days={days} - returning empty list")
            return []

logger = logging.getLogger(__name__)

class AppriseNotificationHandler:
    def __init__(self):
        self.apprise_obj = None
        self.enabled = False
        self.notification_urls = []
        self.expiration_days = [7, 30]
        self.notification_time = "09:00"
        self.title_prefix = "[Warracker]"
        
        # Only initialize if Apprise is available
        if APPRISE_AVAILABLE:
            try:
                self._load_configuration()
                logger.info("Apprise notification handler initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Apprise notification handler: {e}")
                self.enabled = False
        else:
            logger.warning("Apprise not available - notifications disabled")

    def _load_configuration(self):
        """Load Apprise configuration from database and environment variables"""
        if not APPRISE_AVAILABLE:
            logger.warning("Apprise not available, configuration loading skipped")
            return
            
        try:
            # Priority: Environment Variable > Database Setting > Hardcoded Default
            
            # Load APPRISE_ENABLED with correct precedence
            env_enabled = os.getenv('APPRISE_ENABLED')
            if env_enabled is not None:
                self.enabled = env_enabled.lower() == 'true'
            else:
                self.enabled = get_site_setting('apprise_enabled', 'false').lower() == 'true'

            # Load APPRISE_URLS with correct precedence
            env_urls = os.getenv('APPRISE_URLS')
            if env_urls is not None:
                self.notification_urls = [url.strip() for url in env_urls.split(',') if url.strip()]
            else:
                urls_str = get_site_setting('apprise_urls', '')
                if urls_str:
                    self.notification_urls = [url.strip() for url in urls_str.split(',') if url.strip()]

            # Load APPRISE_EXPIRATION_DAYS with correct precedence
            env_days = os.getenv('APPRISE_EXPIRATION_DAYS')
            if env_days is not None:
                try:
                    self.expiration_days = [int(day.strip()) for day in env_days.split(',') if day.strip()]
                except ValueError:
                    logger.warning(f"Invalid environment expiration days: {env_days}")
                    self.expiration_days = [7, 30]
            else:
                expiration_days_str = get_site_setting('apprise_expiration_days', '7,30')
                if expiration_days_str:
                    try:
                        self.expiration_days = [int(day.strip()) for day in expiration_days_str.split(',') if day.strip()]
                    except ValueError:
                        logger.warning(f"Invalid expiration days format: {expiration_days_str}, using defaults")
                        self.expiration_days = [7, 30]

            # Load APPRISE_NOTIFICATION_TIME with correct precedence
            env_time = os.getenv('APPRISE_NOTIFICATION_TIME')
            if env_time is not None:
                self.notification_time = env_time
            else:
                self.notification_time = get_site_setting('apprise_notification_time', '09:00')

            # Load APPRISE_TITLE_PREFIX with correct precedence
            env_prefix = os.getenv('APPRISE_TITLE_PREFIX')
            if env_prefix is not None:
                self.title_prefix = env_prefix
            else:
                self.title_prefix = get_site_setting('apprise_title_prefix', '[Warracker]')

            # Initialize Apprise object if enabled
            if self.enabled and self.notification_urls:
                self._initialize_apprise()

            logger.info(f"Apprise configuration loaded: enabled={self.enabled}, urls_count={len(self.notification_urls)}")

        except Exception as e:
            logger.error(f"Error loading Apprise configuration: {e}")
            self.enabled = False

    def _initialize_apprise(self):
        """Initialize the Apprise object with configured URLs"""
        if not APPRISE_AVAILABLE:
            logger.warning("Apprise not available, initialization skipped")
            return
            
        try:
            self.apprise_obj = apprise.Apprise()
            
            for url in self.notification_urls:
                if url:
                    result = self.apprise_obj.add(url)
                    if result:
                        logger.info(f"Successfully added Apprise URL: {url[:20]}...")
                    else:
                        logger.error(f"Failed to add Apprise URL: {url[:20]}...")

            if len(self.apprise_obj) == 0:
                logger.warning("No valid Apprise URLs configured")
                self.enabled = False

        except Exception as e:
            logger.error(f"Error initializing Apprise: {e}")
            self.enabled = False

    def is_available(self):
        """Check if Apprise is available and properly configured"""
        return APPRISE_AVAILABLE and self.enabled and self.apprise_obj is not None

    def get_status(self):
        """Get detailed status information for debugging"""
        if not APPRISE_AVAILABLE:
            return {
                "available": False,
                "error": "Apprise library not installed or import failed",
                "urls_configured": 0,
                "enabled": False
            }
        
        return {
            "available": True,
            "enabled": self.enabled,
            "urls_configured": len(self.notification_urls),
            "apprise_object_ready": self.apprise_obj is not None,
            "notification_time": self.notification_time,
            "expiration_days": self.expiration_days
        }

    def reload_configuration(self):
        """Reload configuration from database/environment"""
        if APPRISE_AVAILABLE:
            self._load_configuration()
        else:
            logger.warning("Cannot reload configuration - Apprise not available")

    def send_test_notification(self, test_url: Optional[str] = None) -> bool:
        """Send a test notification to verify configuration"""
        if not APPRISE_AVAILABLE:
            logger.error("Cannot send test notification - Apprise not available")
            return False
            
        try:
            if test_url:
                # Use specific test URL
                test_apprise = apprise.Apprise()
                if not test_apprise.add(test_url):
                    logger.error(f"Failed to add test URL: {test_url}")
                    return False
                
                title = f"{self.title_prefix} Test Notification"
                body = "This is a test notification from Warracker to verify your Apprise configuration is working correctly."
                
                return bool(test_apprise.notify(title=title, body=body))
            
            elif self.enabled and self.apprise_obj:
                # Use configured URLs
                title = f"{self.title_prefix} Test Notification"
                body = "This is a test notification from Warracker to verify your Apprise configuration is working correctly."
                
                return bool(self.apprise_obj.notify(title=title, body=body))
            else:
                logger.warning("Apprise not enabled or configured for test notification")
                return False

        except Exception as e:
            logger.error(f"Error sending test notification: {e}")
            return False

    def send_expiration_notifications(self, eligible_user_ids: Optional[List[int]] = None) -> Dict[str, int]:
        """Send notifications for warranties expiring within configured days
        
        Args:
            eligible_user_ids: List of user IDs that should receive Apprise notifications.
                             If None, all users with expiring warranties will be notified.
        """
        if not self.is_available():
            logger.info("Apprise notifications disabled or not configured")
            return {"sent": 0, "errors": 0}

        if not DB_FUNCTIONS_IMPORTED:
            logger.error("Database functions not available - cannot retrieve expiring warranties")
            return {"sent": 0, "errors": 1}

        results = {"sent": 0, "errors": 0}

        try:
            logger.info(f"Checking expiration notifications for days: {self.expiration_days}")
            if eligible_user_ids is not None:
                logger.info(f"Filtering notifications for {len(eligible_user_ids)} eligible users: {eligible_user_ids}")
            
            for days in self.expiration_days:
                logger.info(f"Getting warranties expiring in {days} days...")
                expiring_warranties = get_expiring_warranties(days)
                logger.info(f"Found {len(expiring_warranties)} warranties expiring in {days} days")
                
                # Filter warranties by eligible user IDs if provided
                if eligible_user_ids is not None:
                    original_count = len(expiring_warranties)
                    expiring_warranties = [w for w in expiring_warranties if w.get('user_id') in eligible_user_ids]
                    logger.info(f"Filtered from {original_count} to {len(expiring_warranties)} warranties for eligible users")
                
                if expiring_warranties:
                    success = self._send_expiration_batch(expiring_warranties, days)
                    if success:
                        results["sent"] += 1
                        logger.info(f"Sent expiration notification for {len(expiring_warranties)} warranties expiring in {days} days")
                    else:
                        results["errors"] += 1
                        logger.error(f"Failed to send expiration notification for {days} days")
                else:
                    logger.info(f"No eligible warranties expiring in {days} days")

        except Exception as e:
            logger.error(f"Error in send_expiration_notifications: {e}")
            results["errors"] += 1

        return results

    def _send_expiration_batch(self, warranties: List[Dict], days: int) -> bool:
        """Send notification for a batch of warranties expiring in X days"""
        if not self.is_available():
            return False
            
        try:
            if days == 1:
                title = f"{self.title_prefix} Warranties Expiring Tomorrow!"
                urgency = "🚨 URGENT: "
            elif days <= 7:
                title = f"{self.title_prefix} Warranties Expiring in {days} Days"
                urgency = "⚠️ IMPORTANT: "
            else:
                title = f"{self.title_prefix} Warranties Expiring in {days} Days"
                urgency = "📅 REMINDER: "

            # Build notification body
            body_lines = [
                f"{urgency}You have {len(warranties)} warranty(ies) expiring in {days} day(s):",
                ""
            ]

            for warranty in warranties[:10]:  # Limit to first 10 to avoid very long messages
                expiry_date = warranty.get('expiration_date', 'Unknown')
                if isinstance(expiry_date, str):
                    try:
                        # Parse and format date if it's a string
                        parsed_date = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
                        expiry_date = parsed_date.strftime('%Y-%m-%d')
                    except:
                        pass
                
                body_lines.append(f"• {warranty.get('product_name', 'Unknown Product')} (expires: {expiry_date})")

            if len(warranties) > 10:
                body_lines.append(f"... and {len(warranties) - 10} more")

            body_lines.extend([
                "",
                "Please review your warranties and take necessary action.",
                "",
                "Visit your Warracker dashboard to view details and manage your warranties."
            ])

            body = "\n".join(body_lines)

            return bool(self.apprise_obj.notify(title=title, body=body))

        except Exception as e:
            logger.error(f"Error sending expiration batch notification: {e}")
            return False

    def send_custom_notification(self, title: str, message: str, urls: Optional[List[str]] = None) -> bool:
        """Send a custom notification"""
        if not APPRISE_AVAILABLE:
            logger.error("Cannot send custom notification - Apprise not available")
            return False
            
        try:
            if urls:
                # Use specific URLs
                custom_apprise = apprise.Apprise()
                for url in urls:
                    custom_apprise.add(url)
                
                if len(custom_apprise) == 0:
                    logger.error("No valid URLs provided for custom notification")
                    return False
                
                full_title = f"{self.title_prefix} {title}"
                return bool(custom_apprise.notify(title=full_title, body=message))
            
            elif self.is_available():
                # Use configured URLs
                full_title = f"{self.title_prefix} {title}"
                return bool(self.apprise_obj.notify(title=full_title, body=message))
            else:
                logger.warning("No Apprise configuration available for custom notification")
                return False

        except Exception as e:
            logger.error(f"Error sending custom notification: {e}")
            return False

    def validate_url(self, url: str) -> bool:
        """Validate if an Apprise URL is properly formatted"""
        if not APPRISE_AVAILABLE:
            return False
            
        try:
            test_apprise = apprise.Apprise()
            return test_apprise.add(url)
        except Exception as e:
            logger.error(f"Error validating URL: {e}")
            return False

    def get_supported_services(self) -> List[str]:
        """Get a list of supported notification services"""
        if not APPRISE_AVAILABLE:
            return []
            
        try:
            # This is a simplified list - Apprise supports 80+ services
            return [
                "Discord", "Slack", "Microsoft Teams", "Telegram", "Signal",
                "Email (SMTP)", "Gmail", "Outlook", "Yahoo Mail",
                "Pushover", "Pushbullet", "Gotify", "ntfy",
                "AWS SNS", "Twilio", "SMS", "WhatsApp",
                "Matrix", "Rocket.Chat", "Mattermost",
                "And 60+ more services..."
            ]
        except Exception:
            return []

    def send_global_expiration_notification(self, warranties: List[Dict]) -> bool:
        """Sends a single, consolidated notification for all expiring warranties."""
        if not self.is_available() or not warranties:
            return False
            
        logger.info(f"Sending GLOBAL Apprise notification for {len(warranties)} expiring items.")
        try:
            # Group warranties by expiration days to send separate notifications like manual test
            warranties_by_days = {}
            for w in warranties:
                # Calculate days until expiration
                expiry_date = w.get('expiration_date')
                if expiry_date:
                    try:
                        if isinstance(expiry_date, str):
                            parsed_date = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
                        else:
                            parsed_date = expiry_date
                        
                        days_until_expiry = (parsed_date.date() - datetime.now().date()).days
                        
                        if days_until_expiry not in warranties_by_days:
                            warranties_by_days[days_until_expiry] = []
                        warranties_by_days[days_until_expiry].append(w)
                    except Exception as e:
                        logger.warning(f"Error parsing expiration date {expiry_date}: {e}")
                        # Default to 365 days if parsing fails
                        if 365 not in warranties_by_days:
                            warranties_by_days[365] = []
                        warranties_by_days[365].append(w)
            
            # Send separate notifications for each day group (like manual test)
            success = True
            for days, day_warranties in warranties_by_days.items():
                if not self._send_global_expiration_batch(day_warranties, days):
                    success = False
            
            return success
        except Exception as e:
            logger.error(f"Error sending global expiration notification: {e}")
            return False

    def _send_global_expiration_batch(self, warranties: List[Dict], days: int) -> bool:
        """Send global notification for warranties expiring in X days (matches manual test format)"""
        if not self.is_available():
            return False
            
        try:
            # Use same title format as manual test
            if days == 1:
                title = f"{self.title_prefix} Warranties Expiring Tomorrow!"
                urgency = "🚨 URGENT: "
            elif days <= 7:
                title = f"{self.title_prefix} Warranties Expiring in {days} Days"
                urgency = "⚠️ IMPORTANT: "
            else:
                title = f"{self.title_prefix} Warranties Expiring in {days} Days"
                urgency = "📅 REMINDER: "

            # Use same body format as manual test
            body_lines = [
                f"{urgency}You have {len(warranties)} warranty(ies) expiring in {days} day(s):",
                ""
            ]

            for warranty in warranties[:10]:  # Limit to first 10 to avoid very long messages
                expiry_date = warranty.get('expiration_date', 'Unknown')
                if isinstance(expiry_date, str):
                    try:
                        # Parse and format date if it's a string
                        parsed_date = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
                        expiry_date = parsed_date.strftime('%Y-%m-%d')
                    except:
                        pass
                
                body_lines.append(f"• {warranty.get('product_name', 'Unknown Product')} (expires: {expiry_date})")

            if len(warranties) > 10:
                body_lines.append(f"... and {len(warranties) - 10} more")

            body_lines.extend([
                "",
                "Please review your warranties and take necessary action.",
                "",
                "Visit your Warracker dashboard to view details and manage your warranties."
            ])

            body = "\n".join(body_lines)

            return bool(self.apprise_obj.notify(title=title, body=body))

        except Exception as e:
            logger.error(f"Error sending global expiration batch notification: {e}")
            return False

    def send_individual_expiration_notification(self, user_id: int, warranties: List[Dict], get_db_connection, release_db_connection) -> bool:
        """Sends a personalized Apprise notification to a single user."""
        if not self.is_available() or not warranties:
            return False

        try:
            logger.info(f"Sending INDIVIDUAL Apprise notification for {len(warranties)} items to user {user_id}.")
            
            # Group warranties by expiration days to send separate notifications like manual test
            warranties_by_days = {}
            for w in warranties:
                # Calculate days until expiration
                expiry_date = w.get('expiration_date')
                if expiry_date:
                    try:
                        if isinstance(expiry_date, str):
                            parsed_date = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
                        else:
                            parsed_date = expiry_date
                        
                        days_until_expiry = (parsed_date.date() - datetime.now().date()).days
                        
                        if days_until_expiry not in warranties_by_days:
                            warranties_by_days[days_until_expiry] = []
                        warranties_by_days[days_until_expiry].append(w)
                    except Exception as e:
                        logger.warning(f"Error parsing expiration date {expiry_date}: {e}")
                        # Default to 365 days if parsing fails
                        if 365 not in warranties_by_days:
                            warranties_by_days[365] = []
                        warranties_by_days[365].append(w)
            
            # Send separate notifications for each day group (like manual test)
            success = True
            for days, day_warranties in warranties_by_days.items():
                if not self._send_individual_expiration_batch(day_warranties, days, user_id):
                    success = False
            
            return success

        except Exception as e:
            logger.error(f"Error sending individual expiration notification for user {user_id}: {e}")
            return False

    def _send_individual_expiration_batch(self, warranties: List[Dict], days: int, user_id: int) -> bool:
        """Send individual notification for warranties expiring in X days (matches manual test format)"""
        if not self.is_available():
            return False
            
        try:
            # Use same title format as manual test
            if days == 1:
                title = f"{self.title_prefix} Warranties Expiring Tomorrow!"
                urgency = "🚨 URGENT: "
            elif days <= 7:
                title = f"{self.title_prefix} Warranties Expiring in {days} Days"
                urgency = "⚠️ IMPORTANT: "
            else:
                title = f"{self.title_prefix} Warranties Expiring in {days} Days"
                urgency = "📅 REMINDER: "

            # Use same body format as manual test
            body_lines = [
                f"{urgency}You have {len(warranties)} warranty(ies) expiring in {days} day(s):",
                ""
            ]

            for warranty in warranties[:10]:  # Limit to first 10 to avoid very long messages
                expiry_date = warranty.get('expiration_date', 'Unknown')
                if isinstance(expiry_date, str):
                    try:
                        # Parse and format date if it's a string
                        parsed_date = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
                        expiry_date = parsed_date.strftime('%Y-%m-%d')
                    except:
                        pass
                
                body_lines.append(f"• {warranty.get('product_name', 'Unknown Product')} (expires: {expiry_date})")

            if len(warranties) > 10:
                body_lines.append(f"... and {len(warranties) - 10} more")

            body_lines.extend([
                "",
                "Please review your warranties and take necessary action.",
                "",
                "Visit your Warracker dashboard to view details and manage your warranties."
            ])

            body = "\n".join(body_lines)

            return bool(self.apprise_obj.notify(title=title, body=body))

        except Exception as e:
            logger.error(f"Error sending individual expiration batch notification: {e}")
            return False

# Global instance
apprise_handler = AppriseNotificationHandler() 