/**
 * Authentication functionality for Warracker
 * Handles user login, logout, and authentication state management
 */

class AuthManager {
    constructor() {
        this.token = null;
        this.currentUser = null;
        this.onLogoutCallbacks = [];

        // Initial state load from localStorage
        this.token = localStorage.getItem('auth_token');
        const userInfoString = localStorage.getItem('user_info');
        if (userInfoString) {
            try {
                this.currentUser = JSON.parse(userInfoString);
            } catch (e) {
                console.error('Auth.js: Corrupt user_info in localStorage. Clearing.');
                this.currentUser = null;
                localStorage.removeItem('user_info');
                // Consider clearing token as well if user_info is corrupt
                // localStorage.removeItem('auth_token'); 
                // this.token = null;
            }
        }
        console.log('[Auth.js] Initial state:', { token: this.token ? 'present' : 'null', currentUser: this.currentUser });
    }

    isAuthenticated() {
        // User is authenticated if both token and currentUser (with an id) are present
        return !!(this.token && this.currentUser && this.currentUser.id);
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getToken() {
        // Always return the current state of this.token, which should be synced with localStorage
        return this.token;
    }

    clearAuthData() {
        console.log('[Auth.js] Clearing auth data.');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
        this.token = null;
        this.currentUser = null;
        this.onLogoutCallbacks.forEach(cb => cb());
    }
    
    onLogout(callback) {
        if (typeof callback === 'function') {
            this.onLogoutCallbacks.push(callback);
        }
    }

    async checkAuthState(isInitialLoad = false) {
        console.log('[Auth.js] checkAuthState called. Initial load:', isInitialLoad);
        this.token = localStorage.getItem('auth_token'); // Re-read token, might have changed (e.g. by auth-redirect.js)
        const userInfoString = localStorage.getItem('user_info');
        
        this.currentUser = null; // Reset before check

        if (userInfoString) {
            try {
                this.currentUser = JSON.parse(userInfoString);
            } catch (e) {
                console.error('Auth.js: Failed to parse user_info from localStorage during checkAuthState. Clearing auth data.', e);
                this.clearAuthData(); // Clear potentially corrupt data
                this.updateUIBasedOnAuthState(); // Update UI to reflect logged-out state
                return; // Exit early
            }
        }

        if (this.token) {
            // If token exists, try to validate it and fetch/confirm user_info
            // This is crucial if user_info was missing or to refresh/validate existing user_info
            console.log('[Auth.js] Token found. Validating and fetching user info...');
            try {
                const response = await fetch('/api/auth/validate-token', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.valid && data.user && data.user.id) {
                        this.currentUser = data.user;
                        localStorage.setItem('user_info', JSON.stringify(this.currentUser)); // Ensure localStorage is up-to-date
                        console.log('[Auth.js] Token validated, user_info updated/confirmed:', this.currentUser);
                    } else {
                        console.warn('[Auth.js] Token validation failed or user data invalid from API. Clearing auth data.');
                        this.clearAuthData();
                    }
                } else {
                    console.warn(`[Auth.js] Token validation API call failed (status: ${response.status}). Clearing auth data.`);
                    this.clearAuthData();
                }
            } catch (error) {
                console.error('[Auth.js] Error validating token / fetching user info:', error);
                this.clearAuthData(); 
            }
        } else {
            // No token, ensure everything is cleared
            if (this.currentUser) { // If there was user_info but no token, clear user_info
                console.log('[Auth.js] No token found, but user_info was present. Clearing user_info.');
                this.clearAuthData();
            }
        }
        
        this.updateUIBasedOnAuthState(); 
    }

    updateUIBasedOnAuthState() {
        const isAuthenticated = this.isAuthenticated();
        this._updateDOMForAuthState(isAuthenticated, this.currentUser);
        this.dispatchAuthStateEvent(isAuthenticated, this.currentUser);
    }
    
