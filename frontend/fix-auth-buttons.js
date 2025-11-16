/**
 * Script to fix the login and register buttons in the new UI
 * This script specifically targets the buttons shown in the screenshot
 */

// Log execution
console.log('fix-auth-buttons.js loaded and executing');

// Function to check if user is authenticated
function isAuthenticated() {
    const token = localStorage.getItem('auth_token');
    // console.log('Auth token check:', !!token); // Keep console logs minimal here if auth.js is primary
    return !!token;
}

// Function to find elements by text content
function getElementsByText(selector, text) {
    const elements = document.querySelectorAll(selector);
    return Array.prototype.filter.call(elements, element => element.textContent.trim() === text);
}

// Function to hide login and register buttons if user is authenticated
function updateAuthButtons() {
    // console.log('fix-auth-buttons.js: updateAuthButtons executing...'); // Keep console logs minimal here
    if (isAuthenticated()) {
        // console.log('fix-auth-buttons.js: User is authenticated, hiding login/register buttons');
        const loginButtons = document.querySelectorAll('a[href="login.html"], .login-btn, .auth-btn.login-btn');
        const registerButtons = document.querySelectorAll('a[href="register.html"], .register-btn, .auth-btn.register-btn');
        const authContainer = document.getElementById('authContainer');
        const userMenu = document.getElementById('userMenu'); // Ensure this ID is consistent or use userMenuBtn's parent

        loginButtons.forEach(button => { button.style.display = 'none'; button.style.visibility = 'hidden'; });
        registerButtons.forEach(button => { button.style.display = 'none'; button.style.visibility = 'hidden'; });
        if (authContainer) { authContainer.style.display = 'none'; authContainer.style.visibility = 'hidden';}
        if (userMenu) { userMenu.style.display = 'block'; userMenu.style.visibility = 'visible'; }

        const userInfo = localStorage.getItem('user_info');
        if (userInfo) {
            try {
                const user = JSON.parse(userInfo);
                const displayName = user.first_name || user.username || 'User';
                const userDisplayName = document.getElementById('userDisplayName');
                if (userDisplayName) userDisplayName.textContent = displayName;

                const userNameMenu = document.getElementById('userName');
                if (userNameMenu) {
                    userNameMenu.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User Name';
                }
                const userEmailMenu = document.getElementById('userEmail');
                if (userEmailMenu && user.email) userEmailMenu.textContent = user.email;
            } catch (error) { /* console.error('fix-auth-buttons.js: Error parsing user info:', error); */ }
        }
    } else {
        // console.log('fix-auth-buttons.js: User is not authenticated, showing login/register buttons');
        const loginButtons = document.querySelectorAll('a[href="login.html"], .login-btn, .auth-btn.login-btn');
        const registerButtons = document.querySelectorAll('a[href="register.html"], .register-btn, .auth-btn.register-btn');
        const authContainer = document.getElementById('authContainer');
        const userMenu = document.getElementById('userMenu');

        loginButtons.forEach(button => { button.style.display = 'inline-block'; button.style.visibility = 'visible'; });
        registerButtons.forEach(button => { button.style.display = 'inline-block'; button.style.visibility = 'visible'; });
        if (authContainer) { authContainer.style.display = 'flex'; authContainer.style.visibility = 'visible'; }
        if (userMenu) { userMenu.style.display = 'none'; userMenu.style.visibility = 'hidden'; }
    }
}

// Run immediately
// console.log('Running updateAuthButtons immediately from fix-auth-buttons.js');
updateAuthButtons();

// Update auth buttons when page loads
document.addEventListener('DOMContentLoaded', () => {
    // console.log('DOMContentLoaded event triggered in fix-auth-buttons.js, updating auth buttons');
    updateAuthButtons();
    // REMOVE: setupUserMenuDropdown();
});