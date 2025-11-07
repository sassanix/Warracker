// DOM Elements
const darkModeToggle = document.getElementById('darkModeToggle');
const darkModeToggleSetting = document.getElementById('darkModeToggleSetting');
const languageSelect = document.getElementById('languageSelect');
const defaultViewSelect = document.getElementById('defaultView');
const expiringSoonDaysInput = document.getElementById('expiringSoonDays');
const notificationChannel = document.getElementById('notificationChannel');
const notificationFrequencySelect = document.getElementById('notificationFrequency');
const notificationTimeInput = document.getElementById('notificationTime');
const timezoneSelect = document.getElementById('timezone');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const savePreferencesBtn = document.getElementById('savePreferencesBtn');
const saveNotificationSettingsBtn = document.getElementById('saveNotificationSettingsBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const emailSettingsContainer = document.getElementById('emailSettingsContainer');
const appriseSettingsContainer = document.getElementById('appriseSettingsContainer');
const userAppriseSettingsContainer = document.getElementById('userAppriseSettingsContainer');
const passwordChangeForm = document.getElementById('passwordChangeForm');
const savePasswordBtn = document.getElementById('savePasswordBtn');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const deleteAccountBtn = document.getElementById('deleteAccountBtn');
const deleteAccountModal = document.getElementById('deleteAccountModal');
const deleteConfirmInput = document.getElementById('deleteConfirmInput');
const confirmDeleteAccountBtn = document.getElementById('confirmDeleteAccountBtn');
const passwordSuccessModal = document.getElementById('passwordSuccessModal');
const loadingContainer = document.getElementById('loadingContainer');
const toastContainer = document.getElementById('toastContainer');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const usersTableBody = document.getElementById('usersTableBody');

// Edit User Modal Elements
const editUserModal = document.getElementById('editUserModal');
const editUserId = document.getElementById('editUserId');
const editUsername = document.getElementById('editUsername');
const editEmail = document.getElementById('editEmail');
const editUserActive = document.getElementById('editUserActive');
const editUserAdmin = document.getElementById('editUserAdmin');

// Form fields
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const emailInput = document.getElementById('email');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');

// DOM Elements for admin section
const adminSection = document.getElementById('adminSection');
const refreshUsersBtn = document.getElementById('refreshUsersBtn');
const checkAdminBtn = document.getElementById('checkAdminBtn');
const showUsersBtn = document.getElementById('showUsersBtn');
const testApiBtn = document.getElementById('testApiBtn');
const triggerNotificationsBtn = document.getElementById('triggerNotificationsBtn');
const schedulerStatusBtn = document.getElementById('schedulerStatusBtn');
const registrationEnabled = document.getElementById('registrationEnabled');
const saveSiteSettingsBtn = document.getElementById('saveSiteSettingsBtn');
const emailBaseUrlInput = document.getElementById('emailBaseUrl'); // Added for email base URL

// OIDC Settings DOM Elements
const oidcEnabledToggle = document.getElementById('oidcEnabled');
const oidcOnlyModeToggle = document.getElementById('oidcOnlyMode');
const oidcProviderNameInput = document.getElementById('oidcProviderName');
const oidcClientIdInput = document.getElementById('oidcClientId');
const oidcClientSecretInput = document.getElementById('oidcClientSecret');
const oidcIssuerUrlInput = document.getElementById('oidcIssuerUrl');
const oidcScopeInput = document.getElementById('oidcScope');
const oidcAdminGroupInput = document.getElementById('oidcAdminGroup');
const saveOidcSettingsBtn = document.getElementById('saveOidcSettingsBtn');
const oidcRestartMessage = document.getElementById('oidcRestartMessage');

// Apprise Settings DOM Elements
const appriseEnabledToggle = document.getElementById('appriseEnabled');
const appriseNotificationModeSelect = document.getElementById('appriseNotificationMode');
const appriseModeDescription = document.getElementById('appriseModeDescription');
const appriseWarrantyScopeSelect = document.getElementById('appriseWarrantyScope');
const appriseScopeDescription = document.getElementById('appriseScopeDescription');
const appriseUrlsTextarea = document.getElementById('appriseUrls');
const appriseExpirationDaysInput = document.getElementById('appriseExpirationDays');
const appriseNotificationFrequency = document.getElementById('appriseNotificationFrequency');

// User-specific Apprise settings (in notification settings section)
const userAppriseNotificationTimeInput = document.getElementById('userAppriseNotificationTime');
const userAppriseTimezoneSelect = document.getElementById('userAppriseTimezone');
const userAppriseNotificationFrequency = document.getElementById('userAppriseNotificationFrequency');
const appriseTitlePrefixInput = document.getElementById('appriseTitlePrefix');
const appriseTestUrlInput = document.getElementById('appriseTestUrl');
const saveAppriseSettingsBtn = document.getElementById('saveAppriseSettingsBtn');
const testAppriseBtn = document.getElementById('testAppriseBtn');
const validateAppriseUrlBtn = document.getElementById('validateAppriseUrlBtn');
const triggerAppriseNotificationsBtn = document.getElementById('triggerAppriseNotificationsBtn');
const appriseStatusBadge = document.getElementById('appriseStatusBadge');
const appriseUrlsCount = document.getElementById('appriseUrlsCount');
const currentAppriseExpirationDays = document.getElementById('currentAppriseExpirationDays');

const viewSupportedServicesBtn = document.getElementById('viewSupportedServicesBtn');
const appriseNotAvailable = document.getElementById('appriseNotAvailable');

const currencySymbolInput = document.getElementById('currencySymbol');
const currencySymbolSelect = document.getElementById('currencySymbolSelect');
const currencySymbolCustom = document.getElementById('currencySymbolCustom');
const currencyPositionSelect = document.getElementById('currencyPositionSelect');

// Add dateFormatSelect near other DOM element declarations if not already there
const dateFormatSelect = document.getElementById('dateFormat');

// Paperless-ngx Settings DOM Elements
const paperlessEnabledToggle = document.getElementById('paperlessEnabled');
const paperlessUrlInput = document.getElementById('paperlessUrl');
const paperlessApiTokenInput = document.getElementById('paperlessApiToken');
const paperlessViewInAppToggle = document.getElementById('paperlessViewInApp');
const paperlessSettingsContainer = document.getElementById('paperlessSettingsContainer');
const testPaperlessConnectionBtn = document.getElementById('testPaperlessConnectionBtn');
const savePaperlessSettingsBtn = document.getElementById('savePaperlessSettingsBtn');
const paperlessConnectionStatus = document.getElementById('paperlessConnectionStatus');

// Global variable to store currencies data for currency code lookup
let globalCurrenciesData = [];

/**
 * Load currencies from the API and populate the currency dropdown
 */
async function loadCurrenciesForSettings() {
    try {
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        const response = await fetch('/api/currencies', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch currencies');
        }
        
        const currencies = await response.json();
        
        // Store currencies data globally for currency code lookup
        globalCurrenciesData = currencies;
        
        // Populate currency symbol dropdown
        if (currencySymbolSelect) {
            // Clear existing options
            currencySymbolSelect.innerHTML = '';
            
            // Add currencies from API
            currencies.forEach(currency => {
                const option = document.createElement('option');
                option.value = currency.symbol;
                option.textContent = `${currency.symbol} (${currency.code} - ${currency.name})`;
                currencySymbolSelect.appendChild(option);
            });
            
            // Add "Other..." option at the end
            const otherOption = document.createElement('option');
            otherOption.value = 'other';
            otherOption.textContent = 'Other...';
            currencySymbolSelect.appendChild(otherOption);
        }
        
        console.log('Currencies loaded successfully for settings page');
    } catch (error) {
        console.error('Error loading currencies for settings:', error);
        // Fallback to default currencies if loading fails
        if (currencySymbolSelect) {
            currencySymbolSelect.innerHTML = `
                <option value="$">$ (USD - US Dollar)</option>
                <option value="€">€ (EUR - Euro)</option>
                <option value="£">£ (GBP - British Pound)</option>
                <option value="¥">¥ (JPY - Japanese Yen)</option>
                <option value="other">Other...</option>
            `;
        }
    }
}

/**
 * Initialize language selector
 */
function initLanguageSelector() {
    console.log('initLanguageSelector called');
    console.log('languageSelect element exists:', !!languageSelect);
    
    if (!languageSelect) {
        console.error('Language select element not found!');
        return;
    }
    
    // Check if already initialized
    if (languageSelect.hasAttribute('data-initialized')) {
        console.log('Language selector already initialized, skipping');
        return;
    }
    
    // Get current language
    const currentLang = window.i18n?.getCurrentLanguage() || 'en';
    console.log('Setting language selector to current language:', currentLang);
    languageSelect.value = currentLang;
    
    // Mark as initialized
    languageSelect.setAttribute('data-initialized', 'true');
    
    // Add event listener for language changes
    languageSelect.addEventListener('change', async function() {
        const selectedLanguage = this.value;
        console.log('Language changed to:', selectedLanguage);
        
        if (window.i18n?.changeLanguage) {
            try {
                showToast('Changing language...', 'info');
                await window.i18n.changeLanguage(selectedLanguage);
                showToast(window.t('messages.saved') || 'Language changed successfully', 'success');
                
                // Reload page after a short delay to apply all translations
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } catch (error) {
                console.error('Failed to change language:', error);
                showToast(window.t('messages.error') || 'Failed to change language', 'error');
            }
        } else {
            console.warn('i18n changeLanguage function not available');
            showToast('Language system not ready. Please try again.', 'error');
        }
    });
    
    console.log('Language selector initialized successfully with current language:', currentLang);
}

/**
 * Initialize language selector after i18n is ready
 */
function initLanguageSelectorWhenReady() {
    console.log('initLanguageSelectorWhenReady called');
    console.log('window.i18n available:', !!window.i18n);
    console.log('window.i18n.getCurrentLanguage available:', !!(window.i18n && window.i18n.getCurrentLanguage));
    
    if (window.i18n && window.i18n.getCurrentLanguage) {
        // i18n is already ready
        console.log('i18n already ready, initializing language selector');
        initLanguageSelector();
    } else {
        // Wait for i18n to be ready
        console.log('Waiting for i18n to be ready...');
        window.addEventListener('i18nReady', function(event) {
            console.log('i18n is now ready, initializing language selector');
            initLanguageSelector();
        }, { once: true }); // Use once: true to ensure this only runs once
        
        // Also try again after a short delay as backup
        setTimeout(() => {
            if (window.i18n && window.i18n.getCurrentLanguage && !languageSelect.hasAttribute('data-initialized')) {
                console.log('Backup initialization: i18n ready, initializing language selector');
                initLanguageSelector();
            }
        }, 2000);
    }
}

/**
 * Set theme (dark/light) - Unified and persistent
 * @param {boolean} isDark - Whether to use dark mode
 */
function setTheme(isDark) {
    const theme = isDark ? 'dark' : 'light';
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    // Save to localStorage (single source of truth)
    localStorage.setItem('darkMode', isDark);
    // Sync both toggles if present
    if (typeof darkModeToggle !== 'undefined' && darkModeToggle) {
        darkModeToggle.checked = isDark;
    }
    if (typeof darkModeToggleSetting !== 'undefined' && darkModeToggleSetting) {
        darkModeToggleSetting.checked = isDark;
    }
    // Also update user_preferences.theme for backward compatibility
    try {
        let userPrefs = {};
        const storedPrefs = localStorage.getItem('user_preferences');
        if (storedPrefs) {
            userPrefs = JSON.parse(storedPrefs);
        }
        userPrefs.theme = theme;
        localStorage.setItem('user_preferences', JSON.stringify(userPrefs));
    } catch (e) {
        console.error('Error updating theme in user_preferences:', e);
    }
}

/**
 * Initialize dark mode toggle and synchronize state
 */
function initDarkModeToggle() {
    // Always check the single source of truth in localStorage (fallback)
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    // Apply theme to DOM if not already set
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    document.body.classList.toggle('dark-mode', isDarkMode);
    // Sync both toggles and add unified handler
    const syncToggles = (val) => {
        if (typeof darkModeToggle !== 'undefined' && darkModeToggle) darkModeToggle.checked = val;
        if (typeof darkModeToggleSetting !== 'undefined' && darkModeToggleSetting) darkModeToggleSetting.checked = val;
    };
    syncToggles(isDarkMode);
    // Handler to update theme, localStorage, backend
    const handleToggle = async function(checked) {
        setTheme(checked);
        syncToggles(checked);
        // Save to backend if authenticated
        if (window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated()) {
            try {
                let prefs = {};
                const storedPrefs = localStorage.getItem('user_preferences');
                if (storedPrefs) prefs = JSON.parse(storedPrefs);
                prefs.theme = checked ? 'dark' : 'light';
                await fetch('/api/auth/preferences', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${window.auth.getToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(prefs)
                });
            } catch (e) {
                console.warn('Failed to save dark mode to backend:', e);
            }
        }
    };
    if (typeof darkModeToggle !== 'undefined' && darkModeToggle) {
        darkModeToggle.onchange = function() { handleToggle(this.checked); };
    }
    if (typeof darkModeToggleSetting !== 'undefined' && darkModeToggleSetting) {
        darkModeToggleSetting.onchange = function() { handleToggle(this.checked); };
    }
}

// Initialize settings page
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing settings page');
    
    // DEBUG: Check current user data
    const debugCurrentUser = window.auth && window.auth.getCurrentUser ? window.auth.getCurrentUser() : null;
    console.log('DEBUG: Current user data:', debugCurrentUser);
    
    // Also listen for i18nReady event to ensure language selector gets initialized
    console.log('Setting up i18nReady event listener from DOMContentLoaded');
    window.addEventListener('i18nReady', function(event) {
        console.log('i18nReady event received in DOMContentLoaded listener, initializing language selector');
        // Small delay to ensure all DOM elements are ready
        setTimeout(() => {
            if (!document.getElementById('languageSelect').hasAttribute('data-initialized')) {
                console.log('Language selector not yet initialized, doing it now');
                initLanguageSelector();
            } else {
                console.log('Language selector already initialized');
            }
        }, 100);
    }, { once: true });
    if (debugCurrentUser) {
        console.log('DEBUG: User has is_owner field:', 'is_owner' in debugCurrentUser, 'Value:', debugCurrentUser.is_owner);
    }
    
    // Set up event listeners
    setupEventListeners(); // Ensure this doesn't also try to init settings menu
    
    // Set up direct event listeners for critical elements
    setupCriticalEventListeners();
    
    // Make functions globally accessible if needed
    window.deleteUser = deleteUser;
    window.directDeleteUserAPI = directDeleteUserAPI;
    
    // Add global click handlers if needed
    // ... (existing delete button handler logic) ...

    // Initialize dark mode toggle
    initDarkModeToggle();
    // Clear dark mode preference on logout for privacy
    if (window.auth && window.auth.onLogout) {
        window.auth.onLogout(() => {
            localStorage.removeItem('darkMode');
        });
    }
    
    // REMOVED initSettingsMenu() call - Handled by auth.js

    // Load initial data for the settings page
    loadUserData();
    loadTimezones().then(() => loadPreferences()).catch(err => {
        console.error('Error loading timezones/prefs:', err);
        loadPreferences(); // Try loading prefs anyway
    });

    // --- ADD THIS LINE TO INITIALIZE MODALS ---
    initModals();
    
    // Initialize collapsible cards
    initCollapsibleCards();
    
    // Load admin-only settings if user is admin
    // Note: These will also be loaded later in loadUserData() with proper checks
    // This is a redundant call that should be conditional
    const currentUser = window.auth && window.auth.getCurrentUser ? window.auth.getCurrentUser() : null;
    if (currentUser && currentUser.is_admin) {
        // Load site settings (for admins) - includes OIDC settings
        loadSiteSettings();
        
        // Load Apprise settings
        loadAppriseSettings();
        
        // Load Apprise site settings (also loads overall Apprise settings)
        loadAppriseSiteSettings();
        
        // Initialize ownership management if user is owner
        if (currentUser.is_owner) {
            console.log('DEBUG: User is owner, initializing ownership management');
            setTimeout(() => {
                const ownershipSection = document.getElementById('ownershipSection');
                if (ownershipSection) {
                    ownershipSection.style.display = 'block';
                    console.log('DEBUG: Ownership section made visible');
                }
                // Don't load users here - wait for modal to open
                console.log('DEBUG: Ownership management initialized, users will load when modal opens');
            }, 500); // Wait for DOM to be ready
        }
    } else {
        console.log('User is not admin, skipping admin-only settings load during initialization');
    }
    
    // Setup Apprise event listeners
    setupAppriseEventListeners();

    // Audit Trail button handler (admin section)
    const viewAuditTrailBtn = document.getElementById('viewAuditTrailBtn');
    if (viewAuditTrailBtn) {
        viewAuditTrailBtn.addEventListener('click', loadAndDisplayAuditTrail);
    }
    
    // Initialize delete button handling
    setupDeleteButton();
});

/**
 * Initialize the settings page
 */
function initPage() {
    console.log('Initializing settings page');
    
    // Initialize language selector when i18n is ready
    initLanguageSelectorWhenReady();
    
    // Check authentication
    if (window.auth) {
        window.auth.checkAuthState();
        
        // Redirect to login if not authenticated
        if (!window.auth.isAuthenticated()) {
            console.log('User not authenticated, redirecting to login');
            window.location.href = 'login.html';
            return;
        }
    } else {
        // Auth module not loaded
        console.error('Auth module not loaded');
        window.location.href = 'login.html';
        return;
    }
    
    // Load user data and preferences with error handling
    try {
        // First load timezones, then load preferences to ensure correct order
        loadTimezones().then(() => {
            console.log('Timezones loaded, now loading preferences');
            loadPreferences();
        }).catch(err => {
            console.error('Error loading timezones:', err);
            // Still try to load preferences even if timezones fail
            loadPreferences();
        });
        
        loadUserData().catch(err => {
            console.error('Error loading user data:', err);
            // Continue with page initialization even if user data fails
        });
    } catch (err) {
        console.error('Error during page initialization:', err);
        // Continue despite errors to allow basic functionality
    }
    
    // Fix for settings button - not needed anymore as we've removed it
    if (settingsBtn) {
        console.log('Settings button found, adding event listener');
        settingsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            settingsMenu.classList.toggle('active');
            console.log('Settings button clicked, menu toggled');
        });
        
        // Close settings menu when clicking outside
        document.addEventListener('click', function(e) {
            if (settingsMenu.classList.contains('active') && 
                !settingsMenu.contains(e.target) && 
                !settingsBtn.contains(e.target)) {
                settingsMenu.classList.remove('active');
            }
        });
    } else {
        console.log('Settings button not found - this is expected after UI update');
    }
    
    console.log('Settings page initialization complete');
}

// ============================
// Audit Trail functions
// ============================

async function loadAndDisplayAuditTrail() {
    const displayArea = document.getElementById('auditTrailDisplay');
    const loadingIndicator = document.getElementById('auditTrailLoading');
    const table = document.getElementById('auditTrailTable');
    const tableBody = document.getElementById('auditTrailTableBody');

    if (!displayArea || !loadingIndicator || !table || !tableBody) return;

    displayArea.style.display = 'block';
    loadingIndicator.style.display = 'block';
    table.style.display = 'none';
    tableBody.innerHTML = '';

    try {
        const token = window.auth && window.auth.getToken ? window.auth.getToken() : localStorage.getItem('auth_token');
        const response = await fetch('/api/admin/audit-trail?limit=200', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch audit log');
        }

        const logs = await response.json();
        renderAuditTrail(logs);

    } catch (error) {
        console.error('Error loading audit trail:', error);
        loadingIndicator.textContent = 'Error loading audit trail.';
    }
}

