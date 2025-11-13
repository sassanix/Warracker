/**
 * Footer Width Fix - Universal
 * Ensures the Warracker footer spans full width across all pages
 * Handles both light and dark themes automatically
 */

(function() {
    'use strict';
    
    // Apply footer styles based on theme
    function applyFooterStyles() {
        const footer = document.getElementById('warrackerFooter');
        const link = document.getElementById('warrackerFooterLink');
        
        if (!footer) return; // Exit if footer doesn't exist on this page
        
        // Detect dark mode
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark' || 
                          document.documentElement.classList.contains('dark-mode') ||
                          document.body.classList.contains('dark-mode');
        
        if (isDarkMode) {
            // Dark mode styles without viewport-width hacks (prevents horizontal scrollbar)
            footer.style.cssText = `
                width: 100% !important;
                margin-top: 50px !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding: 20px !important;
                text-align: center !important;
                border-top: 1px solid #444 !important;
                background-color: #2d2d2d !important;
                color: #e0e0e0 !important;
                font-size: 0.9rem !important;
                position: relative !important;
                box-sizing: border-box !important;
            `;
            if (link) {
                link.style.cssText = 'color: #4dabf7 !important; text-decoration: none !important; font-weight: 500 !important;';
            }
        } else {
            // Light mode styles without viewport-width hacks (prevents horizontal scrollbar)
            footer.style.cssText = `
                width: 100% !important;
                margin-top: 50px !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding: 20px !important;
                text-align: center !important;
                border-top: 1px solid #e0e0e0 !important;
                background-color: #ffffff !important;
                color: #333333 !important;
                font-size: 0.9rem !important;
                position: relative !important;
                box-sizing: border-box !important;
            `;
            if (link) {
                link.style.cssText = 'color: #3498db !important; text-decoration: none !important; font-weight: 500 !important;';
            }
        }
    }
    
    // Initialize footer styles when DOM is ready
    function initFooterFix() {
        applyFooterStyles();
        
        // Watch for theme changes on document.documentElement
        const observer = new MutationObserver(applyFooterStyles);
        observer.observe(document.documentElement, { 
            attributes: true, 
            attributeFilter: ['data-theme', 'class'] 
        });
        
        // Also watch body for theme changes (fallback)
        observer.observe(document.body, { 
            attributes: true, 
            attributeFilter: ['class'] 
        });
        
        // Listen for custom theme change events if they exist
        document.addEventListener('themeChanged', applyFooterStyles);
        window.addEventListener('themeChanged', applyFooterStyles);
    }
    
    // Auto-initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFooterFix);
    } else {
        // DOM is already loaded
        initFooterFix();
    }
    
    // Expose function globally in case manual calls are needed
    window.applyFooterFix = applyFooterStyles;
    
    console.log('Footer Fix loaded - Footer will span full width on all pages');
})(); 