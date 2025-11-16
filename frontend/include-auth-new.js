/**
 * Immediate Authentication State Handler
 * 
 * This script runs as soon as possible to hide login/register buttons if a user is logged in
 * It should be included directly in the HTML before any other scripts
 */

console.log('include-auth-new.js: Running immediate auth check');

// Function to update UI based on auth state (extracted for reuse)
function updateAuthUI() {
    if (localStorage.getItem('auth_token')) {
        console.log('include-auth-new.js: Updating UI for authenticated user');
        // Inject CSS to hide auth buttons and show user menu
        const styleId = 'auth-ui-style';
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }
        style.textContent = `
            #authContainer, .auth-buttons, a[href="login.html"], a[href="register.html"], 
            .login-btn, .register-btn, .auth-btn.login-btn, .auth-btn.register-btn {
                display: none !important;
                visibility: hidden !important;
            }
            #userMenu, .user-menu {
                display: block !important;
                visibility: visible !important;
            }
        `;

        // Update user info display elements immediately
        try {
            var userInfoStr = localStorage.getItem('user_info');
            if (userInfoStr) {
                var userInfo = JSON.parse(userInfoStr);
                var displayName = userInfo.username || 'User';
                var userDisplayName = document.getElementById('userDisplayName');
                if (userDisplayName) userDisplayName.textContent = displayName;
                var userName = document.getElementById('userName');
                if (userName) {
                    userName.textContent = (userInfo.first_name || '') + ' ' + (userInfo.last_name || '');
                    if (!userName.textContent.trim()) userName.textContent = userInfo.username || 'User';
                }
                var userEmail = document.getElementById('userEmail');
                if (userEmail && userInfo.email) userEmail.textContent = userInfo.email;
            }
        } catch (e) {
            console.error('include-auth-new.js: Error updating user info display:', e);
        }

    } else {
        console.log('include-auth-new.js: Updating UI for logged-out user');
        // Inject CSS to show auth buttons and hide user menu
        const styleId = 'auth-ui-style';
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }
        style.textContent = `
            #authContainer, .auth-buttons {
                display: flex !important; /* Use flex for container */
                visibility: visible !important;
            }
            a[href="login.html"], a[href="register.html"], 
            .login-btn, .register-btn, .auth-btn.login-btn, .auth-btn.register-btn {
                display: inline-block !important; /* Use inline-block for buttons */
                visibility: visible !important;
            }
            #userMenu, .user-menu {
                display: none !important;
                visibility: hidden !important;
            }
        `;
    }
}

// Immediately check auth state and update UI
updateAuthUI();

// Listen for changes to localStorage and update UI without reloading
window.addEventListener('storage', function(event) {
    if (event.key === 'auth_token' || event.key === 'user_info') {
        console.log(`include-auth-new.js: Storage event detected for ${event.key}. Updating UI.`);
        updateAuthUI(); // Update UI instead of reloading
        // window.location.reload(); // <-- Keep commented out / Remove permanently
    }
});

/**
 * Script to include the new authentication script in existing HTML files
 * This script should be included at the end of the body in each HTML file
 */

// Function to load and execute the new authentication script
function loadAuthNewScript() {
    // Create a script element
    const script = document.createElement('script');
    script.src = 'auth-new.js';
    script.async = true;
    
    // Add the script to the document
    document.body.appendChild(script);
    
    console.log('Added auth-new.js script to the page');
}

// Function to check if we're using the new UI
function isNewUI() {
    // Check for elements that are specific to the new UI
    const loginButton = document.querySelector('a[href="login.html"].auth-btn, a.login');
    const registerButton = document.querySelector('a[href="register.html"].auth-btn, a.register');
    
    // If we find these elements, we're using the new UI
    return !!(loginButton || registerButton);
}

// Load the new authentication script if we're using the new UI
if (isNewUI()) {
    console.log('Detected new UI, loading auth-new.js');
    loadAuthNewScript();
} else {
    console.log('Using old UI, not loading auth-new.js');
} 