function renderAuditTrail(logs) {
    const loadingIndicator = document.getElementById('auditTrailLoading');
    const table = document.getElementById('auditTrailTable');
    const tableBody = document.getElementById('auditTrailTableBody');

    loadingIndicator.style.display = 'none';

    if (!Array.isArray(logs) || logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No audit records found.</td></tr>';
    } else {
        logs.forEach(log => {
            const row = tableBody.insertRow();
            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString() : '';
            const username = (log.username || 'System');
            const action = (log.action || '');
            const details = log.details ? escapeHtmlSafe(log.details) : 'N/A';

            row.innerHTML = `
                <td title='${log.ip_address || ''}'>${timestamp}</td>
                <td>${escapeHtmlSafe(username)}</td>
                <td><span class='badge'>${escapeHtmlSafe(action)}</span></td>
                <td style='white-space: pre-wrap; word-break: break-word;'>${details}</td>
            `;
        });
    }
    table.style.display = 'table';
}

function escapeHtmlSafe(text) {
    if (typeof text !== 'string') return text;
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Setup critical event listeners that must work for core functionality
 */
function setupCriticalEventListeners() {
    console.log('Setting up critical event listeners');
    
    // Set up delete user modal close buttons
    const closeModalButtons = document.querySelectorAll('.close-modal');
    closeModalButtons.forEach(button => {
        button.addEventListener('click', function() {
            closeAllModals();
        });
    });
    
    // Set up delete user button in the modal
    const confirmDeleteUserBtn = document.getElementById('confirmDeleteUserBtn');
    if (confirmDeleteUserBtn) {
        console.log('Setting up confirmDeleteUserBtn');
        
        // Add multiple event handlers for redundancy
        confirmDeleteUserBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Delete button clicked via addEventListener in setupCriticalEventListeners');
            deleteUser();
            return false;
        });
        
        confirmDeleteUserBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Delete button clicked via onclick in setupCriticalEventListeners');
            deleteUser();
            return false;
        };
    }
    
    // Set up direct delete link
    const directDeleteLink = document.getElementById('directDeleteLink');
    if (directDeleteLink) {
        directDeleteLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Direct delete link clicked in setupCriticalEventListeners');
            deleteUser();
            return false;
        });
    }
    
    // Set up direct API link
    const directAPILink = document.getElementById('directAPILink');
    if (directAPILink) {
        directAPILink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Direct API link clicked in setupCriticalEventListeners');
            const userId = window.currentDeleteUserId || 
                          (document.getElementById('deleteUserId') ? document.getElementById('deleteUserId').value : null);
            directDeleteUserAPI(userId);
            return false;
        });
    }
    
    // Set up delete user form
    const deleteUserForm = document.getElementById('deleteUserForm');
    if (deleteUserForm) {
        deleteUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Delete user form submitted in setupCriticalEventListeners');
            deleteUser();
            return false;
        });
    }
}

/**
 * Load user data from localStorage and API
 */
