/**
 * Authentication functionality for Warracker (New UI)
 * Handles user login, logout, and authentication state management for the new UI design
 */

// Authentication state
let currentUser = null;
let authToken = null;

// Initialize authentication
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing auth-new.js for new UI');
    
    // Initial check of authentication state
    checkAuthState();
    
    // Set up periodic check of auth state (every 30 seconds)
    setInterval(checkAuthState, 30000);
    
    // Set up logout functionality
    setupLogout();
});

/**
 * Set up logout functionality
 */
function setupLogout() {
    // Look for logout button in the new UI
    const logoutButton = document.querySelector('.logout-btn');
    
    if (logoutButton) {
        console.log('Found logout button in new UI');
        
        // Add click event to logout
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

/**
 * Check if user is authenticated and update UI accordingly
 */
function checkAuthState() {
    console.log('Checking auth state for new UI');
    
    // Get auth token from localStorage
    authToken = localStorage.getItem('auth_token');
    const userInfo = localStorage.getItem('user_info');
    
    if (authToken && userInfo) {
        try {
            currentUser = JSON.parse(userInfo);
            updateUIForAuthenticatedUser();
            validateToken();
        } catch (error) {
            console.error('Error parsing user info:', error);
            clearAuthData();
            updateUIForUnauthenticatedUser();
        }
    } else {
        updateUIForUnauthenticatedUser();
    }
}

/**
 * Update UI elements for authenticated user in the new UI
 */
function updateUIForAuthenticatedUser() {
    console.log('Updating UI for authenticated user');
    
    // Find login/register buttons in the new UI based on the screenshot
    const loginButton = document.querySelector('a[href="login.html"], a.login');
    const registerButton = document.querySelector('a[href="register.html"], a.register');
    
    // Hide login/register buttons if they exist
    if (loginButton) {
        console.log('Hiding login button');
        loginButton.style.display = 'none';
    }
    
    if (registerButton) {
        console.log('Hiding register button');
        registerButton.style.display = 'none';
    }
    
    // Show user info if it exists
    const userDisplay = document.querySelector('.user-display');
    if (userDisplay && currentUser) {
        let displayName = currentUser.username || 'User';
        userDisplay.textContent = displayName;
        userDisplay.style.display = 'inline-block';
    }
}

/**
 * Update UI elements for unauthenticated user in the new UI
 */
function updateUIForUnauthenticatedUser() {
    console.log('Updating UI for unauthenticated user');
    
    // Find login/register buttons in the new UI based on the screenshot
    const loginButton = document.querySelector('a[href="login.html"], a.login');
    const registerButton = document.querySelector('a[href="register.html"], a.register');
    
    // Show login/register buttons if they exist
    if (loginButton) {
        console.log('Showing login button');
        loginButton.style.display = 'inline-block';
    }
    
    if (registerButton) {
        console.log('Showing register button');
        registerButton.style.display = 'inline-block';
    }
    
    // Hide user info if it exists
    const userDisplay = document.querySelector('.user-display');
    if (userDisplay) {
        userDisplay.style.display = 'none';
    }
}

/**
 * Logout user
 */
async function logout() {
    try {
        console.log('Logging out user');
        
        // Call logout API
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Clear auth data regardless of API response
        clearAuthData();
        updateUIForUnauthenticatedUser();
        
        // Show success message
        console.log('Logged out successfully');
        
        // Reload page to refresh UI
        window.location.reload();
        
    } catch (error) {
        console.error('Logout error:', error);
        
        // Still clear auth data even if API call fails
        clearAuthData();
        updateUIForUnauthenticatedUser();
        
        console.log('Logged out with errors');
    }
}

/**
 * Clear authentication data from localStorage
 */
function clearAuthData() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    authToken = null;
    currentUser = null;
}

/**
 * Validate token with the server
 */
async function validateToken() {
    if (!authToken) {
        clearAuthData();
        updateUIForUnauthenticatedUser();
        return;
    }
    
    try {
        // Use the full URL to avoid path issues
        const apiUrl = window.location.origin + '/api/auth/validate-token';
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Token validation failed:', errorData.message);
            throw new Error(errorData.message || 'Invalid token');
        }
        
        // Token is valid, update last active time
        const data = await response.json();
        if (data.user) {
            currentUser = data.user;
            localStorage.setItem('user_info', JSON.stringify(currentUser));
            updateUIForAuthenticatedUser();
        }
        
        return true;
    } catch (error) {
        console.error('Token validation error:', error);
        clearAuthData();
        updateUIForUnauthenticatedUser();
        
        return false;
    }
}

// Export authentication functions for use in other scripts
window.authNew = {
    isAuthenticated: () => !!authToken,
    getCurrentUser: () => currentUser,
    getToken: () => authToken,
    checkAuthState,
    logout
}; 