    _updateDOMForAuthState(isAuthenticated, user) {
        const authContainer = document.getElementById('authContainer');
        const userMenu = document.getElementById('userMenu');
        const userDisplayName = document.getElementById('userDisplayName');
        const userNameMenu = document.getElementById('userName');
        const userEmailMenu = document.getElementById('userEmail');
        const logoutMenuItem = document.getElementById('logoutMenuItem');

        // Select all potential login/register buttons more broadly
        const loginButtons = document.querySelectorAll('a[href="login.html"], .login-btn');
        const registerButtons = document.querySelectorAll('a[href="register.html"], .register-btn');
        const genericAuthButtonsContainers = document.querySelectorAll('.auth-buttons');


        if (isAuthenticated && user) {
            console.log('Auth.js: Updating UI for AUTHENTICATED user:', user);
            if (authContainer) { authContainer.style.display = 'none'; authContainer.style.visibility = 'hidden'; }
            
            if (userMenu) { 
                userMenu.style.display = 'block'; // Or 'flex' based on CSS
                userMenu.style.visibility = 'visible';
                const displayNameText = user.first_name || user.username || 'User';
                const fullNameText = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User Name';
                if (userDisplayName) userDisplayName.textContent = displayNameText;
                if (userNameMenu) userNameMenu.textContent = fullNameText;
                if (userEmailMenu && user.email) userEmailMenu.textContent = user.email;
            }
            loginButtons.forEach(btn => { btn.style.display = 'none'; btn.style.visibility = 'hidden'; });
            registerButtons.forEach(btn => { btn.style.display = 'none'; btn.style.visibility = 'hidden'; });
            genericAuthButtonsContainers.forEach(container => {
                 if (container.id !== 'authContainer') { // Avoid double-hiding if authContainer also has .auth-buttons
                    container.style.display = 'none'; container.style.visibility = 'hidden';
                 }
            });

            if (logoutMenuItem) { 
                logoutMenuItem.style.display = 'flex'; // Assuming it's a flex item
                // Ensure logout listener is attached (can be done once in constructor or DOMContentLoaded)
            }
        } else {
            console.log('Auth.js: Updating UI for UNAUTHENTICATED user.');
            if (authContainer) { authContainer.style.display = 'flex'; authContainer.style.visibility = 'visible'; }
            
            if (userMenu) { userMenu.style.display = 'none'; userMenu.style.visibility = 'hidden'; }
            
            // Reset user display names if they exist
            if (userDisplayName) userDisplayName.textContent = 'User';
            if (userNameMenu) userNameMenu.textContent = 'User Name';
            if (userEmailMenu) userEmailMenu.textContent = 'user@example.com';

            loginButtons.forEach(btn => { btn.style.display = 'inline-block'; btn.style.visibility = 'visible'; });
            registerButtons.forEach(btn => { btn.style.display = 'inline-block'; btn.style.visibility = 'visible'; });
            genericAuthButtonsContainers.forEach(container => {
                if (container.id !== 'authContainer') {
                    container.style.display = 'flex'; // Or 'block'
                    container.style.visibility = 'visible';
                }
            });
            if (logoutMenuItem) { logoutMenuItem.style.display = 'none'; }
        }
    }