async function loadUserData() {
    showLoading();
    // Get the new display elements
    const userNameDisplay = document.getElementById('currentUserNameDisplay');
    const userEmailDisplay = document.getElementById('currentUserEmailDisplay');

    try {
        // Get user from localStorage first
        const currentUser = window.auth.getCurrentUser();

        if (currentUser) {
            // Populate form fields
            if (firstNameInput) firstNameInput.value = currentUser.first_name || ''; // Add null checks
            if (lastNameInput) lastNameInput.value = currentUser.last_name || ''; // Add null checks
            if (emailInput) emailInput.value = currentUser.email || ''; // Add null checks

            // --- UPDATE DISPLAY ELEMENT (Initial Load) ---
            let displayName;
            if (currentUser.first_name && currentUser.last_name) {
                displayName = `${currentUser.first_name} ${currentUser.last_name}`;
            } else {
                displayName = currentUser.username || 'User';
            }
            if (userNameDisplay) userNameDisplay.textContent = displayName;
            if (userEmailDisplay) userEmailDisplay.textContent = currentUser.email || 'N/A';

            if (currentUser.oidc_managed) {
                if (firstNameInput) firstNameInput.disabled = true;
                if (lastNameInput) lastNameInput.disabled = true;
                if (emailInput) emailInput.disabled = true;
                if (saveProfileBtn) saveProfileBtn.style.display = 'none';
                userEditDesc = document.querySelector('#currentUserInfoDisplay > p > strong')
                if (userEditDesc) {
                    userEditDesc.setAttribute('data-i18n', 'settings.current_user_oidc')
                    userEditDesc.textContent = 'OIDC managed profile for:'
                }
                securitySection = document.getElementById('securitySection');
                if (securitySection) securitySection.style.display = 'none';
            }
            // --- END UPDATE ---

            // Admin section visibility will be determined after API call
        }

        // Fetch fresh user data from API
        try {
            const response = await fetch('/api/auth/user', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${window.auth.getToken()}`
                }
            });

            if (response.ok) {
                const userData = await response.json();

                // Update form fields with fresh data
                if (firstNameInput) firstNameInput.value = userData.first_name || ''; // Add null checks
                if (lastNameInput) lastNameInput.value = userData.last_name || ''; // Add null checks
                if (emailInput) emailInput.value = userData.email || ''; // Add null checks

                // --- UPDATE DISPLAY ELEMENT (After API Load) ---
                let displayName;
                if (userData.first_name && userData.last_name) {
                    displayName = `${userData.first_name} ${userData.last_name}`;
                } else {
                    displayName = userData.username || 'User';
                }
                 if (userNameDisplay) userNameDisplay.textContent = displayName;
                 if (userEmailDisplay) userEmailDisplay.textContent = userData.email || 'N/A';
                // --- END UPDATE ---

                // Show admin section if user is admin and load admin-specific data
                if (userData.is_admin) {
                     if (adminSection) {
                        adminSection.style.display = 'block';
                        // Ensure admin-specific data is loaded AFTER section is visible
                        if (usersTableBody) loadUsers();
                        // Check for site settings elements directly to avoid cache timing issues
                        const hasRegistrationToggle = document.getElementById('registrationEnabled');
                        const hasOidcToggle = document.getElementById('oidcEnabled');
                        if (hasRegistrationToggle || hasOidcToggle) {
                            console.log('Admin settings elements found, loading site settings...');
                            loadSiteSettings();
                        } else {
                            console.warn('Admin settings elements not found - this might be a timing/cache issue');
                        }
                     }
                } else {
                    if (adminSection) adminSection.style.display = 'none';
                }

                // Update localStorage ONLY if data has changed
                const currentUser = window.auth.getCurrentUser();
                let first_name = userData.first_name;
                let last_name = userData.last_name;
                if (!last_name) first_name = ''; // Reset first name if last name is empty
                
                const updatedUser = {
                    ...(currentUser || {}), // Preserve existing fields
                    first_name,             // Update first name
                    last_name,              // Update last name
                    // Preserve other essential fields from fetched data if currentUser was null
                    email: currentUser ? currentUser.email : userData.email,
                    username: currentUser ? currentUser.username : userData.username,
                    is_admin: currentUser ? currentUser.is_admin : userData.is_admin,
                    id: currentUser ? currentUser.id : userData.id
                };
                
                // Convert both to JSON strings for reliable comparison
                const currentUserString = JSON.stringify(currentUser);
                const updatedUserString = JSON.stringify(updatedUser);

                if (currentUserString !== updatedUserString) {
                    console.log('User data changed, updating localStorage.');
                    localStorage.setItem('user_info', updatedUserString);
                } else {
                    console.log('User data from API matches localStorage, skipping update.');
                }
                // localStorage.setItem('user_info', JSON.stringify(updatedUser)); // OLD LINE
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
                console.warn('API error fetching user data:', errorData.message);
                 if (!currentUser) {
                    showToast(errorData.message || 'Failed to load fresh user data', 'warning');
                 }
            }
        } catch (apiError) {
            console.warn('API error, using localStorage data:', apiError);
             if (!currentUser) {
                 showToast('Could not connect to fetch user data. Displaying cached info.', 'warning');
             }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Failed to load user data. Please try again.', 'error');
        if (userNameDisplay) userNameDisplay.textContent = 'Error';
        if (userEmailDisplay) userEmailDisplay.textContent = 'Error';
    } finally {
        hideLoading();
    }
}

/**
 * Get current user type (admin or user)
 * @returns {string} 'admin' or 'user'
 */
function getUserType() {
    try {
        const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
        return userInfo.is_admin === true ? 'admin' : 'user';
    } catch (e) {
        console.error('Error determining user type:', e);
        return 'user'; // Default to user if we can't determine
    }
}

/**
 * Get the appropriate localStorage key prefix based on user type
 * @returns {string} The prefix to use for localStorage keys
 */
function getPreferenceKeyPrefix() {
    return getUserType() === 'admin' ? 'admin_' : 'user_';
}

// Prevent multiple simultaneous preference loads
let isLoadingPreferences = false;

/**
 * Load user preferences
 */
async function loadPreferences() {
    // Prevent multiple simultaneous loads
    if (isLoadingPreferences) {
        console.log('Preferences already loading, skipping duplicate call');
        return;
    }
    
    isLoadingPreferences = true;
    console.log('Loading preferences...');
    const prefix = getPreferenceKeyPrefix();
    console.log('Loading preferences with prefix:', prefix);

    let apiPrefs = null;
    
    // FIXED: Load all preferences from API first, then apply to UI
    if (window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated()) {
        try {
            const response = await fetch('/api/auth/preferences', {
                headers: {
                    'Authorization': `Bearer ${window.auth.getToken()}`
                }
            });
            if (response.ok) {
                apiPrefs = await response.json();
                console.log('API preferences loaded:', apiPrefs);
                
                // Apply theme from API immediately (highest priority)
                if (apiPrefs && apiPrefs.theme) {
                    const isDark = apiPrefs.theme === 'dark';
                    console.log('Applying theme from API:', apiPrefs.theme, 'isDark:', isDark);
                    setTheme(isDark);
                    // Sync localStorage to match API
                    localStorage.setItem('darkMode', isDark);
                    // Ensure the dark mode toggle reflects the API setting
                    if (darkModeToggleSetting) {
                        darkModeToggleSetting.checked = isDark;
                        console.log('Synced dark mode toggle to API value:', isDark);
                    }
                } else {
                    console.log('No theme in API preferences, using localStorage fallback');
                    const storedDarkMode = localStorage.getItem('darkMode') === 'true';
                    setTheme(storedDarkMode);
                    if (darkModeToggleSetting) {
                        darkModeToggleSetting.checked = storedDarkMode;
                    }
                }
            } else {
                console.warn('API preferences request failed, using localStorage');
                const storedDarkMode = localStorage.getItem('darkMode') === 'true';
                setTheme(storedDarkMode);
            }
        } catch (e) {
            console.warn('Failed to load preferences from backend:', e);
            // Fallback to localStorage
            const storedDarkMode = localStorage.getItem('darkMode') === 'true';
            setTheme(storedDarkMode);
        }
    } else {
        console.log('Not authenticated, using localStorage for theme');
        const storedDarkMode = localStorage.getItem('darkMode') === 'true';
        setTheme(storedDarkMode);
    }
    // --- Load Date Format --- Add this section
    const storedDateFormat = localStorage.getItem('dateFormat');
    if (storedDateFormat && dateFormatSelect) {
        dateFormatSelect.value = storedDateFormat;
        console.log(`Loaded dateFormat from localStorage: ${storedDateFormat}`);
    } else if (dateFormatSelect) {
        dateFormatSelect.value = 'MDY'; // Default if not found
        console.log('dateFormat not found in localStorage, defaulting to MDY');
    }
    // --- End Date Format Section ---

    // Default View
    const storedView = localStorage.getItem(`${prefix}defaultView`);
    if (storedView && defaultViewSelect) {
        defaultViewSelect.value = storedView;
        console.log(`Loaded default view from ${prefix}defaultView: ${storedView}`);
    } else if (defaultViewSelect) {
        defaultViewSelect.value = 'grid'; // Default
        console.log(`${prefix}defaultView not found, defaulting view to grid`);
    }

    // Currency Symbol - Load stored preference first
    const storedCurrency = localStorage.getItem(`${prefix}currencySymbol`);
    
    // Load currencies from API and set the saved preference
    await loadCurrenciesForSettings();
    
    if (storedCurrency) {
        if (currencySymbolSelect) {
            // Check if the stored symbol is a standard option
            const standardOption = Array.from(currencySymbolSelect.options).find(opt => opt.value === storedCurrency);
            if (standardOption) {
                currencySymbolSelect.value = storedCurrency;
                if (currencySymbolCustom) currencySymbolCustom.style.display = 'none';
                console.log(`Set currency dropdown to stored value: ${storedCurrency}`);
            } else {
                // It's a custom symbol
                currencySymbolSelect.value = 'other';
                if (currencySymbolCustom) {
                    currencySymbolCustom.value = storedCurrency;
                    currencySymbolCustom.style.display = 'inline-block';
                }
                console.log(`Set currency to custom value: ${storedCurrency}`);
            }
            console.log(`Loaded currency symbol from ${prefix}currencySymbol: ${storedCurrency}`);
        }
    } else {
        // Default to '$' if nothing stored
        if (currencySymbolSelect) currencySymbolSelect.value = '$';
        if (currencySymbolCustom) currencySymbolCustom.style.display = 'none';
        console.log(`${prefix}currencySymbol not found, defaulting to $`);
    }

    // Currency Position
    const storedCurrencyPosition = localStorage.getItem(`${prefix}currencyPosition`);
    if (storedCurrencyPosition && currencyPositionSelect) {
        currencyPositionSelect.value = storedCurrencyPosition;
        console.log(`Loaded currency position from ${prefix}currencyPosition: ${storedCurrencyPosition}`);
    } else if (currencyPositionSelect) {
        currencyPositionSelect.value = 'left'; // Default
        console.log(`${prefix}currencyPosition not found, defaulting to left`);
    }

    // Expiring Soon Days
    const storedExpiringDays = localStorage.getItem(`${prefix}expiringSoonDays`);
    if (storedExpiringDays && expiringSoonDaysInput) {
        expiringSoonDaysInput.value = storedExpiringDays;
        console.log(`Loaded expiring soon days from ${prefix}expiringSoonDays: ${storedExpiringDays}`);
    } else if (expiringSoonDaysInput) {
        expiringSoonDaysInput.value = 30; // Default
        console.log(`${prefix}expiringSoonDays not found, defaulting to 30`);
    }

    // Paperless View in App
    const storedPaperlessViewInApp = localStorage.getItem(`${prefix}paperlessViewInApp`);
    if (storedPaperlessViewInApp !== null && paperlessViewInAppToggle) {
        paperlessViewInAppToggle.checked = storedPaperlessViewInApp === 'true';
        console.log(`Loaded Paperless view in app from ${prefix}paperlessViewInApp: ${storedPaperlessViewInApp}`);
    } else if (paperlessViewInAppToggle) {
        paperlessViewInAppToggle.checked = false; // Default
        console.log(`${prefix}paperlessViewInApp not found, defaulting to false`);
    }

    // Apply API preferences to form elements (apiPrefs already loaded above)
    if (apiPrefs) {
        console.log('Applying API preferences to form elements:', apiPrefs);

                // Update UI elements with API data where available
                if (apiPrefs.default_view && defaultViewSelect) {
                    // Only update if different from localStorage value (or if localStorage was empty)
                    const storedView = localStorage.getItem(`${prefix}defaultView`) || 'grid'; // Default if null
                    if (apiPrefs.default_view !== storedView) {
                         console.log(`API default_view (${apiPrefs.default_view}) differs from localStorage (${storedView}). Updating UI.`);
                         defaultViewSelect.value = apiPrefs.default_view;
                    }
                }
                // --- MODIFIED CURRENCY SYMBOL HANDLING ---
                const storedCurrency = localStorage.getItem(`${prefix}currencySymbol`); // Get localStorage value again for comparison
                if (apiPrefs.currency_symbol && currencySymbolSelect) {
                    // Only update UI from API if the API value is different from what was in localStorage
                    // Or if localStorage didn't have a value initially
                    if (!storedCurrency || apiPrefs.currency_symbol !== storedCurrency) {
                        console.log(`API currency_symbol (${apiPrefs.currency_symbol}) differs from localStorage (${storedCurrency}). Updating UI.`);
                        // Logic to handle standard vs custom symbol from API
                        const standardOption = Array.from(currencySymbolSelect.options).find(opt => opt.value === apiPrefs.currency_symbol);
                        if (standardOption) {
                            currencySymbolSelect.value = apiPrefs.currency_symbol;
                            if (currencySymbolCustom) currencySymbolCustom.style.display = 'none';
                        } else {
                            currencySymbolSelect.value = 'other';
                            if (currencySymbolCustom) {
                                currencySymbolCustom.value = apiPrefs.currency_symbol;
                                currencySymbolCustom.style.display = 'inline-block';
                            }
                        }
                    } else {
                         console.log(`API currency_symbol (${apiPrefs.currency_symbol}) matches localStorage (${storedCurrency}). Skipping UI update.`);
                    }
                }
                // --- END MODIFIED CURRENCY SYMBOL HANDLING ---
                
                // --- CURRENCY POSITION HANDLING ---
                const storedCurrencyPosition = localStorage.getItem(`${prefix}currencyPosition`);
                if (apiPrefs.currency_position && currencyPositionSelect) {
                    if (!storedCurrencyPosition || apiPrefs.currency_position !== storedCurrencyPosition) {
                        console.log(`API currency_position (${apiPrefs.currency_position}) differs from localStorage (${storedCurrencyPosition}). Updating UI.`);
                        currencyPositionSelect.value = apiPrefs.currency_position;
                    } else {
                        console.log(`API currency_position (${apiPrefs.currency_position}) matches localStorage (${storedCurrencyPosition}). Skipping UI update.`);
                    }
                }
                // --- END CURRENCY POSITION HANDLING ---
                if (apiPrefs.expiring_soon_days && expiringSoonDaysInput) {
                     // Only update if different from localStorage value (or if localStorage was empty)
                     const storedExpiringDays = localStorage.getItem(`${prefix}expiringSoonDays`) || '30'; // Default if null
                     if (String(apiPrefs.expiring_soon_days) !== storedExpiringDays) {
                         console.log(`API expiring_soon_days (${apiPrefs.expiring_soon_days}) differs from localStorage (${storedExpiringDays}). Updating UI.`);
                         expiringSoonDaysInput.value = apiPrefs.expiring_soon_days;
                     }
                }

                 // --- Update Date Format from API Prefs --- Add this check
                 const storedDateFormat = localStorage.getItem('dateFormat') || 'MDY'; // Default if null
                 if (apiPrefs.date_format && dateFormatSelect) {
                      if (apiPrefs.date_format !== storedDateFormat) {
                         console.log(`API date_format (${apiPrefs.date_format}) differs from localStorage (${storedDateFormat}). Updating UI.`);
                         dateFormatSelect.value = apiPrefs.date_format;
                     }
                 }
                 // --- End Date Format Check ---

                 // --- Update Paperless View in App from API Prefs ---
                 if (apiPrefs.paperless_view_in_app !== undefined && paperlessViewInAppToggle) {
                     paperlessViewInAppToggle.checked = apiPrefs.paperless_view_in_app;
                     console.log(`Set Paperless view in app from API: ${apiPrefs.paperless_view_in_app}`);
                 }
                 // --- End Paperless View in App from API Prefs ---

                // Update Email Settings from API
                if (notificationChannel) {
                    const channelValue = apiPrefs.notification_channel || 'email'; // Default to email if not present
                    notificationChannel.value = channelValue;
                    toggleNotificationSettings(channelValue);
                    console.log('Set notification channel to:', channelValue);
                }
                if (notificationFrequencySelect && apiPrefs.notification_frequency) {
                    notificationFrequencySelect.value = apiPrefs.notification_frequency;
                }
                if (notificationTimeInput && apiPrefs.notification_time) {
                    notificationTimeInput.value = apiPrefs.notification_time.substring(0, 5); // HH:MM format
                }
                // Admin Apprise settings (in Apprise card)
                if (appriseNotificationFrequency && apiPrefs.apprise_notification_frequency) {
                    appriseNotificationFrequency.value = apiPrefs.apprise_notification_frequency;
                }
                
                // User-specific Apprise settings (in notification settings section)
                if (userAppriseNotificationTimeInput && apiPrefs.apprise_notification_time) {
                    userAppriseNotificationTimeInput.value = apiPrefs.apprise_notification_time.substring(0, 5);
                }
                if (userAppriseTimezoneSelect && apiPrefs.apprise_timezone) {
                    if (Array.from(userAppriseTimezoneSelect.options).some(option => option.value === apiPrefs.apprise_timezone)) {
                        userAppriseTimezoneSelect.value = apiPrefs.apprise_timezone;
                    } else {
                        console.warn(`User Apprise timezone '${apiPrefs.apprise_timezone}' from API not found in dropdown.`);
                    }
                }
                if (userAppriseNotificationFrequency && apiPrefs.apprise_notification_frequency) {
                    userAppriseNotificationFrequency.value = apiPrefs.apprise_notification_frequency;
                }
                
                // Update Apprise timezone display
                updateAppriseTimezoneDisplay(apiPrefs.timezone);
                // Load and set timezone from API
                if (timezoneSelect && apiPrefs.timezone) {
                    console.log('API provided timezone:', apiPrefs.timezone);
                    // Ensure the option exists before setting
                    if (Array.from(timezoneSelect.options).some(option => option.value === apiPrefs.timezone)) {
                        timezoneSelect.value = apiPrefs.timezone;
                        console.log('Applied timezone from API:', timezoneSelect.value, 'Current select value:', timezoneSelect.value);
                        
                        // Update Apprise timezone display when timezone is loaded
                        updateAppriseTimezoneDisplay(apiPrefs.timezone);
                    } else {
                        console.warn(`Timezone '${apiPrefs.timezone}' from API not found in dropdown.`);
                    }
                } else {
                    console.log('No timezone preference found in API or timezone select element missing.');
                }

                                // Load and set language preference
                if (apiPrefs.preferred_language && languageSelect) {
                    console.log('API provided language:', apiPrefs.preferred_language);
                    // Ensure the option exists before setting
                    if (Array.from(languageSelect.options).some(option => option.value === apiPrefs.preferred_language)) {
                        languageSelect.value = apiPrefs.preferred_language;
                        console.log('Applied language from API:', languageSelect.value);
                        
                        // Trigger language change if different from current
                        if (window.i18n?.changeLanguage && window.i18n?.getCurrentLanguage) {
                            const currentLang = window.i18n.getCurrentLanguage();
                            if (apiPrefs.preferred_language !== currentLang) {
                                console.log(`Language preference (${apiPrefs.preferred_language}) differs from current (${currentLang}), changing language`);
                                window.i18n.changeLanguage(apiPrefs.preferred_language).catch(error => {
                                    console.error('Failed to change language from API preference:', error);
                                });
                            }
                        }
                    } else {
                        console.warn(`Language '${apiPrefs.preferred_language}' from API not found in dropdown.`);
                    }
                } else {
                    // Load from localStorage if no API preference
                    const storedLanguage = localStorage.getItem('preferred_language') || 'en';
                    if (languageSelect) {
                        languageSelect.value = storedLanguage;
                        console.log('Applied language from localStorage:', storedLanguage);
                        
                        // Trigger language change if different from current
                        if (window.i18n?.changeLanguage && window.i18n?.getCurrentLanguage) {
                            const currentLang = window.i18n.getCurrentLanguage();
                            if (storedLanguage !== currentLang) {
                                console.log(`Stored language (${storedLanguage}) differs from current (${currentLang}), changing language`);
                                window.i18n.changeLanguage(storedLanguage).catch(error => {
                                    console.error('Failed to change language from localStorage:', error);
                                });
                            }
                        }
                    }
                }
    } else {
        // No API preferences, load language from localStorage
        const storedLanguage = localStorage.getItem('preferred_language') || 'en';
        if (languageSelect) {
            languageSelect.value = storedLanguage;
            console.log('Applied language from localStorage (no API):', storedLanguage);
            
            // Trigger language change if different from current
            if (window.i18n?.changeLanguage && window.i18n?.getCurrentLanguage) {
                const currentLang = window.i18n.getCurrentLanguage();
                if (storedLanguage !== currentLang) {
                    console.log(`Stored language (${storedLanguage}) differs from current (${currentLang}), changing language`);
                    window.i18n.changeLanguage(storedLanguage).catch(error => {
                        console.error('Failed to change language from localStorage (no API):', error);
                    });
                }
            }
        }
    }
    
    // Reset the loading flag
    isLoadingPreferences = false;
    console.log('Preferences loading completed');
}

/**
 * Update the Apprise timezone display to show which timezone will be used
 */
function updateAppriseTimezoneDisplay(timezone) {
    const appriseTimezoneDisplay = document.getElementById('appriseTimezoneDisplay');
    if (appriseTimezoneDisplay) {
        if (timezone) {
            appriseTimezoneDisplay.textContent = `(using timezone: ${timezone})`;
            appriseTimezoneDisplay.style.display = 'inline';
        } else {
            appriseTimezoneDisplay.textContent = '(timezone not set)';
            appriseTimezoneDisplay.style.display = 'inline';
        }
    }
}

/**
 * Setup event listeners for the settings page
 */
function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Set up user menu button click handler
    // const userMenuBtn = document.getElementById('userMenuBtn'); // REMOVE/COMMENT OUT
    // const userMenuDropdown = document.getElementById('userMenuDropdown'); // REMOVE/COMMENT OUT

    // if (userMenuBtn && userMenuDropdown) { // REMOVE/COMMENT OUT THIS ENTIRE BLOCK
    //     console.log('Setting up user menu button click handler');
    //     userMenuBtn.addEventListener('click', function(e) {
    //         e.stopPropagation();
    //         userMenuDropdown.classList.toggle('active');
    //     });
    //     document.addEventListener('click', function(e) {
    //         if (userMenuDropdown.classList.contains('active') &&
    //             !userMenuDropdown.contains(e.target) &&
    //             !userMenuBtn.contains(e.target)) {
    //             userMenuDropdown.classList.remove('active');
    //         }
    //     });
    // }
    
    // Dark mode toggle in header (no longer exists)
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', function() {
            setTheme(this.checked);
            
            // Also update the settings page toggle
            if (darkModeToggleSetting) {
                darkModeToggleSetting.checked = this.checked;
            }
        });
    }
    
    // Dark mode toggle in settings
    if (darkModeToggleSetting) {
        darkModeToggleSetting.addEventListener('change', function() {
            setTheme(this.checked);
            
            // Also update the header toggle if it exists
            if (darkModeToggle) {
                darkModeToggle.checked = this.checked;
            }
        });
    }
    
    // Save profile button
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
    }
    
    // Save preferences button
    if (savePreferencesBtn) {
        savePreferencesBtn.addEventListener('click', savePreferences);
    }
    
    // Change password button
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', function() {
            passwordChangeForm.style.display = 'block';
            this.style.display = 'none';
        });
    }
    
    // Save password button
    if (savePasswordBtn) {
        savePasswordBtn.addEventListener('click', changePassword);
    }
    
    // Cancel password button
    if (cancelPasswordBtn) {
        cancelPasswordBtn.addEventListener('click', function() {
            resetPasswordForm();
            passwordChangeForm.style.display = 'none';
            changePasswordBtn.style.display = 'block';
        });
    }
    
    // Delete account button
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', function() {
            openModal(deleteAccountModal);
        });
    }
    
    // Delete confirm input
    if (deleteConfirmInput) {
        deleteConfirmInput.addEventListener('input', function() {
            confirmDeleteAccountBtn.disabled = this.value !== 'DELETE';
        });
    }
    
    // Confirm delete account button
    if (confirmDeleteAccountBtn) {
        confirmDeleteAccountBtn.addEventListener('click', deleteAccount);
    }
    
    // Add event listener for logout menu item
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    if (logoutMenuItem) {
        logoutMenuItem.addEventListener('click', function() {
            if (window.auth && window.auth.logout) {
                window.auth.logout();
            }
        });
    }
    
    // Admin section buttons
    if (refreshUsersBtn) {
        refreshUsersBtn.addEventListener('click', function() {
            loadUsers();
        });
    }
    
    if (checkAdminBtn) {
        checkAdminBtn.addEventListener('click', function() {
            checkAdminPermissions();
        });
    }
    
    if (showUsersBtn) {
        showUsersBtn.addEventListener('click', function() {
            console.log('Show Users List button clicked');
            // Open the proper users modal that has crown icons and ownership management
            const usersModal = document.getElementById('usersModal');
            if (usersModal) {
                openModal(usersModal);
                loadUsers(); // This will populate the table with crown icons
            } else {
                console.error('usersModal not found, falling back to showUsersList');
                showUsersList();
            }
        });
    }
    
    if (testApiBtn) {
        testApiBtn.addEventListener('click', function() {
            checkApiEndpoint();
        });
    }
    
    if (triggerNotificationsBtn) {
        triggerNotificationsBtn.addEventListener('click', function() {
            triggerWarrantyNotifications();
        });
    }
    
    if (schedulerStatusBtn) {
        schedulerStatusBtn.addEventListener('click', function() {
            checkSchedulerStatus();
        });
    }
    
    // Site settings save button
    if (saveSiteSettingsBtn) {
        saveSiteSettingsBtn.addEventListener('click', function() {
            saveSiteSettings(); // This will now also handle non-OIDC site settings
        });
    }

    // Save OIDC settings button
    if (saveOidcSettingsBtn) {
        saveOidcSettingsBtn.addEventListener('click', function() {
            saveOidcSettings();
        });
    }
    
    // Save email settings button
    if (saveNotificationSettingsBtn) {
        saveNotificationSettingsBtn.addEventListener('click', saveNotificationSettings);
    }

    // Save user changes button (Edit User Modal)
    const saveUserBtn = document.getElementById('saveUserBtn');
    if (saveUserBtn) {
        saveUserBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Save User button clicked');
            saveUserChanges();
        });
    }
    
    // Add timezone change listener to update Apprise timezone display
    const timezoneSelect = document.getElementById('timezone');
    if (timezoneSelect) {
        timezoneSelect.addEventListener('change', function() {
            updateAppriseTimezoneDisplay(this.value);
        });
    }


    
    if (userAppriseTimezoneSelect) {
        loadTimezonesIntoSelect(userAppriseTimezoneSelect);
    }

    if (notificationChannel) {
        notificationChannel.addEventListener('change', (e) => {
            toggleNotificationSettings(e.target.value);
        });
    }
    
    // Paperless-ngx event listeners
    if (paperlessEnabledToggle) {
        paperlessEnabledToggle.addEventListener('change', function() {
            togglePaperlessSettings(this.checked);
        });
    }
    
    if (testPaperlessConnectionBtn) {
        testPaperlessConnectionBtn.addEventListener('click', testPaperlessConnection);
    }
    
    if (savePaperlessSettingsBtn) {
        savePaperlessSettingsBtn.addEventListener('click', savePaperlessSettings);
    }
    
    // Add debug button event listener
    const debugPaperlessBtn = document.getElementById('debugPaperlessBtn');
    if (debugPaperlessBtn) {
        debugPaperlessBtn.addEventListener('click', debugPaperlessConfiguration);
    }
    
    // Add test upload button event listener
    const testFileUploadBtn = document.getElementById('testFileUploadBtn');
    if (testFileUploadBtn) {
        testFileUploadBtn.addEventListener('click', testFileUpload);
    }
    
    // Clear status message when inputs are changed
    if (paperlessUrlInput) {
        paperlessUrlInput.addEventListener('input', function() {
            if (paperlessConnectionStatus) {
                paperlessConnectionStatus.className = 'paperless-status-message';
                paperlessConnectionStatus.innerHTML = '';
            }
        });
    }
    
    if (paperlessApiTokenInput) {
        paperlessApiTokenInput.addEventListener('input', function() {
            if (paperlessConnectionStatus) {
                paperlessConnectionStatus.className = 'paperless-status-message';
                paperlessConnectionStatus.innerHTML = '';
            }
        });
    }
    
    console.log('Event listeners setup complete');
}

/**
 * Initialize modals
 */
function initModals() {
    // Helper to close all modals and reset forms
    function closeModalHandler(e) {
        if (e) e.preventDefault();
        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            modal.style.display = 'none';
        });
        // Reset delete confirm input
        if (deleteConfirmInput) {
            deleteConfirmInput.value = '';
            confirmDeleteAccountBtn.disabled = true;
        }
        // Reset password form
        resetPasswordForm();
    }

    // Close modal when clicking on X or outside
    document.querySelectorAll('.close-btn, [data-dismiss="modal"]').forEach(closeBtn => {
        closeBtn.addEventListener('click', closeModalHandler);
        closeBtn.addEventListener('touchend', closeModalHandler);
    });
    
    // Close modal when clicking outside (backdrop)
    function backdropHandler(event) {
        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            if (event.target === modal) {
                closeModalHandler(event);
            }
        });
    }
    window.addEventListener('click', backdropHandler);
    window.addEventListener('touchend', backdropHandler);
    
    // Add direct click handler to delete user modal
    if (deleteUserModal) {
        console.log('Adding click handler to deleteUserModal');
        deleteUserModal.addEventListener('click', function(event) {
            // Check if the click was on the confirm delete button
            if (event.target && event.target.id === 'confirmDeleteUserBtn') {
                event.preventDefault();
                console.log('Confirm delete button clicked through modal event delegation');
                deleteUser();
            }
        });
    } else {
        console.error('deleteUserModal not found in initModals');
    }
    
    // Set up transfer ownership modal close handlers
    const transferOwnershipModal = document.getElementById('transferOwnershipModal');
    if (transferOwnershipModal) {
        const transferConfirmInput = document.getElementById('transferConfirmInput');
        const confirmTransferBtn = document.getElementById('confirmTransferOwnershipBtn');
        
        if (transferConfirmInput && confirmTransferBtn) {
            transferConfirmInput.addEventListener('input', function() {
                confirmTransferBtn.disabled = this.value.toUpperCase() !== 'TRANSFER';
            });
        }
    }
}

/**
 * Initialize collapsible cards functionality
 */
function initCollapsibleCards() {
    console.log('Initializing collapsible cards...');
    
    // Get all collapsible headers
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    
    // Retrieve saved states from localStorage
    const savedStates = JSON.parse(localStorage.getItem('collapsibleStates') || '{}');
    
    collapsibleHeaders.forEach(header => {
        const targetId = header.getAttribute('data-target');
        const card = header.closest('.collapsible-card');
        
        // Apply saved state or default to expanded
        const isCollapsed = savedStates[targetId] === true;
        if (isCollapsed) {
            card.classList.add('collapsed');
        }
        
        // Add click event listener
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const card = this.closest('.collapsible-card');
            
            // Toggle collapsed state
            card.classList.toggle('collapsed');
            
            // Save state to localStorage
            const currentStates = JSON.parse(localStorage.getItem('collapsibleStates') || '{}');
            currentStates[targetId] = card.classList.contains('collapsed');
            localStorage.setItem('collapsibleStates', JSON.stringify(currentStates));
            
            console.log(`Toggled ${targetId}: ${card.classList.contains('collapsed') ? 'collapsed' : 'expanded'}`);
        });
    });
    
    console.log('Collapsible cards initialized');
}

/**
 * Open a modal
 * @param {HTMLElement} modal - The modal to open
 */
function openModal(modal) {
    console.log('Opening modal:', modal.id, 'Current display:', modal.style.display);
    
    // First close all modals
    closeAllModals();
    
    // Then open this modal
    modal.style.display = 'flex';
    console.log('Modal display after opening:', modal.style.display);
    
    // If this is the delete user modal, set up the delete button
    if (modal.id === 'deleteUserModal') {
        console.log('This is the delete user modal, setting up delete button');
        // Use setTimeout to ensure the DOM is fully updated
        setTimeout(() => {
            setupDeleteButton();
        }, 100);
    }
}

/**
 * Reset password form
 */
function resetPasswordForm() {
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
}

/**
 * Save user profile
 */
async function saveProfile() {
    // Validate form
    if (!firstNameInput || !lastNameInput || !firstNameInput.value.trim() || !lastNameInput.value.trim()) {
        showToast('Please fill in First Name and Last Name', 'error');
        return;
    }

    // Get the new email value
    const newEmail = emailInput.value.trim();
    if (!newEmail) {
        showToast('Email address cannot be empty.', 'error');
        return;
    }
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
        showToast('Please enter a valid email address.', 'error');
        return;
    }

    showLoading();
    const userNameDisplay = document.getElementById('currentUserNameDisplay');

    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${window.auth.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                first_name: firstNameInput.value.trim(),
                last_name: lastNameInput.value.trim(),
                email: newEmail
            })
        });

        if (response.ok) {
            const userData = await response.json();
            // Update localStorage
            const currentUser = window.auth.getCurrentUser();
            let first_name = userData.first_name;
            let last_name = userData.last_name;
            if (!last_name) first_name = '';
            const updatedUser = {
                ...(currentUser || {}),
                first_name,
                last_name,
                email: userData.email, // Use the email returned from the backend
                username: currentUser ? currentUser.username : userData.username,
                is_admin: currentUser ? currentUser.is_admin : userData.is_admin,
                id: currentUser ? currentUser.id : userData.id
            };
            // Update the email input field with the (potentially new) email from the backend
            if (emailInput) emailInput.value = userData.email || '';
            localStorage.setItem('user_info', JSON.stringify(updatedUser));

            // --- UPDATE DISPLAY ELEMENT IMMEDIATELY ---
            let displayName;
            if (userData.first_name && userData.last_name) {
                displayName = `${userData.first_name} ${userData.last_name}`;
            } else {
                displayName = updatedUser.username || 'User';
            }
            if (userNameDisplay) userNameDisplay.textContent = displayName;
            // --- END UPDATE ---

            // Update UI (Header, etc.) - Ensure auth module is loaded
            if (window.auth && window.auth.checkAuthState) {
                window.auth.checkAuthState();
            } else {
                console.warn("Auth module or checkAuthState not found, header might not update immediately.");
            }

            showToast('Profile updated successfully', 'success');
        } else {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
            throw new Error(errorData.message || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast(`Failed to update profile: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Save user preferences
 */
async function savePreferences() {
    console.log('Saving preferences...');
    const prefix = getPreferenceKeyPrefix();

    // Get current UI state FIRST (before building preferencesToSave)
    const isDark = darkModeToggleSetting ? darkModeToggleSetting.checked : false;
    console.log(`Current dark mode UI state: ${isDark}`);

    // --- Prepare data to save --- Add dateFormat and dark mode
    const preferencesToSave = {
        default_view: defaultViewSelect ? defaultViewSelect.value : 'grid',
        expiring_soon_days: expiringSoonDaysInput ? parseInt(expiringSoonDaysInput.value) : 30,
        date_format: dateFormatSelect ? dateFormatSelect.value : 'MDY',
        theme: isDark ? 'dark' : 'light',  // Use current UI state, not old localStorage
        paperless_view_in_app: paperlessViewInAppToggle ? paperlessViewInAppToggle.checked : false,
        preferred_language: languageSelect ? languageSelect.value : 'en',  // Include language preference
    };

    // Handle currency symbol (standard or custom)
    let currencySymbol = '$'; // Default
    let currencyCode = 'USD'; // Default
    if (currencySymbolSelect) {
        if (currencySymbolSelect.value === 'other' && currencySymbolCustom) {
            currencySymbol = currencySymbolCustom.value.trim() || '$'; // Use custom or default to $ if empty
            // For custom symbols, try to derive currency code or default to USD
            currencyCode = 'USD'; // Default for custom symbols
        } else {
            currencySymbol = currencySymbolSelect.value;
            // Find the currency code for the selected symbol
            const selectedCurrency = globalCurrenciesData.find(currency => currency.symbol === currencySymbol);
            if (selectedCurrency) {
                currencyCode = selectedCurrency.code;
            }
        }
    }
    preferencesToSave.currency_symbol = currencySymbol;

    // Handle currency position
    let currencyPosition = 'left'; // Default
    if (currencyPositionSelect) {
        currencyPosition = currencyPositionSelect.value;
    }
    preferencesToSave.currency_position = currencyPosition;
    // --- End data preparation ---

    // +++ ADDED DEBUG LOGGING +++
    console.log(`[SavePrefs Debug] Currency Select Value: ${currencySymbolSelect ? currencySymbolSelect.value : 'N/A'}`);
    console.log(`[SavePrefs Debug] Custom Input Value: ${currencySymbolCustom ? currencySymbolCustom.value : 'N/A'}`);
    console.log(`[SavePrefs Debug] Final currencySymbol value determined: ${currencySymbol}`);
    console.log(`[SavePrefs Debug] Final currencyCode value determined: ${currencyCode}`);
    console.log(`[SavePrefs Debug] Currency Position Value: ${currencyPosition}`);
    console.log(`[SavePrefs Debug] Theme being saved: ${preferencesToSave.theme} (from isDark: ${isDark})`);
    console.log(`[SavePrefs Debug] Language being saved: ${preferencesToSave.preferred_language}`);
    // +++ END DEBUG LOGGING +++

    // Apply the theme to the UI (this updates localStorage too)
    setTheme(isDark);
    console.log(`Saved dark mode: ${isDark}`);

    // Save simple preferences to localStorage immediately
    localStorage.setItem('dateFormat', preferencesToSave.date_format); // Added
    localStorage.setItem(`${prefix}defaultView`, preferencesToSave.default_view);
    localStorage.setItem(`${prefix}currencySymbol`, preferencesToSave.currency_symbol);
    localStorage.setItem(`${prefix}currencyCode`, currencyCode); // Save currency code
    localStorage.setItem(`${prefix}currencyPosition`, preferencesToSave.currency_position);
    localStorage.setItem(`${prefix}expiringSoonDays`, preferencesToSave.expiring_soon_days);
    localStorage.setItem(`${prefix}paperlessViewInApp`, preferencesToSave.paperless_view_in_app);
    localStorage.setItem('preferred_language', preferencesToSave.preferred_language); // Save language preference

    console.log('Preferences saved to localStorage (prefix:', prefix, '):', preferencesToSave);
    console.log(`Value of dateFormat in localStorage: ${localStorage.getItem('dateFormat')}`);

    // Try saving to API
            if (window.auth && window.auth.isAuthenticated()) {
        try {
            showLoading();
            const token = window.auth.getToken();
            console.log('Saving preferences with token:', token ? 'present' : 'missing');
            const response = await fetch('/api/auth/preferences', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(preferencesToSave)
            });

            hideLoading();
            if (response.ok) {
                showToast('Preferences saved successfully.', 'success');
                console.log('Preferences successfully saved to API.');
                
                // If language was changed, trigger the actual language change
                if (preferencesToSave.preferred_language && window.i18n?.changeLanguage) {
                    const currentLang = window.i18n.getCurrentLanguage ? window.i18n.getCurrentLanguage() : 'en';
                    if (preferencesToSave.preferred_language !== currentLang) {
                        console.log(`Language changed from ${currentLang} to ${preferencesToSave.preferred_language}, triggering page translation`);
                        try {
                            await window.i18n.changeLanguage(preferencesToSave.preferred_language);
                            // Reload page after a short delay to apply all translations
                            setTimeout(() => {
                                window.location.reload();
                            }, 1000);
                        } catch (error) {
                            console.error('Failed to change language after saving preferences:', error);
                            showToast('Failed to change language. Please try again.', 'error');
                        }
                    }
                } else if (preferencesToSave.preferred_language) {
                    console.warn('i18n changeLanguage function not available when saving preferences');
                    showToast('Language system not ready. Settings saved but language not changed. Please refresh and try again.', 'warning');
                }
            } else {
                console.error('Preferences save failed. Response status:', response.status);
                console.error('Response headers:', Object.fromEntries(response.headers.entries()));
                const errorData = await response.json().catch((e) => {
                    console.error('Failed to parse error response as JSON:', e);
                    return {};
                });
                console.error('Error response data:', errorData);
                throw new Error(errorData.message || `Failed to save preferences to API: ${response.status}`);
            }
        } catch (error) {
            hideLoading();
            console.error('Error saving preferences to API:', error);
            showToast(`Preferences saved locally, but failed to sync with server: ${error.message}`, 'warning');
        }
    } else {
        // No auth, just show local save success
        showToast('Preferences saved locally.', 'success');
    }
}

/**
 * Change user password
 */
async function changePassword() {
    // Validate form
    if (!currentPasswordInput.value || !newPasswordInput.value || !confirmPasswordInput.value) {
        showToast('Please fill in all password fields', 'error');
        return;
    }
    
    if (newPasswordInput.value !== confirmPasswordInput.value) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    // Validate password strength
    if (newPasswordInput.value.length < 8) {
        showToast('Password must be at least 8 characters long', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/auth/password/change', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.auth.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_password: currentPasswordInput.value,
                new_password: newPasswordInput.value
            })
        });
        
        if (response.ok) {
            // Reset form and hide it
            resetPasswordForm();
            passwordChangeForm.style.display = 'none';
            changePasswordBtn.style.display = 'block';
            
            // Show success modal
            openModal(passwordSuccessModal);
        } else {
            // Handle error
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
            throw new Error(errorData.message || 'Failed to change password');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        showToast(`Failed to change password: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Delete user account
 */
async function deleteAccount() {
    if (deleteConfirmInput.value !== 'DELETE') {
        showToast('Please type DELETE to confirm', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/auth/account', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${window.auth.getToken()}`
            }
        });
        
        if (response.ok) {
            // Clear auth data
            if (window.auth.logout) {
                window.auth.logout();
            } else {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_info');
            }
            
            // Show success message
            showToast('Account deleted successfully', 'success');
            
            // Redirect to home page after a short delay
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        } else {
            // Handle error - show the actual error message from the API
            let errorMessage = 'Failed to delete account';
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                console.warn('Could not parse error response:', parseError);
            }
            
            console.error('API error response:', errorMessage);
            showToast(errorMessage, 'error');
        }
    } catch (error) {
        console.error('Network error deleting account:', error);
        // Only show offline message for actual network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showToast('Account cannot be deleted in offline mode', 'warning');
        } else {
            showToast('Failed to delete account. Please try again.', 'error');
        }
    } finally {
        hideLoading();
        
        // Close modal
        deleteAccountModal.style.display = 'none';
        
        // Reset delete confirm input
        deleteConfirmInput.value = '';
        confirmDeleteAccountBtn.disabled = true;
    }
}

