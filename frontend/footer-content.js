/**
 * Footer Content Manager - Universal
 * Manages the "Powered by" footer content across all pages
 * Easy to customize footer text, links, and branding from one place
 */

(function() {
    'use strict';
    
    // === FOOTER CONFIGURATION ===
    // Edit these values to change footer content across all pages
    const FOOTER_CONFIG = {
        // Main footer text
        text: 'Powered by',
        
        // Link configuration
        link: {
            text: 'Warracker',
            url: 'https://warracker.com',
            target: '_blank',
            rel: 'noopener noreferrer'
        },
        
        // Optional: Additional links or text
        // Uncomment and customize as needed
        /*
        additionalContent: [
            { type: 'text', content: ' | ' },
            { type: 'link', text: 'Privacy Policy', url: '/privacy.html' },
            { type: 'text', content: ' | ' },
            { type: 'link', text: 'Terms of Service', url: '/terms.html' }
        ]
        */
    };
    
    // === FOOTER CONTENT GENERATION ===
    function generateFooterContent() {
        let footerHTML = `${FOOTER_CONFIG.text} `;
        
        // Add main link
        footerHTML += `<a href="${FOOTER_CONFIG.link.url}" target="${FOOTER_CONFIG.link.target}" rel="${FOOTER_CONFIG.link.rel}" id="warrackerFooterLink">${FOOTER_CONFIG.link.text}</a>`;
        
        // Add additional content if configured
        if (FOOTER_CONFIG.additionalContent) {
            FOOTER_CONFIG.additionalContent.forEach(item => {
                if (item.type === 'text') {
                    footerHTML += item.content;
                } else if (item.type === 'link') {
                    const target = item.target || '_self';
                    const rel = item.rel || '';
                    footerHTML += `<a href="${item.url}" target="${target}" rel="${rel}">${item.text}</a>`;
                }
            });
        }
        
        return footerHTML;
    }
    
    // === FOOTER INITIALIZATION ===
    function initFooterContent() {
        const footer = document.getElementById('warrackerFooter');
        
        if (!footer) {
            console.warn('Footer element with ID "warrackerFooter" not found');
            return;
        }
        
        // Generate and inject footer content
        const footerContent = generateFooterContent();
        footer.innerHTML = `<p>${footerContent}</p>`;
        
        console.log('Footer content initialized successfully');
    }
    
    // === DYNAMIC FOOTER CREATION ===
    // If no footer exists, create one
    function createFooterIfMissing() {
        let footer = document.getElementById('warrackerFooter');
        
        if (!footer) {
            footer = document.createElement('footer');
            footer.className = 'warracker-footer';
            footer.id = 'warrackerFooter';
            
            // Insert before closing body tag
            document.body.appendChild(footer);
            console.log('Footer element created dynamically');
        }
        
        return footer;
    }
    
    // === PUBLIC API ===
    // Expose functions for manual updates if needed
    window.FooterContent = {
        // Update footer content dynamically
        update: function(newConfig) {
            Object.assign(FOOTER_CONFIG, newConfig);
            initFooterContent();
        },
        
        // Get current configuration
        getConfig: function() {
            return { ...FOOTER_CONFIG };
        },
        
        // Reinitialize footer
        reinit: function() {
            initFooterContent();
        }
    };
    
    // === AUTO-INITIALIZATION ===
    function init() {
        // Ensure footer element exists
        createFooterIfMissing();
        
        // Initialize footer content
        initFooterContent();
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM is already loaded
        init();
    }
    
    console.log('Footer Content Manager loaded');
})(); 