/**
 * Authentication Redirect Script
 * 
 * This script handles redirects based on authentication status:
 * - Redirects unauthenticated users from protected pages to login
 * - Redirects authenticated users from login/register to index
 * 
 * Usage:
 * Include this script at the very beginning of your HTML with:
 * <script src="auth-redirect.js" data-protected="true|false"></script>
 * 
 * Set data-protected="true" for pages that require authentication (index, status, settings)
 * Set data-protected="false" for auth pages (login, register)
 */

(function() {
    // Wait for DOM to be ready enough to execute script
    const executeRedirect = () => {
        try {
            // Get current script element
            const currentScript = document.currentScript;
            
            // Check if isProtected attribute is set
            const isProtected = currentScript.getAttribute('data-protected') === 'true';
            
            // Check authentication status
            const isAuthenticated = !!localStorage.getItem('auth_token');
            const currentPath = window.location.pathname;
            
            console.log('Auth redirect check - Protected page:', isProtected);
            console.log('Auth redirect check - Is authenticated:', isAuthenticated);
            console.log('Auth redirect check - Current path:', currentPath);
            
            // Handle protected pages (index, status, settings)
            if (isProtected && !isAuthenticated) {
                console.log('Access to protected page without authentication, redirecting to login');
                window.location.href = 'login.html';
                return;
            }
            
            // Handle auth pages (login, register)
            if (!isProtected && isAuthenticated) {
                console.log('Already authenticated, redirecting from auth page to index');
                window.location.href = 'index.html';
                return;
            }
            
            console.log('No redirect needed');
        } catch (error) {
            console.error('Error in auth-redirect.js:', error);
        }
    };
    
    // Execute immediately
    executeRedirect();
})(); 