/**
 * Show loading spinner
 */
function showLoading() {
    loadingContainer.style.display = 'flex';
}

/**
 * Hide loading spinner
 */
function hideLoading() {
    loadingContainer.style.display = 'none';
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast (info, success, error, warning)
 * @param {number} duration - Duration in milliseconds, 0 for no auto-hide
 * @returns {HTMLElement} - The toast element
 */
function showToast(message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = document.createElement('i');
    switch (type) {
        case 'success':
            icon.className = 'fas fa-check-circle';
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle';
            break;
        case 'warning':
            icon.className = 'fas fa-exclamation-triangle';
            break;
        default:
            icon.className = 'fas fa-info-circle';
    }
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(messageSpan);
    
    toastContainer.appendChild(toast);
    
    // Add a method to remove the toast
    toast.remove = function() {
        toast.classList.add('toast-fade-out');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    };
    
    // Auto-hide toast after specified duration (if not 0)
    if (duration > 0) {
        setTimeout(() => {
            toast.remove();
        }, duration);
    }
    
    return toast;
}

/**
 * Load users for admin
 */
async function loadUsers() {
    // Exit if usersTableBody doesn't exist
    if (!usersTableBody) {
        console.log('usersTableBody element not found, skipping loadUsers');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/admin/users', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${window.auth.getToken()}`
            }
        });
        
        if (response.ok) {
            const users = await response.json();
            
            // DEBUG: Check users data
            console.log('DEBUG: Users data from API:', users);
            users.forEach((user, index) => {
                console.log(`DEBUG: User ${index} (${user.username}):`, {
                    id: user.id,
                    is_owner: user.is_owner,
                    is_admin: user.is_admin
                });
            });
            
            // Clear table
            usersTableBody.innerHTML = '';
            
            // Add users to table
            users.forEach(user => {
                const row = document.createElement('tr');
                row.style.borderBottom = '1px solid var(--border-color)';
                row.style.transition = 'background-color 0.2s ease';
                
                // Add hover effect
                row.addEventListener('mouseenter', () => {
                    row.style.backgroundColor = 'var(--hover-bg, rgba(0,0,0,0.05))';
                });
                row.addEventListener('mouseleave', () => {
                    row.style.backgroundColor = 'transparent';
                });
                
                // ID
                const idCell = document.createElement('td');
                idCell.textContent = user.id;
                idCell.style.cssText = 'padding: 12px 8px; color: var(--text-color); border-right: 1px solid var(--border-color); font-weight: 500;';
                row.appendChild(idCell);
                
                // Username with crown
                const usernameCell = document.createElement('td');
                const crownIcon = user.is_owner ? ' <i class="fas fa-crown" title="Application Owner" style="color: #f39c12; margin-left: 5px;"></i>' : '';
                console.log(`DEBUG: User ${user.username} (ID: ${user.id}) - is_owner: ${user.is_owner}, adding crown: ${!!user.is_owner}`);
                usernameCell.innerHTML = user.username + crownIcon;
                usernameCell.style.cssText = 'padding: 12px 8px; color: var(--text-color); border-right: 1px solid var(--border-color); font-weight: 500;';
                row.appendChild(usernameCell);
                
                // Email
                const emailCell = document.createElement('td');
                emailCell.textContent = user.email;
                emailCell.style.cssText = 'padding: 12px 8px; color: var(--text-color); border-right: 1px solid var(--border-color); font-size: 0.9em;';
                row.appendChild(emailCell);
                
                // Name
                const nameCell = document.createElement('td');
                const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                nameCell.textContent = fullName || '-';
                nameCell.style.cssText = 'padding: 12px 8px; color: var(--text-color); border-right: 1px solid var(--border-color);';
                row.appendChild(nameCell);
                
                // Admin
                const adminCell = document.createElement('td');
                const adminBadge = document.createElement('span');
                adminBadge.className = `badge ${user.is_admin ? 'badge-success' : 'badge-secondary'}`;
                adminBadge.textContent = user.is_admin ? 'Yes' : 'No';
                adminBadge.style.cssText = 'padding: 4px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 600;';
                adminCell.appendChild(adminBadge);
                adminCell.style.cssText = 'padding: 12px 8px; text-align: center; border-right: 1px solid var(--border-color);';
                row.appendChild(adminCell);
                
                // Active Status
                const statusCell = document.createElement('td');
                const statusBadge = document.createElement('span');
                statusBadge.className = `badge ${user.is_active ? 'badge-success' : 'badge-danger'}`;
                statusBadge.textContent = user.is_active ? 'Yes' : 'No';
                statusBadge.style.cssText = 'padding: 4px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 600;';
                statusCell.appendChild(statusBadge);
                statusCell.style.cssText = 'padding: 12px 8px; text-align: center; border-right: 1px solid var(--border-color);';
                row.appendChild(statusCell);
                
                // Actions
                const actionsCell = document.createElement('td');
                actionsCell.style.cssText = 'padding: 12px 8px; text-align: center;';
                
                // Create button container for better spacing
                const buttonContainer = document.createElement('div');
                buttonContainer.style.cssText = 'display: flex; gap: 6px; justify-content: center; align-items: center;';
                
                // Edit button
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-sm';
                editBtn.innerHTML = '<i class="fas fa-edit"></i>';
                editBtn.title = 'Edit User';
                editBtn.style.cssText = `
                    padding: 8px 10px; 
                    border-radius: 6px; 
                    border: 1px solid var(--primary-color, #007bff);
                    background-color: transparent;
                    color: var(--primary-color, #007bff);
                    transition: all 0.2s ease;
                    cursor: pointer;
                    min-width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                // Edit button hover effects
                editBtn.addEventListener('mouseenter', () => {
                    if (!editBtn.disabled) {
                        editBtn.style.backgroundColor = 'var(--primary-color, #007bff)';
                        editBtn.style.color = 'white';
                        editBtn.style.transform = 'translateY(-1px)';
                        editBtn.style.boxShadow = '0 2px 4px rgba(0,123,255,0.3)';
                    }
                });
                editBtn.addEventListener('mouseleave', () => {
                    if (!editBtn.disabled) {
                        editBtn.style.backgroundColor = 'transparent';
                        editBtn.style.color = 'var(--primary-color, #007bff)';
                        editBtn.style.transform = 'translateY(0)';
                        editBtn.style.boxShadow = 'none';
                    }
                });
                editBtn.addEventListener('click', () => openEditUserModal(user));
                
                // Delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-sm';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.title = 'Delete User';
                deleteBtn.style.cssText = `
                    padding: 8px 10px; 
                    border-radius: 6px; 
                    border: 1px solid var(--danger-color, #dc3545);
                    background-color: transparent;
                    color: var(--danger-color, #dc3545);
                    transition: all 0.2s ease;
                    cursor: pointer;
                    min-width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                // Delete button hover effects
                deleteBtn.addEventListener('mouseenter', () => {
                    if (!deleteBtn.disabled) {
                        deleteBtn.style.backgroundColor = 'var(--danger-color, #dc3545)';
                        deleteBtn.style.color = 'white';
                        deleteBtn.style.transform = 'translateY(-1px)';
                        deleteBtn.style.boxShadow = '0 2px 4px rgba(220,53,69,0.3)';
                    }
                });
                deleteBtn.addEventListener('mouseleave', () => {
                    if (!deleteBtn.disabled) {
                        deleteBtn.style.backgroundColor = 'transparent';
                        deleteBtn.style.color = 'var(--danger-color, #dc3545)';
                        deleteBtn.style.transform = 'translateY(0)';
                        deleteBtn.style.boxShadow = 'none';
                    }
                });
                
                // Add multiple event handlers for redundancy
                deleteBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('Delete button clicked for user:', user);
                    openDeleteUserModal(user);
                });
                
                // Also set onclick property
                deleteBtn.onclick = function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('Delete button onclick property triggered for user:', user);
                    openDeleteUserModal(user);
                    return false;
                };
                
                // Don't allow editing or deleting self, and disable actions for the owner
                const currentUser = window.auth.getCurrentUser();
                const isOwner = user.is_owner;
                const isCurrentUser = (user.id === currentUser.id);

                console.log(`DEBUG: Button logic for ${user.username} - isOwner: ${isOwner}, isCurrentUser: ${isCurrentUser}, currentUser.id: ${currentUser?.id}, user.id: ${user.id}`);

                if (isOwner || isCurrentUser) {
                    editBtn.disabled = true;
                    deleteBtn.disabled = true;
                    editBtn.title = isOwner ? 'Cannot edit the application owner' : 'Cannot edit yourself';
                    deleteBtn.title = isOwner ? 'Cannot delete the application owner' : 'Cannot delete yourself';
                    
                    // Enhanced disabled styling
                    editBtn.style.opacity = '0.4';
                    editBtn.style.cursor = 'not-allowed';
                    editBtn.style.border = '1px solid var(--text-muted, #6c757d)';
                    editBtn.style.color = 'var(--text-muted, #6c757d)';
                    
                    deleteBtn.style.opacity = '0.4';
                    deleteBtn.style.cursor = 'not-allowed';
                    deleteBtn.style.border = '1px solid var(--text-muted, #6c757d)';
                    deleteBtn.style.color = 'var(--text-muted, #6c757d)';
                    
                    console.log('DEBUG: Disabled edit/delete for', isOwner ? 'owner' : 'current user', ':', user.id);
                } else {
                    console.log('DEBUG: Buttons enabled for user:', user.id);
                }
                
                // Add buttons to container
                buttonContainer.appendChild(editBtn);
                buttonContainer.appendChild(deleteBtn);
                
                // Add container to cell
                actionsCell.appendChild(buttonContainer);
                row.appendChild(actionsCell);
                
                usersTableBody.appendChild(row);
            });
            
            console.log('Users loaded successfully:', users.length);
            
            // Set up ownership management after loading users
            setupOwnershipManagement(users);
        } else {
            console.error('Failed to load users:', response.status);
            showToast('Failed to load users', 'error');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Error loading users', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Open edit user modal
 * @param {Object} user - The user to edit
 */
function openEditUserModal(user) {
    editUserId.value = user.id;
    editUsername.value = user.username;
    editEmail.value = user.email;
    editUserActive.checked = user.is_active;
    editUserAdmin.checked = user.is_admin;
    
    openModal(editUserModal);
}

/**
 * Save user changes
 */
async function saveUserChanges() {
    const userId = editUserId.value;
    
    if (!userId) {
        showToast('User ID is missing', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${window.auth.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                is_active: editUserActive.checked,
                is_admin: editUserAdmin.checked
            })
        });
        
        if (response.ok) {
            showToast('User updated successfully', 'success');
            closeAllModals();
            loadUsers();
        } else {
            const errorData = await response.json();
            showToast(errorData.message || 'Failed to update user', 'error');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        showToast('Failed to update user. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Open delete user modal
 * @param {Object} user - User object
 */
function openDeleteUserModal(user) {
    console.log('Opening delete modal for user:', user);
    
    // Store the user ID in a global variable for easier access
    window.currentDeleteUserId = user.id;
    console.log('Set global currentDeleteUserId to:', user.id);
    
    // Set the user ID in the form
    const deleteUserIdField = document.getElementById('deleteUserId');
    if (deleteUserIdField) {
        deleteUserIdField.value = user.id;
        console.log('Set deleteUserId field to:', user.id);
    } else {
        console.error('deleteUserId field not found in the DOM');
    }
    
    // Display user ID for debugging
    const displayUserIdField = document.getElementById('displayUserId');
    if (displayUserIdField) {
        displayUserIdField.textContent = user.id;
        console.log('Set displayUserId field to:', user.id);
    }
    
    // Also set in editUserId for backward compatibility
    if (editUserId) {
        editUserId.value = user.id;
        console.log('Set editUserId.value to:', user.id);
    }
    
    // Set the username in the modal
    const deleteUserNameElement = document.getElementById('deleteUserName');
    if (deleteUserNameElement) {
        deleteUserNameElement.textContent = user.username;
        console.log('Set deleteUserName to:', user.username);
    } else {
        console.error('deleteUserName element not found in the DOM');
    }
    
    // Make sure the modal is visible
    const deleteUserModal = document.getElementById('deleteUserModal');
    if (deleteUserModal) {
        // First ensure all modals are closed
        closeAllModals();
        
        // Then open this modal
        deleteUserModal.style.display = 'flex';
        console.log('Delete user modal opened');
        
        // Ensure the delete button has the correct click handler
        const confirmDeleteUserBtn = document.getElementById('confirmDeleteUserBtn');
        if (confirmDeleteUserBtn) {
            // Remove existing event listeners by cloning
            const newBtn = confirmDeleteUserBtn.cloneNode(true);
            confirmDeleteUserBtn.parentNode.replaceChild(newBtn, confirmDeleteUserBtn);
            
            // Add the click event listener
            newBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Delete button clicked for user ID:', user.id);
                deleteUser();
                return false;
            });
            
            // Also set the direct onclick attribute as a simple function call
            newBtn.setAttribute('onclick', 'console.log("Direct onclick attribute clicked"); deleteUser(); return false;');
            console.log('Added click event listener to delete button');
            
            // Add a direct click handler
            newBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Direct onclick property handler clicked for user ID:', user.id);
                deleteUser();
                return false;
            };
        } else {
            console.error('confirmDeleteUserBtn not found in the DOM');
        }
        
        // Set up the direct delete link
        const directDeleteLink = document.getElementById('directDeleteLink');
        if (directDeleteLink) {
            directDeleteLink.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Direct delete link clicked for user ID:', user.id);
                deleteUser();
                return false;
            };
            console.log('Added onclick handler to direct delete link');
        }
        
        // Set up the direct API link
        const directAPILink = document.getElementById('directAPILink');
        if (directAPILink) {
            directAPILink.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Direct API link clicked for user ID:', user.id);
                directDeleteUserAPI(user.id);
                return false;
            };
            console.log('Added onclick handler to direct API link');
        }
        
        // Also set up form submit handler
        const deleteUserForm = document.getElementById('deleteUserForm');
        if (deleteUserForm) {
            deleteUserForm.onsubmit = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Delete user form submitted for user ID:', user.id);
                deleteUser();
                return false;
            };
            console.log('Added onsubmit handler to delete user form');
        }
        
        // Add a direct click handler to the modal for event delegation
        deleteUserModal.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'confirmDeleteUserBtn') {
                e.preventDefault();
                e.stopPropagation();
                console.log('Delete button clicked through modal event delegation for user ID:', user.id);
                deleteUser();
                return false;
            }
        });
    } else {
        console.error('deleteUserModal not found in the DOM');
    }
}

