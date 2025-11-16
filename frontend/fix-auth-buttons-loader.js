/**
 * Script to load the fix-auth-buttons.js script on all pages
 * This script should be included in the head of each HTML file
 */

// Log authentication status for debugging
console.log('fix-auth-buttons-loader.js is running');
console.log('Auth token exists:', !!localStorage.getItem('auth_token'));
console.log('User info exists:', !!localStorage.getItem('user_info'));

// Execute immediately to hide buttons as soon as possible
if (localStorage.getItem('auth_token')) {
    console.log('User is logged in, attempting to hide login/register buttons immediately');
    
    // Hide auth container if it exists
    const authContainer = document.getElementById('authContainer');
    if (authContainer) {
        console.log('Found authContainer, hiding it');
        authContainer.style.display = 'none';
    }
    
    // Hide individual buttons if they exist
    const loginButtons = document.querySelectorAll('a[href="login.html"], .login-btn, .auth-btn.login-btn');
    const registerButtons = document.querySelectorAll('a[href="register.html"], .register-btn, .auth-btn.register-btn');
    
    console.log('Found login buttons:', loginButtons.length);
    console.log('Found register buttons:', registerButtons.length);
    
    loginButtons.forEach(button => button.style.display = 'none');
    registerButtons.forEach(button => button.style.display = 'none');
    
    // Show user menu if it exists
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        console.log('Found userMenu, showing it');
        userMenu.style.display = 'block';
    }
}

// Create a script element to load the actual fix script
const script = document.createElement('script');
script.src = 'fix-auth-buttons.js';
script.async = true;

// Add the script to the document
document.head.appendChild(script);

console.log('Added fix-auth-buttons.js script to the page'); 