/**
 * Registration Status Checker
 * 
 * This script checks if registration is enabled on the site and hides registration buttons/links if disabled.
 * Include this script in all pages that have registration links or buttons.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Only check if user is not logged in
    if (!localStorage.getItem('auth_token')) {
        checkRegistrationStatus();
    }
});

/**
 * Check if registration is enabled and hide registration elements if disabled
 */
function checkRegistrationStatus() {
    fetch('/api/auth/registration-status')
        .then(response => response.json())
        .then(data => {
            if (!data.enabled) {
                // Hide all registration links and buttons
                hideRegistrationElements();
            }
        })
        .catch(error => {
            console.error('Error checking registration status:', error);
        });
}

/**
 * Hide all registration-related elements on the page
 */
function hideRegistrationElements() {
    // Hide elements with specific classes
    const elements = [
        '.register-btn',                // Main navigation register button
        'a[href="register.html"]',      // Links to register page
        'a[href="./register.html"]',    // Links to register page (relative)
        'a[href="/register.html"]'      // Links to register page (root relative)
    ];
    
    // Apply to all matching elements
    elements.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            element.style.display = 'none';
        });
    });
    
    // Special case for auth container in the header
    const authContainer = document.getElementById('authContainer');
    if (authContainer) {
        // Check if it has multiple children and at least one is hidden
        const children = authContainer.children;
        let visibleCount = 0;
        
        for (let i = 0; i < children.length; i++) {
            if (children[i].style.display !== 'none') {
                visibleCount++;
            }
        }
        
        // If there's only one visible child, adjust the container styling
        if (visibleCount === 1) {
            authContainer.style.justifyContent = 'flex-end';
        }
    }
    
    // Special case for auth links in login/register pages
    const authLinks = document.querySelector('.auth-links');
    if (authLinks) {
        const links = authLinks.querySelectorAll('a');
        links.forEach(link => {
            if (link.textContent === 'Create Account' || 
                link.href.includes('register.html')) {
                link.style.display = 'none';
            }
        });
        
        // Add a message about registration being disabled if we're on the login page
        if (window.location.pathname.includes('login.html')) {
            const infoMessage = document.createElement('div');
            infoMessage.className = 'registration-info';
            infoMessage.innerHTML = '<small>New account registration is currently disabled</small>';
            infoMessage.style.color = 'var(--text-muted)';
            infoMessage.style.fontSize = '0.8em';
            infoMessage.style.marginTop = '10px';
            authLinks.appendChild(infoMessage);
        }
    }
} 