/**
 * Delete user
 */
function deleteUser() {
    console.log('=== DELETE USER FUNCTION STARTED ===');
    console.log('Function caller:', arguments.callee.caller ? arguments.callee.caller.name : 'unknown');
    
    try {
        // Get the user ID from various possible sources
        const userId = window.currentDeleteUserId || 
                    (document.getElementById('deleteUserId') ? document.getElementById('deleteUserId').value : null) ||
                    (document.getElementById('editUserId') ? document.getElementById('editUserId').value : null) ||
                    (document.getElementById('displayUserId') ? document.getElementById('displayUserId').textContent : null);
        
        console.log('Final User ID to delete:', userId);
        
        if (!userId) {
            showToast('User ID is missing', 'error');
            console.error('Delete user failed: User ID is missing');
            return;
        }
        
        console.log('Starting user deletion process for ID:', userId);
        showLoading();
        
        // Use our improved deletion function
        superEmergencyDelete(userId)
            .then(success => {
                if (success) {
                    console.log('User deletion successful');
                    showToast('User deleted successfully', 'success');
                    closeAllModals();
                    loadUsers(); // Refresh the user list
                    
                    // Refresh the users list if it's currently displayed
                    const usersModal = document.querySelector('div[style*="z-index: 10000"]');
                    if (usersModal) {
                        document.body.removeChild(usersModal);
                        showUsersList();
                    }
                } else {
                    console.error('User deletion failed');
                    showToast('Failed to delete user. Check console for details.', 'error');
                }
                hideLoading();
            })
            .catch(error => {
                console.error('Error during user deletion:', error);
                showToast(window.t('messages.error_during_user_deletion', { error: error.message }), 'error');
                hideLoading();
                
                // Try the direct API call as a fallback
                if (confirm('Would you like to try a direct API call to delete the user?')) {
                    const directToast = showToast(`Trying direct API call for user ID ${userId}...`, 'info', 0);
                    
                    directDeleteUserAPI(userId)
                        .then(directSuccess => {
                            directToast.remove();
                            
                            if (directSuccess) {
                                showToast(`User ID ${userId} deleted successfully with direct API call!`, 'success');
                                
                                // Refresh the users list if it's currently displayed
                                const usersModal = document.querySelector('div[style*="z-index: 10000"]');
                                if (usersModal) {
                                    document.body.removeChild(usersModal);
                                    setTimeout(() => {
                                        showUsersList();
                                    }, 500);
                                }
                            } else {
                                showToast(window.t('messages.failed_to_delete_user_with_direct_api_call', { username: user.username }), 'error');
                            }
                        })
                        .catch(error => {
                            directToast.remove();
                            console.error('Error with direct API call:', error);
                            showToast('Error with direct API call: ' + error.message, 'error');
                        });
                }
            })
            .catch(error => {
                console.error('Error checking if user exists:', error);
                showToast('Error checking if user exists: ' + error.message, 'error');
            });
    } catch (error) {
        console.error('Error in deleteUser function:', error);
        console.error('Error details:', error.message, error.stack);
        showToast('Failed to delete user. Please try again.', 'error');
        hideLoading();
    }
    
    console.log('=== DELETE USER FUNCTION COMPLETED ===');
}

/**
 * Set up ownership management functionality
 * @param {Array} users - List of all users
 */
function setupOwnershipManagement(users) {
    const currentUser = window.auth.getCurrentUser();
    const ownershipCard = document.getElementById('ownershipCard');
    const newOwnerSelect = document.getElementById('newOwnerSelect');
    const transferOwnershipBtn = document.getElementById('transferOwnershipBtn');
    
    // DEBUG: Check ownership management setup
    console.log('DEBUG: setupOwnershipManagement called');
    console.log('DEBUG: currentUser:', currentUser);
    console.log('DEBUG: currentUser.is_owner:', currentUser ? currentUser.is_owner : 'no currentUser');
    console.log('DEBUG: ownershipCard element:', ownershipCard);
    
    if (!currentUser || !currentUser.is_owner) {
        // Hide ownership section if user is not the owner
        console.log('DEBUG: Hiding ownership section - user is not owner');
        const ownershipSection = document.getElementById('ownershipSection');
        if (ownershipSection) {
            ownershipSection.style.display = 'none';
        }
        return;
    }
    
    // Show ownership section for the owner
    const ownershipSection = document.getElementById('ownershipSection');
    if (ownershipSection) {
        ownershipSection.style.display = 'block';
    }
    
    // Populate the select dropdown with admin users (excluding current owner)
    if (newOwnerSelect) {
        newOwnerSelect.innerHTML = '<option value="">Select an admin user...</option>';
        
        users.forEach(user => {
            if (user.is_admin && user.id !== currentUser.id && user.is_active && !user.is_owner) {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.username} (${user.email})`;
                newOwnerSelect.appendChild(option);
            }
        });
        
        // Enable/disable transfer button based on selection
        newOwnerSelect.addEventListener('change', function() {
            if (transferOwnershipBtn) {
                transferOwnershipBtn.disabled = !this.value;
            }
        });
    }
    
    // Set up transfer button click handler
    if (transferOwnershipBtn) {
        transferOwnershipBtn.addEventListener('click', function() {
            const selectedUserId = newOwnerSelect.value;
            if (!selectedUserId) {
                showToast('Please select a user to transfer ownership to', 'error');
                return;
            }
            
            const selectedUser = users.find(u => u.id == selectedUserId);
            if (selectedUser) {
                openTransferOwnershipModal(selectedUser);
            }
        });
    }
}

/**
 * Open the transfer ownership confirmation modal
 * @param {Object} targetUser - The user to transfer ownership to
 */
function openTransferOwnershipModal(targetUser) {
    const modal = document.getElementById('transferOwnershipModal');
    const targetUsernameSpan = document.getElementById('transferTargetUsername');
    const confirmInput = document.getElementById('transferConfirmInput');
    const confirmBtn = document.getElementById('confirmTransferOwnershipBtn');
    
    if (!modal || !targetUsernameSpan || !confirmInput || !confirmBtn) {
        showToast('Error: Transfer ownership modal elements not found', 'error');
        return;
    }
    
    // Set target username
    targetUsernameSpan.textContent = targetUser.username;
    
    // Clear and set up confirm input
    confirmInput.value = '';
    confirmInput.addEventListener('input', function() {
        confirmBtn.disabled = this.value.toUpperCase() !== 'TRANSFER';
    });
    
    // Set up confirm button
    confirmBtn.disabled = true;
    confirmBtn.onclick = function() {
        if (confirmInput.value.toUpperCase() === 'TRANSFER') {
            performOwnershipTransfer(targetUser.id);
        }
    };
    
    // Show modal
    modal.style.display = 'flex';
}

/**
 * Perform the actual ownership transfer
 * @param {number} newOwnerId - ID of the user to transfer ownership to
 */
async function performOwnershipTransfer(newOwnerId) {
    const modal = document.getElementById('transferOwnershipModal');
    
    try {
        showLoading();
        
        const response = await fetch('/api/admin/transfer-ownership', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.auth.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                new_owner_id: newOwnerId
            })
        });
        
        if (response.ok) {
            showToast('Ownership transferred successfully! Refreshing page...', 'success');
            
            // Close modal
            if (modal) {
                modal.style.display = 'none';
            }
            
            // Refresh the page after a short delay to allow the user to see the success message
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            const errorData = await response.json();
            showToast(errorData.message || 'Failed to transfer ownership', 'error');
        }
    } catch (error) {
        console.error('Error transferring ownership:', error);
        showToast('Failed to transfer ownership. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Super emergency delete function for user deletion
 * @param {string|number} userId - The user ID or username to delete
 * @returns {Promise<boolean>} - Promise that resolves to true if deletion was successful, false otherwise
 */
function superEmergencyDelete(userId) {
    console.log('=== SUPER EMERGENCY DELETE STARTED ===');
    console.log('User ID or username to delete:', userId);
    
    return new Promise((resolve, reject) => {
        if (!userId) {
            console.error('No user ID provided');
            reject(new Error('No user ID provided'));
            return;
        }
        
        // Check if the input is a username rather than a numeric ID
        if (isNaN(userId)) {
            console.log('Input appears to be a username, not a numeric ID');
            // Try to find the user ID by username using the Promise-based function
            findUserIdByUsernameAsync(userId)
                .then(numericId => {
                    if (numericId) {
                        console.log(`Found numeric ID ${numericId} for username ${userId}`);
                        // Call this function again with the numeric ID
                        return superEmergencyDelete(numericId);
                    } else {
                        throw new Error(`Could not find a user with username "${userId}"`);
                    }
                })
                .then(resolve)
                .catch(reject);
            return;
        }
        
        console.log('Proceeding with numeric user ID:', userId);
        
        // Get the token
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.error('Authentication token is missing');
            reject(new Error('Authentication token is missing'));
            return;
        }
        
        // Create a new XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open('DELETE', `/api/admin/users/${userId}`, true);
        
        // Set headers
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/json');
        
        // Set up event handlers
        xhr.onload = function() {
            console.log('XHR status:', xhr.status);
            console.log('XHR response text:', xhr.responseText);
            
            if (xhr.status >= 200 && xhr.status < 300) {
                console.log('User deletion successful');
                resolve(true);
            } else {
                console.error('User deletion failed with status:', xhr.status);
                let errorMessage = 'Unknown error';
                try {
                    const response = JSON.parse(xhr.responseText);
                    errorMessage = response.message || response.error || 'Unknown error';
                } catch (e) {
                    errorMessage = xhr.responseText || 'Unknown error';
                }
                console.error('Error message:', errorMessage);
                resolve(false); // Resolve with false instead of rejecting to handle the error in a controlled way
            }
        };
        
        xhr.onerror = function() {
            console.error('Network error during user deletion');
            reject(new Error('Network error during user deletion'));
        };
        
        xhr.ontimeout = function() {
            console.error('Request timeout during user deletion');
            reject(new Error('Request timeout during user deletion'));
        };
        
        // Send the request
        xhr.send();
        console.log('Delete request sent for user ID:', userId);
    });
}

/**
 * Find a user's numeric ID by their username
 * @param {string} username - The username to look up
 * @param {function} callback - Callback function that receives the numeric ID or null if not found
 */
function findUserIdByUsername(username, callback) {
    console.log('=== FIND USER ID BY USERNAME STARTED ===');
    console.log('Looking up user ID for username:', username);
    
    // Get the token
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.error('Authentication token is missing');
        callback(null);
        return;
    }
    
    // Fetch the list of users
    fetch('/api/admin/users', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            console.error('Failed to fetch users list:', response.status);
            callback(null);
            return null;
        }
        return response.json();
    })
    .then(users => {
        if (!users) {
            callback(null);
            return;
        }
        
        console.log('Fetched users list:', users);
        
        // Find the user with the matching username
        const user = users.find(u => u.username === username);
        
        if (user) {
            console.log('Found user:', user);
            callback(user.id);
        } else {
            console.error('User not found with username:', username);
            callback(null);
        }
    })
    .catch(error => {
        console.error('Error fetching users:', error);
        callback(null);
    });
    
    console.log('=== FIND USER ID BY USERNAME COMPLETED ===');
}

/**
 * Check admin permissions
 */
function checkAdminPermissions() {
    console.log('=== CHECK ADMIN PERMISSIONS STARTED ===');
    
    // Get the token
    const token = localStorage.getItem('auth_token');
    if (!token) {
        alert('Error: Authentication token is missing');
        return;
    }
    
    // Get the current user info
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    console.log('Current user info:', userInfo);
    
    // Check if the user is an admin
    if (userInfo.is_admin) {
        console.log('User is an admin');
        alert('You are an admin user');
    } else {
        console.log('User is not an admin');
        alert('You are not an admin user');
    }
    
    // Make a request to the admin endpoint to verify permissions
    fetch('/api/admin/users', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        console.log('Admin check response status:', response.status);
        
        if (response.ok) {
            console.log('Admin endpoint access successful');
            alert('You have access to the admin endpoint');
        } else {
            console.error('Admin endpoint access failed');
            alert('You do not have access to the admin endpoint');
        }
        
        return response.text().catch(() => '');
    })
    .then(text => {
        console.log('Admin check response text:', text);
    })
    .catch(error => {
        console.error('Admin check error:', error);
        alert('Error checking admin permissions: ' + error.message);
    });
    
    console.log('=== CHECK ADMIN PERMISSIONS COMPLETED ===');
}

/**
 * Show a list of users in the system
 */
function showUsersList() {
    console.log('=== SHOW USERS LIST STARTED ===');
    
    // Get the token
    const token = localStorage.getItem('auth_token');
    if (!token) {
        alert('Error: Authentication token is missing');
        return;
    }
    
    // Fetch the list of users
    fetch('/api/admin/users', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            console.error('Failed to fetch users list:', response.status);
            alert('Failed to fetch users list. Status: ' + response.status);
            return null;
        }
        return response.json();
    })
    .then(users => {
        if (!users) return;
        
        console.log('Fetched users list:', users);
        
        // Check if dark mode is enabled
        const isDarkMode = document.body.classList.contains('dark-mode');
        
        // Set colors based on theme
        const backgroundColor = isDarkMode ? '#333' : 'white';
        const textColor = isDarkMode ? '#fff' : '#000';
        const borderColor = isDarkMode ? '#555' : '#ddd';
        
        // Create a modal to display the users
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '10000';
        
        // Create the modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = backgroundColor;
        modalContent.style.color = textColor;
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '5px';
        modalContent.style.maxWidth = '80%';
        modalContent.style.maxHeight = '80%';
        modalContent.style.overflow = 'auto';
        
        // Create the modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '20px';
        
        // Create the modal title
        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Users List';
        modalTitle.style.color = textColor;
        
        // Create the close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.color = textColor;
        closeButton.addEventListener('click', function() {
            document.body.removeChild(modal);
        });
        
        // Add the title and close button to the header
        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);
        
        // Create the table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        
        // Create the table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Create the header cells
        const headers = ['ID', 'Username', 'Email', 'Name', 'Admin', 'Active', 'Actions'];
        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            th.style.padding = '10px';
            th.style.textAlign = 'left';
            th.style.borderBottom = `1px solid ${borderColor}`;
            th.style.color = textColor;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create the table body
        const tbody = document.createElement('tbody');
        
        // Add a row for each user
        users.forEach(user => {
            const row = document.createElement('tr');
            
            // Create cells for each property
            const idCell = document.createElement('td');
            idCell.textContent = user.id;
            idCell.style.padding = '10px';
            idCell.style.borderBottom = `1px solid ${borderColor}`;
            idCell.style.color = textColor;
            
            const usernameCell = document.createElement('td');
            usernameCell.textContent = user.username;
            usernameCell.style.padding = '10px';
            usernameCell.style.borderBottom = `1px solid ${borderColor}`;
            usernameCell.style.color = textColor;
            
            const emailCell = document.createElement('td');
            emailCell.textContent = user.email;
            emailCell.style.padding = '10px';
            emailCell.style.borderBottom = `1px solid ${borderColor}`;
            emailCell.style.color = textColor;
            
            const nameCell = document.createElement('td');
            nameCell.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || '-';
            nameCell.style.padding = '10px';
            nameCell.style.borderBottom = `1px solid ${borderColor}`;
            nameCell.style.color = textColor;
            
            const adminCell = document.createElement('td');
            adminCell.textContent = user.is_admin ? 'Yes' : 'No';
            adminCell.style.padding = '10px';
            adminCell.style.borderBottom = `1px solid ${borderColor}`;
            adminCell.style.color = textColor;
            
            const activeCell = document.createElement('td');
            activeCell.textContent = user.is_active ? 'Yes' : 'No';
            activeCell.style.padding = '10px';
            activeCell.style.borderBottom = `1px solid ${borderColor}`;
            activeCell.style.color = textColor;
            
            const actionsCell = document.createElement('td');
            actionsCell.style.padding = '10px';
            actionsCell.style.borderBottom = `1px solid ${borderColor}`;
            
            // Create a delete button
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.style.backgroundColor = '#dc3545';
            deleteButton.style.color = 'white';
            deleteButton.style.border = 'none';
            deleteButton.style.padding = '5px 10px';
            deleteButton.style.borderRadius = '3px';
            deleteButton.style.cursor = 'pointer';
            
            // Don't allow deleting the current user
            const currentUser = JSON.parse(localStorage.getItem('user_info') || '{}');
            if (user.id === currentUser.id) {
                deleteButton.disabled = true;
                deleteButton.style.opacity = '0.5';
                deleteButton.style.cursor = 'not-allowed';
                deleteButton.title = 'Cannot delete yourself';
            } else {
                deleteButton.addEventListener('click', function() {
                    if (confirm(`Are you sure you want to delete user ${user.username} (ID: ${user.id})?`)) {
                        document.body.removeChild(modal);
                        
                        // First check if the user still exists
                        const checkingToast = showToast(`Checking if user ${user.username} still exists...`, 'info', 0);
                        
                        checkUserExists(user.id)
                            .then(existingUser => {
                                checkingToast.remove();
                                
                                if (!existingUser) {
                                    showToast(`User ${user.username} no longer exists`, 'warning');
                                    showUsersList(); // Refresh the list
                                    return;
                                }
                                
                                // User exists, proceed with deletion
                                testUserDeletion(user.id);
                            })
                            .catch(error => {
                                checkingToast.remove();
                                console.error('Error checking if user exists:', error);
                                showToast(window.t('messages.error_checking_if_user_exists', { error: error.message }), 'error');
                                
                                // Ask if they want to try deletion anyway
                                if (confirm(`Error checking if user ${user.username} exists. Try deletion anyway?`)) {
                                    testUserDeletion(user.id);
                                } else {
                                    showUsersList(); // Refresh the list
                                }
                            });
                    }
                });
            }
            
            actionsCell.appendChild(deleteButton);
            
            // Add all cells to the row
            row.appendChild(idCell);
            row.appendChild(usernameCell);
            row.appendChild(emailCell);
            row.appendChild(nameCell);
            row.appendChild(adminCell);
            row.appendChild(activeCell);
            row.appendChild(actionsCell);
            
            // Add the row to the table body
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        
        // Add the header and table to the modal content
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(table);
        
        // Add the modal content to the modal
        modal.appendChild(modalContent);
        
        // Add the modal to the page
        document.body.appendChild(modal);
        
        console.log('Users list displayed');
    })
    .catch(error => {
        console.error('Error fetching users:', error);
        alert('Error fetching users: ' + error.message);
    });
    
    console.log('=== SHOW USERS LIST COMPLETED ===');
}

/**
 * Promise-based version of findUserIdByUsername
 * @param {string} username - The username to look up
 * @returns {Promise<number|null>} - Promise that resolves to the user ID or null if not found
 */
function findUserIdByUsernameAsync(username) {
    return new Promise((resolve, reject) => {
        findUserIdByUsername(username, (err, userId) => {
            if (err) reject(err);
            else resolve(userId);
        });
    });
}

/**
 * Check if a user exists by ID or username
 * @param {string|number} userIdOrUsername - The user ID or username to check
 * @returns {Promise<Object|null>} - Promise that resolves to the user object if found, null otherwise
 */
function checkUserExists(userIdOrUsername) {
    console.log('=== CHECK USER EXISTS STARTED ===');
    console.log('Checking if user exists:', userIdOrUsername);
    
    return new Promise((resolve, reject) => {
        // Get the token
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.error('Authentication token is missing');
            reject(new Error('Authentication token is missing'));
            return;
        }
        
        // Fetch the list of users
        fetch('/api/admin/users', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                console.error('Failed to fetch users list:', response.status);
                reject(new Error(`Failed to fetch users list: ${response.status}`));
                return null;
            }
            return response.json();
        })
        .then(users => {
            if (!users) {
                resolve(null);
                return;
            }
            
            console.log('Fetched users list for checking existence');
            
            // Check if the input is a numeric ID
            if (!isNaN(userIdOrUsername)) {
                // Convert to number for comparison
                const userId = Number(userIdOrUsername);
                const user = users.find(u => u.id === userId);
                
                if (user) {
                    console.log('Found user by ID:', user);
                    resolve(user);
                } else {
                    console.log('User not found with ID:', userId);
                    resolve(null);
                }
            } else {
                // Assume it's a username
                const user = users.find(u => u.username === userIdOrUsername);
                
                if (user) {
                    console.log('Found user by username:', user);
                    resolve(user);
                } else {
                    console.log('User not found with username:', userIdOrUsername);
                    resolve(null);
                }
            }
        })
        .catch(error => {
            console.error('Error checking if user exists:', error);
            reject(error);
        });
    });
}

/**
 * Test user deletion functionality
 * @param {string|number} userId - The user ID or username to delete
 */
function testUserDeletion(userId) {
    console.log('=== TEST USER DELETION STARTED ===');
    console.log('Attempting to delete user:', userId);
    
    // Check if we have a valid user ID
    if (!userId) {
        console.error('No user ID provided');
        alert('Error: No user ID provided');
        return;
    }
    
    // Show a loading indicator
    const loadingToast = showToast('Checking user...', 'info', 0); // 0 means no auto-hide
    
    // First check if the user exists
    checkUserExists(userId)
        .then(user => {
            if (!user) {
                loadingToast.remove();
                showToast(`User with ID/username "${userId}" not found`, 'error');
                return;
            }
            
            // Update the loading toast
            loadingToast.remove();
            const deletingToast = showToast(`Deleting user ${user.username} (ID: ${user.id})...`, 'info', 0);
            
            // Use our improved deletion function with the numeric ID
            return superEmergencyDelete(user.id)
                .then(success => {
                    // Hide the loading toast
                    if (deletingToast) {
                        deletingToast.remove();
                    }
                    
                    if (success) {
                        console.log('User deletion successful');
                        showToast(`User ${user.username} deleted successfully!`, 'success');
                        
                        // Refresh the users list if it's currently displayed
                        const usersModal = document.querySelector('div[style*="z-index: 10000"]');
                        if (usersModal) {
                            document.body.removeChild(usersModal);
                            setTimeout(() => {
                                showUsersList();
                            }, 500);
                        }
                    } else {
                        console.error('User deletion failed');
                        showToast(`Failed to delete user ${user.username}. Check console for details.`, 'error');
                        
                        // Offer to try direct API call
                        if (confirm(`Would you like to try a direct API call to delete user ${user.username}?`)) {
                            const directToast = showToast(`Trying direct API call for user ${user.username}...`, 'info', 0);
                            
                            directDeleteUserAPI(user.id)
                                .then(directSuccess => {
                                    directToast.remove();
                                    
                                    if (directSuccess) {
                                        showToast(`User ${user.username} deleted successfully with direct API call!`, 'success');
                                        
                                        // Refresh the users list if it's currently displayed
                                        const usersModal = document.querySelector('div[style*="z-index: 10000"]');
                                        if (usersModal) {
                                            document.body.removeChild(usersModal);
                                            setTimeout(() => {
                                                showUsersList();
                                            }, 500);
                                        }
                                    } else {
                                        showToast(window.t('messages.failed_to_delete_user_with_direct_api_call', { username: user.username }), 'error');
                                    }
                                })
                                .catch(error => {
                                    directToast.remove();
                                    console.error('Error with direct API call:', error);
                                    showToast('Error with direct API call: ' + error.message, 'error');
                                });
                        }
                    }
                })
                .catch(error => {
                    // Hide the loading toast
                    if (deletingToast) {
                        deletingToast.remove();
                    }
                    
                    console.error('Error during user deletion:', error);
                    showToast('Error during user deletion: ' + error.message, 'error');
                });
        })
        .catch(error => {
            loadingToast.remove();
            console.error('Error checking if user exists:', error);
            showToast('Error checking if user exists: ' + error.message, 'error');
        });
    
    console.log('=== TEST USER DELETION COMPLETED ===');
}

/**
 * Close all modals
 */
function closeAllModals() {
    console.log('Closing all modals');
    
    // Get all modals
    const modals = document.querySelectorAll('.modal-backdrop');
    
    // Close each modal
    modals.forEach(modal => {
        console.log('Closing modal:', modal.id);
        modal.style.display = 'none';
    });
    
    // Also reset any form fields
    if (deleteConfirmInput) {
        deleteConfirmInput.value = '';
        if (confirmDeleteAccountBtn) {
            confirmDeleteAccountBtn.disabled = true;
        }
    }
    
    // Reset password form
    resetPasswordForm();
    
    console.log('All modals closed');
}

/**
 * Load site settings
 */
async function loadSiteSettings() {
    console.log('Loading site settings...');
    
    // Enhanced debugging for element availability
    console.log('[SiteSettings Debug] DOM readiness check:');
    console.log('  - document.readyState:', document.readyState);
    console.log('  - adminSection exists:', !!document.getElementById('adminSection'));
    console.log('  - registrationEnabled exists:', !!document.getElementById('registrationEnabled'));
    console.log('  - oidcEnabled exists:', !!document.getElementById('oidcEnabled'));
    console.log('  - oidcProviderName exists:', !!document.getElementById('oidcProviderName'));
    console.log('  - oidcClientId exists:', !!document.getElementById('oidcClientId'));
    
    // Query elements locally within this function scope for population
    const registrationToggleElem = document.getElementById('registrationEnabled');
    const emailBaseUrlFieldElem = document.getElementById('emailBaseUrl');
    const globalViewToggleElem = document.getElementById('globalViewEnabled');
    const globalViewAdminOnlyToggleElem = document.getElementById('globalViewAdminOnly');
    const oidcEnabledToggleElem = document.getElementById('oidcEnabled');
    const oidcOnlyModeToggleElem = document.getElementById('oidcOnlyMode');
    const oidcProviderNameInputElem = document.getElementById('oidcProviderName');
    const oidcClientIdInputElem = document.getElementById('oidcClientId');
    const oidcClientSecretInputElem = document.getElementById('oidcClientSecret');
    const oidcIssuerUrlInputElem = document.getElementById('oidcIssuerUrl');
    const oidcScopeInputElem = document.getElementById('oidcScope');
    const oidcAdminGroupInputElem = document.getElementById('oidcAdminGroup');

    try {
        showLoading();
        
        const response = await fetch('/api/admin/settings', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 403) {
            // User is not admin, hide admin settings sections
            console.log('User is not admin, hiding admin settings sections');
            const adminSection = document.getElementById('adminSection');
            if (adminSection) {
                adminSection.style.display = 'none';
            }
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Failed to load site settings: ${response.status} ${response.statusText}`);
        }
        
        const settings = await response.json();
        console.log('[SiteSettings] Raw settings received from API:', settings);
        
        if (registrationToggleElem) {
            registrationToggleElem.checked = settings.registration_enabled === 'true';
        } else {
            console.error('[SiteSettings] registrationEnabled element NOT FOUND locally.');
        }
        
        if (emailBaseUrlFieldElem) { 
            emailBaseUrlFieldElem.value = settings.email_base_url || 'http://localhost:8080'; 
        } else {
            console.error('[SiteSettings] emailBaseUrl element NOT FOUND locally.');
        }

        if (globalViewToggleElem) {
            globalViewToggleElem.checked = settings.global_view_enabled === 'true';
        } else {
            console.error('[SiteSettings] globalViewEnabled element NOT FOUND locally.');
        }

        if (globalViewAdminOnlyToggleElem) {
            globalViewAdminOnlyToggleElem.checked = settings.global_view_admin_only === 'true';
        } else {
            console.error('[SiteSettings] globalViewAdminOnly element NOT FOUND locally.');
        }

        // Populate OIDC settings using locally-scoped element variables
        if (oidcEnabledToggleElem) {
            console.log('[OIDC Settings] Found oidcEnabledToggleElem. Setting checked to:', settings.oidc_enabled === 'true');
            oidcEnabledToggleElem.checked = settings.oidc_enabled === 'true';
        } else {
            console.error('[OIDC Settings] oidcEnabledToggleElem element NOT FOUND locally.');
        }

        if (oidcOnlyModeToggleElem) {
            console.log('[OIDC Settings] Found oidcOnlyModeToggleElem. Setting checked to:', settings.oidc_only_mode === 'true');
            oidcOnlyModeToggleElem.checked = settings.oidc_only_mode === 'true';
        } else {
            console.error('[OIDC Settings] oidcOnlyModeToggleElem element NOT FOUND locally.');
        }

        if (oidcProviderNameInputElem) {
            console.log('[OIDC Settings] Found oidcProviderNameInputElem. Setting value to:', settings.oidc_provider_name || 'oidc');
            oidcProviderNameInputElem.value = settings.oidc_provider_name || 'oidc';
        } else {
            console.error('[OIDC Settings] oidcProviderNameInputElem element NOT FOUND locally.');
        }

        if (oidcClientIdInputElem) {
            console.log('[OIDC Settings] Found oidcClientIdInputElem. Setting value to:', settings.oidc_client_id || '');
            oidcClientIdInputElem.value = settings.oidc_client_id || '';
        } else {
            console.error('[OIDC Settings] oidcClientIdInputElem element NOT FOUND locally.');
        }

        if (oidcClientSecretInputElem) {
            console.log('[OIDC Settings] Found oidcClientSecretInputElem. Setting placeholder based on oidc_client_secret_set:', settings.oidc_client_secret_set);
            oidcClientSecretInputElem.value = ''; // Always clear on load
            oidcClientSecretInputElem.placeholder = settings.oidc_client_secret_set ? '******** (Set - Enter new to change)' : 'Enter OIDC Client Secret';
        } else {
            console.error('[OIDC Settings] oidcClientSecretInputElem element NOT FOUND locally.');
        }

        if (oidcIssuerUrlInputElem) {
            console.log('[OIDC Settings] Found oidcIssuerUrlInputElem. Setting value to:', settings.oidc_issuer_url || '');
            oidcIssuerUrlInputElem.value = settings.oidc_issuer_url || '';
        } else {
            console.error('[OIDC Settings] oidcIssuerUrlInputElem element NOT FOUND locally.');
        }

        if (oidcScopeInputElem) {
            console.log('[OIDC Settings] Found oidcScopeInputElem. Setting value to:', settings.oidc_scope || 'openid email profile');
            oidcScopeInputElem.value = settings.oidc_scope || 'openid email profile';
        } else {
            console.error('[OIDC Settings] oidcScopeInputElem element NOT FOUND locally.');
        }

        if (oidcAdminGroupInputElem) {
            console.log('[OIDC Settings] Found oidcAdminGroupInputElem. Setting value to:', settings.oidc_admin_group || '');
            oidcAdminGroupInputElem.value = settings.oidc_admin_group || '';
        } else {
            console.error('[OIDC Settings] oidcAdminGroupInputElem element NOT FOUND locally.');
        }
        
        console.log('Site and OIDC settings loaded and population attempted using locally queried elements.');
        
    } catch (error) { 
        console.error('Error loading or populating site settings:', error);
        showToast('Failed to load site settings. Please try again.', 'error');
    } finally { 
        hideLoading();
    }
}