    dispatchAuthStateEvent(isAuthenticated, user) {
        console.log('[Auth.js] Dispatching authStateReady event', { isAuthenticated, user });
        // Ensure this event is dispatched after the current call stack clears
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('authStateReady', {
                detail: { isAuthenticated, user }
            }));
        }, 0);
    }

    async login(username, password) {
        // Assuming showLoading/hideLoading are global or part of another module
        if (typeof showLoading === 'function') showLoading();
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (response.ok) {
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('auth_token', this.token);
                localStorage.setItem('user_info', JSON.stringify(this.currentUser));
                this.updateUIBasedOnAuthState();
                return data; // Return data for login.js to handle redirect
            } else {
                throw new Error(data.message || 'Login failed');
            }
        } catch (error) {
            this.clearAuthData(); // Ensure state is cleared on login failure
            this.updateUIBasedOnAuthState();
            throw error; // Re-throw for login.js to handle
        } finally {
            if (typeof hideLoading === 'function') hideLoading();
        }
    }

    async logout() {
        if (typeof showLoading === 'function') showLoading();
        const currentTokenForApiCall = this.token; // Use current token for API call
        
        this.clearAuthData(); // Clear local state immediately
        this.updateUIBasedOnAuthState(); // Update UI to logged-out state

        try {
            if (currentTokenForApiCall) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentTokenForApiCall}` }
                });
                console.log('[Auth.js] Logout API call successful.');
            }
        } catch (error) {
            console.error('[Auth.js] Logout API call failed, but user is logged out locally.', error);
        } finally {
            if (typeof hideLoading === 'function') hideLoading();
            // Redirect to login page after all operations
            if (window.location.pathname !== '/login.html') {
                 window.location.href = 'login.html';
            }
        }
    }
    
    addAuthHeader(options = {}) {
        const token = this.getToken(); 
        if (!token) return options;
        
        const headers = options.headers || {};
        return { ...options, headers: { ...headers, 'Authorization': `Bearer ${token}`}};
    }
}

// Initialize and export
window.auth = new AuthManager();

// Initial check on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Auth.js] DOMContentLoaded - performing initial async auth state check.');
    await window.auth.checkAuthState(true); // Ensure auth state is processed first

    // Setup user menu toggle
    const userMenuBtn_original = document.getElementById('userMenuBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');

    if (userMenuBtn_original && userMenuDropdown) {
        console.log('[Auth.js] Setting up user menu. Button:', userMenuBtn_original, 'Dropdown:', userMenuDropdown);
        
        // Robust listener attachment: clone the button to remove any prior listeners
        const userMenuBtn = userMenuBtn_original.cloneNode(true);
        userMenuBtn_original.parentNode.replaceChild(userMenuBtn, userMenuBtn_original);

        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from immediately closing due to document listener
            console.log('[Auth.js] userMenuBtn clicked - DEBUG INFO:', {
                userMenuDropdown: !!userMenuDropdown,
                dropdownClassList: userMenuDropdown ? Array.from(userMenuDropdown.classList) : 'not found',
                hasActiveClass: userMenuDropdown ? userMenuDropdown.classList.contains('active') : 'dropdown not found',
                buttonId: userMenuBtn.id,
                dropdownId: userMenuDropdown ? userMenuDropdown.id : 'not found'
            });
            
            userMenuDropdown.classList.toggle('active');
            
            const isNowActive = userMenuDropdown.classList.contains('active');
            console.log('[Auth.js] User menu toggled via userMenuBtn. Active:', isNowActive);
            
            // Add a temporary debug check to see if it gets closed immediately
            setTimeout(() => {
                const stillActive = userMenuDropdown.classList.contains('active');
                console.log('[Auth.js] User menu status after 100ms:', stillActive);
                if (isNowActive && !stillActive) {
                    console.warn('[Auth.js] User menu was closed immediately! Possible global click interference.');
                }
            }, 100);
        });
        console.log('[Auth.js] User menu click listener attached to userMenuBtn.');
    } else {
        console.warn('[Auth.js] User menu button (userMenuBtn) or dropdown (userMenuDropdown) not found. Menu interactivity might be affected.');
    }

    // Setup settings gear menu toggle (if elements exist on the current page)
    const settingsBtn_original = document.getElementById('settingsBtn');
    const settingsMenu = document.getElementById('settingsMenu'); // The dropdown menu itself
    if (settingsBtn_original && settingsMenu) {
        const settingsBtn = settingsBtn_original.cloneNode(true);
        settingsBtn_original.parentNode.replaceChild(settingsBtn, settingsBtn_original);

        settingsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            settingsMenu.classList.toggle('active');
            console.log('[Auth.js] Settings menu toggled via settingsBtn.');
        });
        console.log('[Auth.js] Settings menu click listener attached to settingsBtn.');
    }

    // Global click listener to close dropdowns - ensure this is added only once
    if (!window._authJsGlobalClickListenerAdded) {
        document.addEventListener('click', (e) => {
            console.log('[Auth.js] Global click detected on:', e.target);
            
            // Re-fetch elements by ID inside the listener to ensure they are current
            const currentDropdown = document.getElementById('userMenuDropdown');
            const currentButton = document.getElementById('userMenuBtn'); // Use the standardized ID

            if (currentDropdown && currentButton && currentDropdown.classList.contains('active')) {
                console.log('[Auth.js] User menu is active, checking if click is outside...');
                const isOutsideDropdown = !currentDropdown.contains(e.target);
                const isOutsideButton = !currentButton.contains(e.target);
                console.log('[Auth.js] Click outside dropdown:', isOutsideDropdown, 'outside button:', isOutsideButton);
                
                if (isOutsideDropdown && isOutsideButton) {
                    currentDropdown.classList.remove('active');
                    console.log('[Auth.js] User menu closed by global click.');
                }
            }

            const currentSettingsMenu = document.getElementById('settingsMenu');
            const currentSettingsBtn = document.getElementById('settingsBtn');
            if (currentSettingsMenu && currentSettingsBtn && currentSettingsMenu.classList.contains('active') &&
                !currentSettingsMenu.contains(e.target) && !currentSettingsBtn.contains(e.target)) {
                currentSettingsMenu.classList.remove('active');
                console.log('[Auth.js] Settings menu closed by global click.');
            }
        });
        window._authJsGlobalClickListenerAdded = true;
        console.log('[Auth.js] Global click listener for dropdowns added.');
    }

    // Attach logout listener to logout menu item
    const logoutMenuItem_original = document.getElementById('logoutMenuItem');
    if (logoutMenuItem_original) {
        const logoutMenuItem = logoutMenuItem_original.cloneNode(true); // Ensures fresh listener
        logoutMenuItem_original.parentNode.replaceChild(logoutMenuItem, logoutMenuItem_original);
        logoutMenuItem.addEventListener('click', () => {
            console.log('[Auth.js] Logout menu item clicked.');
            window.auth.logout();
        });
        console.log('[Auth.js] Logout menu item listener attached.');
    }
});