/**
 * Save site settings (non-OIDC part)
 */
async function saveSiteSettings() {
    console.log('Saving site settings (non-OIDC)...');
    const registrationToggle = document.getElementById('registrationEnabled');
    const emailBaseUrlField = document.getElementById('emailBaseUrl');
    const globalViewToggle = document.getElementById('globalViewEnabled');
    const globalViewAdminOnlyToggle = document.getElementById('globalViewAdminOnly');

    const settingsToSave = {};
    
    if (registrationToggle) {
        settingsToSave.registration_enabled = registrationToggle.checked; 
    }

    if (globalViewToggle) {
        settingsToSave.global_view_enabled = globalViewToggle.checked;
    }

    if (globalViewAdminOnlyToggle) {
        settingsToSave.global_view_admin_only = globalViewAdminOnlyToggle.checked;
    }

    if (emailBaseUrlField) {
        let baseUrl = emailBaseUrlField.value.trim();
        if (baseUrl && (baseUrl.startsWith('http://') || baseUrl.startsWith('https://'))) {
            if (baseUrl.endsWith('/')) {
                baseUrl = baseUrl.slice(0, -1);
            }
            settingsToSave.email_base_url = baseUrl;
        } else if (baseUrl) {
            showToast('Invalid Email Base URL format. It should start with http:// or https://', 'error');
            return; 
        } else {
             settingsToSave.email_base_url = 'http://localhost:8080'; 
             emailBaseUrlField.value = settingsToSave.email_base_url; 
        }
    }
    
    if (Object.keys(settingsToSave).length === 0) {
        showToast('No site settings to save.', 'info');
        return;
    }
    
    try {
        showLoading();
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        console.log('Saving site settings with token:', token ? 'present' : 'missing');
        
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settingsToSave)
        });
        
        const result = await response.json();
        if (response.ok) {
            showToast(result.message || 'Site settings saved successfully', 'success');
        } else {
            showToast(result.message || window.t('messages.failed_to_save_site_settings'), 'error');
        }
    } catch (error) {
        console.error('Error saving site settings:', error);
        showToast('Failed to save site settings. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}


/**
 * Save OIDC settings
 */
async function saveOidcSettings() {
    console.log('Saving OIDC settings...');
    const oidcSettingsPayload = {
        oidc_enabled: oidcEnabledToggle ? oidcEnabledToggle.checked : false,
        oidc_only_mode: oidcOnlyModeToggle ? oidcOnlyModeToggle.checked : false,
        oidc_provider_name: oidcProviderNameInput ? oidcProviderNameInput.value.trim() : 'oidc',
        oidc_client_id: oidcClientIdInput ? oidcClientIdInput.value.trim() : '',
        oidc_issuer_url: oidcIssuerUrlInput ? oidcIssuerUrlInput.value.trim() : '',
        oidc_scope: oidcScopeInput ? oidcScopeInput.value.trim() : 'openid email profile',
        oidc_admin_group: oidcAdminGroupInput ? oidcAdminGroupInput.value.trim() : ''
    };

    // Only include client_secret if a new value is entered
    if (oidcClientSecretInput && oidcClientSecretInput.value) {
        oidcSettingsPayload.oidc_client_secret = oidcClientSecretInput.value;
    }

    try {
        showLoading();
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        console.log('Saving OIDC settings with token:', token ? 'present' : 'missing');
        
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(oidcSettingsPayload)
        });

        const result = await response.json();
        if (response.ok) {
            showToast(result.message || 'OIDC settings saved successfully.', 'success');
            if (result.message && result.message.includes("restart is required")) {
                if(oidcRestartMessage) oidcRestartMessage.style.display = 'block';
            } else {
                if(oidcRestartMessage) oidcRestartMessage.style.display = 'none';
            }
            // Clear the secret field after attempting to save
            if (oidcClientSecretInput) oidcClientSecretInput.value = '';
            // Reload settings to get the oidc_client_secret_set flag updated
            loadSiteSettings(); 
        } else {
            showToast(result.message || 'Failed to save OIDC settings.', 'error');
        }
    } catch (error) {
        console.error('Error saving OIDC settings:', error);
        showToast('Failed to save OIDC settings. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Set up the delete button for user deletion
 */
function setupDeleteButton() {
    console.log('=== SETUP DELETE BUTTON STARTED ===');
    
    // Get the confirm delete button
    const confirmDeleteUserBtn = document.getElementById('confirmDeleteUserBtn');
    if (!confirmDeleteUserBtn) {
        console.error('confirmDeleteUserBtn not found in setupDeleteButton');
        return;
    }
    
    try {
        // Get the user ID from various possible sources
        let userId = window.currentDeleteUserId || null;
        
        if (!userId && document.getElementById('deleteUserId')) {
            userId = document.getElementById('deleteUserId').value;
        }
        
        if (!userId && document.getElementById('editUserId')) {
            userId = document.getElementById('editUserId').value;
        }
        
        if (!userId && document.getElementById('displayUserId')) {
            userId = document.getElementById('displayUserId').textContent;
        }
        
        console.log('Setting up delete button for user ID:', userId);
        
        // Remove existing event listeners by cloning
        const newBtn = confirmDeleteUserBtn.cloneNode(true);
        confirmDeleteUserBtn.parentNode.replaceChild(newBtn, confirmDeleteUserBtn);
        
        // Add new event listener
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Delete button clicked in setupDeleteButton');
            deleteUser();
            return false;
        });
        
        // Also set onclick for redundancy
        newBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Delete button clicked via onclick in setupDeleteButton');
            deleteUser();
            return false;
        };
        
        console.log('Delete button set up successfully');
    } catch (error) {
        console.error('Error setting up delete button:', error);
    }
    
    console.log('=== SETUP DELETE BUTTON COMPLETED ===');
}

/**
 * Direct API call for user deletion
 * @param {string|number} userId - The user ID or username to delete
 * @returns {Promise<boolean>} - Promise that resolves to true if deletion was successful, false otherwise
 */
function directDeleteUserAPI(userId) {
    console.log('=== DIRECT DELETE API CALL STARTED ===');
    console.log('Function caller:', arguments.callee.caller ? arguments.callee.caller.name : 'unknown');
    
    return new Promise((resolve, reject) => {
        // Try to get the user ID from multiple sources if not provided
        if (!userId) {
            const deleteUserIdField = document.getElementById('deleteUserId');
            const editUserIdField = document.getElementById('editUserId');
            const displayUserIdField = document.getElementById('displayUserId');
            
            userId = window.currentDeleteUserId;
            
            if (!userId && deleteUserIdField && deleteUserIdField.value) {
                userId = deleteUserIdField.value;
            } else if (!userId && editUserIdField && editUserIdField.value) {
                userId = editUserIdField.value;
            } else if (!userId && displayUserIdField && displayUserIdField.textContent) {
                userId = displayUserIdField.textContent;
            }
        }
        
        console.log('User ID to delete:', userId);
        
        if (!userId) {
            console.error('Direct delete API call failed: User ID is missing');
            reject(new Error('User ID is missing'));
            return;
        }
        
        // Check if the input is a username rather than a numeric ID
        if (isNaN(userId)) {
            console.log('Input appears to be a username, not a numeric ID');
            // Try to find the user ID by username
            findUserIdByUsernameAsync(userId)
                .then(numericId => {
                    if (numericId) {
                        console.log(`Found numeric ID ${numericId} for username ${userId}`);
                        // Call this function again with the numeric ID
                        return directDeleteUserAPI(numericId);
                    } else {
                        throw new Error(`Could not find a user with username "${userId}"`);
                    }
                })
                .then(resolve)
                .catch(reject);
            return;
        }
        
        console.log('Proceeding with numeric user ID:', userId);
        
        // Get the token with detailed logging
        const token = localStorage.getItem('auth_token');
        console.log('Token exists:', !!token);
        console.log('Token length:', token ? token.length : 0);
        
        if (!token) {
            console.error('Authentication token is missing');
            reject(new Error('Authentication token is missing'));
            return;
        }
        
        // Log the API endpoint
        const apiEndpoint = `/api/admin/users/${userId}`;
        console.log('Direct API endpoint:', apiEndpoint);
        
        // Create headers with detailed logging
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        console.log('Direct API request headers:', Object.keys(headers));
        
        // Make the fetch request with detailed logging
        console.log('Direct API fetch request configuration:', {
            method: 'DELETE',
            headers: Object.keys(headers),
            credentials: 'same-origin'
        });
        
        // Make a fetch API call
        fetch(apiEndpoint, {
            method: 'DELETE',
            headers: headers,
            credentials: 'same-origin' // Include cookies
        })
        .then(response => {
            console.log('Direct API response received');
            console.log('Direct API response status:', response.status);
            console.log('Direct API response status text:', response.statusText);
            console.log('Direct API response headers:', [...response.headers.entries()]);
            console.log('Direct API response type:', response.type);
            console.log('Direct API response URL:', response.url);
            
            // Get the raw text first
            return response.text().then(text => {
                console.log('Direct API raw response text:', text);
                try {
                    const data = text ? JSON.parse(text) : {};
                    return {
                        status: response.status,
                        data: data
                    };
                } catch (err) {
                    console.log('Error parsing Direct API JSON response:', err);
                    return {
                        status: response.status,
                        data: { message: text || 'No response data or invalid JSON' }
                    };
                }
            });
        })
        .then(result => {
            console.log('Direct API response data:', result);
            
            if (result.status >= 200 && result.status < 300) {
                console.log('Direct API call successful');
                resolve(true);
            } else {
                const errorMessage = result.data && result.data.message ? result.data.message : 'Failed to delete user';
                console.error('Direct API call failed:', errorMessage);
                resolve(false); // Resolve with false instead of rejecting
            }
        })
        .catch(error => {
            console.error('Direct API call error:', error);
            console.error('Direct API call error details:', error.message, error.stack);
            reject(error);
        });
    });
}

/**
 * Check if the API endpoint is accessible
 */
function checkApiEndpoint() {
    console.log('Checking API endpoint accessibility...');
    
    // Try to access a simple API endpoint
    fetch('/api/auth/validate-token', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${window.auth.getToken()}`
        }
    })
    .then(response => {
        console.log('API endpoint check response status:', response.status);
        if (response.ok) {
            console.log('API endpoint is accessible');
            showToast('API endpoint is accessible', 'success');
        } else {
            console.error('API endpoint is not accessible');
            showToast('API endpoint is not accessible. Status: ' + response.status, 'error');
        }
        return response.json().catch(() => ({}));
    })
    .then(data => {
        console.log('API endpoint check response data:', data);
    })
    .catch(error => {
        console.error('Error checking API endpoint:', error);
        showToast('Error checking API endpoint: ' + error.message, 'error');
    });
}

/**
 * Trigger warranty expiration notifications (admin only)
 */
async function triggerWarrantyNotifications() {
    console.log('Trigger warranty notifications requested');
    
    // Check if admin
    try {
        const response = await fetch('/api/auth/user', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to check user status');
        }
        
        const userData = await response.json();
        
        if (!userData.is_admin) {
            showToast('Only administrators can send warranty notifications', 'error');
            return;
        }
        
        // Show confirmation dialog
        if (!confirm('Are you sure you want to send warranty expiration notifications to all eligible users? This will immediately email users with warranties expiring soon.')) {
            return;
        }
        
        showLoading();
        
        // Call the API endpoint to trigger notifications
        const notificationResponse = await fetch('/api/admin/send-notifications', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });
        
        if (!notificationResponse.ok) {
            const errorData = await notificationResponse.json();
            throw new Error(errorData.message || 'Failed to send notifications');
        }
        
        const result = await notificationResponse.json();
        showToast(result.message || 'Notifications triggered successfully', 'success');
        
    } catch (error) {
        console.error('Error triggering notifications:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Check scheduler status (admin only)
 */
async function checkSchedulerStatus() {
    console.log('Checking scheduler status...');
    
    try {
        showLoading();
        
        const response = await fetch('/api/admin/scheduler-status', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error occurred' }));
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        const status = await response.json();
        console.log('Scheduler status:', status);
        
        // Format the status information for display
        let message = '📊 Scheduler Status Report\n\n';
        message += `🚀 Initialized: ${status.scheduler_initialized ? '✅ Yes' : '❌ No'}\n`;
        message += `🔄 Running: ${status.scheduler_running ? '✅ Yes' : '❌ No'}\n`;
        message += `📋 Active Jobs: ${status.scheduler_jobs.length}\n`;
        
        if (status.scheduler_jobs.length > 0) {
            message += '\n📅 Scheduled Jobs:\n';
            status.scheduler_jobs.forEach(job => {
                const nextRun = job.next_run_time ? 
                    new Date(job.next_run_time).toLocaleString() : 
                    'Not scheduled';
                message += `• ${job.id}: ${nextRun}\n`;
                message += `  Trigger: ${job.trigger}\n`;
            });
        }
        
        message += `\n🔧 Worker Information:\n`;
        message += `• Worker ID: ${status.worker_info.worker_id}\n`;
        message += `• Worker Name: ${status.worker_info.worker_name}\n`;
        message += `• Worker Class: ${status.worker_info.worker_class}\n`;
        message += `• Should Run Scheduler: ${status.worker_info.should_run_scheduler ? '✅ Yes' : '❌ No'}\n`;
        
        if (status.environment_vars && Object.keys(status.environment_vars).length > 0) {
            message += `\n🌍 Environment Variables:\n`;
            Object.entries(status.environment_vars).forEach(([key, value]) => {
                message += `• ${key}: ${value}\n`;
            });
        }
        
        // Show in alert dialog
        alert(message);
        
        // Also show a toast with a summary
        const summary = status.scheduler_running ? 
            '✅ Scheduler is running normally' : 
            '⚠️ Scheduler is not running - notifications may not be sent automatically';
        showToast(summary, status.scheduler_running ? 'success' : 'warning', 8000);
        
    } catch (error) {
        console.error('Error checking scheduler status:', error);
        showToast(`Error checking scheduler status: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Load available timezones from the API
 * @returns {Promise} A promise that resolves when timezones are loaded
 */
function loadTimezones() {
    return loadTimezonesIntoSelect(timezoneSelect);
}

function loadTimezonesIntoSelect(selectElement) {
    if (!selectElement) {
        return Promise.reject('Select element not provided to loadTimezonesIntoSelect');
    }
    console.log(`Loading timezones into ${selectElement.id}...`);
    return new Promise((resolve, reject) => {
        fetch('/api/timezones', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load timezones');
            }
            return response.json();
        })
        .then(timezoneGroups => {
            // Clear loading option
            selectElement.innerHTML = '';
            
            // Add timezone groups and their options
            timezoneGroups.forEach(group => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.region;
                
                group.timezones.forEach(timezone => {
                    const option = document.createElement('option');
                    option.value = timezone.value;
                    option.textContent = timezone.label;
                    optgroup.appendChild(option);
                });
                
                selectElement.appendChild(optgroup);
            });
            
            // Set the current timezone from preferences
            // Get the appropriate key prefix based on user type
            const prefix = getPreferenceKeyPrefix();
            const savedPreferences = JSON.parse(localStorage.getItem(`${prefix}preferences`) || '{}');
            
            console.log('Loading timezone preference from localStorage', {
                prefix: prefix,
                preferenceKey: `${prefix}preferences`,
                savedTimezone: savedPreferences.timezone
            });
            
            if (savedPreferences.timezone) {
                selectElement.value = savedPreferences.timezone;
                console.log(`Set ${selectElement.id} to:`, savedPreferences.timezone, 'Current value:', selectElement.value);
                resolve();
            } else {
                // If no timezone preference found in localStorage, load from API as backup
                console.log('No timezone found in localStorage, fetching from API');
                fetch('/api/auth/preferences', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    // API returns preferences directly, not nested
                    if (data && data.timezone) {
                        console.log('Received timezone from API:', data.timezone);
                        selectElement.value = data.timezone;
                        console.log(`Set ${selectElement.id} to:`, data.timezone, 'Current value:', selectElement.value);
                    }
                    resolve();
                })
                .catch(error => {
                    console.error('Error loading preferences from API:', error);
                    resolve(); // Still resolve to continue the chain
                });
            }
        })
        .catch(error => {
            console.error('Error loading timezones:', error);
            selectElement.innerHTML = '<option value="UTC">UTC (Coordinated Universal Time)</option>';
            reject(error);
        });
    });
}

/**
 * Save email settings
 */
function toggleNotificationSettings(channel) {
    if (emailSettingsContainer) {
        emailSettingsContainer.style.display = (channel === 'email' || channel === 'both') ? 'block' : 'none';
    }
    if (userAppriseSettingsContainer) {
        userAppriseSettingsContainer.style.display = (channel === 'apprise' || channel === 'both') ? 'block' : 'none';
    }
}

async function saveNotificationSettings() {
    showLoading();
    
    try {
        const preferences = {
            notification_channel: notificationChannel.value,
            notification_frequency: notificationFrequencySelect.value,
            notification_time: notificationTimeInput.value,
            apprise_notification_time: userAppriseNotificationTimeInput ? userAppriseNotificationTimeInput.value : '09:00',
            apprise_notification_frequency: userAppriseNotificationFrequency ? userAppriseNotificationFrequency.value : 'daily',
            timezone: timezoneSelect.value,
            apprise_timezone: userAppriseTimezoneSelect ? userAppriseTimezoneSelect.value : 'UTC'
        };

        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        console.log('Saving notification settings with token:', token ? 'present' : 'missing');
        
        const response = await fetch('/api/auth/preferences', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preferences)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save notification settings');
        }

        showToast('Notification settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving notification settings:', error);
        showToast(`Error saving notification settings: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// --- Add Storage Event Listener for Real-time Sync ---
window.addEventListener('storage', (event) => {
    console.log(`[Settings Storage Listener] Event received: key=${event.key}, newValue=${event.newValue}`); // Log all events

    const prefix = getPreferenceKeyPrefix();
    const targetKey = `${prefix}defaultView`;

    // Only react to changes in the specific default view key for the current user type
    if (event.key === targetKey) { // Check key match first
        console.log(`[Settings Storage Listener] Matched key: ${targetKey}`);
        console.log(`[Settings Storage Listener] defaultViewSelect exists: ${!!defaultViewSelect}`);
        if (defaultViewSelect) {
            console.log(`[Settings Storage Listener] Current dropdown value: ${defaultViewSelect.value}`);
        }
        console.log(`[Settings Storage Listener] Event newValue: ${event.newValue}`);

        if (event.newValue && defaultViewSelect && defaultViewSelect.value !== event.newValue) {
            console.log(`[Settings Storage Listener] Value changed and dropdown exists. Checking options...`);
            const optionExists = [...defaultViewSelect.options].some(option => option.value === event.newValue);
             console.log(`[Settings Storage Listener] Option ${event.newValue} exists: ${optionExists}`);
            if (optionExists) {
                defaultViewSelect.value = event.newValue;
                console.log(`[Settings Storage Listener] SUCCESS: Updated settings default view dropdown via storage event to ${event.newValue}.`);
            } else {
                console.warn(`[Settings Storage Listener] Storage event value (${event.newValue}) not found in dropdown options.`);
            }
        } else if (!event.newValue) {
            console.log(`[Settings Storage Listener] Ignoring event for ${targetKey} because newValue is null/empty.`);
        } else if (!defaultViewSelect) {
            console.log(`[Settings Storage Listener] Ignoring event for ${targetKey} because defaultViewSelect element not found.`);
        } else {
             console.log(`[Settings Storage Listener] Ignoring event for ${targetKey} because value hasn't changed (${defaultViewSelect.value} === ${event.newValue}).`);
        }
    }

    // Add similar checks for other preferences if needed, e.g., dateFormat, currencySymbol
    if (event.key === 'dateFormat') { // Simplified log for other keys
        console.log(`[Settings Storage Listener] dateFormat changed to ${event.newValue}`);
        if (event.newValue && dateFormatSelect && dateFormatSelect.value !== event.newValue) {
            const optionExists = [...dateFormatSelect.options].some(option => option.value === event.newValue);
            if (optionExists) {
                dateFormatSelect.value = event.newValue;
                console.log('[Settings Storage Listener] Updated settings date format dropdown via storage event.');
            }
        }
    }

    if (event.key === `${prefix}currencySymbol`) { // Simplified log for other keys
         console.log(`[Settings Storage Listener] ${prefix}currencySymbol changed to ${event.newValue}`);
         if (event.newValue && currencySymbolSelect && currencySymbolSelect.value !== event.newValue) {
            // Handle standard vs custom symbol update
             const standardOption = Array.from(currencySymbolSelect.options).find(opt => opt.value === event.newValue);
             if (standardOption) {
                 currencySymbolSelect.value = event.newValue;
                 if (currencySymbolCustom) currencySymbolCustom.style.display = 'none';
                 console.log('[Settings Storage Listener] Updated settings currency dropdown via storage event.');
             } else if (currencySymbolSelect.value !== 'other' || (currencySymbolCustom && currencySymbolCustom.value !== event.newValue)) {
                 currencySymbolSelect.value = 'other';
                 if (currencySymbolCustom) {
                     currencySymbolCustom.value = event.newValue;
                     currencySymbolCustom.style.display = 'inline-block';
                 }
                 console.log('[Settings Storage Listener] Updated settings currency dropdown to custom via storage event.');
             }
         }
    }

    // Add check for expiringSoonDays
    if (event.key === `${prefix}expiringSoonDays`) { // Simplified log for other keys
        console.log(`[Settings Storage Listener] ${prefix}expiringSoonDays changed to ${event.newValue}`);
        if (event.newValue && expiringSoonDaysInput && expiringSoonDaysInput.value !== event.newValue) {
            expiringSoonDaysInput.value = event.newValue;
            console.log('[Settings Storage Listener] Updated settings expiring soon days input via storage event.');
        }
    }

    // Add check for currencyPosition
    if (event.key === `${prefix}currencyPosition`) {
        console.log(`[Settings Storage Listener] ${prefix}currencyPosition changed to ${event.newValue}`);
        if (event.newValue && currencyPositionSelect && currencyPositionSelect.value !== event.newValue) {
            currencyPositionSelect.value = event.newValue;
            console.log('[Settings Storage Listener] Updated settings currency position dropdown via storage event.');
        }
    }

});
// --- End Storage Event Listener ---

// Add event listener for dropdown to show/hide custom input
if (currencySymbolSelect && currencySymbolCustom) {
    currencySymbolSelect.addEventListener('change', function() {
        if (this.value === 'other') {
            currencySymbolCustom.style.display = '';
            currencySymbolCustom.focus();
        } else {
            currencySymbolCustom.style.display = 'none';
            currencySymbolCustom.value = '';
        }
    });
}

// =====================
// APPRISE NOTIFICATIONS FUNCTIONALITY
// =====================

/**
 * Load Apprise settings and status
 */
async function loadAppriseSettings() {
    try {
        // Get current Apprise status
        const statusResponse = await fetch('/api/admin/apprise/status', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });

        if (statusResponse.status === 403) {
            // User is not admin, hide Apprise section
            const appriseCard = document.querySelector('.card:has(#appriseStatusBadge)');
            if (appriseCard) {
                appriseCard.style.display = 'none';
            }
            return;
        }

        if (statusResponse.status === 503) {
            // Apprise not available
            if (appriseNotAvailable) appriseNotAvailable.style.display = 'block';
            if (appriseStatusBadge) appriseStatusBadge.textContent = 'Not Available';
            if (appriseStatusBadge) appriseStatusBadge.className = 'badge badge-danger';
            return;
        }

        const statusData = await statusResponse.json();
        
        // Update status badge
        if (appriseStatusBadge) {
            if (statusData.available && statusData.enabled) {
                appriseStatusBadge.textContent = 'Active';
                appriseStatusBadge.className = 'badge badge-success';
            } else if (statusData.available) {
                appriseStatusBadge.textContent = 'Disabled';
                appriseStatusBadge.className = 'badge badge-warning';
            } else {
                appriseStatusBadge.textContent = 'Not Available';
                appriseStatusBadge.className = 'badge badge-danger';
            }
        }

        // Update status display
        if (appriseUrlsCount) appriseUrlsCount.textContent = statusData.urls_configured || 0;
        if (currentAppriseExpirationDays) currentAppriseExpirationDays.textContent = statusData.expiration_days ? statusData.expiration_days.join(', ') : '-';

        // Load settings from site settings
        await loadAppriseSiteSettings();

    } catch (error) {
        console.error('Error loading Apprise settings:', error);
        if (appriseStatusBadge) {
            appriseStatusBadge.textContent = 'Error';
            appriseStatusBadge.className = 'badge badge-danger';
        }
    }
}

/**
 * Load Apprise site settings
 */
async function loadAppriseSiteSettings() {
    try {
        console.log('📥 Loading Apprise site settings...');
        const response = await fetch('/api/admin/settings', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });

        console.log('📥 Load response status:', response.status);

        if (!response.ok) {
            console.warn('⚠️ Load response not OK, skipping settings load');
            return;
        }

        const data = await response.json();
        console.log('📥 Loaded settings data:', data);
        
        // Check if Apprise settings exist in the data
        const appriseKeys = Object.keys(data).filter(key => key.startsWith('apprise_'));
        console.log('📥 Found Apprise keys:', appriseKeys);
        
        // Update form fields
        if (appriseEnabledToggle && data.apprise_enabled !== undefined) {
            appriseEnabledToggle.checked = data.apprise_enabled === 'true';
            console.log('✅ Set appriseEnabled:', data.apprise_enabled);
            
            // Show/hide settings container based on enabled state
            const settingsContainer = document.getElementById('appriseSettingsContainer');
            if (settingsContainer) {
                settingsContainer.style.display = data.apprise_enabled === 'true' ? 'block' : 'none';
            }
        } else {
            console.log('⚠️ appriseEnabled element not found or apprise_enabled data missing');
        }
        
        if (appriseUrlsTextarea && data.apprise_urls) {
            appriseUrlsTextarea.value = data.apprise_urls.replace(/,/g, '\n');
            console.log('✅ Set appriseUrls:', data.apprise_urls);
        } else {
            console.log('⚠️ appriseUrlsTextarea element not found or apprise_urls data missing');
        }
        
        if (appriseExpirationDaysInput && data.apprise_expiration_days) {
            appriseExpirationDaysInput.value = data.apprise_expiration_days;
            console.log('✅ Set appriseExpirationDays:', data.apprise_expiration_days);
        } else {
            console.log('⚠️ appriseExpirationDaysInput element not found or data missing');
        }
        

        
        if (appriseTitlePrefixInput && data.apprise_title_prefix) {
            appriseTitlePrefixInput.value = data.apprise_title_prefix;
            console.log('✅ Set appriseTitlePrefix:', data.apprise_title_prefix);
        } else {
            console.log('⚠️ appriseTitlePrefixInput element not found or data missing');
        }
        
        if (appriseNotificationModeSelect && data.apprise_notification_mode) {
            appriseNotificationModeSelect.value = data.apprise_notification_mode;
            updateAppriseModeDescription(data.apprise_notification_mode);
            console.log('✅ Set appriseNotificationMode:', data.apprise_notification_mode);
        } else {
            console.log('⚠️ appriseNotificationModeSelect element not found or data missing');
            // Set default mode if not found
            if (appriseNotificationModeSelect) {
                appriseNotificationModeSelect.value = 'global';
                updateAppriseModeDescription('global');
            }
        }
        
        if (appriseWarrantyScopeSelect && data.apprise_warranty_scope) {
            appriseWarrantyScopeSelect.value = data.apprise_warranty_scope;
            updateAppriseScopeDescription(data.apprise_warranty_scope);
            console.log('✅ Set appriseWarrantyScope:', data.apprise_warranty_scope);
        } else {
            console.log('⚠️ appriseWarrantyScopeSelect element not found or data missing');
            // Set default scope if not found
            if (appriseWarrantyScopeSelect) {
                appriseWarrantyScopeSelect.value = 'all';
                updateAppriseScopeDescription('all');
            }
        }

    } catch (error) {
        console.error('❌ Error loading Apprise site settings:', error);
    }
}

/**
 * Save Apprise settings
 */
async function saveAppriseSettings() {
    try {
        console.log('🔍 Starting saveAppriseSettings...');
        showLoading();

        // Process URLs - convert newlines to commas and clean up
        const urlsText = appriseUrlsTextarea ? appriseUrlsTextarea.value : '';
        const urls = urlsText.split(/[\n,]/)
            .map(url => url.trim())
            .filter(url => url.length > 0)
            .join(',');

        const settings = {
            apprise_enabled: appriseEnabledToggle ? appriseEnabledToggle.checked.toString() : 'false',
            apprise_notification_mode: appriseNotificationModeSelect ? appriseNotificationModeSelect.value : 'global',
            apprise_warranty_scope: appriseWarrantyScopeSelect ? appriseWarrantyScopeSelect.value : 'all',
            apprise_urls: urls,
            apprise_expiration_days: appriseExpirationDaysInput ? appriseExpirationDaysInput.value : '7,30',
            apprise_title_prefix: appriseTitlePrefixInput ? appriseTitlePrefixInput.value : '[Warracker]'
        };

        console.log('📋 Settings to save:', settings);

        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        console.log('📡 Saving Apprise settings with token:', token ? 'present' : 'missing');
        
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Response error:', errorData);
            throw new Error(errorData.message || 'Failed to save Apprise settings');
        }

        const responseData = await response.json();
        console.log('✅ Save response:', responseData);

        // Reload configuration
        console.log('🔄 Reloading Apprise configuration...');
        const reloadResponse = await fetch('/api/admin/apprise/reload-config', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });

        console.log('🔄 Reload response status:', reloadResponse.status);

        showToast('Apprise settings saved successfully', 'success');
        
        // Reload status
        console.log('📱 Reloading Apprise settings...');
        await loadAppriseSettings();

    } catch (error) {
        console.error('❌ Error saving Apprise settings:', error);
        showToast(`Error saving Apprise settings: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Send test Apprise notification
 */
async function sendTestAppriseNotification() {
    try {
        showLoading();

        const testUrl = appriseTestUrlInput ? appriseTestUrlInput.value.trim() : null;
        
        const payload = testUrl ? { test_url: testUrl } : {};

        const response = await fetch('/api/admin/apprise/test', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            showToast('Test notification sent successfully', 'success');
        } else {
            showToast(`Failed to send test notification: ${data.message}`, 'error');
        }

    } catch (error) {
        console.error('Error sending test notification:', error);
        showToast(`Error sending test notification: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Validate Apprise URLs
 */
async function validateAppriseUrls() {
    try {
        showLoading();

        const urlsText = appriseUrlsTextarea ? appriseUrlsTextarea.value : '';
        const urls = urlsText.split(/[\n,]/)
            .map(url => url.trim())
            .filter(url => url.length > 0);

        if (urls.length === 0) {
            showToast('No URLs to validate', 'warning');
            hideLoading();
            return;
        }

        let validCount = 0;
        let invalidUrls = [];

        for (const url of urls) {
            try {
                const response = await fetch('/api/admin/apprise/validate-url', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url: url })
                });

                const data = await response.json();
                
                if (data.valid) {
                    validCount++;
                } else {
                    invalidUrls.push(url);
                }
            } catch (error) {
                invalidUrls.push(url);
            }
        }

        let message = `Validation complete: ${validCount}/${urls.length} URLs are valid`;
        if (invalidUrls.length > 0) {
            message += `\nInvalid URLs: ${invalidUrls.join(', ')}`;
            showToast(message, 'warning');
        } else {
            showToast(message, 'success');
        }

    } catch (error) {
        console.error('Error validating URLs:', error);
        showToast(`Error validating URLs: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Trigger Apprise expiration notifications
 */
async function triggerAppriseExpirationNotifications() {
    try {
        showLoading();

        const response = await fetch('/api/admin/apprise/send-expiration', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
        } else {
            showToast(`Failed to trigger notifications: ${data.message}`, 'error');
        }

    } catch (error) {
        console.error('Error triggering Apprise notifications:', error);
        showToast(`Error triggering notifications: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * View supported services
 */
function viewSupportedAppriseServices() {
    window.open('https://github.com/caronc/apprise/wiki', '_blank', 'noopener,noreferrer');
}

/**
 * Save just the Apprise enabled/disabled state
 */
async function saveAppriseEnabledState(enabled) {
    try {
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apprise_enabled: enabled.toString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save Apprise enabled state');
        }

        // Reload configuration
        const reloadResponse = await fetch('/api/admin/apprise/reload-config', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Apprise enabled state saved:', enabled);
        
        // Update status badge
        await loadAppriseSettings();

    } catch (error) {
        console.error('❌ Error saving Apprise enabled state:', error);
        showToast(`Error updating Apprise setting: ${error.message}`, 'error');
        
        // Revert the toggle if save failed
        if (appriseEnabledToggle) {
            appriseEnabledToggle.checked = !enabled;
        }
    }
}

/**
 * Update Apprise mode description text
 */
function updateAppriseModeDescription(mode) {
    if (!appriseModeDescription) return;
    
    if (mode === 'global') {
        appriseModeDescription.textContent = 'A single, consolidated notification will be sent to the global Apprise channels defined below.';
    } else if (mode === 'individual') {
        appriseModeDescription.textContent = 'A separate notification will be sent for each user with expiring warranties. (Note: This currently uses the global channels. Per-user channels can be a future enhancement.)';
    }
}

/**
 * Update Apprise warranty scope description text
 */
function updateAppriseScopeDescription(scope) {
    if (!appriseScopeDescription) return;
    
    if (scope === 'all') {
        appriseScopeDescription.textContent = 'Notifications will include expiring warranties from all users in the system.';
    } else if (scope === 'admin') {
        appriseScopeDescription.textContent = 'Notifications will only include expiring warranties belonging to the admin/owner user.';
    }
}

/**
 * Setup Apprise event listeners
 */
function setupAppriseEventListeners() {
    // Enable/disable toggle
    if (appriseEnabledToggle) {
        appriseEnabledToggle.addEventListener('change', async function() {
            const settingsContainer = document.getElementById('appriseSettingsContainer');
            if (settingsContainer) {
                settingsContainer.style.display = this.checked ? 'block' : 'none';
            }
            
            // Auto-save the enabled state
            await saveAppriseEnabledState(this.checked);
        });
    }

    // Notification mode change
    if (appriseNotificationModeSelect) {
        appriseNotificationModeSelect.addEventListener('change', (e) => {
            updateAppriseModeDescription(e.target.value);
        });
    }

    // Warranty scope change
    if (appriseWarrantyScopeSelect) {
        appriseWarrantyScopeSelect.addEventListener('change', (e) => {
            updateAppriseScopeDescription(e.target.value);
        });
    }

    // Save settings
    if (saveAppriseSettingsBtn) {
        saveAppriseSettingsBtn.addEventListener('click', saveAppriseSettings);
    }

    // Test notification
    if (testAppriseBtn) {
        testAppriseBtn.addEventListener('click', sendTestAppriseNotification);
    }

    // Validate URLs
    if (validateAppriseUrlBtn) {
        validateAppriseUrlBtn.addEventListener('click', validateAppriseUrls);
    }

    // Trigger expiration notifications
    if (triggerAppriseNotificationsBtn) {
        triggerAppriseNotificationsBtn.addEventListener('click', triggerAppriseExpirationNotifications);
    }

    // View supported services
    if (viewSupportedServicesBtn) {
        viewSupportedServicesBtn.addEventListener('click', viewSupportedAppriseServices);
    }
}

// Initialize Apprise functionality
document.addEventListener('DOMContentLoaded', function() {
    setupAppriseEventListeners();
    
    // Load Apprise settings after auth is ready (admin only)
    setTimeout(() => {
        if (window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated()) {
            const currentUser = window.auth.getCurrentUser();
            if (currentUser && currentUser.is_admin) {
                loadAppriseSettings();
                loadPaperlessSettings(); // Also load Paperless-ngx settings for admin
            } else {
                console.log('User is not admin, skipping Apprise settings load in deferred initialization');
            }
        }
    }, 1000);
});

// ============================================================================
// Paperless-ngx Integration Functions
// ============================================================================

/**
 * Toggle the visibility of Paperless-ngx settings based on enabled state
 * @param {boolean} enabled - Whether Paperless-ngx is enabled
 */
function togglePaperlessSettings(enabled) {
    if (paperlessSettingsContainer) {
        paperlessSettingsContainer.style.display = enabled ? 'block' : 'none';
    }
}

/**
 * Load Paperless-ngx settings from the server
 */
async function loadPaperlessSettings() {
    try {
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        
        const response = await fetch('/api/admin/settings', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load settings');
        }

        const settings = await response.json();
        
        // Update Paperless-ngx settings UI
        if (paperlessEnabledToggle) {
            const isEnabled = settings.paperless_enabled === 'true';
            paperlessEnabledToggle.checked = isEnabled;
            togglePaperlessSettings(isEnabled);
        }
        
        if (paperlessUrlInput && settings.paperless_url) {
            paperlessUrlInput.value = settings.paperless_url;
        }
        
        // Update API token field placeholder to indicate if token is saved
        if (paperlessApiTokenInput) {
            if (settings.paperless_api_token_set === 'true') {
                paperlessApiTokenInput.placeholder = 'API token saved (hidden for security) - Leave blank to keep existing';
            } else {
                paperlessApiTokenInput.placeholder = 'Enter API token';
            }
        }
        
        console.log('✅ Paperless-ngx settings loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading Paperless-ngx settings:', error);
        showToast(`Error loading Paperless-ngx settings: ${error.message}`, 'error');
    }
}

/**
 * Save Paperless-ngx settings to the server
 */
async function savePaperlessSettings() {
    try {
        showLoading();
        
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        
        // Validate URL format
        const url = paperlessUrlInput.value.trim();
        if (url && !isValidUrl(url)) {
            showToast('Please enter a valid URL (e.g., https://paperless.yourdomain.com)', 'error');
            return;
        }
        
        // Prepare settings data
        const settingsData = {
            paperless_enabled: paperlessEnabledToggle.checked.toString(),
            paperless_url: url
        };
        
        // Only include API token if it's provided (not empty)
        const apiToken = paperlessApiTokenInput.value.trim();
        if (apiToken) {
            settingsData.paperless_api_token = apiToken;
        }
        
        // Save admin settings first
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settingsData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save Paperless-ngx settings');
        }

        // Also save the user preference for viewing documents in app
        const paperlessViewInApp = paperlessViewInAppToggle ? paperlessViewInAppToggle.checked : false;
        const preferencesData = {
            paperless_view_in_app: paperlessViewInApp
        };
        
        const preferencesResponse = await fetch('/api/auth/preferences', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preferencesData)
        });

        if (!preferencesResponse.ok) {
            console.warn('Failed to save paperless view preference, but admin settings were saved');
        }
        
        // Update localStorage for the preference
        const prefix = getPreferenceKeyPrefix();
        localStorage.setItem(`${prefix}paperlessViewInApp`, paperlessViewInApp);
        
        showToast('Paperless-ngx settings saved successfully!', 'success');
        
        // Clear the API token input for security
        if (paperlessApiTokenInput) {
            paperlessApiTokenInput.value = '';
            paperlessApiTokenInput.placeholder = 'API token saved (hidden for security) - Leave blank to keep existing';
        }
        
        console.log('✅ Paperless-ngx settings saved successfully');
        
    } catch (error) {
        console.error('❌ Error saving Paperless-ngx settings:', error);
        showToast(`Error saving Paperless-ngx settings: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Test connection to Paperless-ngx instance
 */
async function testPaperlessConnection() {
    try {
        showLoading();
        
        // Clear previous status
        if (paperlessConnectionStatus) {
            paperlessConnectionStatus.innerHTML = '';
            paperlessConnectionStatus.className = 'paperless-status-message';
        }
        
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        
        // Get current values from the form
        const url = paperlessUrlInput.value.trim();
        const apiToken = paperlessApiTokenInput.value.trim();
        
        if (!url) {
            showToast('Please enter a Paperless-ngx URL first', 'warning');
            return;
        }
        
        // Check if API token is provided in form, otherwise use stored settings
        if (!apiToken && paperlessApiTokenInput.placeholder.includes('saved')) {
            // API token is already saved, test with stored settings
            const response = await fetch('/api/paperless/test', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (paperlessConnectionStatus) {
                paperlessConnectionStatus.classList.add('show');
                if (result.success) {
                    paperlessConnectionStatus.className = 'paperless-status-message show success';
                    paperlessConnectionStatus.innerHTML = `
                        <strong>✅ Connection Successful!</strong><br>
                        ${result.message}
                        ${result.server_info ? `<br><small>Server: ${result.server_info}</small>` : ''}
                    `;
                    showToast('Paperless-ngx connection test successful!', 'success');
                } else {
                    paperlessConnectionStatus.className = 'paperless-status-message show error';
                    paperlessConnectionStatus.innerHTML = `
                        <strong>❌ Connection Failed!</strong><br>
                        ${result.message}
                    `;
                    showToast('Paperless-ngx connection test failed', 'error');
                }
            }
            
            return;
        }
        
        if (!apiToken) {
            showToast('Please enter an API token to test the connection', 'warning');
            return;
        }
        
        const response = await fetch('/api/paperless/test', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                api_token: apiToken
            })
        });

        const result = await response.json();
        
        if (paperlessConnectionStatus) {
            if (result.success) {
                paperlessConnectionStatus.classList.add('show');
                paperlessConnectionStatus.className = 'paperless-status-message show success';
                paperlessConnectionStatus.innerHTML = `
                    <strong>✅ Connection Successful!</strong><br>
                    ${result.message}
                    ${result.server_info ? `<br><small>Server: ${result.server_info}</small>` : ''}
                `;
                showToast('Paperless-ngx connection test successful!', 'success');
            } else {
                paperlessConnectionStatus.classList.add('show');
                paperlessConnectionStatus.className = 'paperless-status-message show error';
                paperlessConnectionStatus.innerHTML = `
                    <strong>❌ Connection Failed!</strong><br>
                    ${result.message}
                `;
                showToast('Paperless-ngx connection test failed', 'error');
            }
        }
        
    } catch (error) {
        console.error('❌ Error testing Paperless-ngx connection:', error);
        
        if (paperlessConnectionStatus) {
            paperlessConnectionStatus.classList.add('show');
            paperlessConnectionStatus.className = 'paperless-status-message show error';
            paperlessConnectionStatus.innerHTML = `
                <strong>❌ Connection Error!</strong><br>
                ${error.message}
            `;
        }
        
        showToast(`Error testing connection: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Debug Paperless-ngx configuration
 */
async function debugPaperlessConfiguration() {
    try {
        showLoading();
        
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        
        const response = await fetch('/api/paperless/debug', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        // Display debug information
        console.log('🔍 Paperless-ngx Debug Information:', result);
        
        let debugHtml = '<h5>📋 Paperless-ngx Debug Information</h5>';
        debugHtml += `<strong>Enabled:</strong> ${result.paperless_enabled}<br>`;
        debugHtml += `<strong>URL:</strong> ${result.paperless_url || 'Not set'}<br>`;
        debugHtml += `<strong>API Token Set:</strong> ${result.paperless_api_token_set}<br>`;
        debugHtml += `<strong>Handler Available:</strong> ${result.paperless_handler_available}<br>`;
        
        if (result.test_connection_result) {
            debugHtml += `<strong>Connection Test:</strong> ${result.test_connection_result.success ? '✅ Success' : '❌ Failed'}<br>`;
            debugHtml += `<strong>Message:</strong> ${result.test_connection_result.message || result.test_connection_result.error}<br>`;
        }
        
        if (result.paperless_handler_error) {
            debugHtml += `<strong>Handler Error:</strong> ${result.paperless_handler_error}<br>`;
        }
        
        // Show in connection status area or create a temporary area
        if (paperlessConnectionStatus) {
            paperlessConnectionStatus.classList.add('show');
            paperlessConnectionStatus.className = 'paperless-status-message show info';
            paperlessConnectionStatus.innerHTML = debugHtml;
        } else {
            // Create temporary debug display
            const debugArea = document.createElement('div');
            debugArea.innerHTML = debugHtml;
            document.body.appendChild(debugArea);
            setTimeout(() => debugArea.remove(), 10000); // Remove after 10 seconds
        }
        
        showToast('Debug information logged to console', 'info');
        
    } catch (error) {
        console.error('❌ Error running Paperless debug:', error);
        showToast(`Debug error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Test basic file upload mechanism
 */
async function testFileUpload() {
    try {
        showLoading();
        
        // Create a simple test file
        const testContent = 'This is a test file for Paperless-ngx upload debugging';
        const testFile = new File([testContent], 'test.txt', { type: 'text/plain' });
        
        const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
        
        const formData = new FormData();
        formData.append('file', testFile);
        formData.append('document_type', 'test');
        
        const response = await fetch('/api/paperless/test-upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();
        
        console.log('🧪 File Upload Test Result:', result);
        
        if (result.success) {
            showToast('File upload test successful!', 'success');
            if (paperlessConnectionStatus) {
                paperlessConnectionStatus.classList.add('show');
                paperlessConnectionStatus.className = 'paperless-status-message show success';
                paperlessConnectionStatus.innerHTML = `
                    <strong>✅ File Upload Test Successful!</strong><br>
                    ${result.message}<br>
                    <small>File: ${result.file_info.filename} (${result.file_info.size} bytes)</small>
                `;
            }
        } else {
            showToast('File upload test failed', 'error');
            if (paperlessConnectionStatus) {
                paperlessConnectionStatus.classList.add('show');
                paperlessConnectionStatus.className = 'paperless-status-message show error';
                paperlessConnectionStatus.innerHTML = `
                    <strong>❌ File Upload Test Failed!</strong><br>
                    ${result.error}
                `;
            }
        }
        
    } catch (error) {
        console.error('❌ Error testing file upload:', error);
        showToast(window.t('messages.file_upload_test_error', { error: error.message }), 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Validate if a string is a valid URL
 * @param {string} string - The string to validate
 * @returns {boolean} - Whether the string is a valid URL
 */
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}
