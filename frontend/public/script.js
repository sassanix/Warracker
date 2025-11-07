// ===== MOBILE HAMBURGER MENU (kept for other pages) =====
(function() {
    function buildMobileMenuContent(panel, header) {
        if (!panel || !header) return;
        // Build only once
        if (panel.getAttribute('data-built') === 'true') return;
        panel.innerHTML = '';

        const createSection = (titleText) => {
            const title = document.createElement('div');
            title.className = 'section-title';
            title.textContent = titleText;
            panel.appendChild(title);
        };

        const appendLinks = (links) => {
            if (!links || links.length === 0) return;
            const list = document.createElement('div');
            list.className = 'menu-list';
            links.forEach(a => {
                try {
                    const cloned = a.cloneNode(true);
                    // Remove ids to avoid duplicates
                    if (cloned.id) cloned.id = '';
                    list.appendChild(cloned);
                } catch (e) {
                    // Skip problematic nodes
                }
            });
            panel.appendChild(list);
        };

        // Resolve auth state and display name
        const isAuthenticated = !!(function(){ try { return localStorage.getItem('auth_token'); } catch(_) { return null; } })();
        let displayName = '';
        const headerDisplayNameEl = header.querySelector('#userDisplayName');
        if (headerDisplayNameEl && headerDisplayNameEl.textContent) {
            displayName = headerDisplayNameEl.textContent.trim();
        }
        if (!displayName) {
            try {
                const userInfo = JSON.parse(localStorage.getItem('user_info') || 'null');
                if (userInfo) displayName = userInfo.first_name || userInfo.username || 'Account';
            } catch(_) {}
        }
        if (!displayName) displayName = 'Account';

        // Nav links
        const navLinksContainer = header.querySelector('.nav-links');
        const navAnchors = navLinksContainer ? Array.from(navLinksContainer.querySelectorAll('a')) : [];
        if (navAnchors.length) {
            createSection('Navigation');
            appendLinks(navAnchors);
        }

        // Auth buttons if present (only when NOT authenticated)
        const authContainer = header.querySelector('#authContainer');
        const authAnchors = (!isAuthenticated && authContainer) ? Array.from(authContainer.querySelectorAll('a')) : [];
        if (!isAuthenticated && authAnchors.length) {
            createSection('Account');
            appendLinks(authAnchors);
        }

        // User menu dropdown items if present
        const userDropdown = header.querySelector('#userMenuDropdown');
        const userMenuAnchors = userDropdown ? Array.from(userDropdown.querySelectorAll('a')) : [];
        if (userMenuAnchors.length) {
            // Use username as section title when available
            createSection(displayName || 'Menu');
            appendLinks(userMenuAnchors);

            // Add Logout if available
            const logoutSource = header.querySelector('#logoutMenuItem');
            if (logoutSource) {
                const logoutLink = document.createElement('a');
                logoutLink.href = '#';
                logoutLink.id = 'mobileLogoutLink';
                logoutLink.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Logout</span>';
                logoutLink.addEventListener('click', async function(e) {
                    e.preventDefault();
                    try {
                        if (window.auth && typeof window.auth.logout === 'function') {
                            await window.auth.logout();
                        } else {
                            localStorage.removeItem('auth_token');
                            localStorage.removeItem('user_info');
                            window.location.href = 'login.html';
                        }
                    } catch (_) {
                        localStorage.removeItem('auth_token');
                        localStorage.removeItem('user_info');
                        window.location.href = 'login.html';
                    }
                });
                const list = document.createElement('div');
                list.className = 'menu-list';
                list.appendChild(logoutLink);
                panel.appendChild(list);
            }
        }

        panel.setAttribute('data-built', 'true');
    }

    function initializeMobileMenu() {
        const header = document.querySelector('header');
        if (!header) return;
        const toggleBtn = header.querySelector('.mobile-menu-toggle');
        const panel = document.getElementById('mobileMenuPanel');
        const overlay = document.getElementById('mobileMenuOverlay');
        if (!toggleBtn || !panel || !overlay) return;

        // Prevent double-binding
        if (toggleBtn.getAttribute('data-mm-bound') === '1') return;
        toggleBtn.setAttribute('data-mm-bound', '1');

        const openMenu = () => {
            buildMobileMenuContent(panel, header);
            panel.classList.add('is-open');
            overlay.classList.add('is-open');
            document.body.classList.add('mobile-menu-active');
        };

        const closeMenu = () => {
            panel.classList.remove('is-open');
            overlay.classList.remove('is-open');
            document.body.classList.remove('mobile-menu-active');
        };

        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const isOpen = panel.classList.contains('is-open');
            if (isOpen) closeMenu(); else openMenu();
        });

        overlay.addEventListener('click', function() {
            closeMenu();
        });

        panel.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && link.href) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && panel.classList.contains('is-open')) {
                closeMenu();
            }
        });
    }

    // Expose and initialize
    window.initializeMobileMenu = initializeMobileMenu;
    document.addEventListener('DOMContentLoaded', initializeMobileMenu);
})();
console.log('[SCRIPT VERSION] 20250529-005 - Added CSS cache busting for consistent styling across domains');
console.log('[DEBUG] script.js loaded and running');

// alert('script.js loaded!'); // Remove alert after confirming script loads

// Global variables
let warranties = [];
let warrantiesLoaded = false; // Track if warranties have been loaded from API
let lastLoadedArchived = false; // Track if the current warranties array came from archived endpoint
let lastLoadedIncludesArchived = false; // Track if the current warranties list includes archived items
let currentTabIndex = 0;
let tabContents = []; // Initialize as empty array
let editMode = false;
let currentWarrantyId = null;
let userPreferencePrefix = null; // <<< ADDED GLOBAL PREFIX VARIABLE
let isGlobalView = false; // Track if admin is viewing all users' warranties
let currentFilters = {
    status: 'all',
    tag: 'all',
    search: '',
    sortBy: 'expiration',
    vendor: 'all', // Added vendor filter
    warranty_type: 'all' // Added warranty type filter
};

// Tag related variables
let allTags = [];
let selectedTags = []; // Will hold objects with id, name, color

// Global variable for edit mode tags
let editSelectedTags = [];

// DOM Elements
const warrantyForm = document.getElementById('warrantyForm');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const darkModeToggle = document.getElementById('darkModeToggle');
const warrantiesList = document.getElementById('warrantiesList');
const refreshBtn = document.getElementById('refreshBtn');
const searchInput = document.getElementById('searchWarranties');
const clearSearchBtn = document.getElementById('clearSearch');
const statusFilter = document.getElementById('statusFilter');
const sortBySelect = document.getElementById('sortBy');
const vendorFilter = document.getElementById('vendorFilter'); // Added vendor filter select
const warrantyTypeFilter = document.getElementById('warrantyTypeFilter'); // Added warranty type filter select
const exportBtn = document.getElementById('exportBtn');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const tableViewHeader = document.querySelector('.table-view-header');

// Admin view controls
const adminViewSwitcher = document.getElementById('adminViewSwitcher');
const personalViewBtn = document.getElementById('personalViewBtn');
const globalViewBtn = document.getElementById('globalViewBtn');
const warrantiesPanelTitle = document.getElementById('warrantiesPanelTitle');
const fileInput = document.getElementById('invoice');
const fileName = document.getElementById('fileName');
const manualInput = document.getElementById('manual');
const manualFileName = document.getElementById('manualFileName');
const otherDocumentInput = document.getElementById('otherDocument'); 
const otherDocumentFileName = document.getElementById('otherDocumentFileName'); 
const editModal = document.getElementById('editModal');
const deleteModal = document.getElementById('deleteModal');
const editWarrantyForm = document.getElementById('editWarrantyForm');
const saveWarrantyBtn = document.getElementById('saveWarrantyBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const loadingContainer = document.getElementById('loadingContainer');
const toastContainer = document.getElementById('toastContainer');

// CSV Import Elements
const importBtn = document.getElementById('importBtn');
const csvFileInput = document.getElementById('csvFileInput');
if (importBtn) {
    importBtn.classList.remove('import-btn');
    importBtn.classList.add('export-btn');
}

// Tag DOM Elements
const selectedTagsContainer = document.getElementById('selectedTags');
const tagSearch = document.getElementById('tagSearch');
const tagsList = document.getElementById('tagsList');
const manageTagsBtn = document.getElementById('manageTagsBtn');
const tagManagementModal = document.getElementById('tagManagementModal');
const newTagForm = document.getElementById('newTagForm');
const existingTagsContainer = document.getElementById('existingTags');

// Claims modal elements
const claimsModal = document.getElementById('claimsModal');
const claimFormModal = document.getElementById('claimFormModal');
const claimsListBody = document.getElementById('claimsListBody');
const addClaimBtn = document.getElementById('addClaimBtn');
const claimForm = document.getElementById('claimForm');
const saveClaimBtn = document.getElementById('saveClaimBtn');
const editClaimId = document.getElementById('editClaimId');
const claimFormTitle = document.getElementById('claimFormTitle');
const warrantyClaimInfo = document.getElementById('warrantyClaimInfo');

// --- Add near other DOM Element declarations ---
const isLifetimeCheckbox = document.getElementById('isLifetime');
const warrantyDurationFields = document.getElementById('warrantyDurationFields'); // New container
const warrantyDurationYearsInput = document.getElementById('warrantyDurationYears');
const warrantyDurationMonthsInput = document.getElementById('warrantyDurationMonths');
const warrantyDurationDaysInput = document.getElementById('warrantyDurationDays');

const editIsLifetimeCheckbox = document.getElementById('editIsLifetime');
const editWarrantyDurationFields = document.getElementById('editWarrantyDurationFields'); // New container
const editWarrantyDurationYearsInput = document.getElementById('editWarrantyDurationYears');
const editWarrantyDurationMonthsInput = document.getElementById('editWarrantyDurationMonths');
const editWarrantyDurationDaysInput = document.getElementById('editWarrantyDurationDays');

// Warranty Type DOM Elements
const warrantyTypeInput = document.getElementById('warrantyType');
const warrantyTypeCustomInput = document.getElementById('warrantyTypeCustom');
const editWarrantyTypeInput = document.getElementById('editWarrantyType');
const editWarrantyTypeCustomInput = document.getElementById('editWarrantyTypeCustom');

// Warranty method selection elements
const durationMethodRadio = document.getElementById('durationMethod');
const exactDateMethodRadio = document.getElementById('exactDateMethod');
const exactExpirationField = document.getElementById('exactExpirationField');
const exactExpirationDateInput = document.getElementById('exactExpirationDate');

const editDurationMethodRadio = document.getElementById('editDurationMethod');
const editExactDateMethodRadio = document.getElementById('editExactDateMethod');
const editExactExpirationField = document.getElementById('editExactExpirationField');
const editExactExpirationDateInput = document.getElementById('editExactExpirationDate');

// Add near other DOM Element declarations
const showAddWarrantyBtn = document.getElementById('showAddWarrantyBtn');
const addWarrantyModal = document.getElementById('addWarrantyModal');

// Currency dropdown elements
const currencySelect = document.getElementById('currency');
const editCurrencySelect = document.getElementById('editCurrency');
const serialNumbersContainer = document.getElementById('serialNumbersContainer'); // Ensure this is defined

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
 * Initialize view controls for all authenticated users
 */
async function initViewControls() {
    // Check if global view is enabled
    try {
        const response = await fetch('/api/settings/global-view-status', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + (window.auth ? window.auth.getToken() : localStorage.getItem('auth_token')),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            const scopeDropdown = document.getElementById('scopeDropdown');
            // Keep bottom admin switcher hidden; control only the header scope dropdown
            if (adminViewSwitcher) adminViewSwitcher.style.display = 'none';
            if (result.enabled) {
                if (scopeDropdown) scopeDropdown.style.display = 'block';
                // Apply saved scope (update title and state)
                const savedScope = loadViewScopePreference();
                if (savedScope === 'global') {
                    isGlobalView = true;
                    updateWarrantiesPanelTitle(true);
                } else {
                    isGlobalView = false;
                    updateWarrantiesPanelTitle(false);
                }
            } else {
                if (scopeDropdown) scopeDropdown.style.display = 'none';
                if (isGlobalView) {
                    isGlobalView = false;
                    updateWarrantiesPanelTitle(false);
                    await loadWarranties(true);
                    applyFilters();
                }
            }
        } else {
            console.error('Failed to check global view status');
            // Hide bottom switcher even on failure; show header dropdown for fallback
            if (adminViewSwitcher) adminViewSwitcher.style.display = 'none';
            const scopeDropdown = document.getElementById('scopeDropdown');
            if (scopeDropdown) scopeDropdown.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking global view status:', error);
        // Keep bottom switcher hidden; show header dropdown as fallback
        if (adminViewSwitcher) adminViewSwitcher.style.display = 'none';
        const scopeDropdown = document.getElementById('scopeDropdown');
        if (scopeDropdown) scopeDropdown.style.display = 'block';
    }
}

/**
 * Switch to personal view (user's own warranties)
 */
async function switchToPersonalView() {
    if (!personalViewBtn || !globalViewBtn) return;
    
    isGlobalView = false;
    personalViewBtn.classList.add('active');
    globalViewBtn.classList.remove('active');
    
    // Save view preference
    saveViewScopePreference('personal');
    
    // Update title
    updateWarrantiesPanelTitle(false);
    
    // Update header scope label
    try {
        const currentScopeIcon = document.getElementById('currentScopeIcon');
        if (currentScopeIcon) {
            currentScopeIcon.className = 'fas fa-user';
            currentScopeIcon.setAttribute('aria-label', 'Personal');
        }
    } catch (e) { /* no-op */ }

    // Reload warranties
    try {
        const token = window.auth.getToken();
        if (token) {
            await loadWarranties(true);
            applyFilters();
        }
    } catch (error) {
        console.error('Error switching to personal view:', error);
        showToast(window.t('messages.error_loading_personal_warranties'), 'error');
    }
}

/**
 * Switch to global view (all users' warranties) - available to all users
 */
async function switchToGlobalView() {
    if (!personalViewBtn || !globalViewBtn) return;
    
    // Check if global view is still enabled
    try {
        const response = await fetch('/api/settings/global-view-status', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + (window.auth ? window.auth.getToken() : localStorage.getItem('auth_token')),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (!result.enabled) {
                showToast(window.t('messages.global_view_disabled'), 'error');
                return;
            }
        }
    } catch (error) {
        console.error('Error checking global view status:', error);
    }
    
    isGlobalView = true;
    personalViewBtn.classList.remove('active');
    globalViewBtn.classList.add('active');
    
    // Save view preference
    saveViewScopePreference('global');
    
    // Update title
    updateWarrantiesPanelTitle(true);
    
    // Update header scope label
    try {
        const currentScopeIcon = document.getElementById('currentScopeIcon');
        if (currentScopeIcon) {
            currentScopeIcon.className = 'fas fa-globe';
            currentScopeIcon.setAttribute('aria-label', 'Global');
        }
    } catch (e) { /* no-op */ }

    // Reload warranties
    try {
        const token = window.auth.getToken();
        if (token) {
            await loadWarranties(true);
            applyFilters();
        }
    } catch (error) {
        console.error('Error switching to global view:', error);
        showToast(window.t('messages.error_loading_global_warranties'), 'error');
    }
}

/**
 * Update warranties panel title with proper translation
 * @param {boolean} isGlobal - Whether to show global or personal title
 */
function updateWarrantiesPanelTitle(isGlobal = false) {
    if (warrantiesPanelTitle) {
        if (window.i18next && window.i18next.t) {
            warrantiesPanelTitle.textContent = isGlobal ? 
                window.i18next.t('warranties.title_global') : 
                window.i18next.t('warranties.title');
        } else {
            warrantiesPanelTitle.textContent = isGlobal ? 'All Users\' Warranties' : 'Your Warranties';
        }
    }
}

/**
 * Get the appropriate localStorage key prefix based on user type
 * @returns {string} The prefix to use for localStorage keys
 */
function getPreferenceKeyPrefix() {
    return getUserType() === 'admin' ? 'admin_' : 'user_';
}

/**
 * Save view scope preference to localStorage
 * @param {string} scope - 'personal' or 'global'
 */
function saveViewScopePreference(scope) {
    try {
        const prefix = getPreferenceKeyPrefix();
        localStorage.setItem(`${prefix}viewScope`, scope);
        console.log(`Saved view scope preference: ${scope} with prefix: ${prefix}`);
    } catch (error) {
        console.error('Error saving view scope preference:', error);
    }
}

/**
 * Load view scope preference from localStorage
 * @returns {string} The saved preference ('personal', 'global', or 'personal' as default)
 */
function loadViewScopePreference() {
    try {
        const prefix = getPreferenceKeyPrefix();
        const savedScope = localStorage.getItem(`${prefix}viewScope`);
        console.log(`Loaded view scope preference: ${savedScope} with prefix: ${prefix}`);
        return savedScope || 'personal'; // Default to personal view
    } catch (error) {
        console.error('Error loading view scope preference:', error);
        return 'personal'; // Default to personal view on error
    }
}

// Theme Management - Simplified
function setTheme(isDark) {
    const theme = isDark ? 'dark' : 'light';
    console.log('Setting theme to:', theme);
    
    // 1. Apply theme attribute to document root
    document.documentElement.setAttribute('data-theme', theme);
        
    // 2. Save the single source of truth to localStorage
    localStorage.setItem('darkMode', isDark);
    
    // Update toggle state if the toggle exists on this page (e.g., in the header)
    const headerToggle = document.getElementById('darkModeToggle'); 
    if (headerToggle) {
        headerToggle.checked = isDark;
    }
}

// Persist theme to API similar to view/filters
async function saveThemePreference(isDark, saveToApi = true) {
    try {
        // Always persist locally first
        setTheme(isDark);

        if (saveToApi && window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated()) {
            const token = window.auth.getToken();
            if (token) {
                try {
                    console.log('[Theme] Saving theme preference to API:', isDark ? 'dark' : 'light');
                    const response = await fetch('/api/auth/preferences', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ theme: isDark ? 'dark' : 'light' })
                    });
                    if (!response.ok) {
                        console.warn('[Theme] Failed to save theme to API:', response.status);
                    }
                } catch (err) {
                    console.error('[Theme] Error saving theme to API:', err);
                }
            }
        }
    } catch (e) {
        console.warn('Failed to save theme preference', e);
    }
}

// Initialization logic on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker registered with scope:', registration.scope);
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        });
    }

    // --- Search button click triggers search ---
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchWarranties');
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            currentFilters.search = searchInput.value.toLowerCase();
            applyFilters();
        });
    }
    // --- Ensure globalManageTagsBtn triggers modal and tag form is always initialized ---
    // (Redundant with setupUIEventListeners, but ensures modal is always ready)
    const globalManageTagsBtn = document.getElementById('globalManageTagsBtn');
    if (globalManageTagsBtn) {
        globalManageTagsBtn.addEventListener('click', async () => {
            if (!allTags || allTags.length === 0) {
                showLoadingSpinner();
                try {
                    await loadTags();
                } catch (error) {
                    console.error("Failed to load tags before opening modal:", error);
                    showToast(window.t('messages.could_not_load_tags'), "error");
                    hideLoadingSpinner();
                    return;
                }
                hideLoadingSpinner();
            }
            openTagManagementModal();
        });
    }
    console.log('[DEBUG] Registering authStateReady event handler');
    // ... other initialization ...

    // --- BEGIN REFACTORED TAG MODAL AND MAIN FORM TAG UI SETUP ---
    const globalTagManagementModal = document.getElementById('tagManagementModal');
    const globalNewTagForm = document.getElementById('newTagForm'); // Inside tagManagementModal
    const mainTagSearchInput = document.getElementById('tagSearch'); // For the main "Add Warranty" form's tag search
    const warrantyFormElement = document.getElementById('warrantyForm'); // The main add warranty form

    // 1. ALWAYS Initialize listeners for the global Tag Management Modal IF IT EXISTS
    if (globalTagManagementModal) {
        if (globalNewTagForm) {
            // Ensure the event listener is attached only once, or manage it if DOMContentLoaded could fire multiple times (not typical)
            // For simplicity, assuming DOMContentLoaded runs once per page load.
            globalNewTagForm.addEventListener('submit', (e) => {
                e.preventDefault();
                // Inline implementation for creating a new tag from the modal
                const tagNameInput = document.getElementById('newTagName');
                const tagColorInput = document.getElementById('newTagColor');
                const name = tagNameInput ? tagNameInput.value.trim() : '';
                const color = tagColorInput ? tagColorInput.value : '#808080';
                if (!name) {
                    showToast(window.t('messages.tag_name_required'), 'error');
                    return;
                }
                // Use the existing createTag function if available
                if (typeof createTag === 'function') {
                    createTag(name, color)
                        .then(() => {
                            if (tagNameInput) tagNameInput.value = '';
                            if (tagColorInput) tagColorInput.value = '#808080';
                            renderExistingTags && renderExistingTags();
                        })
                        .catch((err) => {
                            showToast((err && err.message) || window.t('messages.failed_to_create_tag'), 'error');
                        });
                } else {
                    showToast(window.t('messages.tag_creation_function_not_found'), 'error');
                }
            });
        }

        const closeButtons = globalTagManagementModal.querySelectorAll('[data-dismiss="modal"]');
        closeButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                globalTagManagementModal.style.display = 'none';
                event.stopPropagation(); // This was the fix from before, ensuring it's applied
            });
        });
        console.log('Global Tag Management Modal listeners initialized directly in DOMContentLoaded.');
    }

    // 2. Initialize Tag functionality FOR THE MAIN ADD WARRANTY FORM (if its specific tag search input exists)
    // initTagFunctionality is now refactored to be specific to the main form's tag UI.
    if (mainTagSearchInput) {
        initTagFunctionality(); // Sets up main form tag search, its manage button, etc.
                                // Also calls loadTags() if needed for the main form.
    }
    // --- END REFACTORED TAG MODAL AND MAIN FORM TAG UI SETUP ---


    // Setup form submission (assuming addWarrantyForm exists - this is 'warrantyFormElement')
    // const form = document.getElementById('addWarrantyForm'); // Old selector
    if (warrantyFormElement) { // Use the variable defined above
        warrantyFormElement.addEventListener('submit', handleFormSubmit);
        // Initialize form tabs if the form exists
        // initFormTabs(); // This should be called when the ADD MODAL is SHOWN, not globally here.
                          // It's correctly in setupModalTriggers for the addWarrantyModal.
    }


    // Initialize theme toggle state *after* DOM is loaded
    // ... (theme toggle init logic remains) ...

    // Setup view switcher (assuming view switcher elements exist)
    if (document.getElementById('gridViewBtn')) {
        // setupViewSwitcher(); // Removed undefined function
        loadViewPreference(); // This is fine here, loads initial view preference.
    }

    // Setup filter controls (assuming filter controls exist)
    if (document.getElementById('filterControls')) {
        // setupFilterControls(); // Removed: function not defined
        // populateTagFilter(); // This should be called AFTER warranties (and their tags) are loaded.
                              // It's called in loadWarranties -> processAllWarranties or similar flow.
    }

    // Initialize modal interactions (general modal triggers like close buttons, backdrop)
    setupModalTriggers(); // This sets up general modal behaviors and specific triggers for add/edit.

    // Initialize form-specific lifetime checkbox handler FOR THE MAIN ADD FORM
    const lifetimeCheckbox = document.getElementById('isLifetime'); // Main form's checkbox
    if (lifetimeCheckbox) {
        lifetimeCheckbox.addEventListener('change', handleLifetimeChange);
        handleLifetimeChange({ target: lifetimeCheckbox }); // Initial check
    }

    // Initialize warranty method selection handlers
    if (durationMethodRadio && exactDateMethodRadio) {
        durationMethodRadio.addEventListener('change', handleWarrantyMethodChange);
        exactDateMethodRadio.addEventListener('change', handleWarrantyMethodChange);
        handleWarrantyMethodChange(); // Initial setup
    }

    if (editDurationMethodRadio && editExactDateMethodRadio) {
        editDurationMethodRadio.addEventListener('change', handleEditWarrantyMethodChange);
        editExactDateMethodRadio.addEventListener('change', handleEditWarrantyMethodChange);
        handleEditWarrantyMethodChange(); // Initial setup for edit form
    }

    // --- LOAD WARRANTIES AFTER AUTH ---
    let authStateHandled = false;

    async function runAuthenticatedTasks(isAuthenticated) { // Added isAuthenticated parameter
        if (!isAuthenticated) {
            console.log('[DEBUG] runAuthenticatedTasks: Called with isAuthenticated = false. Not running tasks yet.');
            // Do not set authStateHandled = true here, allow a subsequent call with true.
            return;
        }
        // If we reach here, isAuthenticated is true.
        if (authStateHandled) {
            console.log('[DEBUG] runAuthenticatedTasks: Tasks already handled (or in progress by another call).');
            return;
        }
        authStateHandled = true; // Set flag only when tasks are actually starting with isAuthenticated = true.
        console.log('[DEBUG] runAuthenticatedTasks: Executing with isAuthenticated = true.');

        // Set prefix
        userPreferencePrefix = getPreferenceKeyPrefix();
        console.log(`[runAuthenticatedTasks] Determined and stored global prefix: ${userPreferencePrefix}`);

        // Re-check auth status just before critical data loads
        const currentAuthStatus = window.auth && window.auth.isAuthenticated();
        console.log(`[runAuthenticatedTasks] Current auth status before loading prefs/warranties: ${currentAuthStatus}`);

        if (currentAuthStatus) {
            await loadAndApplyUserPreferences(true); // Pass true, as we've confirmed auth
            await loadTags(); // Ensure all available tags are loaded
            await loadCurrencies(); // Load currencies for dropdowns
            
            // Initialize Paperless-ngx integration
            await initPaperlessNgxIntegration();
            
            // Initialize view controls for all users
            initViewControls();

            if (document.getElementById('warrantiesList')) {
                console.log("[runAuthenticatedTasks] Loading warranty data...");
                await loadWarranties(true); // Pass true
                console.log('[DEBUG] After loadWarranties, warranties array:', warranties);
                // After warranties are loaded and filter dropdowns populated, load filter/sort prefs and apply
                loadFilterAndSortPreferences();
                // Reflect saved filters in UI selects if present
                const statusFilterEl = document.getElementById('statusFilter');
                const tagFilterEl = document.getElementById('tagFilter');
                const vendorFilterEl = document.getElementById('vendorFilter');
                const warrantyTypeFilterEl = document.getElementById('warrantyTypeFilter');
                const sortByEl = document.getElementById('sortBy');
                if (statusFilterEl && currentFilters.status) statusFilterEl.value = currentFilters.status;
                if (tagFilterEl && currentFilters.tag) tagFilterEl.value = currentFilters.tag;
                if (vendorFilterEl && currentFilters.vendor) vendorFilterEl.value = currentFilters.vendor;
                if (warrantyTypeFilterEl && currentFilters.warranty_type) warrantyTypeFilterEl.value = currentFilters.warranty_type;
                if (sortByEl && currentFilters.sortBy) sortByEl.value = currentFilters.sortBy;
                // Update the filter indicator if available
                if (typeof window.updateFilterIndicator === 'function') {
                    window.updateFilterIndicator();
                }
            } else {
                console.log("[runAuthenticatedTasks] Warranties list element not found.");
            }
        } else {
            console.warn("[runAuthenticatedTasks] Auth status became false before loading data. Aborting data load.");
            // Optionally, reset authStateHandled if we want to allow another attempt
            // authStateHandled = false; 
        }

        // Now that data and preferences are ready, apply view/currency and render via applyFilters
        console.log("[runAuthenticatedTasks] Applying preferences and rendering...");
        loadViewPreference(); // Sets currentView and UI classes/buttons
        updateCurrencySymbols(); // Update symbols
        
        // Apply filters using the loaded data and render the list
        if (document.getElementById('warrantiesList')) { 
            applyFilters(); 
        }
    }

    // Listener for the 'authStateReady' event
    window.addEventListener('authStateReady', async function handleAuthEvent(event) {
        console.log('[DEBUG] authStateReady event received in script.js. Detail:', event.detail);
        // Pass the isAuthenticated status from the event detail to runAuthenticatedTasks
        await runAuthenticatedTasks(event.detail && event.detail.isAuthenticated);
    }); // Removed { once: true } to allow re-evaluation if auth state changes

    // Proactive check after a brief delay to allow auth.js to initialize
    setTimeout(async () => {
        console.log('[DEBUG] Proactive auth check in script.js (after timeout).');
        if (window.auth) {
            // Pass the current authentication status to runAuthenticatedTasks
            await runAuthenticatedTasks(window.auth.isAuthenticated());
        } else {
            console.log('[DEBUG] Proactive check: window.auth not available. Event listener should handle it.');
            // Call with false if auth module isn't ready, to avoid tasks running prematurely.
            await runAuthenticatedTasks(false);
        }
    }, 500); // Delay
    // --- END LOAD WARRANTIES AFTER AUTH ---

    // updateCurrencySymbols(); // Call removed, rely on loadWarranties triggering render with correct symbol
});

// Initialize theme based on user preference or system preference
function initializeTheme() {
    // Only use the global darkMode key for theme persistence
    const savedTheme = localStorage.getItem('darkMode');
    if (savedTheme !== null) {
        setTheme(savedTheme === 'true');
    } else {
        setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
}

// Variables
let currentView = 'grid'; // Default view
let expiringSoonDays = 30; // Default value, will be updated from user preferences

// API URL
const API_URL = '/api/warranties';
async function toggleArchiveStatus(warrantyId, shouldArchive) {
    try {
        const token = window.auth.getToken();
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/warranties/${warrantyId}/archive`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ archived: !!shouldArchive })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        // Reload appropriate list
        // Always reload current view to ensure accurate list source
        await loadWarranties(true);
        showToast(shouldArchive ? (window.t ? window.t('messages.archived_success') : 'Archived') : (window.t ? window.t('messages.unarchived_success') : 'Unarchived'), 'success');
    } catch (e) {
        console.error('Failed to toggle archive status', e);
        showToast(window.t ? window.t('messages.error_updating_archive_status') : 'Failed to update archive status', 'error');
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Form tab navigation variables (simplified)
let formTabs = []; // Changed from const to let, initialized as empty
// Removed const formTabsElements = document.querySelectorAll('.form-tab');
// Removed const formTabs = formTabsElements ? Array.from(formTabsElements) : [];
// Removed const tabContentsElements = document.querySelectorAll('.tab-content');
// Removed tabContents assignment here

// const nextButton = document.querySelector('.next-tab'); // Keep these if needed globally, otherwise might remove
// const prevButton = document.querySelector('.prev-tab'); // Keep these if needed globally, otherwise might remove

// --- Add near other DOM Element declarations ---
    // ... existing code ...
    // Add save button handler for notes modal (if not already present)
    const saveNotesBtn = document.getElementById('saveNotesBtn');
    if (saveNotesBtn) {
        saveNotesBtn.onclick = async function() {
            // Get the warranty ID being edited
            const warrantyId = notesModalWarrantyId;
            const notesValue = document.getElementById('notesModalTextarea').value;
            if (!warrantyId || !notesModalWarrantyObj) return;
            // Get auth token
            const token = localStorage.getItem('auth_token');
            if (!token) {
                showToast(window.t('messages.authentication_required'), 'error');
                return;
            }
            showLoadingSpinner();
            try {
                // Use FormData and send all required fields, just like the edit modal
                const formData = new FormData();
                formData.append('product_name', notesModalWarrantyObj.product_name);
                formData.append('purchase_date', (notesModalWarrantyObj.purchase_date || '').split('T')[0]);
                formData.append('is_lifetime', notesModalWarrantyObj.is_lifetime ? 'true' : 'false');
                if (!notesModalWarrantyObj.is_lifetime) {
                    // Append duration components instead of warranty_years
                    formData.append('warranty_duration_years', notesModalWarrantyObj.warranty_duration_years || 0);
                    formData.append('warranty_duration_months', notesModalWarrantyObj.warranty_duration_months || 0);
                    formData.append('warranty_duration_days', notesModalWarrantyObj.warranty_duration_days || 0);
                    
                    // If all duration fields are 0 but we have an expiration date, this was created with exact date method
                    const isExactDateWarranty = (notesModalWarrantyObj.warranty_duration_years || 0) === 0 &&
                                              (notesModalWarrantyObj.warranty_duration_months || 0) === 0 &&
                                              (notesModalWarrantyObj.warranty_duration_days || 0) === 0 &&
                                              notesModalWarrantyObj.expiration_date;
                    
                    if (isExactDateWarranty) {
                        // For exact date warranties, send the expiration date as exact_expiration_date
                        formData.append('exact_expiration_date', notesModalWarrantyObj.expiration_date.split('T')[0]);
                    }
                }
                if (notesModalWarrantyObj.product_url) {
                    formData.append('product_url', notesModalWarrantyObj.product_url);
                }
                if (notesModalWarrantyObj.purchase_price !== null && notesModalWarrantyObj.purchase_price !== undefined) {
                    formData.append('purchase_price', notesModalWarrantyObj.purchase_price);
                }
                if (notesModalWarrantyObj.vendor) {
                    formData.append('vendor', notesModalWarrantyObj.vendor);
                }
                if (notesModalWarrantyObj.warranty_type) {
                    formData.append('warranty_type', notesModalWarrantyObj.warranty_type);
                }
                if (typeof notesModalWarrantyObj.model_number !== 'undefined' && notesModalWarrantyObj.model_number !== null) {
                    formData.append('model_number', notesModalWarrantyObj.model_number);
                }
                if (notesModalWarrantyObj.serial_numbers && Array.isArray(notesModalWarrantyObj.serial_numbers)) {
                    notesModalWarrantyObj.serial_numbers.forEach(sn => {
                        if (sn && sn.trim() !== '') {
                            formData.append('serial_numbers[]', sn); // Use [] for arrays
                        }
                    });
                } else if (!formData.has('serial_numbers[]')) {
                    // Send empty array if none exist
                    // formData.append('serial_numbers[]', ''); // Sending empty string might not work as expected, better to not send if empty
                }
                if (notesModalWarrantyObj.tags && Array.isArray(notesModalWarrantyObj.tags)) {
                    const tagIds = notesModalWarrantyObj.tags.map(tag => tag.id);
                    formData.append('tag_ids', JSON.stringify(tagIds));
                } else {
                    formData.append('tag_ids', JSON.stringify([]));
                }
                formData.append('notes', notesValue);
                // Also include model number value from edit input if present on DOM
                const editModelNumberInput = document.getElementById('editModelNumber');
                if (editModelNumberInput && editModelNumberInput.value.trim() !== '') {
                    formData.set('model_number', editModelNumberInput.value.trim());
                }
                const response = await fetch(`/api/warranties/${warrantyId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': 'Bearer ' + token
                    },
                    body: formData
                });
                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to update notes');
                }
                hideLoadingSpinner();
                showToast(window.t('messages.notes_updated_successfully'), 'success');
                // Close the modal
                const notesModal = document.getElementById('notesModal');
                if (notesModal) notesModal.style.display = 'none';
                // Now reload warranties and re-render UI
                await loadWarranties();
                applyFilters();
            } catch (error) {
                hideLoadingSpinner();
                console.error('Error updating notes:', error);
                showToast(error.message || window.t('messages.failed_to_update_notes'), 'error');
            }
        };
    }

// Initialize form tabs
function initFormTabs() {
    console.log('Initializing form tabs...');
    // Use the modal context if available, otherwise query document
    const modalContext = document.getElementById('addWarrantyModal'); // Assuming this is the context
    const context = modalContext && modalContext.classList.contains('active') ? modalContext : document;

    const tabsContainer = context.querySelector('.form-tabs');
    // Re-query tabContents and formTabs within the correct context and update global variables
    const contentsElements = context.querySelectorAll('.tab-content');
    tabContents = contentsElements ? Array.from(contentsElements) : []; // Update global variable

    const tabsElements = tabsContainer ? tabsContainer.querySelectorAll('.form-tab') : [];
    formTabs = tabsElements ? Array.from(tabsElements) : []; // Update global variable

    const nextButton = context.querySelector('#nextTabBtn'); // Use context
    const prevButton = context.querySelector('#prevTabBtn'); // Use context
    const submitButton = context.querySelector('#submitWarrantyBtn'); // Use context

    // Use the updated global variables length for checks
    if (!tabsContainer || !tabContents.length || !formTabs.length || !nextButton || !prevButton || !submitButton) {
        console.warn('Form tab elements not found in the expected context. Skipping tab initialization.');
        return; // Don't proceed if elements aren't present
    }

    // Remove the local 'tabs' and 'contents' variables, use global ones now
    // let currentTabIndex = 0; // Already global
    // const tabs = tabsContainer.querySelectorAll('.form-tab'); // Use global formTabs
    // const contents = document.querySelectorAll('.tab-content'); // Use global tabContents

    // Remove the inner switchToTab and updateNavigationButtons functions as they are defined globally
    /*
    function switchToTab(index) {
        // ... removed inner function ...
    }

    function updateNavigationButtons() {
        // ... removed inner function ...
    }
    */

    // --- CLONE AND REPLACE NAV BUTTONS TO REMOVE OLD LISTENERS ---
    // Ensure buttons exist before cloning
    let nextButtonCloned = nextButton;
    let prevButtonCloned = prevButton;
    if (nextButton && prevButton) {
        nextButtonCloned = nextButton.cloneNode(true);
        prevButtonCloned = prevButton.cloneNode(true);
        nextButton.parentNode.replaceChild(nextButtonCloned, nextButton);
        prevButton.parentNode.replaceChild(prevButtonCloned, prevButton);
    } else {
        console.warn("Next/Prev buttons not found for cloning listeners.");
    }


    // ... (rest of initFormTabs, including event listeners, ensure element checks)
    // Make sure event listeners use the correct global functions and variables
    formTabs.forEach((tab, index) => { // Use global formTabs
        if (tab) { // Check if tab exists
            tab.addEventListener('click', () => {
                // Allow clicking only on previous tabs if valid, or current
                if (index < currentTabIndex) {
                    let canSwitch = true;
                    for (let i = 0; i < index; i++) {
                        // Ensure validateTab uses the correct global tabContents
                        if (!validateTab(i)) {
                            canSwitch = false;
                            break;
                        }
                    }
                    if (canSwitch) switchToTab(index); // Call global function
                } else if (index === currentTabIndex) {
                    // Clicking current tab does nothing
                } else {
                    // Try to navigate forward by clicking tab
                    // Ensure validateTab uses the correct global tabContents
                    if (validateTab(currentTabIndex)) {
                        // Mark current as completed
                        if(formTabs[currentTabIndex]) formTabs[currentTabIndex].classList.add('completed'); // Use global formTabs
                        switchToTab(index); // Call global function
                    } else {
                         // If current tab is invalid, show errors for it
                         showValidationErrors(currentTabIndex);
                    }
                }
            });
        }
    });

    if (nextButtonCloned) { // Check button exists
        nextButtonCloned.addEventListener('click', () => {
            // Ensure validateTab uses the correct global tabContents
            if (validateTab(currentTabIndex)) {
                if (formTabs[currentTabIndex]) formTabs[currentTabIndex].classList.add('completed'); // Use global formTabs
                // Use global formTabs length
                if (currentTabIndex < formTabs.length - 1) { // <-- Ensure this uses formTabs.length
                    switchToTab(currentTabIndex + 1); // Call global function
                }
            } else {
                // If current tab is invalid, show errors
                showValidationErrors(currentTabIndex);
            }
        });
    } else {
         console.warn("Cloned Next button not found, listener not added.");
    }

    if (prevButtonCloned) { // Check button exists
        prevButtonCloned.addEventListener('click', () => {
            if (currentTabIndex > 0) {
                switchToTab(currentTabIndex - 1);
            }
        });
    }

    // Initialize the first tab
    switchToTab(0);
}

// Switch to a specific tab
function switchToTab(index) {
    console.log(`Switching to tab ${index} from tab ${currentTabIndex}`);
    
    // Ensure index is within bounds
    if (index < 0 || index >= formTabs.length) {
        console.log(`Invalid tab index: ${index}, not switching`);
        return;
    }
    
    // Update summary FIRST if switching TO the summary tab
    if (index === formTabs.length - 1) {
        updateSummary();
    }
    
    // Update active tab
    formTabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    formTabs[index].classList.add('active');
    tabContents[index].classList.add('active');
    
    // Update current tab index
    currentTabIndex = index;
    
    // Update progress indicator
    document.querySelector('.form-tabs').setAttribute('data-step', currentTabIndex);
    
    // Update completed tabs
    updateCompletedTabs();
    
    // Update navigation buttons
    updateNavigationButtons();
}

// Update navigation buttons based on current tab
function updateNavigationButtons() {
    const prevButton = document.querySelector('.prev-tab');
    const nextButton = document.querySelector('.next-tab');
    const submitButton = document.querySelector('button[type="submit"]');
    
    // Hide/show previous button
    prevButton.style.display = currentTabIndex === 0 ? 'none' : 'block';
    
    // Hide/show next button and submit button
    if (currentTabIndex === formTabs.length - 1) {
        nextButton.style.display = 'none';
        submitButton.style.display = 'block';
    } else {
        nextButton.style.display = 'block';
        submitButton.style.display = 'none';
    }
}

// Update completed tabs
function updateCompletedTabs() {
    formTabs.forEach((tab, index) => {
        if (index < currentTabIndex) {
            tab.classList.add('completed');
        } else {
            tab.classList.remove('completed');
        }
    });
}

// Validate a specific tab
function validateTab(tabIndex) {
    const tabContent = tabContents[tabIndex];
    const controls = tabContent.querySelectorAll('input, textarea, select');
    let isTabValid = true;

    controls.forEach(control => {
        // Clear previous validation state
        control.classList.remove('invalid');
        let validationMessageElement = control.nextElementSibling;
        if (validationMessageElement && validationMessageElement.classList.contains('validation-message')) {
            validationMessageElement.remove();
        }

        // Manual validation for required fields
        if (control.hasAttribute('required') && control.value.trim() === '') {
            isTabValid = false;
            control.classList.add('invalid');
            // Mark as invalid, message will be added by showValidationErrors
        } else if (!control.validity.valid) { // For other HTML5 validation issues (e.g., type mismatch)
            isTabValid = false;
            control.classList.add('invalid');
        }
    });
    return isTabValid;
}

// Show validation errors for a specific tab
function showValidationErrors(tabIndex) {
    const tabContent = tabContents[tabIndex];
    const controls = tabContent.querySelectorAll('input, textarea, select');
    let firstInvalidControl = null;
    let validationToast = document.querySelector('.validation-toast'); // Check for existing validation toast

    controls.forEach(control => {
        if (!control.validity.valid) {
            if (!firstInvalidControl) firstInvalidControl = control;
            control.classList.add('invalid');

            // Add or update validation message
            let validationMessageElement = control.nextElementSibling;
            if (!validationMessageElement || !validationMessageElement.classList.contains('validation-message')) {
                validationMessageElement = document.createElement('div');
                validationMessageElement.className = 'validation-message';
                control.parentNode.insertBefore(validationMessageElement, control.nextSibling);
            }
            if (control.hasAttribute('required') && control.value.trim() === '') {
                validationMessageElement.textContent = window.i18next ? window.i18next.t('messages.please_fill_out_this_field') : 'Please fill out this field.';
            } else {
                validationMessageElement.textContent = control.validationMessage || (window.i18next ? window.i18next.t('messages.field_is_invalid') : 'This field is invalid.');
            }
        } else {
            // Ensure invalid class is removed if somehow missed by validateTab (shouldn't happen)
            control.classList.remove('invalid');
            // Remove validation message if control is now valid
            let validationMessageElement = control.nextElementSibling;
            if (validationMessageElement && validationMessageElement.classList.contains('validation-message')) {
                validationMessageElement.remove();
            }
        }
    });

    // The browser will attempt to focus the first invalid field when form submission is prevented.
    // Switching to the tab containing the error (done by handleFormSubmit) is key.
    
    // Manage a single validation toast
    if (!validationToast) {
        validationToast = showToast(window.t('messages.correct_errors_in_tab'), 'error', 0); // 0 duration = persistent
        validationToast.classList.add('validation-toast'); // Add a class to identify it
    } else {
        // Update existing toast message if needed (optional)
        validationToast.querySelector('span').textContent = window.t('messages.correct_errors_in_tab');
    }
}

// Update summary tab with current form values
function updateSummary() {
    // Product information
    const summaryProductName = document.getElementById('summary-product-name');
    if (summaryProductName) {
        summaryProductName.textContent = 
            document.getElementById('productName')?.value || '-';
    }
    
    const summaryProductUrl = document.getElementById('summary-product-url');
    if (summaryProductUrl) {
        summaryProductUrl.textContent = 
            document.getElementById('productUrl')?.value || '-';
    }
    
    // Serial numbers
    const serialNumbers = [];
    document.querySelectorAll('input[name="serial_numbers[]"]').forEach(input => {
        if (input && input.value && input.value.trim()) {
            serialNumbers.push(input.value.trim());
        }
    });
    
    const serialNumbersContainer = document.getElementById('summary-serial-numbers');
    if (serialNumbersContainer) {
        if (serialNumbers.length > 0) {
            serialNumbersContainer.innerHTML = '<ul>' + 
                serialNumbers.map(sn => `<li>${sn}</li>`).join('') + 
                '</ul>';
        } else {
            serialNumbersContainer.textContent = 'None';
        }
    }
    
    // Warranty details
    const purchaseDateStr = document.getElementById('purchaseDate')?.value;
    const summaryPurchaseDate = document.getElementById('summary-purchase-date');
    if (summaryPurchaseDate) {
        if (purchaseDateStr) {
            // Use the same logic as formatDate to handle YYYY-MM-DD
            const parts = String(purchaseDateStr).split('-');
            let formattedDate = '-'; // Default
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
                const day = parseInt(parts[2], 10);
                const dateObj = new Date(Date.UTC(year, month, day));
                if (!isNaN(dateObj.getTime())) {
                    // Format manually (example: Jan 1, 2023)
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    formattedDate = `${monthNames[month]} ${day}, ${year}`;
                }
            }
            summaryPurchaseDate.textContent = formattedDate;
        } else {
            summaryPurchaseDate.textContent = '-';
        }
    }
    
    // --- Handle Lifetime in Summary ---
    const isLifetime = isLifetimeCheckbox ? isLifetimeCheckbox.checked : false;
    const summaryWarrantyDuration = document.getElementById('summary-warranty-duration'); // Use new ID

    if (summaryWarrantyDuration) {
                if (isLifetime) {
            summaryWarrantyDuration.textContent = window.i18next ? window.i18next.t('warranties.lifetime') : 'Lifetime';
        } else {
            const years = parseInt(warrantyDurationYearsInput?.value || 0);
            const months = parseInt(warrantyDurationMonthsInput?.value || 0);
            const days = parseInt(warrantyDurationDaysInput?.value || 0);

            let durationParts = [];
            if (years > 0) {
                const yearText = window.i18next ? window.i18next.t('warranties.year', {count: years}) : `year${years !== 1 ? 's' : ''}`;
                durationParts.push(`${years} ${yearText}`);
            }
            if (months > 0) {
                const monthText = window.i18next ? window.i18next.t('warranties.month', {count: months}) : `month${months !== 1 ? 's' : ''}`;
                durationParts.push(`${months} ${monthText}`);
            }
            if (days > 0) {
                const dayText = window.i18next ? window.i18next.t('warranties.day', {count: days}) : `day${days !== 1 ? 's' : ''}`;
                durationParts.push(`${days} ${dayText}`);
            }

            summaryWarrantyDuration.textContent = durationParts.length > 0 ? durationParts.join(', ') : '-';
        }
    }
    
    // Warranty type - handle dropdown and custom input
    const warrantyTypeSelect = document.getElementById('warrantyType');
    const warrantyTypeCustom = document.getElementById('warrantyTypeCustom');
    const summaryWarrantyType = document.getElementById('summary-warranty-type');
    if (summaryWarrantyType) {
        let warrantyTypeText = 'Not specified';
        if (warrantyTypeSelect && warrantyTypeSelect.value) {
            if (warrantyTypeSelect.value === 'other' && warrantyTypeCustom && warrantyTypeCustom.value.trim()) {
                warrantyTypeText = warrantyTypeCustom.value.trim();
            } else if (warrantyTypeSelect.value !== 'other') {
                warrantyTypeText = warrantyTypeSelect.value;
            }
        }
        summaryWarrantyType.textContent = warrantyTypeText;
    }
    
    // Purchase price
    const purchasePrice = document.getElementById('purchasePrice')?.value;
    const currency = document.getElementById('currency')?.value;
    const summaryPurchasePrice = document.getElementById('summary-purchase-price');
    if (summaryPurchasePrice) {
        if (purchasePrice) {
            const symbol = getCurrencySymbol();
            const position = getCurrencyPosition();
            const amount = parseFloat(purchasePrice).toFixed(2);
            summaryPurchasePrice.innerHTML = formatCurrencyHTML(amount, symbol, position);
        } else {
            summaryPurchasePrice.textContent = 'Not specified';
        }
    }
    
    // Documents
    const productPhotoFile = document.getElementById('productPhoto')?.files[0];
    const summaryProductPhoto = document.getElementById('summary-product-photo');
    if (summaryProductPhoto) {
        summaryProductPhoto.textContent = productPhotoFile ? 
            productPhotoFile.name : 'No photo selected';
    }
    
        const invoiceFile = document.getElementById('invoice')?.files[0];
    const invoiceUrlField = document.getElementById('invoiceUrl');
    const invoiceUrl = invoiceUrlField ? invoiceUrlField.value : '';
    const summaryInvoice = document.getElementById('summary-invoice');
    if (summaryInvoice) {
        if (invoiceFile) {
            summaryInvoice.textContent = invoiceFile.name;
        } else if (invoiceUrl) {
            summaryInvoice.textContent = 'URL: ' + invoiceUrl;
        } else {
            summaryInvoice.textContent = 'Not specified';
        }
    }

    const manualFile = document.getElementById('manual')?.files[0];
    const manualUrlField = document.getElementById('manualUrl');
    const manualUrl = manualUrlField ? manualUrlField.value : '';
    const summaryManual = document.getElementById('summary-manual');
    if (summaryManual) {
        if (manualFile) {
            summaryManual.textContent = manualFile.name;
        } else if (manualUrl) {
            summaryManual.textContent = 'URL: ' + manualUrl;
        } else {
            summaryManual.textContent = 'Not specified';
        }
    }

    const otherDocumentFile = document.getElementById('otherDocument')?.files[0]; 
    const otherDocumentUrlField = document.getElementById('otherDocumentUrl');
    const otherDocumentUrl = otherDocumentUrlField ? otherDocumentUrlField.value : '';
    const summaryOtherDocument = document.getElementById('summary-other-document'); 
    if (summaryOtherDocument) { 
        if (otherDocumentFile) {
            summaryOtherDocument.textContent = otherDocumentFile.name;
        } else if (otherDocumentUrl) {
            summaryOtherDocument.textContent = 'URL: ' + otherDocumentUrl;
        } else {
            summaryOtherDocument.textContent = 'Not specified';
        }
    } 
    
    // Tags
    const summaryTags = document.getElementById('summary-tags');
    if (summaryTags) {
        if (selectedTags && selectedTags.length > 0) {
            summaryTags.innerHTML = '';
            
            selectedTags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'tag';
                tagElement.style.backgroundColor = tag.color;
                tagElement.style.color = getContrastColor(tag.color);
                tagElement.textContent = tag.name;
                
                summaryTags.appendChild(tagElement);
            });
        } else {
            summaryTags.textContent = 'No tags selected';
        }
    }

    // Vendor/Retailer
    const vendor = document.getElementById('vendor');
    document.getElementById('summary-vendor').textContent = vendor && vendor.value ? vendor.value : '-';
}

// Add input event listeners to remove validation errors when user types
document.addEventListener('input', (e) => {
    if (e.target.hasAttribute('required') && e.target.classList.contains('invalid')) {
        if (e.target.value.trim()) {
            e.target.classList.remove('invalid');
            
            // Remove validation message if exists
            const validationMessage = e.target.nextElementSibling;
            if (validationMessage && validationMessage.classList.contains('validation-message')) {
                validationMessage.remove();
            }
        }
    }
});

// Function to reset the form and initialize serial number inputs
function resetForm() {
    // Reset the form
    warrantyForm.reset();
    
    // Reset serial numbers container
    serialNumbersContainer.innerHTML = '';
    
    // Add the first serial number input
    addSerialNumberInput();
    
    // Reset form tabs
    currentTabIndex = 0;
    switchToTab(0);
    
    // Clear any file input displays
    const productPhotoFileName = document.getElementById('productPhotoFileName');
    if (productPhotoFileName) productPhotoFileName.textContent = '';
    fileName.textContent = '';
    manualFileName.textContent = '';
    if (otherDocumentFileName) otherDocumentFileName.textContent = '';
    
    // Reset photo preview
    const productPhotoPreview = document.getElementById('productPhotoPreview');
    if (productPhotoPreview) {
        productPhotoPreview.style.display = 'none';
    } 
}

async function exportWarranties() {
    console.log('[EXPORT DEBUG] Starting export process');
    console.log('[EXPORT DEBUG] Total warranties in memory:', warranties.length);
    console.log('[EXPORT DEBUG] Current filters:', currentFilters);
    
    // Get filtered warranties
    let warrantiesToExport = [...warranties];
    console.log('[EXPORT DEBUG] Initial warranties to export:', warrantiesToExport.length);
    
    // Apply current filters
    if (currentFilters.search) {
        const searchTerm = currentFilters.search.toLowerCase();
        console.log('[EXPORT DEBUG] Applying search filter:', searchTerm);
        warrantiesToExport = warrantiesToExport.filter(warranty => {
            // Check if product name contains search term
            const productNameMatch = warranty.product_name.toLowerCase().includes(searchTerm);
            
            // Check if any tag name contains search term
            const tagMatch = warranty.tags && Array.isArray(warranty.tags) && 
                warranty.tags.some(tag => tag.name.toLowerCase().includes(searchTerm));
            
            // Check if vendor name contains search term
            const vendorMatch = warranty.vendor && warranty.vendor.toLowerCase().includes(searchTerm);
            
            // Return true if either product name, tag name, or vendor name matches
            return productNameMatch || tagMatch || vendorMatch;
        });
        console.log('[EXPORT DEBUG] After search filter:', warrantiesToExport.length);
    }
    
    if (currentFilters.status !== 'all') {
        console.log('[EXPORT DEBUG] Applying status filter:', currentFilters.status);
        warrantiesToExport = warrantiesToExport.filter(warranty => 
            warranty.status === currentFilters.status
        );
        console.log('[EXPORT DEBUG] After status filter:', warrantiesToExport.length);
    }
    
    // Apply tag filter
    if (currentFilters.tag !== 'all') {
        const tagId = parseInt(currentFilters.tag);
        console.log('[EXPORT DEBUG] Applying tag filter:', tagId);
        warrantiesToExport = warrantiesToExport.filter(warranty => 
            warranty.tags && Array.isArray(warranty.tags) &&
            warranty.tags.some(tag => tag.id === tagId)
        );
        console.log('[EXPORT DEBUG] After tag filter:', warrantiesToExport.length);
    }
    
    // Apply vendor filter
    if (currentFilters.vendor !== 'all') {
        console.log('[EXPORT DEBUG] Applying vendor filter:', currentFilters.vendor);
        warrantiesToExport = warrantiesToExport.filter(warranty => 
            (warranty.vendor || '').toLowerCase() === currentFilters.vendor.toLowerCase()
        );
        console.log('[EXPORT DEBUG] After vendor filter:', warrantiesToExport.length);
    }
    
    // Apply warranty type filter
    if (currentFilters.warranty_type !== 'all') {
        console.log('[EXPORT DEBUG] Applying warranty type filter:', currentFilters.warranty_type);
        warrantiesToExport = warrantiesToExport.filter(warranty => 
            (warranty.warranty_type || '').toLowerCase() === currentFilters.warranty_type.toLowerCase()
        );
        console.log('[EXPORT DEBUG] After warranty type filter:', warrantiesToExport.length);
    }
    
    console.log('[EXPORT DEBUG] Final warranties to export:', warrantiesToExport.length);
    console.log('[EXPORT DEBUG] Warranty IDs being exported:', warrantiesToExport.map(w => w.id));
    
    // Create CSV content
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Add headers - Updated for duration components
    csvContent += "ProductName,PurchaseDate,IsLifetime,WarrantyDurationYears,WarrantyDurationMonths,WarrantyDurationDays,ExpirationDate,Status,PurchasePrice,SerialNumber,ProductURL,Tags,Vendor\n";
    
    // Add data rows
    warrantiesToExport.forEach(warranty => {
        // Format serial numbers as comma-separated string
        const serialNumbers = Array.isArray(warranty.serial_numbers) 
            ? warranty.serial_numbers.filter(s => s).join(', ')
            : '';
        
        // Format tags as comma-separated string
        const tags = Array.isArray(warranty.tags)
            ? warranty.tags.map(tag => tag.name).join(', ')
            : '';
        
        // Format row data - Updated for duration components
        const row = [
            warranty.product_name || '',
            formatDateYYYYMMDD(new Date(warranty.purchase_date)),
            warranty.is_lifetime ? 'TRUE' : 'FALSE',
            warranty.warranty_duration_years || 0,
            warranty.warranty_duration_months || 0,
            warranty.warranty_duration_days || 0,
            warranty.is_lifetime ? '' : formatDateYYYYMMDD(new Date(warranty.expiration_date)), // Expiration date empty for lifetime
            warranty.status || '',
            warranty.purchase_price || '',
            serialNumbers,
            warranty.product_url || '',
            tags,
            warranty.vendor || ''
        ];
        
        // Add row to CSV content
        csvContent += row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(',') + '\n';
    });
    
    // Create a download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `warranties_export_${formatDate(new Date())}.csv`);
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    
    // Show success notification
    showToast(window.t('messages.exported_warranties_successfully', {count: warrantiesToExport.length}), 'success');
}

// Switch view of warranties list
async function switchView(viewType, saveToApi = true) { // Added saveToApi parameter with default true
    console.log(`Switching to view: ${viewType}`);
    currentView = viewType;

    const prefix = getPreferenceKeyPrefix();
    const viewKey = `${prefix}defaultView`;
    const currentStoredValue = localStorage.getItem(viewKey);

    // Save to localStorage immediately for responsiveness
    if (currentStoredValue !== viewType) {
        localStorage.setItem(viewKey, viewType); 
        // Keep legacy keys for now if needed, but primary is viewKey
        localStorage.setItem(`${prefix}warrantyView`, viewType);
        localStorage.setItem('viewPreference', viewType); 
        console.log(`Saved view preference (${viewKey}) to localStorage: ${viewType}`);
    } else {
        console.log(`View preference (${viewKey}) already set to ${viewType} in localStorage.`);
    }

    // --- MODIFIED: Only save preference to API if saveToApi is true --- 
    if (saveToApi && window.auth && window.auth.isAuthenticated()) {
        const token = window.auth.getToken();
        if (token) {
            try {
                console.log(`Attempting to save view preference (${viewType}) to API...`);
                const response = await fetch('/api/auth/preferences', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ default_view: viewType }) // Send only the changed preference
                });

                if (response.ok) {
                    console.log('Successfully saved view preference to API.');
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.warn(`Failed to save view preference to API: ${response.status}`, errorData.message || '');
                    // Optional: Show a non-intrusive warning toast?
                    // showToast('Failed to sync view preference with server.', 'warning'); 
                }
            } catch (error) {
                console.error('Error saving view preference to API:', error);
                // Optional: Show a non-intrusive warning toast?
                // showToast('Error syncing view preference with server.', 'error'); 
            }
        } else {
            console.warn('Cannot save view preference to API: No auth token found.');
        }
    } else if (!saveToApi) {
        console.log('Skipping API save as saveToApi is false (likely called from loadViewPreference).');
    } else {
        console.warn('Cannot save view preference to API: User not authenticated or auth module not loaded.');
    }
    // --- END MODIFIED: Save preference to API ---

    // Make sure warrantiesList exists before modifying classes
    if (warrantiesList) {
        warrantiesList.classList.remove('grid-view', 'list-view', 'table-view');
        warrantiesList.classList.add(`${viewType}-view`);
    }

    // Make sure view buttons exist
    if (gridViewBtn && listViewBtn && tableViewBtn) {
        gridViewBtn.classList.remove('active');
        listViewBtn.classList.remove('active');
        tableViewBtn.classList.remove('active');
        // Add active class to the correct button
        if (viewType === 'grid') gridViewBtn.classList.add('active');
        if (viewType === 'list') listViewBtn.classList.add('active');
        if (viewType === 'table') tableViewBtn.classList.add('active');
    }
    
    // Show/hide table header only if it exists
    if (tableViewHeader) {
        tableViewHeader.classList.toggle('visible', viewType === 'table');
    }

    // Re-apply current filters after view change to preserve user's selection
    try {
        // Persist current filters before render (defensive no-op if unchanged)
        // Skip API save on initial load to mirror view settings behavior
        saveFilterPreferences(false);
    } catch (_) {}

    if (warrantiesList && warrantiesLoaded) {
        // Reapply full filter set (status, tag, vendor, type, search, sort)
        applyFilters();
    }

    // Update header dropdown label if present
    try {
        const currentViewIcon = document.getElementById('currentViewIcon');
        if (currentViewIcon) {
            currentViewIcon.className = 'fas';
            if (viewType === 'list') {
                currentViewIcon.classList.add('fa-list');
                currentViewIcon.setAttribute('aria-label', 'List');
            } else if (viewType === 'table') {
                currentViewIcon.classList.add('fa-table');
                currentViewIcon.setAttribute('aria-label', 'Table');
            } else {
                currentViewIcon.classList.add('fa-th-large');
                currentViewIcon.setAttribute('aria-label', 'Grid');
            }
        }
    } catch (e) { /* no-op */ }
}

// Load view preference from localStorage
function loadViewPreference() {
    // Get the appropriate key prefix based on user type
    const prefix = getPreferenceKeyPrefix();
    let savedView = null;

    // --- BEGIN EDIT: Check keys in priority order ---
    const userSpecificView = localStorage.getItem(`${prefix}defaultView`);
    const generalView = localStorage.getItem('viewPreference');
    const legacyWarrantyView = localStorage.getItem(`${prefix}warrantyView`);

    if (userSpecificView) {
        savedView = userSpecificView;
        console.log(`Loaded view preference from ${prefix}defaultView:`, savedView);
    } else if (generalView) {
        savedView = generalView;
        console.log('Loaded view preference from viewPreference:', savedView);
    } else if (legacyWarrantyView) {
        savedView = legacyWarrantyView;
        console.log(`Loaded view preference from legacy ${prefix}warrantyView:`, savedView);
    }
    // --- END EDIT ---

    // Default to grid view if no preference is saved
    savedView = savedView || 'grid';

    console.log(`Applying view preference from loadViewPreference: ${savedView}`);
    // Switch view only if view buttons exist (implying it's the main page)
    if (gridViewBtn || listViewBtn || tableViewBtn) {
        switchView(savedView, false); // Pass false to prevent API save on initial load
    }
}

// Dark mode toggle
if (darkModeToggle) { // Add check for darkModeToggle
    darkModeToggle.addEventListener('change', (e) => {
        saveThemePreference(e.target.checked);
    });
}

// Add event listener for adding new serial number inputs
// Add check for serialNumbersContainer before adding listener
if (serialNumbersContainer) {
    serialNumbersContainer.addEventListener('click', (e) => {
        if (e.target.closest('.add-serial-number')) {
            addSerialNumberInput();
        }
    });
}

// Add a serial number input field
function addSerialNumberInput(container = serialNumbersContainer) {
    // Check if the container exists before proceeding
    if (!container) {
        console.warn('Serial numbers container not found, cannot add input.');
        return;
    }

    const div = document.createElement('div');
    div.className = 'serial-number-input d-flex mb-2';
    
    // Create an input element
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.name = 'serial_numbers[]';
    input.placeholder = window.i18next ? window.i18next.t('warranties.enter_serial_number') : 'Enter serial number';
    console.log('i18next available for serial number placeholder:', !!window.i18next);
    if (window.i18next) {
        console.log('Translation for warranties.enter_serial_number:', window.i18next.t('warranties.enter_serial_number'));
    }
    
    // Check if this is the first serial number input
    const isFirstInput = container.querySelectorAll('.serial-number-input').length === 0;
    
    // Append input to the input group
    div.appendChild(input);
    
    // Only add remove button if this is not the first input
    if (!isFirstInput) {
        // Create a remove button
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-sm btn-danger remove-serial';
        removeButton.innerHTML = '<i class="fas fa-times"></i>';
        
        // Add event listener to remove button
        removeButton.addEventListener('click', function() {
            container.removeChild(div);
        });
        
        // Append remove button to the input group
        div.appendChild(removeButton);
    }
    
    // Insert the new input group before the add button
    const addButton = container.querySelector('.add-serial');
    if (addButton) {
        container.insertBefore(div, addButton);
    } else {
        container.appendChild(div);
        
        // Create and append an add button if it doesn't exist
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'btn btn-sm btn-secondary add-serial';
        addButton.innerHTML = '<i class="fas fa-plus"></i> ' + (window.i18next ? window.i18next.t('warranties.add_serial_number') : 'Add Serial Number');
        console.log('i18next available in addSerialNumberInput:', !!window.i18next);
        if (window.i18next) {
            console.log('Translation for warranties.add_serial_number:', window.i18next.t('warranties.add_serial_number'));
        }
        
        addButton.addEventListener('click', function() {
            addSerialNumberInput(container);
        });
        
        container.appendChild(addButton);
    }
}

// Functions
function showLoading() {
    let localLoadingContainer = window.loadingContainer || document.getElementById('loadingContainer');
    if (localLoadingContainer) {
        localLoadingContainer.classList.add('active');
        window.loadingContainer = localLoadingContainer; // Update global reference if found
    } else {
        console.error('WarrackerDebug: loadingContainer element not found by showLoading(). Ensure it exists in the HTML and script.js is loaded after it.');
    }
}

function hideLoading() {
    let localLoadingContainer = window.loadingContainer || document.getElementById('loadingContainer');
    if (localLoadingContainer) {
        localLoadingContainer.classList.remove('active');
        window.loadingContainer = localLoadingContainer; // Update global reference if found
    } else {
        console.error('WarrackerDebug: loadingContainer element not found by hideLoading().');
    }
}

function showToast(message, type = 'info', duration = 5000) {
    // Check if a toast with the same message and type already exists
    const existingToasts = document.querySelectorAll(`.toast.toast-${type}`);
    for (let i = 0; i < existingToasts.length; i++) {
        const span = existingToasts[i].querySelector('span');
        if (span && span.textContent === message) {
            return existingToasts[i]; // Don't create a new one
        }
    }

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

// Update file name display when a file is selected
function updateFileName(event, inputId = 'invoice', outputId = 'fileName') {
    const file = event.target.files[0];
    const output = document.getElementById(outputId);
    
    if (file && output) {
        output.textContent = file.name;
    } else if (output) {
        output.textContent = '';
    }
    
    // Handle photo preview for product photo
    if (inputId === 'productPhoto' || inputId === 'editProductPhoto') {
        const previewId = inputId === 'productPhoto' ? 'productPhotoPreview' : 'editProductPhotoPreview';
        const imgId = inputId === 'productPhoto' ? 'productPhotoImg' : 'editProductPhotoImg';
        const preview = document.getElementById(previewId);
        const img = document.getElementById(imgId);
        
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                img.src = e.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            preview.style.display = 'none';
        }
    }
}

// Helper function to process warranty data
function processWarrantyData(warranty) {
    console.log('Processing warranty data:', warranty);
    
    // Create a copy of the warranty object to avoid modifying the original
    const processedWarranty = { ...warranty };
    // Flag archived items when merged into All view
    processedWarranty.is_archived = !!(warranty.__isArchived || warranty.is_archived);
    
    // Ensure product_name exists
    if (!processedWarranty.product_name) {
        processedWarranty.product_name = 'Unnamed Product';
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to midnight for accurate date comparisons

    // Parse purchase_date string (YYYY-MM-DD) into a UTC Date object
    let purchaseDateObj = null;
    if (processedWarranty.purchase_date) {
        const parts = String(processedWarranty.purchase_date).split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
            const day = parseInt(parts[2], 10);
            purchaseDateObj = new Date(Date.UTC(year, month, day));
            if (isNaN(purchaseDateObj.getTime())) {
                 purchaseDateObj = null; // Invalid date parsed
            }
        } else {
            // Fallback for unexpected formats, though backend should send YYYY-MM-DD
            purchaseDateObj = new Date(processedWarranty.purchase_date);
             if (isNaN(purchaseDateObj.getTime())) {
                 purchaseDateObj = null; 
            }
        }
    }
    processedWarranty.purchaseDate = purchaseDateObj;
    
    // Parse expiration_date similarly (assuming it's also YYYY-MM-DD)
    let expirationDateObj = null;
    if (processedWarranty.expiration_date) {
        const parts = String(processedWarranty.expiration_date).split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            expirationDateObj = new Date(Date.UTC(year, month, day));
             if (isNaN(expirationDateObj.getTime())) {
                 expirationDateObj = null;
            }
        } else {
            expirationDateObj = new Date(processedWarranty.expiration_date);
             if (isNaN(expirationDateObj.getTime())) {
                 expirationDateObj = null;
            }
        }
    }
    processedWarranty.expirationDate = expirationDateObj;

    // --- Lifetime Handling ---
    if (processedWarranty.is_lifetime) {
        processedWarranty.status = 'active';
        processedWarranty.statusText = window.i18next ? window.i18next.t('warranties.lifetime') : 'Lifetime';
        processedWarranty.daysRemaining = Infinity;
        // Ensure duration components are 0 for lifetime
        processedWarranty.warranty_duration_years = 0;
        processedWarranty.warranty_duration_months = 0;
        processedWarranty.warranty_duration_days = 0;
    } else if (processedWarranty.expirationDate && !isNaN(processedWarranty.expirationDate.getTime())) {
        // Existing logic for dated warranties
        const expirationDateOnly = new Date(processedWarranty.expirationDate);
        expirationDateOnly.setHours(0,0,0,0);

        const timeDiff = expirationDateOnly - today;
        const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        processedWarranty.daysRemaining = daysRemaining;

        if (daysRemaining < 0) {
            processedWarranty.status = 'expired';
            processedWarranty.statusText = window.i18next ? window.i18next.t('warranties.expired') : 'Expired';
        } else if (daysRemaining < expiringSoonDays) {
            processedWarranty.status = 'expiring';
            const dayText = window.i18next ? 
                window.i18next.t('warranties.day', {count: daysRemaining}) :
                `day${daysRemaining !== 1 ? 's' : ''}`;
            processedWarranty.statusText = window.i18next ? 
                window.i18next.t('warranties.days_remaining', {days: daysRemaining, dayText: dayText}) :
                `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
        } else {
            processedWarranty.status = 'active';
            const dayText = window.i18next ? 
                window.i18next.t('warranties.day', {count: daysRemaining}) :
                `day${daysRemaining !== 1 ? 's' : ''}`;
            processedWarranty.statusText = window.i18next ? 
                window.i18next.t('warranties.days_remaining', {days: daysRemaining, dayText: dayText}) :
                `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
        }
        
        // Preserve original duration values to detect input method
        const originalYears = processedWarranty.warranty_duration_years || 0;
        const originalMonths = processedWarranty.warranty_duration_months || 0;
        const originalDays = processedWarranty.warranty_duration_days || 0;
        
        // Track the original input method based on duration values
        const wasExactDateMethod = originalYears === 0 && originalMonths === 0 && originalDays === 0;
        processedWarranty.original_input_method = wasExactDateMethod ? 'exact_date' : 'duration';
        
        // Calculate duration from dates if all duration components are 0 (exact date method was used)
        const hasNoDuration = originalYears === 0 && originalMonths === 0 && originalDays === 0;
        
        if (hasNoDuration && purchaseDateObj && processedWarranty.expirationDate) {
            console.log('[DEBUG] Calculating duration from dates for exact date warranty');
            const calculatedDuration = calculateDurationFromDates(
                purchaseDateObj.toISOString().split('T')[0], 
                processedWarranty.expirationDate.toISOString().split('T')[0]
            );
            if (calculatedDuration) {
                // Store calculated duration for display purposes
                processedWarranty.display_duration_years = calculatedDuration.years;
                processedWarranty.display_duration_months = calculatedDuration.months;
                processedWarranty.display_duration_days = calculatedDuration.days;
                console.log('[DEBUG] Calculated duration:', calculatedDuration);
                
                // Keep original values at 0 to preserve input method detection
                processedWarranty.warranty_duration_years = 0;
                processedWarranty.warranty_duration_months = 0;
                processedWarranty.warranty_duration_days = 0;
            }
        } else {
            // Use original duration values for display
            processedWarranty.display_duration_years = originalYears;
            processedWarranty.display_duration_months = originalMonths;
            processedWarranty.display_duration_days = originalDays;
        }
    } else {
        processedWarranty.status = 'unknown';
        processedWarranty.statusText = window.i18next ? window.i18next.t('warranties.unknown_status') : 'Unknown Status';
        processedWarranty.daysRemaining = null;
    }

    console.log('Processed warranty data result:', processedWarranty);
    return processedWarranty;
}

// Function to process all warranties in the array
function processAllWarranties() {
    console.log('Processing all warranties in array...');
    if (warranties && warranties.length > 0) {
        warranties = warranties.map(warranty => processWarrantyData(warranty));
    }
    console.log('Processed warranties:', warranties);
}

async function loadWarranties(isAuthenticated) { // Added isAuthenticated parameter
    // +++ REMOVED: Ensure Preferences are loaded FIRST (Now handled by authStateReady) +++
    // await loadAndApplyUserPreferences(); 
    // +++ Preferences Loaded +++
    
    try {
        console.log('[DEBUG] Entered loadWarranties, isAuthenticated:', isAuthenticated);
        
        // Reset the flag when starting to load warranties
        warrantiesLoaded = false;
        
        showLoading();
        
        // Fetch user preferences (including date format) before loading warranties
        // --- THIS INNER PREFERENCE FETCH IS NOW REDUNDANT, REMOVE/COMMENT OUT --- 
        /*
        try {
            const token = window.auth.getToken(); // Ensure token is retrieved here
            if (!token) throw new Error("No auth token found"); // Added error handling

            const prefsResponse = await fetch('/api/auth/preferences', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (prefsResponse.ok) {
                const prefsData = await prefsResponse.json();
                console.log("Preferences fetched in loadWarranties:", prefsData);
                
                // Update expiringSoonDays
                if (prefsData && typeof prefsData.expiring_soon_days !== 'undefined') {
                    const oldValue = expiringSoonDays;
                    expiringSoonDays = prefsData.expiring_soon_days;
                    console.log('Updated expiring soon days from preferences:', expiringSoonDays);
                    // Reprocess logic moved below warranty fetch
                }

                // --- ADDED: Update dateFormat in localStorage --- 
                if (prefsData && typeof prefsData.date_format !== 'undefined') {
                    const oldDateFormat = localStorage.getItem('dateFormat');
                    localStorage.setItem('dateFormat', prefsData.date_format);
                    console.log(`Updated dateFormat in localStorage from API: ${prefsData.date_format}`);
                    // Trigger re-render if format changed and warranties already exist (though unlikely at this stage)
                    if (warranties && warranties.length > 0 && oldDateFormat !== prefsData.date_format) {
                        console.log('Date format changed, triggering re-render via applyFilters');
                        applyFilters(); // Re-render warranties with new format
                    }
                } else {
                     // If API doesn't return date_format, ensure localStorage has a default
                     if (!localStorage.getItem('dateFormat')) {
                         localStorage.setItem('dateFormat', 'MDY');
                         console.log('API did not return date_format, setting localStorage default to MDY');
                     }
                }
                // --- END ADDED SECTION ---

            } else {
                 // Handle failed preference fetch
                 console.warn('Failed to fetch preferences:', prefsResponse.status);
                 // Ensure a default date format exists if fetch fails
                 if (!localStorage.getItem('dateFormat')) {
                     localStorage.setItem('dateFormat', 'MDY');
                     console.log('Preferences fetch failed, setting localStorage default date format to MDY');
                 }
            }
        } catch (error) {
            console.error('Error loading preferences:', error);
            // Ensure a default date format exists on error
            if (!localStorage.getItem('dateFormat')) {
                localStorage.setItem('dateFormat', 'MDY');
                console.log('Error fetching preferences, setting localStorage default date format to MDY');
            }
            // Continue loading warranties even if preferences fail
        }
        */
        // --- END REDUNDANT PREFERENCE FETCH ---
        
        // Check saved view scope preference to determine which API endpoint to use
        const savedScope = loadViewScopePreference();
        const shouldUseGlobalView = savedScope === 'global';
        
        // Use the appropriate API endpoint based on saved preference
        const baseUrl = window.location.origin;
        // If status is 'archived', use archived endpoint (support global vs personal)
        const isArchivedView = currentFilters && currentFilters.status === 'archived';
        const apiUrl = isArchivedView
            ? (shouldUseGlobalView ? `${baseUrl}/api/warranties/global/archived` : `${baseUrl}/api/warranties/archived`)
            : (shouldUseGlobalView ? `${baseUrl}/api/warranties/global` : `${baseUrl}/api/warranties`);
        
        console.log(`[DEBUG] Using API endpoint based on saved preference '${savedScope}', archivedView=${isArchivedView}: ${apiUrl}`);
        
        // Check if auth is available and user is authenticated using the passed parameter
        if (!isAuthenticated) {
            console.log('[DEBUG] loadWarranties: Early return - User not authenticated based on passed parameter.');
            renderEmptyState(window.t('messages.login_to_view_warranties'));
            hideLoading();
            return;
        }
        // Get the auth token
        const token = window.auth.getToken();
        if (!token) {
            console.log('[DEBUG] Early return: No auth token available');
            renderEmptyState(window.t('messages.authentication_error_login_again'));
            hideLoading();
            return;
        }
        
        // Create request with auth header
        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
        
        console.log('Fetching warranties with auth token');
        const response = await fetch(apiUrl, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
            console.error('Error loading warranties:', response.status, errorData);
            throw new Error(`Error loading warranties: ${errorData.message || response.status}`);
        }
        const data = await response.json();
        console.log('[DEBUG] Received warranties from server:', data);
        if (!Array.isArray(data)) {
            console.error('[DEBUG] API did not return an array! Data:', data);
        }
        
        // Update isGlobalView to match the loaded data
        isGlobalView = shouldUseGlobalView;
        console.log(`[DEBUG] Set isGlobalView to: ${isGlobalView}`);

        // Optionally merge archived items into the "All" view (only in personal scope)
        let combinedData = Array.isArray(data) ? data : [];
        lastLoadedIncludesArchived = false;
        if (!isArchivedView && currentFilters && currentFilters.status === 'all') {
            try {
                const archivedUrl = shouldUseGlobalView ? `${baseUrl}/api/warranties/global/archived` : `${baseUrl}/api/warranties/archived`;
                const archivedResp = await fetch(archivedUrl, options);
                if (archivedResp.ok) {
                    const archivedData = await archivedResp.json();
                    const archivedMarked = Array.isArray(archivedData)
                        ? archivedData.map(w => ({ ...w, __isArchived: true }))
                        : [];
                    combinedData = combinedData.concat(archivedMarked);
                    lastLoadedIncludesArchived = true;
                    console.log(`[DEBUG] Merged ${archivedMarked.length} archived warranties into All view`);
                } else {
                    // Log but do not block rendering of non-archived warranties
                    let errInfo = '';
                    try {
                        const errJson = await archivedResp.json();
                        errInfo = JSON.stringify(errJson);
                    } catch (_) {}
                    console.warn('[DEBUG] Failed to load archived warranties for All view:', archivedResp.status, errInfo);
                }
            } catch (mergeErr) {
                console.warn('[DEBUG] Error while merging archived into All:', mergeErr);
            }
        }

        // Process each warranty to calculate status and days remaining
        warranties = Array.isArray(combinedData) ? combinedData.map(warranty => processWarrantyData(warranty)) : [];
        lastLoadedArchived = isArchivedView;
        console.log('[DEBUG] Final warranties array:', warranties);
        console.log('[DEBUG] Total warranties loaded:', warranties.length);
        console.log('[DEBUG] Warranty IDs loaded:', warranties.map(w => w.id));
        
        // Set flag to indicate warranties have been loaded from API
        warrantiesLoaded = true;
        
        if (warranties.length === 0) {
            console.log('No warranties found, showing empty state');
            renderEmptyState(window.t('messages.no_warranties_found_add_first'));
        } else {
            console.log('Applying filters to display warranties');
            
            // Populate tag filter dropdown with tags from warranties
            populateTagFilter();
            populateVendorFilter(); // Added call to populate vendor filter
            populateWarrantyTypeFilter(); // Added call to populate warranty type filter
            
            // Ensure the UI reflects the freshly loaded data
            applyFilters();
        }
    } catch (error) {
        console.error('[DEBUG] Error loading warranties:', error);
        warrantiesLoaded = false; // Reset flag on error
        renderEmptyState(window.t('messages.error_loading_warranties_try_again'));
    } finally {
        hideLoading();
    }
}

function renderEmptyState(message = 'No warranties yet. Add your first warranty to get started.') {
    warrantiesList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-box-open"></i>
            <h3>${window.t ? window.t('messages.no_warranties_found') : 'No warranties found'}</h3>
            <p>${message || (window.t ? window.t('messages.no_warranties_found_add_first') : 'No warranties yet. Add your first warranty to get started.')}</p>
        </div>
    `;
}

function formatDate(date) {
    // Input 'date' should now be a Date object created by processWarrantyData (or null)
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'N/A';
    }

    // Get the user's preferred format from localStorage, default to MDY
    const formatPreference = localStorage.getItem('dateFormat') || 'MDY';

    // Manually extract UTC components to avoid timezone discrepancies
    const year = date.getUTCFullYear();
    const monthIndex = date.getUTCMonth(); // 0-indexed for month names array
    const day = date.getUTCDate();

    // Padded numeric values
    const monthPadded = (monthIndex + 1).toString().padStart(2, '0');
    const dayPadded = day.toString().padStart(2, '0');

    // Abbreviated month names
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthAbbr = monthNames[monthIndex];

    switch (formatPreference) {
        case 'DMY':
            return `${dayPadded}/${monthPadded}/${year}`;
        case 'YMD':
            return `${year}-${monthPadded}-${dayPadded}`;
        case 'MDY_WORDS': // Added
            return `${monthAbbr} ${day}, ${year}`;
        case 'DMY_WORDS': // Added
            return `${day} ${monthAbbr} ${year}`;
        case 'YMD_WORDS': // Added
            return `${year} ${monthAbbr} ${day}`;
        case 'MDY':
        default:
            return `${monthPadded}/${dayPadded}/${year}`;
    }
}

function formatDateYYYYMMDD(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'N/A';
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Calculate the age of a product from purchase date to now
 * @param {string|Date} purchaseDate - The purchase date
 * @returns {string} - Formatted age string (e.g., "2 years, 3 months", "6 months", "15 days")
 */
function calculateProductAge(purchaseDate) {
    if (!purchaseDate) return 'Unknown';
    
    const purchase = new Date(purchaseDate);
    const now = new Date();
    
    if (isNaN(purchase.getTime()) || purchase > now) {
        return 'Unknown';
    }
    
    // Calculate the difference
    let years = now.getFullYear() - purchase.getFullYear();
    let months = now.getMonth() - purchase.getMonth();
    let days = now.getDate() - purchase.getDate();
    
    // Adjust for negative days
    if (days < 0) {
        months--;
        const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += lastMonth.getDate();
    }
    
    // Adjust for negative months
    if (months < 0) {
        years--;
        months += 12;
    }
    
    // Format the result
    const parts = [];
    if (years > 0) {
        const yearText = window.i18next ? window.i18next.t('warranties.year', {count: years}) : `year${years !== 1 ? 's' : ''}`;
        parts.push(`${years} ${yearText}`);
    }
    if (months > 0) {
        const monthText = window.i18next ? window.i18next.t('warranties.month', {count: months}) : `month${months !== 1 ? 's' : ''}`;
        parts.push(`${months} ${monthText}`);
    }
    if (days > 0 && years === 0) { // Only show days if less than a year old
        const dayText = window.i18next ? window.i18next.t('warranties.day', {count: days}) : `day${days !== 1 ? 's' : ''}`;
        parts.push(`${days} ${dayText}`);
    }
    
    if (parts.length === 0) {
        return 'Today'; // Purchased today
    }
    
    return parts.join(', ');
}

/**
 * Calculate the age of a product in days for sorting purposes
 * @param {string|Date} purchaseDate - The purchase date
 * @returns {number} - Age in days (0 if invalid date)
 */
function calculateProductAgeInDays(purchaseDate) {
    if (!purchaseDate) return 0;
    
    const purchase = new Date(purchaseDate);
    const now = new Date();
    
    if (isNaN(purchase.getTime()) || purchase > now) {
        return 0;
    }
    
    // Calculate difference in milliseconds and convert to days
    const diffTime = now.getTime() - purchase.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

async function renderWarranties(warrantiesToRender) {
    console.log('renderWarranties called with:', warrantiesToRender);

    // Guard clause: If the main warrantiesList element doesn't exist on the current page, exit.
    // This can happen if saveWarranty -> applyFilters -> renderWarranties is called from a page
    // that doesn't have the main list view (e.g., the status page).
    if (!warrantiesList) {
        console.warn('renderWarranties: warrantiesList element not found. Aborting render. This might be normal if not on the main warranties page.');
        return;
    }

    const isArchivedView = currentFilters && currentFilters.status === 'archived';

    if (!warrantiesToRender || warrantiesToRender.length === 0) {
        renderEmptyState(isArchivedView ? (window.t ? window.t('messages.no_archived_warranties') : 'No archived warranties.') : undefined); // renderEmptyState should also check for warrantiesList or its specific container
        return;
    }
    
    const today = new Date();
    const globalSymbol = getCurrencySymbol(); // Get the global symbol as fallback
    
    warrantiesList.innerHTML = '';
    
    // Apply sorting based on current sort selection
    const sortedWarranties = [...warrantiesToRender].sort((a, b) => {
        switch (currentFilters.sortBy) {
            case 'name':
                return (a.product_name || '').toLowerCase().localeCompare((b.product_name || '').toLowerCase());
            case 'purchase':
                return new Date(b.purchase_date || 0) - new Date(a.purchase_date || 0);
            case 'age': // Added age sorting
                return calculateProductAgeInDays(b.purchase_date) - calculateProductAgeInDays(a.purchase_date); // Oldest first
            case 'vendor': // Added vendor sorting
                return (a.vendor || '').toLowerCase().localeCompare((b.vendor || '').toLowerCase());
            case 'warranty_type': // Added warranty type sorting
                return (a.warranty_type || '').toLowerCase().localeCompare((b.warranty_type || '').toLowerCase());
            case 'expiration':
            default:
                const dateA = new Date(a.expiration_date || 0);
                const dateB = new Date(b.expiration_date || 0);
                
                const isExpiredA = dateA < today;
                const isExpiredB = dateB < today;
                
                if (isExpiredA && !isExpiredB) return 1;
                if (!isExpiredA && isExpiredB) return -1;
                
                // Both active or both expired, sort by date
                return dateA - dateB;
        }
    });
    
    console.log('Sorted warranties:', sortedWarranties);
    
    // Update the container class based on current view
    warrantiesList.className = `warranties-list ${currentView}-view ${isArchivedView ? 'archived-view' : ''}`;
    
    // Show/hide table header for table view
    if (tableViewHeader) {
        tableViewHeader.classList.toggle('visible', currentView === 'table');
    }
    
    // Update view buttons to reflect current view
    if (gridViewBtn && listViewBtn && tableViewBtn) {
        gridViewBtn.classList.toggle('active', currentView === 'grid');
        listViewBtn.classList.toggle('active', currentView === 'list');
        tableViewBtn.classList.toggle('active', currentView === 'table');
    }
    
    sortedWarranties.forEach(warranty => {
        // --- Use processed data ---
        const purchaseDate = warranty.purchaseDate;
        const expirationDate = warranty.expirationDate;
        const isLifetime = warranty.is_lifetime;
        let statusClass = warranty.status || 'unknown';
        let statusText = warranty.statusText || 'Unknown Status';
        // If showing archived-only view or item itself is archived within All view
        if (isArchivedView || warranty.is_archived) {
            const archivedTextRaw = window.i18next ? window.i18next.t('warranties.archived') : 'Archived';
            const archivedLabel = archivedTextRaw && archivedTextRaw !== 'warranties.archived' ? archivedTextRaw : 'Archived';
            statusClass = 'archived';
            statusText = archivedLabel;
        }
        // Format warranty duration text
        let warrantyDurationText = window.i18next ? window.i18next.t('warranties.na') : 'N/A';
        if (isLifetime) {
            warrantyDurationText = window.i18next ? window.i18next.t('warranties.lifetime') : 'Lifetime';
        } else {
            // Use display_duration values if available, otherwise fall back to warranty_duration values
            const years = warranty.display_duration_years !== undefined ? warranty.display_duration_years : (warranty.warranty_duration_years || 0);
            const months = warranty.display_duration_months !== undefined ? warranty.display_duration_months : (warranty.warranty_duration_months || 0);
            const days = warranty.display_duration_days !== undefined ? warranty.display_duration_days : (warranty.warranty_duration_days || 0);
            
            // If all duration fields are 0 but we have expiration date, calculate from dates
            if (years === 0 && months === 0 && days === 0 && warranty.expiration_date && warranty.purchase_date) {
                const calculatedDuration = calculateDurationFromDates(warranty.purchase_date, warranty.expiration_date);
                if (calculatedDuration) {
                    let parts = [];
                    if (calculatedDuration.years > 0) {
                        const yearText = window.i18next ? window.i18next.t('warranties.year', {count: calculatedDuration.years}) : `year${calculatedDuration.years !== 1 ? 's' : ''}`;
                        parts.push(`${calculatedDuration.years} ${yearText}`);
                    }
                    if (calculatedDuration.months > 0) {
                        const monthText = window.i18next ? window.i18next.t('warranties.month', {count: calculatedDuration.months}) : `month${calculatedDuration.months !== 1 ? 's' : ''}`;
                        parts.push(`${calculatedDuration.months} ${monthText}`);
                    }
                    if (calculatedDuration.days > 0) {
                        const dayText = window.i18next ? window.i18next.t('warranties.day', {count: calculatedDuration.days}) : `day${calculatedDuration.days !== 1 ? 's' : ''}`;
                        parts.push(`${calculatedDuration.days} ${dayText}`);
                    }
                    if (parts.length > 0) {
                        warrantyDurationText = parts.join(', ');
                    }
                }
            } else {
                // Use the stored/calculated duration fields
                let parts = [];
                if (years > 0) {
                    const yearText = window.i18next ? window.i18next.t('warranties.year', {count: years}) : `year${years !== 1 ? 's' : ''}`;
                    parts.push(`${years} ${yearText}`);
                }
                if (months > 0) {
                    const monthText = window.i18next ? window.i18next.t('warranties.month', {count: months}) : `month${months !== 1 ? 's' : ''}`;
                    parts.push(`${months} ${monthText}`);
                }
                if (days > 0) {
                    const dayText = window.i18next ? window.i18next.t('warranties.day', {count: days}) : `day${days !== 1 ? 's' : ''}`;
                    parts.push(`${days} ${dayText}`);
                }
                if (parts.length > 0) {
                    warrantyDurationText = parts.join(', ');
                }
            }
        }
        const expirationDateText = isLifetime ? (window.i18next ? window.i18next.t('warranties.lifetime') : 'Lifetime') : formatDate(expirationDate);
        
        // Calculate product age
        const productAge = calculateProductAge(warranty.purchase_date);
        
        // Make sure serial numbers array exists and is valid
        const validSerialNumbers = Array.isArray(warranty.serial_numbers) 
            ? warranty.serial_numbers.filter(sn => sn && typeof sn === 'string' && sn.trim() !== '')
            : [];
        // Prepare user info HTML for global view
        let userInfoHtml = '';
        if (isGlobalView && warranty.user_display_name) {
            const ownerLabel = window.i18next ? window.i18next.t('warranties.owner') : 'Owner';
            userInfoHtml = `<div><strong>${ownerLabel}:</strong> <span>${warranty.user_display_name}</span></div>`;
        }
        
        // Prepare tags HTML
        const tagsHtml = warranty.tags && warranty.tags.length > 0 
            ? `<div class="tags-row">
                ${warranty.tags.map(tag => 
                    `<span class="tag" style="background-color: ${tag.color}; color: ${getContrastColor(tag.color)}">
                        ${tag.name}
                    </span>`
                ).join('')}
              </div>`
            : '';
        // Add notes display button if present
        let notesHtml = '';
        const hasNotes = warranty.notes && warranty.notes.trim() !== '';
        // Remove the button, and instead prepare a notes link for document-links-row
        let notesLinkHtml = '';
        if (hasNotes) {
            const notesLabel = window.i18next ? window.i18next.t('warranties.notes') : 'Notes';
            notesLinkHtml = `<a href="#" class="notes-link" data-id="${warranty.id}" title="View Notes"><i class='fas fa-sticky-note'></i> ${notesLabel}</a>`;
        }
        
        const hasDocuments = Boolean(
            warranty.product_url ||
            warranty.invoice_path || warranty.invoice_url ||
            warranty.manual_path || warranty.manual_url ||
            warranty.other_document_path || warranty.other_document_url ||
            warranty.paperless_invoice_id || warranty.paperless_manual_id ||
            warranty.paperless_photo_id || warranty.paperless_other_id ||
            hasNotes
        );
        
        
        // Get current user ID to check warranty ownership
        const currentUserId = (() => {
            try {
                const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                return userInfo.id;
            } catch (e) {
                return null;
            }
        })();
        
        // Check if current user can edit/delete this warranty
        // Allow if: not in global view, user owns the warranty, or user is admin
        const isAdmin = getUserType() === 'admin';
        const canEdit = !isGlobalView || (warranty.user_id === currentUserId) || isAdmin;
        
        // Determine claims button class and title based on claim status
        let claimsButtonClass = 'action-btn claims-link';
        let claimsTitle = 'Claims';
        
        if (warranty.claim_status_summary === 'OPEN') {
            claimsButtonClass += ' claims-open';
            claimsTitle = 'Claims (Open)';
        } else if (warranty.claim_status_summary === 'FINISHED') {
            claimsButtonClass += ' claims-finished';
            claimsTitle = 'Claims (Finished)';
        }

        // Generate action buttons HTML based on permissions
        const actionButtonsHtml = canEdit ? `
            <button class="${claimsButtonClass}" title="${claimsTitle}" data-id="${warranty.id}">
                <i class="fas fa-clipboard-list"></i>
            </button>
            ${ (isArchivedView || warranty.is_archived) ? `
                <button class="action-btn unarchive-btn" title="Unarchive" data-id="${warranty.id}">
                    <i class="fas fa-box-open"></i>
                </button>
                <button class="action-btn edit-btn" title="Edit (disabled in archived view)" data-id="${warranty.id}" disabled>
                    <i class="fas fa-edit"></i>
                </button>
            ` : `
                <button class="action-btn edit-btn" title="Edit" data-id="${warranty.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn archive-btn" title="Archive" data-id="${warranty.id}">
                    <i class="fas fa-archive"></i>
                </button>
            `}
            <button class="action-btn delete-btn" title="Delete" data-id="${warranty.id}">
                <i class="fas fa-trash"></i>
            </button>
        ` : `
            <button class="${claimsButtonClass}" title="${claimsTitle}" data-id="${warranty.id}">
                <i class="fas fa-clipboard-list"></i>
            </button>
            <span class="action-btn-placeholder" title="View only - not your warranty">
                <i class="fas fa-eye" style="color: #666;"></i>
            </span>
        `;

        const cardElement = document.createElement('div');
        const isArchivedItem = isArchivedView || warranty.is_archived;
        cardElement.className = `warranty-card ${isArchivedItem ? 'archived' : (statusClass === 'expired' ? 'expired' : statusClass === 'expiring' ? 'expiring-soon' : 'active')}`;
        
        // Claims button styling will be handled in the action buttons HTML generation
        
        if (currentView === 'grid') {
            // Grid view HTML structure
            const photoThumbnailHtml = warranty.product_photo_path && warranty.product_photo_path !== 'null' ? `
                <div class="product-photo-thumbnail">
                    <a href="#" onclick="openSecureFile('${warranty.product_photo_path}'); return false;" title="Click to view full size image">
                        <img data-secure-src="/api/secure-file/${warranty.product_photo_path.replace('uploads/', '')}" alt="Product Photo" 
                             style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid var(--border-color); cursor: pointer;"
                             onerror="this.style.display='none'" class="secure-image">
                    </a>
                </div>
            ` : '';
            
            cardElement.innerHTML = `
                <div class="product-name-header">
                    <h3 class="warranty-title" title="${warranty.product_name || 'Unnamed Product'}">${warranty.product_name || 'Unnamed Product'}</h3>
                    <div class="warranty-actions">
                        ${actionButtonsHtml}
                    </div>
                </div>
                <div class="warranty-content">
                    ${photoThumbnailHtml}
                    <div class="warranty-info">
                        ${userInfoHtml}
                        <div><i class="fas fa-calendar"></i> ${window.i18next ? window.i18next.t('warranties.age') : 'Age'}: <span>${productAge}</span></div>
                        <div><i class="fas fa-file-alt"></i> ${window.i18next ? window.i18next.t('warranties.warranty') : 'Warranty'}: <span>${warrantyDurationText}</span></div>
                        <div><i class="fas fa-wrench"></i> ${window.i18next ? window.i18next.t('warranties.warranty_ends') : 'Warranty Ends'}: <span>${expirationDateText}</span></div>
                        ${warranty.purchase_price ? `<div><i class="fas fa-coins"></i> ${window.i18next ? window.i18next.t('warranties.price') : 'Price'}: <span>${formatCurrencyHTML(warranty.purchase_price, warranty.currency ? getCurrencySymbolByCode(warranty.currency) : getCurrencySymbol(), getCurrencyPosition())}</span></div>` : ''}
                        ${validSerialNumbers.length > 0 ? `
                            <div><i class="fas fa-barcode"></i> ${window.i18next ? window.i18next.t('warranties.serial_number') : 'Serial Number'}: <span>${validSerialNumbers[0]}</span></div>
                            ${validSerialNumbers.length > 1 ? `
                                <div style="margin-left: 28px;">
                                    <ul style="margin-top: 5px;">
                                        ${validSerialNumbers.slice(1).map(sn => `<li>${sn}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        ` : ''}
                        ${warranty.model_number ? `<div><i class="fas fa-tag"></i> ${window.i18next ? window.i18next.t('warranties.model_number') : 'Model Number'}: <span>${warranty.model_number}</span></div>` : ''}
                        ${warranty.vendor ? `<div><i class="fas fa-store"></i> ${window.i18next ? window.i18next.t('warranties.vendor') : 'Vendor'}: <span>${warranty.vendor}</span></div>` : ''}
                        ${warranty.warranty_type ? `<div><i class="fas fa-shield-alt"></i> ${window.i18next ? window.i18next.t('warranties.type') : 'Type'}: <span>${warranty.warranty_type}</span></div>` : ''}
                    </div>
                </div>
                ${hasDocuments ? `
                <div class="document-links-row">
                    <div class="document-links-inner-container">
                        ${warranty.product_url ? `
                            <a href="${warranty.product_url}" class="product-link" target="_blank">
                                <i class="fas fa-globe"></i> ${window.i18next ? window.i18next.t('warranties.product_website') : 'Product Website'}
                            </a>
                        ` : ''}
                        ${generateDocumentLink(warranty, 'invoice')}
                        ${generateDocumentLink(warranty, 'manual')}
                        ${generateDocumentLink(warranty, 'other')}
                        ${notesLinkHtml}

                    </div>
                </div>
                ` : ''}
                ${tagsHtml}
                <div class="warranty-status-row status-${statusClass}">
                    <span>${statusText}</span>
                </div>
            `;
        } else if (currentView === 'list') {
            // List view HTML structure
            const photoThumbnailHtml = warranty.product_photo_path && warranty.product_photo_path !== 'null' ? `
                <div class="product-photo-thumbnail">
                    <a href="#" onclick="openSecureFile('${warranty.product_photo_path}'); return false;" title="Click to view full size image">
                        <img data-secure-src="/api/secure-file/${warranty.product_photo_path.replace('uploads/', '')}" alt="Product Photo" 
                             style="width: 180px; height: 180px; object-fit: cover; border-radius: 6px; border: 2px solid var(--border-color); cursor: pointer;"
                             onerror="this.style.display='none'" class="secure-image">
                    </a>
                </div>
            ` : '';
            
            cardElement.innerHTML = `
                <div class="product-name-header">
                    <h3 class="warranty-title" title="${warranty.product_name || 'Unnamed Product'}">${warranty.product_name || 'Unnamed Product'}</h3>
                    <div class="warranty-actions">
                        ${actionButtonsHtml}
                    </div>
                </div>
                <div class="warranty-content">
                    ${photoThumbnailHtml}
                    <div class="warranty-info">
                        ${userInfoHtml}
                        <div><i class="fas fa-calendar"></i> ${window.i18next ? window.i18next.t('warranties.age') : 'Age'}: <span>${productAge}</span></div>
                        <div><i class="fas fa-file-alt"></i> ${window.i18next ? window.i18next.t('warranties.warranty') : 'Warranty'}: <span>${warrantyDurationText}</span></div>
                        <div><i class="fas fa-wrench"></i> ${window.i18next ? window.i18next.t('warranties.warranty_ends') : 'Warranty Ends'}: <span>${expirationDateText}</span></div>
                        ${warranty.purchase_price ? `<div><i class="fas fa-coins"></i> ${window.i18next ? window.i18next.t('warranties.price') : 'Price'}: <span>${formatCurrencyHTML(warranty.purchase_price, warranty.currency ? getCurrencySymbolByCode(warranty.currency) : getCurrencySymbol(), getCurrencyPosition())}</span></div>` : ''}
                        ${validSerialNumbers.length > 0 ? `
                            <div><i class="fas fa-barcode"></i> ${window.i18next ? window.i18next.t('warranties.serial_number') : 'Serial Number'}: <span>${validSerialNumbers[0]}</span></div>
                            ${validSerialNumbers.length > 1 ? `
                                <div style="margin-left: 28px;">
                                    <ul style="margin-top: 5px;">
                                        ${validSerialNumbers.slice(1).map(sn => `<li>${sn}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        ` : ''}
                        ${warranty.model_number ? `<div><i class=\"fas fa-tag\"></i> ${window.i18next ? window.i18next.t('warranties.model_number') : 'Model Number'}: <span>${warranty.model_number}</span></div>` : ''}
                        ${warranty.vendor ? `<div><i class="fas fa-store"></i> ${window.i18next ? window.i18next.t('warranties.vendor') : 'Vendor'}: <span>${warranty.vendor}</span></div>` : ''}
                        ${warranty.warranty_type ? `<div><i class="fas fa-shield-alt"></i> ${window.i18next ? window.i18next.t('warranties.type') : 'Type'}: <span>${warranty.warranty_type}</span></div>` : ''}
                    </div>
                </div>
                ${hasDocuments ? `
                <div class="document-links-row">
                    <div class="document-links-inner-container">
                        ${warranty.product_url ? `
                            <a href="${warranty.product_url}" class="product-link" target="_blank">
                                <i class="fas fa-globe"></i> ${window.i18next ? window.i18next.t('warranties.product_website') : 'Product Website'}
                            </a>
                        ` : ''}
                        ${generateDocumentLink(warranty, 'invoice')}
                        ${generateDocumentLink(warranty, 'manual')}
                        ${generateDocumentLink(warranty, 'other')}
                        ${notesLinkHtml}

                    </div>
                </div>
                ` : ''}
                ${tagsHtml}
                <div class="warranty-status-row status-${statusClass}">
                    <span>${statusText}</span>
                </div>
            `;
        } else if (currentView === 'table') {
            // Table view HTML structure
            const photoThumbnailHtml = warranty.product_photo_path && warranty.product_photo_path !== 'null' ? `
                <div class="product-photo-thumbnail">
                    <a href="#" onclick="openSecureFile('${warranty.product_photo_path}'); return false;" title="Click to view full size image">
                        <img data-secure-src="/api/secure-file/${warranty.product_photo_path.replace('uploads/', '')}" alt="Product Photo" 
                             style="width: 55px; height: 55px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color); cursor: pointer;"
                             onerror="this.style.display='none'" class="secure-image">
                    </a>
                </div>
            ` : '';
            
            cardElement.innerHTML = `
                <div class="product-name-header">
                    <h3 class="warranty-title" title="${warranty.product_name || 'Unnamed Product'}">${warranty.product_name || 'Unnamed Product'}</h3>
                    <div class="warranty-actions">
                        ${actionButtonsHtml}
                    </div>
                </div>
                <div class="warranty-content">
                    ${photoThumbnailHtml}
                    <div class="warranty-info">
                        ${userInfoHtml}
                        <div><i class="fas fa-calendar"></i> ${window.i18next ? window.i18next.t('warranties.age') : 'Age'}: <span>${productAge}</span></div>
                        <div><i class="fas fa-file-alt"></i> ${window.i18next ? window.i18next.t('warranties.warranty') : 'Warranty'}: <span>${warrantyDurationText}</span></div>
                        <div><i class="fas fa-wrench"></i> ${window.i18next ? window.i18next.t('warranties.warranty_ends') : 'Warranty Ends'}: <span>${expirationDateText}</span></div>
                        ${warranty.purchase_price ? `<div><i class="fas fa-coins"></i> ${window.i18next ? window.i18next.t('warranties.price') : 'Price'}: <span>${formatCurrencyHTML(warranty.purchase_price, warranty.currency ? getCurrencySymbolByCode(warranty.currency) : getCurrencySymbol(), getCurrencyPosition())}</span></div>` : ''}
                        ${validSerialNumbers.length > 0 ? `
                            <div><i class="fas fa-barcode"></i> ${window.i18next ? window.i18next.t('warranties.serial_number') : 'Serial Number'}: <span>${validSerialNumbers[0]}</span></div>
                            ${validSerialNumbers.length > 1 ? `
                                <div style="margin-left: 28px;">
                                    <ul style="margin-top: 5px;">
                                        ${validSerialNumbers.slice(1).map(sn => `<li>${sn}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        ` : ''}
                        ${warranty.model_number ? `<div><i class=\"fas fa-tag\"></i> ${window.i18next ? window.i18next.t('warranties.model_number') : 'Model Number'}: <span>${warranty.model_number}</span></div>` : ''}
                        ${warranty.vendor ? `<div><i class="fas fa-store"></i> ${window.i18next ? window.i18next.t('warranties.vendor') : 'Vendor'}: <span>${warranty.vendor}</span></div>` : ''}
                        ${warranty.warranty_type ? `<div><i class="fas fa-shield-alt"></i> ${window.i18next ? window.i18next.t('warranties.type') : 'Type'}: <span>${warranty.warranty_type}</span></div>` : ''}
                    </div>
                </div>
                <div class="warranty-status-row status-${statusClass}">
                    <span>${statusText}</span>
                </div>
                ${hasDocuments ? `
                <div class="document-links-row">
                    <div class="document-links-inner-container">
                        ${warranty.product_url ? `
                            <a href="${warranty.product_url}" class="product-link" target="_blank">
                                <i class="fas fa-globe"></i> ${window.i18next ? window.i18next.t('warranties.product_website') : 'Product Website'}
                            </a>
                        ` : ''}
                        ${generateDocumentLink(warranty, 'invoice')}
                        ${generateDocumentLink(warranty, 'manual')}
                        ${generateDocumentLink(warranty, 'other')}
                        ${notesLinkHtml}

                    </div>
                </div>
                ` : ''}
                ${tagsHtml}
            `;
        }
        
        // Add event listeners
        warrantiesList.appendChild(cardElement);
        
        // Add event listeners only if user can edit (buttons exist)
        if (canEdit) {
            // Edit button event listener
            const editBtn = cardElement.querySelector('.edit-btn');
            if (editBtn && !editBtn.disabled) {
                editBtn.addEventListener('click', async () => {
                    console.log('[DEBUG] Edit button clicked for warranty ID:', warranty.id);
                    // Find the current warranty data instead of using the potentially stale warranty object
                    const currentWarranty = warranties.find(w => w.id === warranty.id);
                    console.log('[DEBUG] Found current warranty:', currentWarranty ? 'Yes' : 'No', currentWarranty?.notes);
                    if (currentWarranty) {
                        await openEditModal(currentWarranty);
                    } else {
                        showToast(window.t('messages.warranty_not_found_refresh'), 'error');
                    }
                });
            }
            
            // Delete button event listener
            const deleteBtn = cardElement.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    openDeleteModal(warranty.id, warranty.product_name);
                });
            }

            // Archive/Unarchive button event listeners
            const archiveBtn = cardElement.querySelector('.archive-btn');
            if (archiveBtn) {
                archiveBtn.addEventListener('click', () => {
                    openArchiveModal(warranty.id, warranty.product_name);
                });
            }
            const unarchiveBtn = cardElement.querySelector('.unarchive-btn');
            if (unarchiveBtn) {
                unarchiveBtn.addEventListener('click', async () => {
                    await toggleArchiveStatus(warranty.id, false);
                });
            }
        }
        // View notes button event listener
        const notesLink = cardElement.querySelector('.notes-link');
        if (notesLink) {
            notesLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Find the current warranty data instead of using the potentially stale warranty object
                const currentWarranty = warranties.find(w => w.id === warranty.id);
                if (currentWarranty) {
                    showNotesModal(currentWarranty.notes, currentWarranty);
                } else {
                    showToast(window.t('messages.warranty_not_found_refresh'), 'error');
                }
            });
        }
    });
    
    // Load secure images with authentication after rendering
    loadSecureImages();

    // Improved: Align card heights after all images have loaded
    if (currentView === 'grid') {
        const cards = warrantiesList.querySelectorAll('.warranty-card');
        if (cards.length > 0) {
            const images = warrantiesList.querySelectorAll('.secure-image');
            let loadedCount = 0;
            const totalImages = images.length;

            const alignHeights = () => {
                let maxHeight = 0;
                cards.forEach(card => {
                    card.style.minHeight = ''; // Reset
                    const height = card.getBoundingClientRect().height;
                    if (height > maxHeight) maxHeight = height;
                });
                cards.forEach(card => {
                    card.style.minHeight = `${maxHeight}px`;
                });
            };

            if (totalImages === 0) {
                alignHeights(); // No images, align immediately
            } else {
                images.forEach(img => {
                    if (img.complete) {
                        loadedCount++;
                        if (loadedCount === totalImages) alignHeights();
                    } else {
                        img.addEventListener('load', () => {
                            loadedCount++;
                            if (loadedCount === totalImages) alignHeights();
                        });
                        img.addEventListener('error', () => {
                            loadedCount++;
                            if (loadedCount === totalImages) alignHeights();
                        });
                    }
                });
            }
        }
    }

    // Update the timeline chart if on the status page or appropriate
    if (typeof updateTimelineChart === 'function') {
        updateTimelineChart();
    }

    console.log('Warranties rendered successfully');
}

function filterWarranties() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : ''; // Add null check for searchInput

    // Show or hide the clear search button if it exists
    if (clearSearchBtn) {
        clearSearchBtn.style.display = searchTerm ? 'flex' : 'none';
    }

    if (!searchTerm) {
        return warranties; // Return the full list if no search term
        // REMOVED: renderWarranties(); 
        // REMOVED: return;
    }

    const filtered = warranties.filter(warranty => {
        // Check product name
        if (warranty.product_name && warranty.product_name.toLowerCase().includes(searchTerm)) { // Add null check
            return true;
        }

        // Check tags
        if (warranty.tags && Array.isArray(warranty.tags)) {
            if (warranty.tags.some(tag => tag.name && tag.name.toLowerCase().includes(searchTerm))) {
                return true;
            }
        }

        // Check notes
        if (warranty.notes && warranty.notes.toLowerCase().includes(searchTerm)) {
            return true;
        }

        // Check vendor
        if (warranty.vendor && warranty.vendor.toLowerCase().includes(searchTerm)) {
            return true;
        }

        // Check model number
        if (warranty.model_number && warranty.model_number.toLowerCase().includes(searchTerm)) {
            return true;
        }

        // Check if any serial number contains search term
        if (warranty.serial_numbers && Array.isArray(warranty.serial_numbers)) {
            if (warranty.serial_numbers.some(sn => sn && sn.toLowerCase().includes(searchTerm))) {
                return true;
            }
        }

        return false;
    });

    // REMOVED: Add visual feedback if no results found
    // REMOVED: if (filtered.length === 0) {
    // REMOVED:     renderEmptyState(`No matches found for "${searchTerm}". Try a different search term.`);
    // REMOVED: } else {
    // REMOVED:     renderWarranties(filtered);
    // REMOVED: }

    return filtered; // Return the filtered list
}

function applyFilters() {
    console.log('[FILTER DEBUG] Applying filters with:', currentFilters);
    console.log('[FILTER DEBUG] Total warranties before filtering:', warranties.length);
    
    // If user selected archived status, reload data from archived endpoint and return
    if (currentFilters.status === 'archived') {
        if (!lastLoadedArchived) {
            loadWarranties(true);
            return;
        }
    } else if (lastLoadedArchived) {
        // If leaving archived view, reload normal source
        loadWarranties(true);
        return;
    } else if (currentFilters.status === 'all' && !lastLoadedIncludesArchived) {
        // Ensure All view re-merges archived items after switching away and back
        loadWarranties(true);
        return;
    }

    // Filter warranties based on currentFilters
    const filtered = warranties.filter(warranty => {
        // Exclude archived items from specific status views (only show in 'all' or 'archived')
        if (warranty.is_archived && currentFilters.status !== 'all' && currentFilters.status !== 'archived') {
            return false;
        }
        // Status filter: allow archived items to pass in All view
        if (currentFilters.status !== 'all' && currentFilters.status !== 'archived' && warranty.status !== currentFilters.status) {
            return false;
        }
        
        // Tag filter
        if (currentFilters.tag !== 'all') {
            const tagId = parseInt(currentFilters.tag);
            const hasTag = warranty.tags && Array.isArray(warranty.tags) &&
                warranty.tags.some(tag => tag.id === tagId);
            if (!hasTag) {
                return false;
            }
        }

        // Vendor filter
        if (currentFilters.vendor !== 'all' && (warranty.vendor || '').toLowerCase() !== currentFilters.vendor.toLowerCase()) {
            return false;
        }
        
        // Warranty type filter
        if (currentFilters.warranty_type !== 'all' && (warranty.warranty_type || '').toLowerCase() !== currentFilters.warranty_type.toLowerCase()) {
            return false;
        }
        
        // Search filter
        if (currentFilters.search) {
            const searchTerm = currentFilters.search.toLowerCase();
            // Check if product name contains search term
            const productNameMatch = warranty.product_name.toLowerCase().includes(searchTerm);
            // Check if any tag name contains search term
            const tagMatch = warranty.tags && Array.isArray(warranty.tags) && 
                warranty.tags.some(tag => tag.name.toLowerCase().includes(searchTerm));
            // Check if notes contains search term
            const notesMatch = warranty.notes && warranty.notes.toLowerCase().includes(searchTerm);
            // Check if vendor contains search term
            const vendorMatch = warranty.vendor && warranty.vendor.toLowerCase().includes(searchTerm);
            // Check if model number contains search term
            const modelNumberMatch = warranty.model_number && warranty.model_number.toLowerCase().includes(searchTerm);
            // Check if any serial number contains search term
            const serialNumberMatch = warranty.serial_numbers && Array.isArray(warranty.serial_numbers) &&
                warranty.serial_numbers.some(sn => sn && sn.toLowerCase().includes(searchTerm));
            // Return true if any match
            if (!productNameMatch && !tagMatch && !notesMatch && !vendorMatch && !modelNumberMatch && !serialNumberMatch) {
                return false;
            }
        }
        
        return true;
    });
    
    console.log('[FILTER DEBUG] Filtered warranties:', filtered.length);
    console.log('[FILTER DEBUG] Filtered warranty IDs:', filtered.map(w => w.id));
    
    // Render the filtered warranties
    renderWarranties(filtered);
}

// --- Persist and restore filters/sort ---
async function saveFilterPreferences(saveToApi = true) {
    try {
        const prefix = getPreferenceKeyPrefix();
        const filtersToSave = {
            status: currentFilters.status || 'all',
            tag: currentFilters.tag || 'all',
            vendor: currentFilters.vendor || 'all',
            warranty_type: currentFilters.warranty_type || 'all',
            search: currentFilters.search || '',
            sortBy: currentFilters.sortBy || 'expiration'
        };
        localStorage.setItem(`${prefix}warrantyFilters`, JSON.stringify(filtersToSave));
        
        // Save to API if authenticated and saveToApi is true
        if (saveToApi && window.auth && window.auth.isAuthenticated()) {
            const token = window.auth.getToken();
            if (token) {
                try {
                    console.log('[Filters] Saving filter preferences to API:', filtersToSave);
                    const response = await fetch('/api/auth/preferences', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ saved_filters: filtersToSave })
                    });
                    
                    if (response.ok) {
                        console.log('[Filters] Successfully saved filter preferences to API');
                    } else {
                        console.warn('[Filters] Failed to save filter preferences to API:', response.status);
                    }
                } catch (error) {
                    console.error('[Filters] Error saving filter preferences to API:', error);
                }
            }
        }
    } catch (e) {
        console.warn('Failed to save filter preferences', e);
    }
}

// Deprecated: Sort preference is now saved as part of saveFilterPreferences

function loadFilterAndSortPreferences() {
    try {
        const prefix = getPreferenceKeyPrefix();
        const savedFiltersRaw = localStorage.getItem(`${prefix}warrantyFilters`);
        if (savedFiltersRaw) {
            const savedFilters = JSON.parse(savedFiltersRaw);
            if (savedFilters && typeof savedFilters === 'object') {
                console.log('[Filters] Loading saved filters from localStorage:', savedFilters);
                currentFilters.status = savedFilters.status || currentFilters.status;
                currentFilters.tag = savedFilters.tag || currentFilters.tag;
                currentFilters.vendor = savedFilters.vendor || currentFilters.vendor;
                currentFilters.warranty_type = savedFilters.warranty_type || currentFilters.warranty_type;
                currentFilters.search = savedFilters.search || '';
                currentFilters.sortBy = savedFilters.sortBy || currentFilters.sortBy;
                
                // Restore search input UI state
                const searchInput = document.getElementById('searchWarranties');
                const clearSearchBtn = document.getElementById('clearSearch');
                if (searchInput && savedFilters.search) {
                    searchInput.value = savedFilters.search;
                    // Show clear button if search has value
                    if (clearSearchBtn) {
                        clearSearchBtn.style.display = 'flex';
                    }
                    // Add active search class
                    searchInput.parentElement.classList.add('active-search');
                }
            }
        }
    } catch (e) {
        console.warn('Failed to load filter/sort preferences', e);
    }
}

async function openEditModal(warranty) {
    // Close any existing modals first
    closeModals();
    
    currentWarrantyId = warranty.id;
    
    // Load currencies for the dropdown and wait for it to complete
    await loadCurrencies();
    
    console.log('[DEBUG] Opening edit modal for warranty:', warranty.id, 'with notes:', warranty.notes);
    
    // Populate form fields
    document.getElementById('editProductName').value = warranty.product_name;
    document.getElementById('editProductUrl').value = warranty.product_url || '';
    const editModelNumberInput = document.getElementById('editModelNumber');
    if (editModelNumberInput) {
        editModelNumberInput.value = warranty.model_number || '';
    }
    document.getElementById('editPurchaseDate').value = warranty.purchase_date.split('T')[0];
    // Populate new duration fields
    document.getElementById('editWarrantyDurationYears').value = warranty.warranty_duration_years || 0;
    document.getElementById('editWarrantyDurationMonths').value = warranty.warranty_duration_months || 0;
    document.getElementById('editWarrantyDurationDays').value = warranty.warranty_duration_days || 0;
    
    document.getElementById('editPurchasePrice').value = warranty.purchase_price || '';
    
    // Set currency dropdown
    const editCurrencySelect = document.getElementById('editCurrency');
    if (editCurrencySelect && warranty.currency) {
        editCurrencySelect.value = warranty.currency;
    }
    document.getElementById('editVendor').value = warranty.vendor || '';
    
    // Populate URL fields for documents (with null checks)
    const editInvoiceUrl = document.getElementById('editInvoiceUrl');
    if (editInvoiceUrl) editInvoiceUrl.value = warranty.invoice_url || '';
    
    const editManualUrl = document.getElementById('editManualUrl');
    if (editManualUrl) editManualUrl.value = warranty.manual_url || '';
    
    const editOtherDocumentUrl = document.getElementById('editOtherDocumentUrl');
    if (editOtherDocumentUrl) editOtherDocumentUrl.value = warranty.other_document_url || '';
    
    // Handle warranty type - check if it's a predefined option or custom
    const editWarrantyTypeSelect = document.getElementById('editWarrantyType');
    const editWarrantyTypeCustom = document.getElementById('editWarrantyTypeCustom');
    if (editWarrantyTypeSelect && warranty.warranty_type) {
        // Check if the warranty type exists as an option in the dropdown
        const options = Array.from(editWarrantyTypeSelect.options);
        const matchingOption = options.find(option => option.value === warranty.warranty_type);
        
        if (matchingOption) {
            // It's a predefined option
            editWarrantyTypeSelect.value = warranty.warranty_type;
            if (editWarrantyTypeCustom) editWarrantyTypeCustom.style.display = 'none';
        } else {
            // It's a custom value
            editWarrantyTypeSelect.value = 'other';
            if (editWarrantyTypeCustom) {
                editWarrantyTypeCustom.style.display = 'block';
                editWarrantyTypeCustom.value = warranty.warranty_type;
            }
        }
    } else if (editWarrantyTypeSelect) {
        editWarrantyTypeSelect.value = '';
        if (editWarrantyTypeCustom) editWarrantyTypeCustom.style.display = 'none';
    }
    
    // Clear existing serial number inputs
    const editSerialNumbersContainer = document.getElementById('editSerialNumbersContainer');
    editSerialNumbersContainer.innerHTML = '';

    // Normalize serial_numbers to array of strings if needed
    if (Array.isArray(warranty.serial_numbers) && warranty.serial_numbers.length > 0 && typeof warranty.serial_numbers[0] === 'object') {
        warranty.serial_numbers = warranty.serial_numbers
            .map(snObj => snObj && snObj.serial_number)
            .filter(sn => typeof sn === 'string' && sn.trim() !== '');
    }

    // Add event listener for adding new serial number inputs in edit modal
    editSerialNumbersContainer.addEventListener('click', (e) => {
        if (e.target.closest('.add-serial-number')) {
            addSerialNumberInput(editSerialNumbersContainer);
        }
    });

    const validSerialNumbers = Array.isArray(warranty.serial_numbers)
        ? warranty.serial_numbers.filter(sn => sn && typeof sn === 'string' && sn.trim() !== '')
        : [];

    if (validSerialNumbers.length === 0) {
        // Add a single empty input if there are no serial numbers
        addSerialNumberInput(editSerialNumbersContainer);
    } else {
        // Add the first serial number with an "Add Another" button only (no remove button)
        const firstInput = document.createElement('div');
        firstInput.className = 'serial-number-input';
        firstInput.innerHTML = `
            <input type="text" name="serial_numbers[]" class="form-control" placeholder="${i18next.t('warranties.enter_serial_number')}" value="${validSerialNumbers[0]}">
            <button type="button" class="btn btn-sm btn-primary add-serial-number">
                <i class="fas fa-plus"></i> ${i18next.t('warranties.add_serial_number')}
            </button>
        `;

        // Add event listener for the Add button
        firstInput.querySelector('.add-serial-number').addEventListener('click', function(e) {
            e.stopPropagation(); // Stop event from bubbling up
            addSerialNumberInput(editSerialNumbersContainer);
        });

        editSerialNumbersContainer.appendChild(firstInput);

        // Add the rest of the serial numbers with "Remove" buttons
        for (let i = 1; i < validSerialNumbers.length; i++) {
            const newInput = document.createElement('div');
            newInput.className = 'serial-number-input';
            newInput.innerHTML = `
                <input type="text" name="serial_numbers[]" class="form-control" placeholder="${i18next.t('warranties.enter_serial_number')}" value="${validSerialNumbers[i]}">
                <button type="button" class="btn btn-sm btn-danger remove-serial-number">
                    <i class="fas fa-minus"></i> ${i18next.t('actions.delete')}
                </button>
            `;

            // Add remove button functionality
            newInput.querySelector('.remove-serial-number').addEventListener('click', function() {
                this.parentElement.remove();
            });

            editSerialNumbersContainer.appendChild(newInput);
        }
    }
    
    // Show current invoice if exists
    const currentInvoiceElement = document.getElementById('currentInvoice');
    const deleteInvoiceBtn = document.getElementById('deleteInvoiceBtn');
    if (currentInvoiceElement && deleteInvoiceBtn) {
        const hasLocalInvoice = warranty.invoice_path && warranty.invoice_path !== 'null';
        const hasPaperlessInvoice = warranty.paperless_invoice_id && warranty.paperless_invoice_id !== null;
        
        if (hasLocalInvoice) {
            currentInvoiceElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_invoice')}: 
                    <a href="#" class="view-document-link" onclick="openSecureFile('${warranty.invoice_path}'); return false;">View</a>
                    (${i18next.t('warranties.upload_new_file_replace')})
                </span>
            `;
            deleteInvoiceBtn.style.display = '';
        } else if (hasPaperlessInvoice) {
            currentInvoiceElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_invoice')}: 
                    <a href="#" class="view-document-link" onclick="openPaperlessDocument(${warranty.paperless_invoice_id}, {user_id: ${warranty.user_id}, id: ${warranty.id}}); return false;">View</a>
                    <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i> (${i18next.t('warranties.upload_new_file_replace')})
                </span>
            `;
            deleteInvoiceBtn.style.display = '';
        } else {
            currentInvoiceElement.innerHTML = `<span>${i18next.t('warranties.no_invoice_uploaded')}</span>`;
            deleteInvoiceBtn.style.display = 'none';
        }
        // Reset delete state
        deleteInvoiceBtn.dataset.delete = 'false';
        deleteInvoiceBtn.onclick = function() {
            deleteInvoiceBtn.dataset.delete = 'true';
            currentInvoiceElement.innerHTML = `<span class="text-danger">${i18next.t('warranties.invoice_will_be_deleted')}</span>`;
            deleteInvoiceBtn.style.display = 'none';
        };
    }
    // Show current manual if exists
    const currentManualElement = document.getElementById('currentManual');
    const deleteManualBtn = document.getElementById('deleteManualBtn');
    if (currentManualElement && deleteManualBtn) {
        const hasLocalManual = warranty.manual_path && warranty.manual_path !== 'null';
        const hasPaperlessManual = warranty.paperless_manual_id && warranty.paperless_manual_id !== null;
        
        if (hasLocalManual) {
            currentManualElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_manual')}: 
                    <a href="#" class="view-document-link" onclick="openSecureFile('${warranty.manual_path}'); return false;">View</a>
                    (${i18next.t('warranties.upload_new_file_replace')})
                </span>
            `;
            deleteManualBtn.style.display = '';
        } else if (hasPaperlessManual) {
            currentManualElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_manual')}: 
                    <a href="#" class="view-document-link" onclick="openPaperlessDocument(${warranty.paperless_manual_id}, {user_id: ${warranty.user_id}, id: ${warranty.id}}); return false;">View</a>
                    <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i> (${i18next.t('warranties.upload_new_file_replace')})
                </span>
            `;
            deleteManualBtn.style.display = '';
        } else {
            currentManualElement.innerHTML = `<span>${i18next.t('warranties.no_manual_uploaded')}</span>`;
            deleteManualBtn.style.display = 'none';
        }
        // Reset delete state
        deleteManualBtn.dataset.delete = 'false';
        deleteManualBtn.onclick = function() {
            deleteManualBtn.dataset.delete = 'true';
            currentManualElement.innerHTML = `<span class="text-danger">${i18next.t('warranties.manual_will_be_deleted')}</span>`;
            deleteManualBtn.style.display = 'none';
        };
    }

    // Show current product photo if exists
    const currentProductPhotoElement = document.getElementById('currentProductPhoto');
    const deleteProductPhotoBtn = document.getElementById('deleteProductPhotoBtn');
    if (currentProductPhotoElement && deleteProductPhotoBtn) {
        const hasLocalPhoto = warranty.product_photo_path && warranty.product_photo_path !== 'null';
        const hasPaperlessPhoto = warranty.paperless_photo_id && warranty.paperless_photo_id !== null;
        
        if (hasLocalPhoto) {
            currentProductPhotoElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_photo')}: 
                    <img data-secure-src="/api/secure-file/${warranty.product_photo_path.replace('uploads/', '')}" alt="Current Photo" class="secure-image" 
                         style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 8px; margin-left: 10px; border: 2px solid var(--border-color);"
                         onerror="this.style.display='none'">
                    <br><small>(${i18next.t('warranties.upload_new_photo_replace')})</small>
                </span>
            `;
            deleteProductPhotoBtn.style.display = '';
        } else if (hasPaperlessPhoto) {
            currentProductPhotoElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_photo')}: 
                    <a href="#" class="view-document-link" onclick="openPaperlessDocument(${warranty.paperless_photo_id}, {user_id: ${warranty.user_id}, id: ${warranty.id}}); return false;">View</a>
                    <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i>
                    <br><small>(${i18next.t('warranties.upload_new_photo_replace')})</small>
                </span>
            `;
            deleteProductPhotoBtn.style.display = '';
        } else {
            currentProductPhotoElement.innerHTML = `<span>${i18next.t('warranties.no_photo_uploaded')}</span>`;
            deleteProductPhotoBtn.style.display = 'none';
        }
        // Reset delete state
        deleteProductPhotoBtn.dataset.delete = 'false';
        deleteProductPhotoBtn.onclick = function() {
            deleteProductPhotoBtn.dataset.delete = 'true';
            currentProductPhotoElement.innerHTML = `<span class="text-danger">${i18next.t('warranties.photo_will_be_deleted')}</span>`;
            deleteProductPhotoBtn.style.display = 'none';
        };
    }
    
    // Show current other document if exists
    const currentOtherDocumentElement = document.getElementById('currentOtherDocument'); 
    const deleteOtherDocumentBtn = document.getElementById('deleteOtherDocumentBtn'); 
    if (currentOtherDocumentElement && deleteOtherDocumentBtn) { 
        const hasLocalOther = warranty.other_document_path && warranty.other_document_path !== 'null';
        const hasPaperlessOther = warranty.paperless_other_id && warranty.paperless_other_id !== null;
        
        if (hasLocalOther) { 
            currentOtherDocumentElement.innerHTML = ` 
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_other_document')}: 
                    <a href="#" class="view-document-link" onclick="openSecureFile('${warranty.other_document_path}'); return false;">View</a>
                    (${i18next.t('warranties.upload_new_file_replace')})
                </span>
            `; 
            deleteOtherDocumentBtn.style.display = ''; 
        } else if (hasPaperlessOther) {
            currentOtherDocumentElement.innerHTML = ` 
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> ${i18next.t('warranties.current_other_document')}: 
                    <a href="#" class="view-document-link" onclick="openPaperlessDocument(${warranty.paperless_other_id}, {user_id: ${warranty.user_id}, id: ${warranty.id}}); return false;">View</a>
                    <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i> (${i18next.t('warranties.upload_new_file_replace')})
                </span>
            `; 
            deleteOtherDocumentBtn.style.display = ''; 
        } else { 
            currentOtherDocumentElement.innerHTML = `<span>${i18next.t('warranties.no_other_document_uploaded')}</span>`; 
            deleteOtherDocumentBtn.style.display = 'none'; 
        } 
        // Reset delete state
        deleteOtherDocumentBtn.dataset.delete = 'false'; 
        deleteOtherDocumentBtn.onclick = function() { 
            deleteOtherDocumentBtn.dataset.delete = 'true'; 
            currentOtherDocumentElement.innerHTML = `<span class="text-danger">${i18next.t('warranties.other_document_will_be_deleted')}</span>`; 
            deleteOtherDocumentBtn.style.display = 'none'; 
        }; 
    } 
    
    // Reset file inputs
    document.getElementById('editProductPhoto').value = '';
    document.getElementById('editInvoice').value = '';
    document.getElementById('editManual').value = '';
    document.getElementById('editOtherDocument').value = ''; 
    document.getElementById('editProductPhotoFileName').textContent = '';
    document.getElementById('editFileName').textContent = '';
    document.getElementById('editManualFileName').textContent = '';
    document.getElementById('editOtherDocumentFileName').textContent = '';
    
    // Reset photo preview
    const editPhotoPreview = document.getElementById('editProductPhotoPreview');
    if (editPhotoPreview) {
        editPhotoPreview.style.display = 'none';
    } 
    
    // Set storage options based on current document storage
    if (paperlessNgxEnabled) {
        // Set product photo storage option
        const editProductPhotoStorageRadios = document.getElementsByName('editProductPhotoStorage');
        if (editProductPhotoStorageRadios.length > 0) {
            const isPaperlessPhoto = warranty.paperless_photo_id && warranty.paperless_photo_id !== null;
            editProductPhotoStorageRadios.forEach(radio => {
                radio.checked = isPaperlessPhoto ? (radio.value === 'paperless') : (radio.value === 'local');
            });
        }
        
        // Set invoice storage option
        const editInvoiceStorageRadios = document.getElementsByName('editInvoiceStorage');
        if (editInvoiceStorageRadios.length > 0) {
            const isPaperlessInvoice = warranty.paperless_invoice_id && warranty.paperless_invoice_id !== null;
            editInvoiceStorageRadios.forEach(radio => {
                radio.checked = isPaperlessInvoice ? (radio.value === 'paperless') : (radio.value === 'local');
            });
        }
        
        // Set manual storage option
        const editManualStorageRadios = document.getElementsByName('editManualStorage');
        if (editManualStorageRadios.length > 0) {
            const isPaperlessManual = warranty.paperless_manual_id && warranty.paperless_manual_id !== null;
            editManualStorageRadios.forEach(radio => {
                radio.checked = isPaperlessManual ? (radio.value === 'paperless') : (radio.value === 'local');
            });
        }
        
        // Set other document storage option
        const editOtherDocumentStorageRadios = document.getElementsByName('editOtherDocumentStorage');
        if (editOtherDocumentStorageRadios.length > 0) {
            const isPaperlessOther = warranty.paperless_other_id && warranty.paperless_other_id !== null;
            editOtherDocumentStorageRadios.forEach(radio => {
                radio.checked = isPaperlessOther ? (radio.value === 'paperless') : (radio.value === 'local');
            });
        }
        
        console.log('[Edit Modal] Storage options set based on current document storage:', {
            photo: warranty.paperless_photo_id ? 'paperless' : 'local',
            invoice: warranty.paperless_invoice_id ? 'paperless' : 'local',
            manual: warranty.paperless_manual_id ? 'paperless' : 'local',
            other: warranty.paperless_other_id ? 'paperless' : 'local'
        });
    }
    
    // Initialize file input event listeners
    const editProductPhotoInput = document.getElementById('editProductPhoto');
    if (editProductPhotoInput) {
        editProductPhotoInput.addEventListener('change', function(event) {
            updateFileName(event, 'editProductPhoto', 'editProductPhotoFileName');
        });
    }
    
    const editInvoiceInput = document.getElementById('editInvoice');
    if (editInvoiceInput) {
        editInvoiceInput.addEventListener('change', function(event) {
            updateFileName(event, 'editInvoice', 'editFileName');
        });
    }
    
    const editManualInput = document.getElementById('editManual');
    if (editManualInput) {
        editManualInput.addEventListener('change', function(event) {
            updateFileName(event, 'editManual', 'editManualFileName');
        });
    }

    const editOtherDocumentInput = document.getElementById('editOtherDocument'); 
    if (editOtherDocumentInput) { 
        editOtherDocumentInput.addEventListener('change', function(event) { 
            updateFileName(event, 'editOtherDocument', 'editOtherDocumentFileName'); 
        }); 
    } 
    
    // Show edit modal
    const modalBackdrop = document.getElementById('editModal');
    if (modalBackdrop) {
        modalBackdrop.classList.add('active'); // Add active class to display as flex
    }
    
    // Reset tabs to first tab
    const editTabBtns = document.querySelectorAll('.edit-tab-btn');
    editTabBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector('.edit-tab-btn[data-tab="edit-product-info"]').classList.add('active');
    
    // Reset tab content
    document.querySelectorAll('.edit-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('edit-product-info').classList.add('active');
    
    // Initialize edit mode tags
    editSelectedTags = [];
    
    // If warranty has tags, populate editSelectedTags
    if (warranty.tags && Array.isArray(warranty.tags)) {
        editSelectedTags = warranty.tags.map(tag => ({
            id: tag.id,
            name: tag.name,
            color: tag.color
        }));
    }
    
    // Render selected tags using the helper function
    renderEditSelectedTags();
    
    // Set up tag search in edit mode
    const editTagSearch = document.getElementById('editTagSearch');
    const editTagsList = document.getElementById('editTagsList');
    
    if (editTagSearch && editTagsList) {
        // Add event listeners for tag search
        editTagSearch.addEventListener('focus', () => {
            renderEditTagsList();
            editTagsList.classList.add('show');
        });
        
        editTagSearch.addEventListener('input', () => {
            renderEditTagsList(editTagSearch.value);
        });
        
        // Add event listener to close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!editTagSearch.contains(e.target) && !editTagsList.contains(e.target)) {
                editTagsList.classList.remove('show');
            }
        });
    }
    
    // Set up manage tags button in edit mode
    const editManageTagsBtn = document.getElementById('editManageTagsBtn');
    if (editManageTagsBtn) {
        editManageTagsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openTagManagementModal();
        });
    }
    
    // Validate all tabs to update completion indicators
    validateEditTab('edit-product-info');
    validateEditTab('edit-warranty-details');
    validateEditTab('edit-documents');
    validateEditTab('edit-tags');
    
    // Add input event listeners to update validation status
    document.querySelectorAll('#editWarrantyForm input').forEach(input => {
        input.addEventListener('input', function() {
            // Find the tab this input belongs to
            const tabContent = this.closest('.edit-tab-content');
            if (tabContent) {
                validateEditTab(tabContent.id);
            }
        });
    });

    // --- Set Lifetime Checkbox and Toggle Duration Fields ---
    if (editIsLifetimeCheckbox && editWarrantyDurationFields) {
        editIsLifetimeCheckbox.checked = warranty.is_lifetime || false;
        handleEditLifetimeChange(); // Call handler to set initial state

        // Remove previous listener if exists
        editIsLifetimeCheckbox.removeEventListener('change', handleEditLifetimeChange);
        // Add new listener
        editIsLifetimeCheckbox.addEventListener('change', handleEditLifetimeChange);

        // Set duration values only if NOT lifetime
        if (!warranty.is_lifetime) {
            document.getElementById('editWarrantyDurationYears').value = warranty.warranty_duration_years || 0;
            document.getElementById('editWarrantyDurationMonths').value = warranty.warranty_duration_months || 0;
            document.getElementById('editWarrantyDurationDays').value = warranty.warranty_duration_days || 0;
        } else {
            document.getElementById('editWarrantyDurationYears').value = '';
            document.getElementById('editWarrantyDurationMonths').value = '';
            document.getElementById('editWarrantyDurationDays').value = '';
        }
    } else {
        console.error("Lifetime warranty elements or duration fields not found in edit form");
    }

    // --- Set Warranty Method Selection ---
    if (editDurationMethodRadio && editExactDateMethodRadio && editExactExpirationDateInput) {
        console.log('[DEBUG Edit Modal] Warranty method detection:', {
            originalInputMethod: warranty.original_input_method,
            isLifetime: warranty.is_lifetime,
            expirationDate: warranty.expiration_date,
            warrantyDurationYears: warranty.warranty_duration_years,
            warrantyDurationMonths: warranty.warranty_duration_months,
            warrantyDurationDays: warranty.warranty_duration_days
        });
        
        // Use the original input method if available, otherwise fall back to previous logic
        if (!warranty.is_lifetime) {
            if (warranty.original_input_method === 'exact_date') {
                // Use exact date method
                editExactDateMethodRadio.checked = true;
                editDurationMethodRadio.checked = false;
                editExactExpirationDateInput.value = warranty.expiration_date.split('T')[0];
                console.log('[DEBUG Edit Modal] Selected exact date method based on original_input_method');
            } else {
                // Use duration method (either explicitly set or fallback)
                editDurationMethodRadio.checked = true;
                editExactDateMethodRadio.checked = false;
                editExactExpirationDateInput.value = '';
                console.log('[DEBUG Edit Modal] Selected duration method based on original_input_method or fallback');
            }
        }
        
        // Set up event listeners for warranty method change
        editDurationMethodRadio.removeEventListener('change', handleEditWarrantyMethodChange);
        editExactDateMethodRadio.removeEventListener('change', handleEditWarrantyMethodChange);
        editDurationMethodRadio.addEventListener('change', handleEditWarrantyMethodChange);
        editExactDateMethodRadio.addEventListener('change', handleEditWarrantyMethodChange);
        
        console.log('[DEBUG Edit Modal] Event listeners attached to warranty method radio buttons');
        console.log('[DEBUG Edit Modal] Initial radio states:', {
            durationChecked: editDurationMethodRadio.checked,
            exactDateChecked: editExactDateMethodRadio.checked
        });
        
        // Call handler to set initial state
        handleEditWarrantyMethodChange();
    }

    // Set notes
    const notesInput = document.getElementById('editNotes');
    if (notesInput) {
        notesInput.value = warranty.notes || '';
    }
    
    // Update currency symbols and positioning for the edit form
    const symbol = getCurrencySymbol();
    const position = getCurrencyPosition();
    updateFormCurrencyPosition(symbol, position);
    
    // Trigger currency positioning after modal is visible
    setTimeout(() => {
        if (position === 'right') {
            const editPriceInput = document.getElementById('editPurchasePrice');
            const editCurrencySymbol = document.getElementById('editCurrencySymbol');
            if (editPriceInput && editCurrencySymbol) {
                // Force update the currency position now that modal is visible
                const wrapper = editPriceInput.closest('.price-input-wrapper');
                if (wrapper && wrapper.classList.contains('currency-right')) {
                    const updateEvent = new Event('focus');
                    editPriceInput.dispatchEvent(updateEvent);
                    const blurEvent = new Event('blur');
                    editPriceInput.dispatchEvent(blurEvent);
                }
            }
        }
    }, 200);
    
    // Load secure images with authentication for the edit modal
    setTimeout(() => loadSecureImages(), 100); // Small delay to ensure DOM is updated
}

function openDeleteModal(warrantyId, productName) {
    currentWarrantyId = warrantyId;
    
    const deleteProductNameElement = document.getElementById('deleteProductName');
    if (deleteProductNameElement) {
        deleteProductNameElement.textContent = productName || '';
    }
    
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
        deleteModal.classList.add('active');
    }
}

// Open Archive confirmation modal
function openArchiveModal(warrantyId, productName) {
    currentWarrantyId = warrantyId;
    const archiveProductNameElement = document.getElementById('archiveProductName');
    if (archiveProductNameElement) {
        archiveProductNameElement.textContent = productName || '';
    }
    const archiveModal = document.getElementById('archiveModal');
    if (archiveModal) {
        archiveModal.classList.add('active');
    }
}

// Confirm archive handler
async function confirmArchive() {
    if (!currentWarrantyId) {
        showToast('No warranty selected', 'error');
        return;
    }
    try {
        await toggleArchiveStatus(currentWarrantyId, true);
        closeModals();
        // Guidance toast for where to find archived items
        const guidance = 'You can find archived warranties by selecting "Archived" in Filters.';
        showToast(guidance, 'info');
        currentWarrantyId = null;
    } catch (e) {
        // toggleArchiveStatus already toasts on failure
        console.error('Archive failed', e);
    }
}

// Function to close all modals
function closeModals() {
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Validate file size before upload
function validateFileSize(formData, maxSizeMB = 32) {
    let totalSize = 0;
    
    // Check file sizes
    if (formData.has('invoice') && formData.get('invoice').size > 0) {
        totalSize += formData.get('invoice').size;
    }
    
    if (formData.has('manual') && formData.get('manual').size > 0) {
        totalSize += formData.get('manual').size;
    }

    if (formData.has('other_document') && formData.get('other_document').size > 0) { 
        totalSize += formData.get('other_document').size; 
    }
    
    // Convert bytes to MB for comparison and display
    const totalSizeMB = totalSize / (1024 * 1024);
    console.log(`Total upload size: ${totalSizeMB.toFixed(2)} MB`);
    
    // Check if total size exceeds limit
    if (totalSizeMB > maxSizeMB) {
        return {
            valid: false,
            message: `Total file size (${totalSizeMB.toFixed(2)} MB) exceeds the maximum allowed size of ${maxSizeMB} MB. Please reduce file sizes.`
        };
    }
    
    return {
        valid: true
    };
}

// Submit form function - event handler for form submit
async function handleFormSubmit(event) { // Made async to properly await paperless uploads
    event.preventDefault();
    
    const isLifetime = isLifetimeCheckbox.checked;
    const isDurationMethod = durationMethodRadio && durationMethodRadio.checked;
    const years = parseInt(warrantyDurationYearsInput.value || 0);
    const months = parseInt(warrantyDurationMonthsInput.value || 0);
    const days = parseInt(warrantyDurationDaysInput.value || 0);
    const exactDate = exactExpirationDateInput ? exactExpirationDateInput.value : '';

    // --- Updated Lifetime and Method Check ---
    if (!isLifetime) {
        if (isDurationMethod) {
            // Validate duration fields
            if (years === 0 && months === 0 && days === 0) {
                showValidationErrors(1);
                switchToTab(1); // Switch to warranty details tab
                // Optionally focus the first duration input
                if (warrantyDurationYearsInput) warrantyDurationYearsInput.focus();
                // Add invalid class to the container or individual inputs if needed
                if (warrantyDurationFields) warrantyDurationFields.classList.add('invalid-duration'); // Example
                return;
            }
        } else {
            // Validate exact expiration date
            if (!exactDate) {
                showValidationErrors(1);
                switchToTab(1); // Switch to warranty details tab
                if (exactExpirationDateInput) exactExpirationDateInput.focus();
                return;
            }
            
            // Validate that expiration date is in the future relative to purchase date
            const purchaseDate = document.getElementById('purchaseDate').value;
            if (purchaseDate && exactDate <= purchaseDate) {
                showToast(window.t('messages.expiration_date_after_purchase_date'), 'error');
                switchToTab(1);
                if (exactExpirationDateInput) exactExpirationDateInput.focus();
                return;
            }
        }
    }
    
    // Remove invalid duration class if validation passes
    if (warrantyDurationFields) warrantyDurationFields.classList.remove('invalid-duration');
    
    // Validate all tabs
    for (let i = 0; i < tabContents.length; i++) {
        if (!validateTab(i)) {
            // Switch to the first invalid tab
            switchToTab(i);
            showValidationErrors(i);
            return;
        }
    }
    
    // Create form data object
    const formData = new FormData(warrantyForm);
    // Ensure model_number is included if present
    const modelNumberInput = document.getElementById('modelNumber');
    if (modelNumberInput && modelNumberInput.value.trim() !== '') {
        formData.set('model_number', modelNumberInput.value.trim());
    }
    
    // Handle warranty type - use custom value if "other" is selected
    const warrantyTypeSelect = document.getElementById('warrantyType');
    const warrantyTypeCustom = document.getElementById('warrantyTypeCustom');
    if (warrantyTypeSelect && warrantyTypeSelect.value === 'other' && warrantyTypeCustom && warrantyTypeCustom.value.trim()) {
        formData.set('warranty_type', warrantyTypeCustom.value.trim());
    }
    
    // Debug: Log all form data entries
    console.log('=== DEBUG: Form Data Contents ===');
    for (let [key, value] of formData.entries()) {
        console.log(`${key}: ${value}`);
    }
    console.log('=== END DEBUG ===');
    
    // Product URL handling
    let productUrlValue = formData.get('product_url');
    if (productUrlValue && typeof productUrlValue === 'string') {
        productUrlValue = productUrlValue.trim();
        if (productUrlValue && !productUrlValue.startsWith('http://') && !productUrlValue.startsWith('https://')) {
            formData.set('product_url', 'https://' + productUrlValue);
        } else if (productUrlValue) {
            // Ensure trimmed value is set back if it was already valid
            formData.set('product_url', productUrlValue);
        }
    }
    
    // Remove old warranty_years if it exists in formData (it shouldn't if HTML is correct)
    formData.delete('warranty_years'); 
    
    // Append new duration fields (already handled by FormData constructor if names match)
    // formData.append('warranty_duration_years', years);
    // formData.append('warranty_duration_months', months);
    // formData.append('warranty_duration_days', days);
    
    // Add serial numbers to form data (using correct name 'serial_numbers[]')
    const serialInputs = document.querySelectorAll('#serialNumbersContainer input[name="serial_numbers[]"]');
    // Clear existing serial_numbers[] from formData before appending new ones
    formData.delete('serial_numbers[]'); 
    serialInputs.forEach(input => {
        if (input.value.trim()) {
            formData.append('serial_numbers[]', input.value.trim()); // Use [] for arrays
        }
    });
    
    // Add tag IDs to form data as JSON string
    if (selectedTags && selectedTags.length > 0) {
        const tagIds = selectedTags.map(tag => tag.id);
        formData.append('tag_ids', JSON.stringify(tagIds));
    } else {
        formData.append('tag_ids', JSON.stringify([])); // Send empty array if no tags
    }
    
    // Add URL fields for documents (with null checks)
    const invoiceUrlField = document.getElementById('invoiceUrl');
    formData.append('invoice_url', invoiceUrlField ? invoiceUrlField.value || '' : '');
    
    const manualUrlField = document.getElementById('manualUrl');
    formData.append('manual_url', manualUrlField ? manualUrlField.value || '' : '');
    
    const otherDocumentUrlField = document.getElementById('otherDocumentUrl');
    formData.append('other_document_url', otherDocumentUrlField ? otherDocumentUrlField.value || '' : '');
    
    // --- Ensure is_lifetime is correctly added ---
    // FormData already includes it if the checkbox is checked. If not checked, it's omitted.
    // We need to explicitly add 'false' if it's not checked.
    if (!isLifetimeCheckbox.checked) {
        formData.append('is_lifetime', 'false');
        
        // Add warranty method and exact expiration date if using exact date method
        if (!isDurationMethod && exactDate) {
            formData.append('exact_expiration_date', exactDate);
            // Ensure duration fields are 0 when using exact date
            formData.set('warranty_duration_years', '0');
            formData.set('warranty_duration_months', '0');
            formData.set('warranty_duration_days', '0');
        }
    } else {
        // Ensure duration fields are 0 if lifetime is checked
        formData.set('warranty_duration_years', '0');
        formData.set('warranty_duration_months', '0');
        formData.set('warranty_duration_days', '0');
    }

    // Add other_document file (always, as no storage selection for this)
    const otherDocumentFile = document.getElementById('otherDocument').files[0];
    if (otherDocumentFile) {
        formData.append('other_document', otherDocumentFile);
    }

    // --- Only append invoice/manual files to FormData if storage is 'local' ---
    const invoiceFile = document.getElementById('invoice')?.files[0];
    const manualFile = document.getElementById('manual')?.files[0];
    let invoiceStorage = 'local';
    let manualStorage = 'local';
    const invoiceStorageRadio = document.querySelector('input[name="invoiceStorage"]:checked');
    const manualStorageRadio = document.querySelector('input[name="manualStorage"]:checked');
    if (invoiceStorageRadio) invoiceStorage = invoiceStorageRadio.value;
    if (manualStorageRadio) manualStorage = manualStorageRadio.value;
    formData.set('invoiceStorage', invoiceStorage);
    formData.set('manualStorage', manualStorage);
    console.log('[DEBUG] Invoice storage:', invoiceStorage, 'Manual storage:', manualStorage);
    console.log('[DEBUG] Invoice file:', invoiceFile);
    console.log('[DEBUG] Manual file:', manualFile);
    if (invoiceStorage === 'local' && invoiceFile) {
        console.log('[DEBUG] Appending invoice file to FormData (local storage)');
        formData.append('invoice', invoiceFile);
    }
    if (manualStorage === 'local' && manualFile) {
        console.log('[DEBUG] Appending manual file to FormData (local storage)');
        formData.append('manual', manualFile);
    }
    if (invoiceStorage === 'paperless') {
        console.log('[DEBUG] Invoice should be uploaded to Paperless-ngx');
    }
    if (manualStorage === 'paperless') {
        console.log('[DEBUG] Manual should be uploaded to Paperless-ngx');
    }

    // Add selected Paperless documents (for linking existing docs, not uploads)
    const selectedPaperlessProductPhoto = document.getElementById('selectedPaperlessProductPhoto');
    const selectedPaperlessInvoice = document.getElementById('selectedPaperlessInvoice');
    const selectedPaperlessManual = document.getElementById('selectedPaperlessManual');
    const selectedPaperlessOtherDocument = document.getElementById('selectedPaperlessOtherDocument');
    if (selectedPaperlessProductPhoto && selectedPaperlessProductPhoto.value) {
        formData.append('paperless_photo_id', selectedPaperlessProductPhoto.value);
    }
    if (selectedPaperlessInvoice && selectedPaperlessInvoice.value) {
        formData.append('paperless_invoice_id', selectedPaperlessInvoice.value);
    }
    if (selectedPaperlessManual && selectedPaperlessManual.value) {
        formData.append('paperless_manual_id', selectedPaperlessManual.value);
    }
    if (selectedPaperlessOtherDocument && selectedPaperlessOtherDocument.value) {
        formData.append('paperless_other_id', selectedPaperlessOtherDocument.value);
    }
    
    // Show loading spinner
    showLoadingSpinner();
    
    try {
        // Process Paperless-ngx uploads if enabled
        const paperlessUploads = await processPaperlessNgxUploads(formData);
        
        // Add Paperless-ngx document IDs to form data
        Object.keys(paperlessUploads).forEach(key => {
            formData.append(key, paperlessUploads[key]);
        });
        
        // Send the form data to the server
        const response = await fetch('/api/warranties', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add warranty');
        }

        const data = await response.json();
        hideLoadingSpinner();
        showToast(window.t('messages.warranty_added_successfully'), 'success');
        
        // Store the new warranty ID for auto-linking
        const newWarrantyId = data.id;

        // --- Store file info and storage type before upload for auto-link logic ---
        const invoiceFileInput = document.getElementById('invoice');
        const manualFileInput = document.getElementById('manual');
        const invoiceFilePre = invoiceFileInput?.files[0];
        const manualFilePre = manualFileInput?.files[0];
        const invoiceStoragePre = formData.get('invoiceStorage');
        const manualStoragePre = formData.get('manualStorage');

        // Auto-link any documents that were uploaded to Paperless-ngx (match edit modal behavior)
        const autoLinkTypes = [];
        const fileInfo = {};
        if (invoiceStoragePre === 'paperless' && invoiceFilePre) {
            autoLinkTypes.push('invoice');
            fileInfo.invoice = invoiceFilePre.name;
        }
        if (manualStoragePre === 'paperless' && manualFilePre) {
            autoLinkTypes.push('manual');
            fileInfo.manual = manualFilePre.name;
        }
        // Other document does not have a storage option, so skip unless you add support
        // If you want to support auto-linking for 'other', add logic here
        console.log('[Auto-Link DEBUG] newWarrantyId:', newWarrantyId, 'autoLinkTypes:', autoLinkTypes, 'fileInfo:', fileInfo, 'invoiceStorage:', invoiceStoragePre, 'manualStorage:', manualStoragePre);
        if (autoLinkTypes.length > 0 && newWarrantyId) {
            console.log('[Auto-Link] Starting automatic document linking after warranty creation (Paperless-ngx uploads only)', autoLinkTypes, fileInfo);
            setTimeout(() => {
                console.log('[Auto-Link DEBUG] Calling autoLinkRecentDocuments with:', newWarrantyId, autoLinkTypes, fileInfo);
                autoLinkRecentDocuments(newWarrantyId, autoLinkTypes, 10, 10000, fileInfo);
            }, 3000); // Wait 3 seconds for Paperless-ngx to process the documents
        }

        // Close and reset the modal on success
        if (addWarrantyModal) {
            addWarrantyModal.classList.remove('active');
        }
        resetAddWarrantyWizard(); // Reset the wizard form

        try {
            await loadWarranties(true);
            console.log('Warranties reloaded after adding new warranty');
            applyFilters();
            
            // Load secure images for the new cards
            setTimeout(() => {
                console.log('Loading secure images for new warranty cards');
                loadSecureImages();
            }, 200);
        } catch (error) {
            console.error('Error reloading warranties after adding:', error);
        }
    } catch (error) {
        hideLoadingSpinner();
        console.error('Error adding warranty:', error);
        showToast(error.message || window.t('messages.failed_to_add_warranty'), 'error');
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the warranty form *only* if the form element exists
    if (warrantyForm) {
        initWarrantyForm();
    }
    
    // Load warranties (might need checks if warrantiesList doesn't always exist)
    if (warrantiesList) { 
        // REMOVED: loadWarranties(); // Now called after authStateReady
        // REMOVED: loadViewPreference(); // Now called after authStateReady
        loadTags(); // Load tags for the form
        initTagFunctionality(); // Initialize tag search/selection
    }
    
    // Initialize theme (should be safe on all pages)
    initializeTheme();
    
    // Set up event listeners for other UI controls (should contain checks)
    setupUIEventListeners();
    setupModalTriggers(); // Add the new modal listeners
    
    // Check if user is logged in and update UI
    // checkLoginStatus(); // Removed undefined function
    
    // Setup form submission
    const form = document.getElementById('addWarrantyForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit); // Use renamed handler
    }
    
    // Setup settings menu toggle
    // setupSettingsMenu(); // Removed: function not defined, handled by auth.js
    
    // Initialize theme toggle state *after* DOM is loaded
    // Find the header toggle (assuming ID 'darkModeToggle')
    const headerToggle = document.getElementById('darkModeToggle'); 
    if (headerToggle) {
        // Set initial state based on theme applied by theme-loader.js
        const currentTheme = document.documentElement.getAttribute('data-theme');
        headerToggle.checked = currentTheme === 'dark';
        
        // Add listener to update theme when toggled
        headerToggle.addEventListener('change', function() {
            setTheme(this.checked);
        });
    }
    
    // REMOVE any direct calls to initializeTheme() from here or globally
    // initializeTheme(); 

    // Setup view switcher
    // setupViewSwitcher(); // Removed undefined function
    
    // Setup filter controls
    // setupFilterControls(); // Removed: function not defined
    
    // Setup form tabs and navigation
    // initFormTabs(); // <-- Remove this line from DOMContentLoaded
    
    // Initialize modal interactions
    // initializeModals(); // Removed: function not defined, handled by setupModalTriggers
    
    // Load preferences (if needed for things other than theme)
    // loadPreferences(); // Consider if needed

    // REMOVED: updateCurrencySymbols(); // Now called after authStateReady
    
    // Initialize claims functionality
    initClaimsEventListeners();
});

// ====== WARRANTY CLAIMS FUNCTIONALITY ======

// Global variables for claims
let currentClaimsWarrantyId = null;
let currentClaims = [];
let currentClaimsCanEdit = false; // Track if current user can edit the warranty being viewed

/**
 * Initialize claims event listeners
 */
function initClaimsEventListeners() {
    // Event delegation for claims links
    if (warrantiesList) {
        warrantiesList.addEventListener('click', (e) => {
            if (e.target.closest('.claims-link')) {
                e.preventDefault();
                const warrantyId = parseInt(e.target.closest('.claims-link').dataset.id);
                openClaimsModal(warrantyId);
                return;
            }
            // Archive button
            if (e.target.closest('.archive-btn')) {
                e.preventDefault();
                const el = e.target.closest('.archive-btn');
                const warrantyId = parseInt(el.dataset.id);
                const card = el.closest('.warranty-card');
                const titleEl = card ? card.querySelector('.product-name-header .warranty-title') : null;
                const productName = titleEl ? titleEl.textContent.trim() : '';
                openArchiveModal(warrantyId, productName);
                return;
            }
            // Unarchive button
            if (e.target.closest('.unarchive-btn')) {
                e.preventDefault();
                const warrantyId = parseInt(e.target.closest('.unarchive-btn').dataset.id);
                toggleArchiveStatus(warrantyId, false);
                return;
            }
        });
    }
    
    // Add claim button
    if (addClaimBtn) {
        addClaimBtn.addEventListener('click', () => {
            openClaimFormModal();
        });
    }
    
    // Claim form submission
    if (claimForm) {
        claimForm.addEventListener('submit', handleClaimFormSubmit);
    }
    
    // Modal close handling - Removed backdrop click listeners to match warranty modal behavior
    // Claims modals now only close via explicit close buttons with [data-dismiss="modal"]
    // The general modal click prevention (e.stopPropagation) handles preventing backdrop clicks
    
    // Add event listeners for claims modal close buttons
    if (claimsModal) {
        claimsModal.querySelectorAll('[data-dismiss="modal"]').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                closeClaimsModal();
            });
        });
    }
    
    if (claimFormModal) {
        claimFormModal.querySelectorAll('[data-dismiss="modal"]').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                closeClaimFormModal();
            });
        });
    }
}

/**
 * Open the claims modal for a specific warranty
 */
async function openClaimsModal(warrantyId) {
    try {
        currentClaimsWarrantyId = warrantyId;
        
        // Find warranty info
        const warranty = warranties.find(w => w.id === warrantyId);
        if (!warranty) {
            showToast(window.i18next ? window.i18next.t('claims.warranty_not_found') : 'Warranty not found', 'error');
            return;
        }
        
        // Determine if current user can edit this warranty
        const currentUserId = (() => {
            try {
                const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                return userInfo.id;
            } catch (e) {
                return null;
            }
        })();
        const isAdmin = getUserType() === 'admin';
        currentClaimsCanEdit = !isGlobalView || (warranty.user_id === currentUserId) || isAdmin;
        
        // Show/hide the Add New Claim button based on edit permissions
        if (addClaimBtn) {
            addClaimBtn.style.display = currentClaimsCanEdit ? 'inline-block' : 'none';
        }
        
        // Update warranty info in modal
        if (warrantyClaimInfo) {
            warrantyClaimInfo.innerHTML = `
                <div class="warranty-info-card">
                    <h4>${warranty.product_name || 'Unnamed Product'}</h4>
                    <div class="warranty-details">
                        <span><i class="fas fa-building"></i> ${warranty.vendor || 'Unknown Vendor'}</span>
                        <span><i class="fas fa-calendar"></i> Expires: ${formatDate(warranty.expiration_date ? new Date(warranty.expiration_date) : null)}</span>
                        <span class="warranty-status status-${warranty.status || 'unknown'}">
                            ${warranty.statusText || 'Unknown Status'}
                        </span>
                    </div>
                </div>
            `;
        }
        
        // Show modal
        claimsModal.classList.add('active');
        
        // Load claims
        await loadClaims(warrantyId);
        
    } catch (error) {
        console.error('Error opening claims modal:', error);
        showToast('Failed to open claims modal', 'error');
    }
}

/**
 * Load claims for a warranty
 */
async function loadClaims(warrantyId) {
    try {
        // Show loading
        if (claimsListBody) {
            claimsListBody.innerHTML = `
                <div class="loading-message" style="text-align: center; padding: 20px;">
                    <i class="fas fa-spinner fa-spin"></i> Loading claims...
                </div>
            `;
        }
        
        // Fetch claims
        const response = await fetch(`/api/warranties/${warrantyId}/claims`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + (window.auth ? window.auth.getToken() : localStorage.getItem('auth_token')),
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load claims');
        }
        
        currentClaims = await response.json();
        renderClaims();
        
    } catch (error) {
        console.error('Error loading claims:', error);
        if (claimsListBody) {
            claimsListBody.innerHTML = `
                <div class="error-message" style="text-align: center; padding: 20px; color: var(--danger-color);">
                    <i class="fas fa-exclamation-triangle"></i> Failed to load claims
                </div>
            `;
        }
    }
}

/**
 * Render claims list
 */
function renderClaims() {
    if (!claimsListBody) return;
    
    if (currentClaims.length === 0) {
        const noClaimsMessage = currentClaimsCanEdit 
            ? (window.i18next ? window.i18next.t('claims.no_claims_message') : 'Click "Add New Claim" to get started')
            : 'No claims have been filed for this warranty';
            
        claimsListBody.innerHTML = `
            <div class="no-claims-message" style="text-align: center; padding: 40px;">
                <i class="fas fa-clipboard-list" style="font-size: 3rem; color: var(--medium-gray); margin-bottom: 1rem;"></i>
                <h4 style="color: var(--text-color); margin-bottom: 0.5rem;">${window.i18next ? window.i18next.t('claims.no_claims_yet') : 'No Claims Yet'}</h4>
                <p style="color: var(--dark-gray); margin-bottom: 0;">${noClaimsMessage}</p>
            </div>
        `;
        return;
    }
    
    let claimsHtml = '';
    currentClaims.forEach(claim => {
        claimsHtml += `
            <div class="claim-item" data-claim-id="${claim.id}">
                <div class="claim-header">
                    <div class="claim-info">
                        <div class="claim-title">
                            ${claim.claim_number ? `<strong>${claim.claim_number}</strong>` : `<strong>Claim #${claim.id}</strong>`}
                            <span class="claim-status-badge claim-status-${claim.status.toLowerCase().replace(' ', '-')}">
                                ${claim.status}
                            </span>
                        </div>
                        <div class="claim-date">
                            <i class="fas fa-calendar"></i> ${formatDate(claim.claim_date ? new Date(claim.claim_date) : null)}
                            ${claim.resolution_date && claim.resolution_date.trim() ? `<span style="margin-left: 10px;"><i class="fas fa-check-circle"></i> Resolved: ${formatDate(new Date(claim.resolution_date))}</span>` : ''}
                        </div>
                    </div>
                    <div class="claim-actions">
                        ${currentClaimsCanEdit ? `
                            <button class="btn btn-sm btn-secondary edit-claim-btn" data-claim-id="${claim.id}">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-danger delete-claim-btn" data-claim-id="${claim.id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        ` : `
                            <span class="claim-readonly-indicator" style="color: var(--medium-gray); font-size: 0.9em;">
                                <i class="fas fa-eye"></i> View Only
                            </span>
                        `}
                    </div>
                </div>
                ${claim.description ? `<div class="claim-description">${escapeHtml(claim.description)}</div>` : ''}
                ${claim.resolution ? `<div class="claim-resolution"><strong>Resolution:</strong> ${escapeHtml(claim.resolution)}</div>` : ''}
            </div>
        `;
    });
    
    claimsListBody.innerHTML = claimsHtml;
    
    // Add event listeners for edit and delete buttons (only if user can edit)
    if (currentClaimsCanEdit) {
        claimsListBody.addEventListener('click', (e) => {
            if (e.target.closest('.edit-claim-btn')) {
                const claimId = parseInt(e.target.closest('.edit-claim-btn').dataset.claimId);
                const claim = currentClaims.find(c => c.id === claimId);
                if (claim) {
                    openClaimFormModal(claim);
                }
            }
            
            if (e.target.closest('.delete-claim-btn')) {
                const claimId = parseInt(e.target.closest('.delete-claim-btn').dataset.claimId);
                if (confirm(window.i18next ? window.i18next.t('claims.confirm_delete_claim') : 'Are you sure you want to delete this claim?')) {
                    deleteClaim(claimId);
                }
            }
        });
    }
}

/**
 * Open claim form modal for adding or editing
 */
function openClaimFormModal(claim = null) {
    if (!claimFormModal) return;
    
    // Update title
    if (claimFormTitle) {
        claimFormTitle.textContent = claim ? (window.i18next ? window.i18next.t('claims.edit_claim') : 'Edit Claim') : (window.i18next ? window.i18next.t('claims.add_new_claim') : 'Add New Claim');
    }
    
    // Reset form
    if (claimForm) {
        claimForm.reset();
    }
    
    if (claim) {
        // Populate form with claim data
        if (editClaimId) editClaimId.value = claim.id;
        if (document.getElementById('claimDate')) document.getElementById('claimDate').value = claim.claim_date || '';
        if (document.getElementById('claimStatus')) document.getElementById('claimStatus').value = claim.status;
        if (document.getElementById('claimNumber')) document.getElementById('claimNumber').value = claim.claim_number || '';
        if (document.getElementById('claimDescription')) document.getElementById('claimDescription').value = claim.description || '';
        if (document.getElementById('claimResolution')) document.getElementById('claimResolution').value = claim.resolution || '';
        if (document.getElementById('resolutionDate')) document.getElementById('resolutionDate').value = claim.resolution_date || '';
    } else {
        // Set default values for new claim
        if (editClaimId) editClaimId.value = '';
        if (document.getElementById('claimDate')) document.getElementById('claimDate').value = new Date().toISOString().split('T')[0];
        if (document.getElementById('claimStatus')) document.getElementById('claimStatus').value = 'Submitted';
    }
    
    // Show modal
    claimFormModal.classList.add('active');
}

/**
 * Handle claim form submission
 */
async function handleClaimFormSubmit(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(claimForm);
        const claimId = editClaimId.value;
        
        const claimData = {
            claim_date: formData.get('claim_date'),
            status: formData.get('status'),
            claim_number: formData.get('claim_number'),
            description: formData.get('description'),
            resolution: formData.get('resolution'),
            resolution_date: formData.get('resolution_date')
        };
        
        // Remove empty strings
        Object.keys(claimData).forEach(key => {
            if (claimData[key] === '') {
                claimData[key] = null;
            }
        });
        
        const isEdit = claimId && claimId !== '';
        const url = isEdit 
            ? `/api/warranties/${currentClaimsWarrantyId}/claims/${claimId}`
            : `/api/warranties/${currentClaimsWarrantyId}/claims`;
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': 'Bearer ' + (window.auth ? window.auth.getToken() : localStorage.getItem('auth_token')),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(claimData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save claim');
        }
        
        showToast(isEdit ? (window.i18next ? window.i18next.t('claims.claim_updated_successfully') : 'Claim updated successfully') : (window.i18next ? window.i18next.t('claims.claim_created_successfully') : 'Claim created successfully'), 'success');
        closeClaimFormModal();
        
        // Reload claims
        await loadClaims(currentClaimsWarrantyId);
        
    } catch (error) {
        console.error('Error saving claim:', error);
        showToast(error.message || 'Failed to save claim', 'error');
    }
}

/**
 * Delete a claim
 */
async function deleteClaim(claimId) {
    try {
        const response = await fetch(`/api/warranties/${currentClaimsWarrantyId}/claims/${claimId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + (window.auth ? window.auth.getToken() : localStorage.getItem('auth_token')),
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete claim');
        }
        
        showToast(window.i18next ? window.i18next.t('claims.claim_deleted_successfully') : 'Claim deleted successfully', 'success');
        
        // Reload claims
        await loadClaims(currentClaimsWarrantyId);
        
    } catch (error) {
        console.error('Error deleting claim:', error);
        showToast(error.message || 'Failed to delete claim', 'error');
    }
}

/**
 * Close claims modal
 */
function closeClaimsModal() {
    if (claimsModal) {
        claimsModal.classList.remove('active');
    }
    currentClaimsWarrantyId = null;
    currentClaims = [];
    currentClaimsCanEdit = false;
}

/**
 * Close claim form modal
 */
function closeClaimFormModal() {
    if (claimFormModal) {
        claimFormModal.classList.remove('active');
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add this function to handle edit tab functionality
function initEditTabs() {
    const editTabBtns = document.querySelectorAll('.edit-tab-btn');
    
    editTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all tabs
            editTabBtns.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked tab
            btn.classList.add('active');
            
            // Hide all tab content
            document.querySelectorAll('.edit-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Show the selected tab content
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Update validateEditTabs function
function validateEditTab(tabId) {
    const tab = document.getElementById(tabId);
    if (!tab) {
        console.warn('validateEditTab: Could not find tab with ID:', tabId);
        return false; // Or true, depending on desired behavior for missing tabs
    }
    let isTabValid = true;

    // Get all relevant form controls within the tab
    const controls = tab.querySelectorAll('input, textarea, select');

    controls.forEach(control => {
        // Check the native HTML5 validity state
        if (!control.validity.valid) {
            isTabValid = false;
            control.classList.add('invalid');
            // Optionally, you could add logic here to display specific messages
            // or rely on browser default behavior if the form is submitted.
        } else {
            control.classList.remove('invalid');
        }
    });

    // Update the tab button to show completion status
    const tabBtn = document.querySelector(`.edit-tab-btn[data-tab="${tabId}"]`);
    if (tabBtn) {
        if (isTabValid) {
            tabBtn.classList.add('completed');
        } else {
            tabBtn.classList.remove('completed');
        }
    }
    return isTabValid;
}

// Add this function for secure file access
function openSecureFile(filePath) {
    console.log(`[openSecureFile] Opening file: ${filePath}`);
    
    // Get the file name from the path, handling both uploads/ prefix and direct filenames
    let fileName = filePath;
    if (filePath.startsWith('uploads/')) {
        fileName = filePath.substring(8); // Remove 'uploads/' prefix
    } else if (filePath.startsWith('/uploads/')) {
        fileName = filePath.substring(9); // Remove '/uploads/' prefix
    }
    
    console.log(`[openSecureFile] Processed filename: ${fileName}`);
    
    const token = auth.getToken();
    
    if (!token) {
        showToast(window.t('messages.login_to_access_files'), 'error');
        return false;
    }
    
    // Enhanced fetch with retry logic and better error handling
    const fetchWithRetry = async (url, options, retries = 2) => {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`[openSecureFile] Attempt ${i + 1} to fetch: ${url}`);
                const response = await fetch(url, options);
                
                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('Authentication error. Please log in again.');
                    } else if (response.status === 403) {
                        throw new Error('You are not authorized to access this file.');
                    } else if (response.status === 404) {
                        throw new Error('File not found. It may have been deleted.');
                    } else {
                        throw new Error(`Server error: ${response.status} ${response.statusText}`);
                    }
                }

                // Check if response has content-length header
                const contentLength = response.headers.get('content-length');
                console.log(`[openSecureFile] Response Content-Length: ${contentLength}`);
                
                // Convert to blob with error handling
                const blob = await response.blob();
                console.log(`[openSecureFile] Blob size: ${blob.size} bytes`);
                
                // Verify blob size matches content-length if available
                if (contentLength && parseInt(contentLength) !== blob.size) {
                    console.warn(`[openSecureFile] Content-Length mismatch: header=${contentLength}, blob=${blob.size}`);
                    if (i < retries) {
                        console.log(`[openSecureFile] Retrying due to content-length mismatch...`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                        continue;
                    } else {
                        console.error(`[openSecureFile] Final attempt failed with content-length mismatch`);
                    }
                }
                
                return blob;
                
            } catch (error) {
                console.error(`[openSecureFile] Attempt ${i + 1} failed:`, error);
                
                // If this is a content-length mismatch or network error, retry
                if (i < retries && (
                    error.message.includes('content-length') ||
                    error.message.includes('Failed to fetch') ||
                    error.name === 'TypeError'
                )) {
                    console.log(`[openSecureFile] Retrying after error: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
                    continue;
                }
                
                throw error;
            }
        }
    };

    fetchWithRetry(`/api/secure-file/${fileName}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
        }
    })
    .then(blob => {
        console.log(`[openSecureFile] Successfully received blob of size: ${blob.size}`);
        
        // Create a URL for the blob
        const blobUrl = window.URL.createObjectURL(blob);
        
        // Open in new tab
        const newWindow = window.open(blobUrl, '_blank');
        
        // Clean up the blob URL after a delay to prevent memory leaks
        setTimeout(() => {
            window.URL.revokeObjectURL(blobUrl);
        }, 10000); // Clean up after 10 seconds
        
        // Check if window was blocked by popup blocker
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            showToast(window.t('messages.popup_blocked'), 'warning');
            window.URL.revokeObjectURL(blobUrl); // Clean up immediately if blocked
        }
    })
    .catch(error => {
        console.error('Error fetching file:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Error opening file';
        if (error.message.includes('Authentication')) {
            errorMessage = 'Authentication error. Please refresh and try again.';
        } else if (error.message.includes('authorized')) {
            errorMessage = 'You are not authorized to access this file.';
        } else if (error.message.includes('not found')) {
            errorMessage = 'File not found. It may have been deleted.';
        } else if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMessage = 'Network error. Please check your connection and try again.';
        } else {
            errorMessage = `Error opening file: ${error.message}`;
        }
        
        showToast(errorMessage, 'error');
    });
    
    return false;
}

/**
 * Open a Paperless-ngx document by ID
 */

/**
 * Generate document link HTML for both local and Paperless-ngx documents
 */
function generateDocumentLink(warranty, docType) {
    const docConfig = {
        invoice: {
            localPath: warranty.invoice_path,
            paperlessId: warranty.paperless_invoice_id,
            url: warranty.invoice_url,
            icon: 'fas fa-file-invoice',
            label: 'Invoice',
            className: 'invoice-link'
        },
        manual: {
            localPath: warranty.manual_path,
            paperlessId: warranty.paperless_manual_id,
            url: warranty.manual_url,
            icon: 'fas fa-book',
            label: 'Manual',
            className: 'manual-link'
        },
        other: {
            localPath: warranty.other_document_path,
            paperlessId: warranty.paperless_other_id,
            url: warranty.other_document_url,
            icon: 'fas fa-file-alt',
            label: 'Files',
            className: 'other-document-link'
        },
        photo: {
            localPath: warranty.product_photo_path,
            paperlessId: warranty.paperless_photo_id,
            url: null, // Photos don't have URLs
            icon: 'fas fa-image',
            label: 'Photo',
            className: 'photo-link'
        }
    };
    
    const config = docConfig[docType];
    if (!config) return '';
    
    // Check Global View permissions for "other" documents
    if (docType === 'other' && isGlobalView) {
        // Get current user ID to check warranty ownership
        const currentUserId = (() => {
            try {
                const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                return userInfo.id;
            } catch (e) {
                return null;
            }
        })();
        
        const isAdmin = getUserType() === 'admin';
        const canViewOtherDocs = !isGlobalView || (warranty.user_id === currentUserId) || isAdmin;
        
        // Hide "other" documents in Global View unless user owns the warranty or is admin
        if (!canViewOtherDocs) {
            return '';
        }
    }
    
    const hasLocal = config.localPath && config.localPath !== 'null';
    const hasPaperless = config.paperlessId && config.paperlessId !== null;
    const hasUrl = config.url && config.url.trim() !== '';
    
    
    let linksHtml = '';
    
    if (hasLocal) {
        linksHtml += `<a href="#" onclick="openSecureFile('${config.localPath}'); return false;" class="${config.className}">
            <i class="${config.icon}"></i> ${config.label}
        </a>`;
    } else if (hasPaperless) {
        const warrantyContextJson = JSON.stringify({user_id: warranty.user_id, id: warranty.id}).replace(/"/g, '&quot;');
        linksHtml += `<a href="#" onclick="openPaperlessDocument(${config.paperlessId}, JSON.parse('${warrantyContextJson}')); return false;" class="${config.className}">
            <i class="${config.icon}"></i> ${config.label} <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i>
        </a>`;
    }
    
    // Add URL link if available
    if (hasUrl) {
        if (linksHtml) linksHtml += ' ';
        linksHtml += `<a href="${config.url}" target="_blank" class="document-url-link ${config.className}" title="Open ${config.label} URL">
            <i class="fas fa-link"></i> ${config.label} Link
        </a>`;
    }
    
    return linksHtml;
}

// Initialize the warranty form and all its components
function initWarrantyForm() {
    // Initialize form tabs
    if (formTabs && tabContents) {
        initFormTabs();
    }
    
    // Initialize serial number inputs
    addSerialNumberInput();
    
    // Initialize file input display
    if (document.getElementById('productPhoto')) {
        document.getElementById('productPhoto').addEventListener('change', function(event) {
            updateFileName(event, 'productPhoto', 'productPhotoFileName');
        });
    }
    
    if (document.getElementById('invoice')) {
        document.getElementById('invoice').addEventListener('change', function(event) {
            updateFileName(event, 'invoice', 'fileName');
        });
    }
    
    if (document.getElementById('manual')) {
        document.getElementById('manual').addEventListener('change', function(event) {
            updateFileName(event, 'manual', 'manualFileName');
        });
    }

    if (document.getElementById('otherDocument')) { 
        document.getElementById('otherDocument').addEventListener('change', function(event) { 
            updateFileName(event, 'otherDocument', 'otherDocumentFileName'); 
        }); 
    } 
    
    // Initialize tag functionality
    initTagFunctionality();
    
    // Form submission
    if (warrantyForm) {
        warrantyForm.addEventListener('submit', handleFormSubmit); // Use renamed handler
    }

    // Initialize lifetime checkbox listener
    if (isLifetimeCheckbox && warrantyDurationFields) { // Check for new container
        isLifetimeCheckbox.addEventListener('change', handleLifetimeChange);
        handleLifetimeChange(); // Initial check
    } else {
        console.error("Lifetime warranty elements or duration fields not found in add form");
    }
}

// Initialize tag functionality
function initTagFunctionality() {
    // This function now ONLY sets up listeners for the main "Add Warranty" form's tag interface.
    // Assumes globalTagManagementModal listeners (new tag form, close buttons) are set up separately if the modal exists.

    // Get main form tag elements
    const mainFormTagSearch = document.getElementById('tagSearch');
    const mainFormTagsList = document.getElementById('tagsList'); // Dropdown for search in main form
    const mainFormManageTagsBtn = document.getElementById('manageTagsBtn'); // "Manage Tags" button in main form
    const mainFormSelectedTagsContainer = document.getElementById('selectedTags'); // Container for selected tags in main form

    // Skip if main form specific tag elements don't exist
    if (!mainFormTagSearch || !mainFormTagsList || !mainFormManageTagsBtn || !mainFormSelectedTagsContainer) {
        console.log('Main form tag UI elements (tagSearch, tagsList, manageTagsBtn, or selectedTagsContainer) not found, skipping main form tag UI initialization.');
        return;
    }

    console.log('Initializing main form tag UI functionality (search, selection, manage button).');

    // Load allTags if not already loaded (needed for search suggestions in the main form)
    if (allTags.length === 0) {
        loadTags(); // loadTags is async
    }

    mainFormTagSearch.addEventListener('focus', () => {
        renderTagsList(); // Renders suggestions into mainFormTagsList based on allTags
        mainFormTagsList.classList.add('show');
    });

    mainFormTagSearch.addEventListener('input', () => {
        renderTagsList(mainFormTagSearch.value); // Filters suggestions
    });

    // Hide main form's tag suggestion dropdown when clicking outside
    document.addEventListener('click', (e) => {
        // Check if mainFormTagSearch and mainFormTagsList are still valid (e.g. not removed from DOM)
        if (mainFormTagSearch && mainFormTagsList && 
            !mainFormTagSearch.contains(e.target) && 
            !mainFormTagsList.contains(e.target)) {
            mainFormTagsList.classList.remove('show');
        }
    });

    // "Manage Tags" button in the main form opens the global tagManagementModal
    mainFormManageTagsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openTagManagementModal(); // This function shows the global modal
    });

    // Initial rendering of selected tags for the main form (if any are pre-selected or loaded)
    renderSelectedTags(); // Renders into mainFormSelectedTagsContainer
}

// Function to load all tags
async function loadTags(force = false) {
    console.log('[script.js] loadTags() called. Current page:', window.location.pathname);
    
    // Check if tags are already loaded and reasonably populated
    if (!force && allTags && allTags.length > 0) {
        console.log('[script.js] Tags already loaded in allTags global. Skipping fetch. Count:', allTags.length);
        // Optionally, re-dispatch the event if other components might need it on subsequent (though now less likely) calls
        // document.dispatchEvent(new CustomEvent('allTagsLoaded', { detail: allTags }));
        return;
    }

    try {
        const token = auth.getToken();
        if (!token) {
            console.warn('[script.js] No token available for loadTags. User might not be authenticated yet.');
            allTags = []; // Ensure allTags is empty if we can't load
            return;
        }
        const response = await fetch('/api/tags', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[script.js] Failed to load tags:', response.status, errorText);
            allTags = []; // Default to empty on error
            return;
        }
        const fetchedTags = await response.json();
        // Assuming fetchedTags is an array of {id, name, color, ...} as expected by other functions
        allTags = fetchedTags;
        console.log('[script.js] All tags loaded into global allTags variable:', allTags.length, 'tags. Sample:', allTags.slice(0,2));
        // Dispatch event for any components that might be waiting for tags (e.g., Tagify instances)
        document.dispatchEvent(new CustomEvent('allTagsLoaded', { detail: allTags }));

    } catch (error) {
        console.error('[script.js] Error in loadTags():', error);
        allTags = []; // Default to empty on critical error
    }
}

// Render the tags dropdown list
function renderTagsList(searchTerm = '') {
    if (!tagsList) return;
    
    tagsList.innerHTML = '';
    
    // Filter tags based on search term
    const filteredTags = allTags.filter(tag => 
        !searchTerm || tag.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Add option to create new tag if search term is provided and not in list
    if (searchTerm && !filteredTags.some(tag => tag.name.toLowerCase() === searchTerm.toLowerCase())) {
        const createOption = document.createElement('div');
        createOption.className = 'tag-option create-tag';
        createOption.innerHTML = `<i class="fas fa-plus"></i> Create "${searchTerm}"`;
        createOption.addEventListener('click', () => {
            createTag(searchTerm).then(newTag => {
                // Add the new tag to selectedTags
                selectedTags.push(newTag);
                renderSelectedTags();
                renderTagsList(''); // Clear search and refresh list
            });
            tagsList.classList.remove('show');
        });
        tagsList.appendChild(createOption);
    }
    
    // Add existing tags to dropdown
    filteredTags.forEach(tag => {
        const option = document.createElement('div');
        option.className = 'tag-option';
        
        // Check if tag is already selected
        const isSelected = selectedTags.some(selected => selected.id === tag.id);
        
        option.innerHTML = `
            <span class="tag-color" style="background-color: ${tag.color}"></span>
            ${tag.name}
            <span class="tag-status">${isSelected ? '<i class="fas fa-check"></i>' : ''}</span>
        `;
        
        option.addEventListener('click', () => {
            if (isSelected) {
                // Remove tag if already selected
                selectedTags = selectedTags.filter(selected => selected.id !== tag.id);
            } else {
                // Add tag if not selected
                selectedTags.push({
                    id: tag.id,
                    name: tag.name,
                    color: tag.color
                });
            }
            
            renderSelectedTags();
            renderTagsList(searchTerm);
        });
        
        tagsList.appendChild(option);
    });
    
    // Show the dropdown
    tagsList.classList.add('show');
}

// Update renderEditTagsList to add new tag to editSelectedTags after creation
function renderEditTagsList(searchTerm = '') {
    const editTagsList = document.getElementById('editTagsList');
    if (!editTagsList) return;
    editTagsList.innerHTML = '';
    // Filter tags based on search term
    const filteredTags = allTags.filter(tag => 
        !searchTerm || tag.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    // Add option to create new tag if search term is provided and not in list
    if (searchTerm && !filteredTags.some(tag => tag.name.toLowerCase() === searchTerm.toLowerCase())) {
        const createOption = document.createElement('div');
        createOption.className = 'tag-option create-tag';
        createOption.innerHTML = `<i class="fas fa-plus"></i> Create "${searchTerm}"`;
        createOption.addEventListener('click', () => {
            createTag(searchTerm).then(newTag => {
                // Add the new tag to editSelectedTags
                editSelectedTags.push(newTag);
                renderEditSelectedTags();
                renderEditTagsList(''); // Clear search and refresh list
            });
            editTagsList.classList.remove('show');
        });
        editTagsList.appendChild(createOption);
    }
    // Add existing tags to dropdown
    filteredTags.forEach(tag => {
        const option = document.createElement('div');
        option.className = 'tag-option';
        
        // Check if tag is already selected
        const isSelected = editSelectedTags.some(selected => selected.id === tag.id);
        
        option.innerHTML = `
            <span class="tag-color" style="background-color: ${tag.color}"></span>
            ${tag.name}
            <span class="tag-status">${isSelected ? '<i class="fas fa-check"></i>' : ''}</span>
        `;
        
        option.addEventListener('click', () => {
            if (isSelected) {
                // Remove tag if already selected
                editSelectedTags = editSelectedTags.filter(selected => selected.id !== tag.id);
            } else {
                // Add tag if not selected
                editSelectedTags.push({
                    id: tag.id,
                    name: tag.name,
                    color: tag.color
                });
            }
            
            // Use our helper function to render selected tags
            renderEditSelectedTags();
            
            renderEditTagsList(searchTerm);
        });
        
        editTagsList.appendChild(option);
    });
    
    // Show the dropdown
    editTagsList.classList.add('show');
}

// Render the selected tags
function renderSelectedTags() {
    if (!selectedTagsContainer) return;
    
    selectedTagsContainer.innerHTML = '';
    
    if (selectedTags.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'no-tags-selected';
        placeholder.textContent = 'No tags selected';
        selectedTagsContainer.appendChild(placeholder);
        return;
    }
    
    selectedTags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.style.backgroundColor = tag.color;
        tagElement.style.color = getContrastColor(tag.color);
        
        tagElement.innerHTML = `
            ${tag.name}
            <span class="remove-tag" data-id="${tag.id}">&times;</span>
        `;
        
        // Add event listener for removing tag
        tagElement.querySelector('.remove-tag').addEventListener('click', (e) => {
            e.stopPropagation();
            selectedTags = selectedTags.filter(t => t.id !== tag.id);
            renderSelectedTags();
            
            // Update summary if needed
            if (document.getElementById('summary-tags')) {
                updateSummary();
            }
        });
        
        selectedTagsContainer.appendChild(tagElement);
    });
}

// Helper function to render the edit selected tags
function renderEditSelectedTags() {
    const editSelectedTagsContainer = document.getElementById('editSelectedTags');
    if (!editSelectedTagsContainer) return;
    
    editSelectedTagsContainer.innerHTML = '';
    
    if (editSelectedTags.length > 0) {
        editSelectedTags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'tag';
            tagElement.style.backgroundColor = tag.color;
            tagElement.style.color = getContrastColor(tag.color);
            
            tagElement.innerHTML = `
                ${tag.name}
                <span class="remove-tag" data-id="${tag.id}">&times;</span>
            `;
            
            // Add event listener for removing tag
            const removeButton = tagElement.querySelector('.remove-tag');
            removeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault(); // Add this to prevent default action
                
                // Prevent the event from bubbling up to parent elements
                if (e.cancelBubble !== undefined) {
                    e.cancelBubble = true;
                }
                
                editSelectedTags = editSelectedTags.filter(t => t.id !== tag.id);
                
                // Re-render just the tags
                renderEditSelectedTags();
                return false; // Add return false for older browsers
            });
            
            editSelectedTagsContainer.appendChild(tagElement);
        });
    } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'no-tags-selected';
        placeholder.textContent = 'No tags selected';
        editSelectedTagsContainer.appendChild(placeholder);
    }
}

// Update createTag to return a Promise
function createTag(name) {
    return new Promise((resolve, reject) => {
        // Enhanced auth manager availability check
        if (!window.auth) {
            console.error('[createTag] Auth manager not available');
            reject(new Error('Authentication system not ready. Please try again.'));
            return;
        }
        
        // Use auth manager's getToken method instead of directly accessing localStorage
        const token = window.auth.getToken();
        console.log('[createTag] Debug info:', {
            hasToken: !!token,
            tokenLength: token ? token.length : 0,
            hasUserInfo: !!localStorage.getItem('user_info'),
            authManagerAvailable: !!window.auth,
            isAuthenticated: window.auth.isAuthenticated(),
            tokenSource: 'auth.getToken()'
        });
        
        if (!token) {
            console.error('[createTag] No authentication token found');
            reject(new Error('No authentication token found. Please try logging in again.'));
            return;
        }
        // Generate a random color for the tag
        const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        fetch('/api/tags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                name: name,
                color: color
            })
        })
        .then(response => {
            if (!response.ok) {
                // Enhanced error handling to capture specific error details
                return response.json().then(errorData => {
                    console.error('[createTag] API Error Response:', {
                        status: response.status,
                        statusText: response.statusText,
                        errorData: errorData
                    });
                    
                    if (response.status === 409) {
                        reject(new Error(window.t('messages.tag_already_exists')));
                        return;
                    }
                    if (response.status === 401) {
                        reject(new Error('Authentication failed. Please try logging in again.'));
                        return;
                    }
                    if (response.status === 403) {
                        reject(new Error('Permission denied. You may not have access to create tags.'));
                        return;
                    }
                    
                    const errorMsg = errorData?.error || errorData?.message || 'Failed to create tag';
                    reject(new Error(errorMsg));
                }).catch(() => {
                    // If response body is not JSON or is empty
                    console.error('[createTag] Non-JSON error response:', response.status, response.statusText);
                    reject(new Error(`Failed to create tag (${response.status})`));
                });
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            const newTag = {
                id: data.id,
                name: data.name,
                color: data.color
            };
            allTags.push(newTag);
            renderExistingTags();
            populateTagFilter();
            showToast(window.t('messages.tag_created_successfully'), 'success');
            resolve(newTag);
        })
        .catch(error => {
            console.error('Error creating tag:', error);
            showToast(error.message || window.t('messages.failed_to_create_tag'), 'error');
            reject(error);
        });
    });
}

// Helper function to determine text color based on background color
function getContrastColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    
    // Calculate luminance
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // Return black or white depending on luminance
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

// Open tag management modal
function openTagManagementModal() {
    if (!tagManagementModal) return;
    
    // Populate existing tags
    renderExistingTags();
    addTagManagementEventListeners();
    
    // Show modal
    tagManagementModal.classList.add('active');
}

// Render existing tags in the management modal
function renderExistingTags() {
    if (!existingTagsContainer) return;
    existingTagsContainer.innerHTML = '';

    const wrapper = document.createElement('div');
    // Ensure horizontal scroll on small screens
    wrapper.className = 'table-responsive';
    const table = document.createElement('table');
    table.className = 'tag-management-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th class="tag-color-header">Color</th>
            <th>Name</th>
            <th class="tag-actions-header">Actions</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (!allTags || allTags.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="3"><div class="no-tags">${window.t ? window.t('messages.no_tags_created_yet') : 'No tags created yet'}</div></td>`;
        tbody.appendChild(emptyRow);
    } else {
        allTags.forEach(tag => {
            const row = document.createElement('tr');
            row.className = 'existing-tag-row';
            row.dataset.id = String(tag.id);

            row.innerHTML = `
                <td>
                    <div class="tag-color-swatch-container">
                        <div class="tag-color-swatch" style="background-color: ${tag.color}" aria-label="${escapeHtml(tag.name)}"></div>
                        <input type="color" class="tag-color-input-hidden" value="${tag.color}" aria-label="Pick color" />
                    </div>
                </td>
                <td>
                    <span class="tag-name-display">${escapeHtml(tag.name)}</span>
                    <input type="text" class="form-control tag-name-input" value="${escapeHtml(tag.name)}" />
                </td>
                <td class="tag-actions">
                    <div class="view-actions">
                        <button class="btn btn-sm btn-secondary edit-tag" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger delete-tag" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="edit-actions">
                        <button class="btn btn-sm btn-primary save-tag" title="Save"><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-secondary cancel-edit" title="Cancel"><i class="fas fa-times"></i></button>
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    existingTagsContainer.appendChild(wrapper);

    // Ensure delegation is attached once
    addTagManagementEventListeners();
}

// Edit a tag
function editTag(row) {
    // Switch row into edit mode (toggle inputs/buttons)
    const nameDisplay = row.querySelector('.tag-name-display');
    const nameInput = row.querySelector('.tag-name-input');
    const viewActions = row.querySelector('.view-actions');
    const editActions = row.querySelector('.edit-actions');
    if (!nameDisplay || !nameInput || !viewActions || !editActions) return;

    nameDisplay.style.display = 'none';
    nameInput.style.display = 'block';
    viewActions.style.display = 'none';
    editActions.style.display = 'flex';
    row.classList.add('editing');
}

// Update a tag
function updateTag(id, name, color) {
    const token = window.auth ? window.auth.getToken() : localStorage.getItem('auth_token');
    if (!token) {
        console.error('No authentication token found');
        return;
    }
    
    fetch(`/api/tags/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
            name: name,
            color: color
        })
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 409) {
                throw new Error('A tag with this name already exists');
            }
            throw new Error(window.t('messages.failed_to_update_tag'));
        }
        return response.json();
    })
    .then(data => {
        // Refresh lists to ensure consistency and exit edit mode
        return loadTags(true).then(() => {
            // Update local selections and warranties to reflect new tag data immediately
            try {
                if (data && typeof data.id !== 'undefined') {
                    // Update selected tags in Add Warranty flow
                    if (Array.isArray(selectedTags) && selectedTags.length > 0) {
                        selectedTags = selectedTags.map(t => t.id === data.id ? { id: data.id, name: data.name, color: data.color } : t);
                    }
                    // Update selected tags in Edit Warranty flow
                    if (Array.isArray(editSelectedTags) && editSelectedTags.length > 0) {
                        editSelectedTags = editSelectedTags.map(t => t.id === data.id ? { id: data.id, name: data.name, color: data.color } : t);
                    }
                    // Update tags inside existing warranties so cards reflect changes
                    if (Array.isArray(warranties) && warranties.length > 0) {
                        warranties.forEach(w => {
                            if (Array.isArray(w.tags)) {
                                w.tags.forEach(tag => {
                                    if (tag.id === data.id) {
                                        tag.name = data.name;
                                        tag.color = data.color;
                                    }
                                });
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn('[script.js] Non-fatal error while updating local tag state after update:', e);
            }

            renderExistingTags();
            renderSelectedTags();
            renderEditSelectedTags();
            populateTagFilter();
            renderWarranties(warranties);
            if (document.getElementById('summary-tags')) {
                updateSummary();
            }
            showToast(window.t('messages.tag_updated_successfully'), 'success');
        });
    })
    .catch(error => {
        console.error('Error updating tag:', error);
        showToast(error.message || window.t('messages.failed_to_update_tag'), 'error');
    });
}

// Centralized event delegation for tag management table
function addTagManagementEventListeners() {
    if (!tagManagementModal) return;
    const container = existingTagsContainer;
    if (!container) return;

    // Avoid attaching multiple times
    if (container.dataset.tmListenersAttached === 'true') return;
    container.dataset.tmListenersAttached = 'true';

    container.addEventListener('click', (e) => {
        const row = e.target.closest('tr.existing-tag-row');
        if (!row) return;
        const id = parseInt(row.dataset.id, 10);
        if (Number.isNaN(id)) return;

        if (e.target.closest('.edit-tag')) {
            editTag(row);
            return;
        }
        if (e.target.closest('.cancel-edit')) {
            // Exit edit mode: revert inputs/buttons visibility
            const nameDisplay = row.querySelector('.tag-name-display');
            const nameInput = row.querySelector('.tag-name-input');
            const viewActions = row.querySelector('.view-actions');
            const editActions = row.querySelector('.edit-actions');
            if (nameDisplay && nameInput && viewActions && editActions) {
                nameDisplay.style.display = '';
                nameInput.style.display = 'none';
                viewActions.style.display = '';
                editActions.style.display = 'none';
            }
            row.classList.remove('editing');
            return;
        }
        if (e.target.closest('.save-tag')) {
            const nameInput = row.querySelector('.tag-name-input');
            const colorInput = row.querySelector('.tag-color-input-hidden');
            const newName = (nameInput && nameInput.value ? nameInput.value.trim() : '');
            const newColor = colorInput ? colorInput.value : undefined;
            if (!newName) {
                showToast(window.t('messages.tag_name_required'), 'error');
                return;
            }
            updateTag(id, newName, newColor);
            row.classList.remove('editing');
            return;
        }
        if (e.target.closest('.delete-tag')) {
            deleteTag(id);
            return;
        }
    });

    // Color picker change via delegation
    container.addEventListener('input', (e) => {
        if (e.target.matches('.tag-color-input-hidden')) {
            const row = e.target.closest('tr.existing-tag-row');
            const swatch = row ? row.querySelector('.tag-color-swatch') : null;
            if (swatch) swatch.style.backgroundColor = e.target.value;
        }
    });

	// Auto-save color changes without requiring Edit/Save click
	container.addEventListener('change', (e) => {
		if (e.target.matches('.tag-color-input-hidden')) {
			const row = e.target.closest('tr.existing-tag-row');
			if (!row) return;
			const id = parseInt(row.dataset.id, 10);
			if (Number.isNaN(id)) return;
			const nameInput = row.querySelector('.tag-name-input');
			const nameDisplay = row.querySelector('.tag-name-display');
			const currentName = (nameInput && nameInput.style.display !== 'none' ? nameInput.value : (nameDisplay ? nameDisplay.textContent : '')).trim();
			const newColor = e.target.value;
			if (!currentName) {
				showToast(window.t ? window.t('messages.tag_name_required') : 'Tag name is required', 'error');
				return;
			}
			updateTag(id, currentName, newColor);
		}
	});
}

// Delete a tag
function deleteTag(id) {
    if (!confirm('Are you sure you want to delete this tag? It will be removed from all warranties.')) {
        return;
    }
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.error('No authentication token found');
        showToast(window.t('messages.authentication_required'), 'error'); // Added toast for better feedback
        return;
    }
    
    showLoadingSpinner(); // Show loading indicator
    
    fetch(`/api/tags/${id}`, { // Use the correct URL with tag ID
        method: 'DELETE', // Use DELETE method
        headers: {
            'Authorization': 'Bearer ' + token
        }
    })
    .then(response => {
        if (!response.ok) {
            // Log the status for debugging the 405 error
            console.error(`Failed to delete tag. Status: ${response.status} ${response.statusText}`);
            // Try to get error message from response body
            return response.json().then(errData => {
                throw new Error(errData.error || errData.message || 'Failed to delete tag');
            }).catch(() => {
                // If response body is not JSON or empty
                throw new Error(`Failed to delete tag. Status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        // Remove tag from allTags array
        allTags = allTags.filter(tag => tag.id !== id);
        
        // Remove tag from selectedTags if present (in both add and edit modes)
        selectedTags = selectedTags.filter(tag => tag.id !== id);
        editSelectedTags = editSelectedTags.filter(tag => tag.id !== id);
        
        // Remove tag from warranties array
        warranties.forEach(warranty => {
            if (warranty.tags && Array.isArray(warranty.tags)) {
                warranty.tags = warranty.tags.filter(tag => tag.id !== id);
            }
        });
        
        // --- FIX: Re-render UI elements ---
        renderExistingTags(); // Update the list in the modal
        renderSelectedTags(); // Update selected tags in the add form
        renderEditSelectedTags(); // Update selected tags in the edit form
        populateTagFilter(); // Update the filter dropdown on the main page
        renderWarranties(warranties); // Update warranty cards to remove deleted tag
        // --- END FIX ---
        
        showToast(window.t('messages.tag_deleted_successfully'), 'success');
    })
    .catch(error => {
        console.error('Error deleting tag:', error);
        showToast(error.message || window.t('messages.failed_to_delete_tag'), 'error'); // Show specific error message
    })
    .finally(() => {
        hideLoadingSpinner(); // Hide loading indicator
    });
}

// Set up event listeners for UI controls
function setupUIEventListeners() {
    // --- Global Manage Tags Button ---
    const globalManageTagsBtn = document.getElementById('globalManageTagsBtn');
    if (globalManageTagsBtn) {
        globalManageTagsBtn.addEventListener('click', async () => {
            // Ensure allTags are loaded before opening the modal
            if (!allTags || allTags.length === 0) {
                showLoadingSpinner();
                try {
                    await loadTags();
                } catch (error) {
                    console.error("Failed to load tags before opening modal:", error);
                    showToast(window.t('messages.could_not_load_tags'), "error");
                    hideLoadingSpinner();
                    return;
                }
                hideLoadingSpinner();
            }
            openTagManagementModal();
        });
    }
    // Initialize edit tabs
    initEditTabs();
    
    // Close modals when clicking outside or on close button
    document.querySelectorAll('.modal-backdrop, [data-dismiss="modal"]').forEach(element => {
        element.addEventListener('click', (e) => {
            // Check if the click is on the backdrop itself OR a dismiss button
            if (e.target === element || e.target.matches('[data-dismiss="modal"]')) {
                // Find the closest modal backdrop to the element clicked
                const modalToClose = e.target.closest('.modal-backdrop');

                if (modalToClose) {
                    // *** MODIFIED CHECK ***
                    // If the click target is the backdrop itself (not a dismiss button)
                    // AND the modal is one of the protected modals, then DO NOTHING.
                    if ((modalToClose.id === 'addWarrantyModal' || modalToClose.id === 'editModal' || 
                         modalToClose.id === 'claimsModal' || modalToClose.id === 'claimFormModal') && e.target === modalToClose) {
                        return; // Ignore backdrop click for protected modals
                    }
                    // *** END MODIFIED CHECK ***

                    // Otherwise, close the modal (handles other modals' backdrop clicks and all dismiss buttons)
                    modalToClose.classList.remove('active');

                    // Reset forms only when closing the respective modal
                    if (modalToClose.id === 'editModal') {
                        // Optional: Add any edit form reset logic here if needed
                        console.log('Edit modal closed, reset logic (if any) can go here.');
                    } else if (modalToClose.id === 'addWarrantyModal') {
                        // This reset will now only trigger if closed via dismiss button
                        resetAddWarrantyWizard();
                    }
                    // Add similar reset logic for other modals like deleteModal if needed
                    // else if (modalToClose.id === 'deleteModal') { ... }
                }
            }
        });
    });

    // Prevent modal content clicks from closing the modal
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
    
    // Filter event listeners
    const searchInput = document.getElementById('searchWarranties');
    const clearSearchBtn = document.getElementById('clearSearch');
    const statusFilter = document.getElementById('statusFilter');
    const tagFilter = document.getElementById('tagFilter');
    const sortBySelect = document.getElementById('sortBy');
    const vendorFilter = document.getElementById('vendorFilter'); // Added vendor filter select
    const warrantyTypeFilter = document.getElementById('warrantyTypeFilter'); // Added warranty type filter select
    
    if (searchInput) {
        // Debounce logic: only apply filters after user stops typing for 300ms
        let searchDebounceTimeout;
        searchInput.addEventListener('input', () => {
            currentFilters.search = searchInput.value.toLowerCase();
            // Show/hide clear button based on search input
            if (clearSearchBtn) {
                clearSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
            }
            // Add visual feedback class to search box when active
            if (searchInput.value) {
                searchInput.parentElement.classList.add('active-search');
            } else {
                searchInput.parentElement.classList.remove('active-search');
            }
            // Debounce applyFilters
            if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
            searchDebounceTimeout = setTimeout(() => {
                applyFilters();
                saveFilterPreferences();
            }, 300);
        });
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                currentFilters.search = '';
                clearSearchBtn.style.display = 'none';
                searchInput.parentElement.classList.remove('active-search');
                searchInput.focus();
                applyFilters();
                saveFilterPreferences();
            }
        });
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            currentFilters.status = statusFilter.value;
            applyFilters();
            saveFilterPreferences();
        });
    }
    
    if (tagFilter) {
        tagFilter.addEventListener('change', () => {
            currentFilters.tag = tagFilter.value;
            applyFilters();
            saveFilterPreferences();
        });
    }
    
    if (vendorFilter) { // Added event listener for vendor filter
        vendorFilter.addEventListener('change', () => {
            currentFilters.vendor = vendorFilter.value;
            applyFilters();
            saveFilterPreferences();
        });
    }
    
    if (warrantyTypeFilter) { // Added event listener for warranty type filter
        warrantyTypeFilter.addEventListener('change', () => {
            currentFilters.warranty_type = warrantyTypeFilter.value;
            applyFilters();
            saveFilterPreferences();
        });
    }
    
    if (sortBySelect) {
        sortBySelect.addEventListener('change', () => {
            currentFilters.sortBy = sortBySelect.value;
            applyFilters();
            saveFilterPreferences();
        });
    }
    
    // Note: Clear Filters button handler is in index.html inline script to close popover
    
    // View switcher event listeners
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    const tableViewBtn = document.getElementById('tableViewBtn');
    
    if (gridViewBtn) gridViewBtn.addEventListener('click', () => switchView('grid'));
    if (listViewBtn) listViewBtn.addEventListener('click', () => switchView('list'));
    if (tableViewBtn) tableViewBtn.addEventListener('click', () => switchView('table'));
    
    // Export button event listener
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportWarranties);
    
    // Import button event listener
    if (importBtn && csvFileInput) {
        importBtn.addEventListener('click', () => {
            csvFileInput.click(); // Trigger hidden file input
        });
        csvFileInput.addEventListener('change', (event) => {
            if (event.target.files && event.target.files.length > 0) {
                handleImport(event.target.files[0]);
            }
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadWarranties);
    
    // Warranty Type dropdown handlers for custom option
    if (warrantyTypeInput && warrantyTypeCustomInput) {
        warrantyTypeInput.addEventListener('change', () => {
            if (warrantyTypeInput.value === 'other') {
                warrantyTypeCustomInput.style.display = 'block';
                warrantyTypeCustomInput.focus();
            } else {
                warrantyTypeCustomInput.style.display = 'none';
                warrantyTypeCustomInput.value = '';
            }
            updateSummary(); // Update summary when warranty type changes
        });
        
        // Also update summary when custom warranty type changes
        warrantyTypeCustomInput.addEventListener('input', updateSummary);
    }
    
    if (editWarrantyTypeInput && editWarrantyTypeCustomInput) {
        editWarrantyTypeInput.addEventListener('change', () => {
            if (editWarrantyTypeInput.value === 'other') {
                editWarrantyTypeCustomInput.style.display = 'block';
                editWarrantyTypeCustomInput.focus();
            } else {
                editWarrantyTypeCustomInput.style.display = 'none';
                editWarrantyTypeCustomInput.value = '';
            }
        });
    }
    
    // Save warranty changes
    const saveWarrantyBtn = document.getElementById('saveWarrantyBtn');
    if (saveWarrantyBtn) {
        let functionToAttachOnClick = saveWarranty; // Default to the original saveWarranty from script.js

        // Check if the observer setup function from status.js is available
        if (typeof window.setupSaveWarrantyObserver === 'function') {
            console.log('[script.js] window.setupSaveWarrantyObserver (from status.js) was FOUND. Attempting to wrap local saveWarranty function.');
            try {
                // Call the observer setup function, passing it the original saveWarranty from this script.
                // The observer setup function is expected to return a new function that wraps the original.
                functionToAttachOnClick = window.setupSaveWarrantyObserver(saveWarranty);
                
                // Optional: A flag to let status.js know that script.js has handled the wrapping.
                // This can be useful if status.js has any fallback/polling logic to prevent double-wrapping.
                window.saveWarrantyObserverAttachedByScriptJS = true; 
                console.log('[script.js] Local saveWarranty function has been successfully WRAPPED by the observer from status.js.');
            } catch (e) {
                console.error('[script.js] An error occurred while trying to wrap saveWarranty with the observer from status.js:', e);
                // If an error occurs during wrapping, functionToAttachOnClick will remain the original saveWarranty.
            }
        } else {
            console.log('[script.js] window.setupSaveWarrantyObserver (from status.js) was NOT FOUND. Using the original saveWarranty function for the button.');
        }

        // Add the event listener using the (potentially) wrapped function.
        saveWarrantyBtn.addEventListener('click', () => {
            console.log('[script.js] Save button (saveWarrantyBtn) clicked. Invoking the determined save function (functionToAttachOnClick).');
            if (typeof functionToAttachOnClick === 'function') {
                functionToAttachOnClick(); // Execute the determined save function
            } else {
                console.error('[script.js] CRITICAL: functionToAttachOnClick is not a function when save button was clicked!');
            }
        });

    } else {
        console.warn('[script.js] saveWarrantyBtn DOM element not found. Cannot attach click listener.');
    }
    
    // Confirm delete button
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', deleteWarranty);

    // Confirm archive button
    const confirmArchiveBtn = document.getElementById('confirmArchiveBtn');
    if (confirmArchiveBtn) confirmArchiveBtn.addEventListener('click', confirmArchive);
    
    // Load saved view preference
    // loadViewPreference(); // Disabled: now called after authStateReady
}

// Function to show loading spinner
function showLoadingSpinner() {
    if (loadingContainer) {
        loadingContainer.style.display = 'flex';
    }
}

// Function to hide loading spinner
function hideLoadingSpinner() {
    if (loadingContainer) {
        loadingContainer.style.display = 'none';
    }
}

// Paperless upload loading functions
function showPaperlessUploadLoading(documentType) {
    // Create or show the Paperless upload overlay
    let overlay = document.getElementById('paperless-upload-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'paperless-upload-overlay';
        overlay.innerHTML = `
            <div class="paperless-upload-modal">
                <div class="paperless-upload-content">
                    <div class="paperless-upload-spinner"></div>
                    <h3>Uploading to Paperless-ngx</h3>
                    <p id="paperless-upload-status">Uploading document...</p>
                    <div class="paperless-upload-progress">
                        <div class="paperless-upload-progress-bar" id="paperless-progress-bar"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Add CSS styles
        const style = document.createElement('style');
        style.textContent = `
            #paperless-upload-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                backdrop-filter: blur(2px);
            }
            
            .paperless-upload-modal {
                background: var(--card-bg, #fff);
                border-radius: 12px;
                padding: 2rem;
                max-width: 400px;
                width: 90%;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                border: 1px solid var(--border-color, #ddd);
            }
            
            .paperless-upload-content h3 {
                margin: 1rem 0 0.5rem 0;
                color: var(--text-color, #333);
                font-size: 1.2rem;
            }
            
            .paperless-upload-content p {
                margin: 0.5rem 0 1.5rem 0;
                color: var(--text-secondary, #666);
                font-size: 0.9rem;
            }
            
            .paperless-upload-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid var(--border-color, #ddd);
                border-top: 4px solid var(--primary-color, #007bff);
                border-radius: 50%;
                animation: paperless-spin 1s linear infinite;
                margin: 0 auto 1rem auto;
            }
            
            @keyframes paperless-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .paperless-upload-progress {
                width: 100%;
                height: 6px;
                background: var(--border-color, #ddd);
                border-radius: 3px;
                overflow: hidden;
                margin-top: 1rem;
            }
            
            .paperless-upload-progress-bar {
                height: 100%;
                background: linear-gradient(90deg, var(--primary-color, #007bff), var(--success-color, #28a745));
                border-radius: 3px;
                width: 0%;
                transition: width 0.3s ease;
                animation: paperless-progress-pulse 2s ease-in-out infinite;
            }
            
            @keyframes paperless-progress-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
        `;
        document.head.appendChild(style);
    }
    
    overlay.style.display = 'flex';
    
    // Update status text
    const statusEl = document.getElementById('paperless-upload-status');
    if (statusEl) {
        statusEl.textContent = `Uploading ${documentType} to Paperless-ngx...`;
    }
    
    // Animate progress bar
    const progressBar = document.getElementById('paperless-progress-bar');
    if (progressBar) {
        progressBar.style.width = '30%';
        setTimeout(() => {
            progressBar.style.width = '60%';
        }, 1000);
        setTimeout(() => {
            progressBar.style.width = '80%';
        }, 2000);
    }
}

function updatePaperlessUploadStatus(message, isProcessing = false) {
    const statusEl = document.getElementById('paperless-upload-status');
    const progressBar = document.getElementById('paperless-progress-bar');
    
    if (statusEl) {
        statusEl.textContent = message;
    }
    
    if (isProcessing && progressBar) {
        progressBar.style.width = '90%';
    }
}

function hidePaperlessUploadLoading() {
    const overlay = document.getElementById('paperless-upload-overlay');
    if (overlay) {
        // Complete the progress bar first
        const progressBar = document.getElementById('paperless-progress-bar');
        if (progressBar) {
            progressBar.style.width = '100%';
        }
        
        // Hide after a short delay to show completion
        setTimeout(() => {
            overlay.style.display = 'none';
            // Reset progress bar for next use
            if (progressBar) {
                progressBar.style.width = '0%';
            }
        }, 500);
    }
}

// Delete warranty function
function deleteWarranty() {
    if (!currentWarrantyId) {
        showToast(window.t('messages.no_warranty_selected_for_deletion'), 'error');
        return;
    }
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
        showToast('Authentication required', 'error');
        return;
    }
    
    showLoadingSpinner();
    
    fetch(`/api/warranties/${currentWarrantyId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete warranty');
        }
        return response.json();
    })
    .then(data => {
        hideLoadingSpinner();
        showToast('Warranty deleted successfully', 'success');
        closeModals();

        // --- BEGIN FIX: Update UI immediately ---
        // Remove the deleted warranty from the global array
        const deletedId = currentWarrantyId; // Store ID before resetting
        warranties = warranties.filter(warranty => warranty.id !== deletedId);
        currentWarrantyId = null; // Reset current ID

        // Re-render the list using the updated local array
        applyFilters();
        // --- END FIX ---
    })
    .catch(error => {
        hideLoadingSpinner();
        console.error('Error deleting warranty:', error);
        showToast('Failed to delete warranty', 'error');
    });
}

// Save warranty updates
function saveWarranty() {
    console.log("[script.js] CORE saveWarranty (original from script.js) EXECUTING.");
    if (!currentWarrantyId) {
        showToast(window.t('messages.no_warranty_selected_for_update'), 'error');
        return;
    }
    
    // --- Get form values ---
    const productName = document.getElementById('editProductName').value.trim();
    const purchaseDate = document.getElementById('editPurchaseDate').value;
    const isLifetime = document.getElementById('editIsLifetime').checked;
    const isDurationMethod = editDurationMethodRadio && editDurationMethodRadio.checked;
    // Get new duration values
    const years = parseInt(document.getElementById('editWarrantyDurationYears').value || 0);
    const months = parseInt(document.getElementById('editWarrantyDurationMonths').value || 0);
    const days = parseInt(document.getElementById('editWarrantyDurationDays').value || 0);
    const exactDate = editExactExpirationDateInput ? editExactExpirationDateInput.value : '';
    
    // Basic validation
    if (!productName) {
        showToast(window.t('messages.product_name_required'), 'error');
        return;
    }
    
    if (!purchaseDate) {
        showToast(window.t('messages.purchase_date_required'), 'error');
        return;
    }
    
    // --- Updated Validation ---
    if (!isLifetime) {
        if (isDurationMethod) {
            // Validate duration fields
            if (years === 0 && months === 0 && days === 0) {
                showToast(window.t('messages.warranty_duration_required'), 'error');
                // Optional: focus the years input again
                const yearsInput = document.getElementById('editWarrantyDurationYears');
                if (yearsInput) { // Check if element exists
                    yearsInput.focus();
                    // Add invalid class to container or inputs
                    if (editWarrantyDurationFields) editWarrantyDurationFields.classList.add('invalid-duration');
                }
                return;
            }
        } else {
            // Validate exact expiration date
            if (!exactDate) {
                showToast(window.t('messages.exact_expiration_date_required'), 'error');
                if (editExactExpirationDateInput) editExactExpirationDateInput.focus();
                return;
            }
            
            // Validate that expiration date is in the future relative to purchase date
            if (purchaseDate && exactDate <= purchaseDate) {
                showToast(window.t('messages.expiration_date_after_purchase_date'), 'error');
                if (editExactExpirationDateInput) editExactExpirationDateInput.focus();
                return;
            }
        }
    }
    
    // Remove invalid duration class if validation passes
    if (editWarrantyDurationFields) editWarrantyDurationFields.classList.remove('invalid-duration');
    // --- End Updated Validation ---
    
    // Create form data
    const formData = new FormData();
    formData.append('product_name', productName);
    formData.append('purchase_date', purchaseDate);
    
    // Optional fields
    let productUrl = document.getElementById('editProductUrl').value.trim();
    if (productUrl) {
        if (!productUrl.startsWith('http://') && !productUrl.startsWith('https://')) {
            productUrl = 'https://' + productUrl;
        }
        formData.append('product_url', productUrl);
    }
    
    const purchasePrice = document.getElementById('editPurchasePrice').value;
    const currency = document.getElementById('editCurrency').value;
    if (purchasePrice) {
        formData.append('purchase_price', purchasePrice);
    }
    if (currency) {
        formData.append('currency', currency);
    }
    
    // Serial numbers (use correct name 'serial_numbers[]')
    const serialInputs = document.querySelectorAll('#editSerialNumbersContainer input[name="serial_numbers[]"]');
    // Clear existing before appending
    formData.delete('serial_numbers[]'); 
    serialInputs.forEach(input => {
        if (input.value.trim()) {
            formData.append('serial_numbers[]', input.value.trim()); // Use []
        }
    });
    
    // Tags - add tag IDs as JSON string
    if (editSelectedTags && editSelectedTags.length > 0) {
        const tagIds = editSelectedTags.map(tag => tag.id);
        formData.append('tag_ids', JSON.stringify(tagIds));
    } else {
        // Send empty array to clear tags
        formData.append('tag_ids', JSON.stringify([]));
    }
    
    // Add URL fields for documents (with null checks)
    const editInvoiceUrlField = document.getElementById('editInvoiceUrl');
    formData.append('invoice_url', editInvoiceUrlField ? editInvoiceUrlField.value || '' : '');
    
    const editManualUrlField = document.getElementById('editManualUrl');
    formData.append('manual_url', editManualUrlField ? editManualUrlField.value || '' : '');
    
    const editOtherDocumentUrlField = document.getElementById('editOtherDocumentUrl');
    formData.append('other_document_url', editOtherDocumentUrlField ? editOtherDocumentUrlField.value || '' : '');
    
    // Files
    const invoiceFile = document.getElementById('editInvoice').files[0];
    if (invoiceFile) {
        formData.append('invoice', invoiceFile);
    }
    
    const manualFile = document.getElementById('editManual').files[0];
    if (manualFile) {
        formData.append('manual', manualFile);
    }

    const otherDocumentFile = document.getElementById('editOtherDocument').files[0]; 
    if (otherDocumentFile) { 
        formData.append('other_document', otherDocumentFile); 
    } 
    
    // Product photo
    const productPhotoFile = document.getElementById('editProductPhoto').files[0];
    if (productPhotoFile) {
        formData.append('product_photo', productPhotoFile);
    }
    
    // Document deletion flags
    const deleteInvoiceBtn = document.getElementById('deleteInvoiceBtn');
    if (deleteInvoiceBtn && deleteInvoiceBtn.dataset.delete === 'true') {
        formData.append('delete_invoice', 'true');
    }
    const deleteManualBtn = document.getElementById('deleteManualBtn');
    if (deleteManualBtn && deleteManualBtn.dataset.delete === 'true') {
        formData.append('delete_manual', 'true');
    }
    const deleteOtherDocumentBtn = document.getElementById('deleteOtherDocumentBtn'); 
    if (deleteOtherDocumentBtn && deleteOtherDocumentBtn.dataset.delete === 'true') { 
        formData.append('delete_other_document', 'true'); 
    }
    const deleteProductPhotoBtn = document.getElementById('deleteProductPhotoBtn');
    if (deleteProductPhotoBtn && deleteProductPhotoBtn.dataset.delete === 'true') {
        formData.append('delete_product_photo', 'true');
    } 
    
    // --- Append is_lifetime and duration components ---
    formData.append('is_lifetime', isLifetime.toString());
    if (!isLifetime) {
        if (isDurationMethod) {
            formData.append('warranty_duration_years', years);
            formData.append('warranty_duration_months', months);
            formData.append('warranty_duration_days', days);
        } else {
            // Using exact date method
            formData.append('exact_expiration_date', exactDate);
            // Ensure duration fields are 0 when using exact date
            formData.append('warranty_duration_years', 0);
            formData.append('warranty_duration_months', 0);
            formData.append('warranty_duration_days', 0);
        }
    } else {
        // Ensure duration is 0 if lifetime
        formData.append('warranty_duration_years', 0);
        formData.append('warranty_duration_months', 0);
        formData.append('warranty_duration_days', 0);
    }
    // Add notes
    const notes = document.getElementById('editNotes').value;
    if (notes && notes.trim() !== '') {
        formData.append('notes', notes);
    } else {
        // Explicitly clear notes if empty
        formData.append('notes', '');
    }
    
    // Add model number to form data (optional)
    const editModelNumber = document.getElementById('editModelNumber');
    if (editModelNumber && editModelNumber.value.trim() !== '') {
        formData.append('model_number', editModelNumber.value.trim());
    } else {
        // Explicitly clear if empty
        formData.append('model_number', '');
    }

    // Add vendor/retailer to form data
    const editVendorInput = document.getElementById('editVendor'); // Use the correct ID
    formData.append('vendor', editVendorInput ? editVendorInput.value.trim() : ''); // Use the correct variable
    
    // Add warranty type to form data - handle custom type
    const editWarrantyTypeInput = document.getElementById('editWarrantyType');
    const editWarrantyTypeCustomInput = document.getElementById('editWarrantyTypeCustom');
    let warrantyTypeValue = '';
    if (editWarrantyTypeInput) {
        if (editWarrantyTypeInput.value === 'other' && editWarrantyTypeCustomInput && editWarrantyTypeCustomInput.value.trim()) {
            warrantyTypeValue = editWarrantyTypeCustomInput.value.trim();
        } else {
            warrantyTypeValue = editWarrantyTypeInput.value.trim();
        }
    }
    formData.append('warranty_type', warrantyTypeValue);
    
    // Add selected Paperless documents for edit form
    const selectedEditPaperlessProductPhoto = document.getElementById('selectedEditPaperlessProductPhoto');
    const selectedEditPaperlessInvoice = document.getElementById('selectedEditPaperlessInvoice');
    const selectedEditPaperlessManual = document.getElementById('selectedEditPaperlessManual');
    const selectedEditPaperlessOtherDocument = document.getElementById('selectedEditPaperlessOtherDocument');
    
    if (selectedEditPaperlessProductPhoto && selectedEditPaperlessProductPhoto.value) {
        formData.append('paperless_photo_id', selectedEditPaperlessProductPhoto.value);
    }
    if (selectedEditPaperlessInvoice && selectedEditPaperlessInvoice.value) {
        formData.append('paperless_invoice_id', selectedEditPaperlessInvoice.value);
    }
    if (selectedEditPaperlessManual && selectedEditPaperlessManual.value) {
        formData.append('paperless_manual_id', selectedEditPaperlessManual.value);
    }
    if (selectedEditPaperlessOtherDocument && selectedEditPaperlessOtherDocument.value) {
        formData.append('paperless_other_id', selectedEditPaperlessOtherDocument.value);
    }
    
    // DEBUG: Log what we're sending to the backend
    console.log('[DEBUG saveWarranty] Form data being sent:');
    console.log('[DEBUG saveWarranty] isLifetime:', isLifetime);
    console.log('[DEBUG saveWarranty] isDurationMethod:', isDurationMethod);
    console.log('[DEBUG saveWarranty] exactDate:', exactDate);
    console.log('[DEBUG saveWarranty] years/months/days:', years, months, days);
    
    // Log all form data entries
    for (let [key, value] of formData.entries()) {
        console.log(`[DEBUG saveWarranty] FormData: ${key} = ${value}`);
    }
    
    // Get auth token
    const token = localStorage.getItem('auth_token');
    if (!token) {
        showToast('Authentication required', 'error');
        return;
    }
    
    showLoadingSpinner();
    
    // Process Paperless-ngx uploads if enabled
    processEditPaperlessNgxUploads(formData)
        .then(paperlessUploads => {
            // Add Paperless-ngx document IDs to form data
            Object.keys(paperlessUploads).forEach(key => {
                formData.append(key, paperlessUploads[key]);
            });
            
            // Send request
            return fetch(`/api/warranties/${currentWarrantyId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                body: formData
            });
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Failed to update warranty');
                });
            }
            return response.json();
        })
        .then(data => {
            hideLoadingSpinner();
            showToast('Warranty updated successfully', 'success');
            closeModals();
        
        // Always reload from server to ensure we get the latest data including product photo paths
        console.log('Reloading warranties after edit to ensure latest data including product photos');
        loadWarranties(true).then(() => {
            console.log('Warranties reloaded after editing warranty');
            applyFilters();
            // Load secure images for the updated cards - additional call to ensure they load
            setTimeout(() => {
                console.log('Loading secure images for updated warranty cards');
                loadSecureImages();
            }, 200); // Slightly longer delay to ensure everything is rendered
            
            // Always close the notes modal if open, to ensure UI is in sync
            const notesModal = document.getElementById('notesModal');
            if (notesModal && notesModal.style.display === 'block') {
                notesModal.style.display = 'none';
            }
            
            console.log('Warranty updated and reloaded from server');
            
            // Auto-link any documents that were uploaded to Paperless-ngx
            if ((invoiceFile || manualFile || otherDocumentFile) && currentWarrantyId) {
                console.log('[Auto-Link] Starting automatic document linking after warranty update');
                
                // Collect filename information for intelligent searching
                const fileInfo = {};
                if (invoiceFile) fileInfo.invoice = invoiceFile.name;
                if (manualFile) fileInfo.manual = manualFile.name;
                if (otherDocumentFile) fileInfo.other = otherDocumentFile.name;
                
                setTimeout(() => {
                    autoLinkRecentDocuments(currentWarrantyId, ['invoice', 'manual', 'other'], 10, 10000, fileInfo);
                }, 3000); // Wait 3 seconds for Paperless-ngx to process the documents
            }
        }).catch(error => {
            console.error('Error reloading warranties after edit:', error);
        });
    })
    .catch(error => {
        hideLoadingSpinner();
        console.error('Error updating warranty:', error);
        showToast(error.message || 'Failed to update warranty', 'error');
    });
}

// Function to populate tag filter dropdown
function populateTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    if (!tagFilter) return;
    
    // Clear existing options (except "All Tags")
    while (tagFilter.options.length > 1) {
        tagFilter.remove(1);
    }
    
    // Create a Set to store unique tag names
    const uniqueTags = new Set();
    
    // Collect all unique tags from warranties
    warranties.forEach(warranty => {
        if (warranty.tags && Array.isArray(warranty.tags)) {
            warranty.tags.forEach(tag => {
                uniqueTags.add(JSON.stringify({id: tag.id, name: tag.name, color: tag.color}));
            });
        }
    });
    
    // Sort tags alphabetically by name
    const sortedTags = Array.from(uniqueTags)
        .map(tagJson => JSON.parse(tagJson))
        .sort((a, b) => a.name.localeCompare(b.name));
    
    // Add options to the dropdown
    // Add options to the dropdown
    sortedTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag.id;
        option.textContent = tag.name; // Reverted to textContent
        // Apply background color directly for now, acknowledging potential contrast issues
        // option.style.backgroundColor = tag.color; // Removed to prevent individual option background colors
        tagFilter.appendChild(option);
    });
}

// Function to populate vendor filter dropdown
function populateVendorFilter() {
    const vendorFilterElement = document.getElementById('vendorFilter');
    if (!vendorFilterElement) return;

    // Clear existing options (except "All Vendors")
    while (vendorFilterElement.options.length > 1) {
        vendorFilterElement.remove(1);
    }

    // Create a Set to store unique vendor names (case-insensitive)
    const uniqueVendors = new Set();

    // Collect all unique, non-empty vendors from warranties
    warranties.forEach(warranty => {
        if (warranty.vendor && warranty.vendor.trim() !== '') {
            uniqueVendors.add(warranty.vendor.trim().toLowerCase());
        }
    });

    // Sort vendors alphabetically (after converting back to original case for display if needed, or just use lowercase)
    // For simplicity, we'll sort the lowercase versions and display them as is.
    // If original casing is important, a map could be used to store original values.
    const sortedVendors = Array.from(uniqueVendors).sort((a, b) => a.localeCompare(b));

    // Add options to the dropdown
    sortedVendors.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor; // Use lowercase for value consistency
        // Capitalize first letter for display
        option.textContent = vendor.charAt(0).toUpperCase() + vendor.slice(1);
        vendorFilterElement.appendChild(option);
    });
}

// Function to populate warranty type filter dropdown
function populateWarrantyTypeFilter() {
    const warrantyTypeFilterElement = document.getElementById('warrantyTypeFilter');
    if (!warrantyTypeFilterElement) return;

    // Clear existing options (except "All Types")
    while (warrantyTypeFilterElement.options.length > 1) {
        warrantyTypeFilterElement.remove(1);
    }

    // Create a Set to store unique warranty types (case-insensitive)
    const uniqueWarrantyTypes = new Set();

    // Collect all unique, non-empty warranty types from warranties
    warranties.forEach(warranty => {
        if (warranty.warranty_type && warranty.warranty_type.trim() !== '') {
            uniqueWarrantyTypes.add(warranty.warranty_type.trim().toLowerCase());
        }
    });

    // Sort warranty types alphabetically
    const sortedWarrantyTypes = Array.from(uniqueWarrantyTypes).sort((a, b) => a.localeCompare(b));

    // Add options to the dropdown
    sortedWarrantyTypes.forEach(warrantyType => {
        const option = document.createElement('option');
        option.value = warrantyType; // Use lowercase for value consistency
        // Capitalize first letter for display
        option.textContent = warrantyType.charAt(0).toUpperCase() + warrantyType.slice(1);
        warrantyTypeFilterElement.appendChild(option);
    });
}

// --- Updated Function ---
function handleLifetimeChange(event) {
    const checkbox = event ? event.target : isLifetimeCheckbox;
    const durationFields = warrantyDurationFields; // Use new container ID
    const yearsInput = warrantyDurationYearsInput;
    const monthsInput = warrantyDurationMonthsInput;
    const daysInput = warrantyDurationDaysInput;
    const warrantyEntryMethod = document.getElementById('warrantyEntryMethod');

    if (!checkbox || !durationFields || !yearsInput || !monthsInput || !daysInput) {
        console.error("Lifetime or duration elements not found in add form");
        return;
    }

    if (checkbox.checked) {
        // Hide warranty method selection and both input methods
        if (warrantyEntryMethod) warrantyEntryMethod.style.display = 'none';
        durationFields.style.display = 'none';
        if (exactExpirationField) exactExpirationField.style.display = 'none';
        
        // Clear and make fields not required
        yearsInput.required = false;
        monthsInput.required = false;
        daysInput.required = false;
        yearsInput.value = '';
        monthsInput.value = '';
        daysInput.value = '';
        if (exactExpirationDateInput) exactExpirationDateInput.value = '';
    } else {
        // Show warranty method selection
        if (warrantyEntryMethod) warrantyEntryMethod.style.display = 'block';
        
        // Call method change handler to show appropriate fields
        handleWarrantyMethodChange();
    }
}

// --- Updated Function ---
function handleEditLifetimeChange(event) {
    const checkbox = event ? event.target : editIsLifetimeCheckbox;
    const durationFields = editWarrantyDurationFields; // Use new container ID
    const yearsInput = editWarrantyDurationYearsInput;
    const monthsInput = editWarrantyDurationMonthsInput;
    const daysInput = editWarrantyDurationDaysInput;
    const editWarrantyEntryMethod = document.getElementById('editWarrantyEntryMethod');

    if (!checkbox || !durationFields || !yearsInput || !monthsInput || !daysInput) {
        console.error("Lifetime or duration elements not found in edit form");
        return;
    }

    if (checkbox.checked) {
        // Hide warranty method selection and both input methods
        if (editWarrantyEntryMethod) editWarrantyEntryMethod.style.display = 'none';
        durationFields.style.display = 'none';
        if (editExactExpirationField) editExactExpirationField.style.display = 'none';
        
        // Clear and make fields not required
        yearsInput.required = false;
        monthsInput.required = false;
        daysInput.required = false;
        yearsInput.value = '';
        monthsInput.value = '';
        daysInput.value = '';
        if (editExactExpirationDateInput) editExactExpirationDateInput.value = '';
    } else {
        // Show warranty method selection
        if (editWarrantyEntryMethod) editWarrantyEntryMethod.style.display = 'block';
        
        // Call method change handler to show appropriate fields
        handleEditWarrantyMethodChange();
    }
}

// --- Add this function to reset the wizard ---
function resetAddWarrantyWizard() {
    console.log('Resetting Add Warranty Wizard...');
    // Reset the form fields
    if (warrantyForm) {
        warrantyForm.reset();
        
        // Explicitly set storage options to 'local'
        const storageTypes = ['invoice', 'manual'];
        storageTypes.forEach(type => {
            const localRadio = document.querySelector(`input[name="${type}Storage"][value="local"]`);
            if (localRadio) {
                localRadio.checked = true;
            }
        });
    }

    // Reset serial numbers container (remove all but the first input structure)
    if (serialNumbersContainer) {
        serialNumbersContainer.innerHTML = ''; // Clear it
        addSerialNumberInput(); // Add the initial input back
    }

    // Reset file input displays
    if (fileName) fileName.textContent = '';
    if (manualFileName) manualFileName.textContent = '';
    if (otherDocumentFileName) otherDocumentFileName.textContent = ''; 

    // Clear Paperless document selections (only for invoice and manual)
    clearPaperlessSelection('invoice');
    clearPaperlessSelection('manual');

    // Reset selected tags
    selectedTags = [];
    console.log('Resetting Add Warranty Wizard...');
    
    // No need to reset the form again as we already did it above

    // Reset serial numbers container (remove all but the first input structure)
    if (serialNumbersContainer) {
        serialNumbersContainer.innerHTML = ''; // Clear it
        addSerialNumberInput(); // Add the initial input back
    }

    // Reset file input displays
    if (fileName) fileName.textContent = '';
    if (manualFileName) manualFileName.textContent = '';
    if (otherDocumentFileName) otherDocumentFileName.textContent = ''; 

    // Reset selected tags
    selectedTags = [];
    renderSelectedTags(); // Update the display

    // Reset tabs to the first one
    // Use the globally defined tabContents if available
    const tabs = addWarrantyModal?.querySelectorAll('.form-tab');
    const contents = addWarrantyModal?.querySelectorAll('.tab-content');
    if (tabs && contents && tabs.length > 0 && contents.length > 0) {
      currentTabIndex = 0;
      switchToTab(0); // Use the existing function to switch
    } else {
       console.warn("Could not find tabs/contents inside addWarrantyModal to reset.");
    }

    // Clear any validation states
    addWarrantyModal?.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    addWarrantyModal?.querySelectorAll('.validation-message').forEach(el => el.remove());

    // Reset lifetime checkbox state if needed (ensure handler runs)
    if (isLifetimeCheckbox) {
         isLifetimeCheckbox.checked = false; // Explicitly uncheck
         handleLifetimeChange({ target: isLifetimeCheckbox }); // Trigger handler to reset visibility/required state
    }
}

// --- Modify setupUIEventListeners or add this within DOMContentLoaded ---
function setupModalTriggers() {
    // Show Add Warranty Modal
    if (showAddWarrantyBtn && addWarrantyModal) {
        showAddWarrantyBtn.addEventListener('click', () => {
            resetAddWarrantyWizard(); // Reset before showing
            addWarrantyModal.classList.add('active');
            initFormTabs(); // Initialize tabs only when modal is shown
            switchToTab(0); // Ensure the first tab content is displayed correctly after reset
            
            // Set currency dropdown to user's preferred currency after form reset
            const preferredCurrencyCode = getCurrencyCode();
            if (currencySelect && preferredCurrencyCode) {
                currencySelect.value = preferredCurrencyCode;
                console.log(`[Modal Open] Set currency dropdown to user preference: ${preferredCurrencyCode}`);
            }
            
            // Update currency symbols and positioning for the add form
            const symbol = getCurrencySymbol();
            const position = getCurrencyPosition();
            updateFormCurrencyPosition(symbol, position);
            
            // Trigger currency positioning after modal is visible
            setTimeout(() => {
                if (position === 'right') {
                    const addPriceInput = document.getElementById('purchasePrice');
                    const addCurrencySymbol = document.getElementById('addCurrencySymbol');
                    if (addPriceInput && addCurrencySymbol) {
                        // Force update the currency position now that modal is visible
                        const wrapper = addPriceInput.closest('.price-input-wrapper');
                        if (wrapper && wrapper.classList.contains('currency-right')) {
                            const updateEvent = new Event('focus');
                            addPriceInput.dispatchEvent(updateEvent);
                            const blurEvent = new Event('blur');
                            addPriceInput.dispatchEvent(blurEvent);
                        }
                    }
                }
            }, 200);
        });
    }

    // Hide Add Warranty Modal (using existing close logic)
    if (addWarrantyModal) {
        // Close button inside modal
        const closeBtn = addWarrantyModal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                addWarrantyModal.classList.remove('active');
                resetAddWarrantyWizard(); // Reset on close
            });
        }
        // REMOVED: Backdrop click listener
        /*
        addWarrantyModal.addEventListener('click', (e) => {
            if (e.target === addWarrantyModal) {
                addWarrantyModal.classList.remove('active');
                resetAddWarrantyWizard(); // Reset on close
            }
        });
        */
        // Optional: Cancel button in footer if you add one
        // ... (cancel button logic remains unchanged)
    }

    // --- Edit Modal Triggers (Keep existing logic) ---
    // Close edit/delete modals when clicking outside or on close button
    document.querySelectorAll('#editModal, #deleteModal, #archiveModal, [data-dismiss="modal"]').forEach(element => {
        element.addEventListener('click', (e) => {
            // Check if the click is on the backdrop itself OR a dismiss button
            if (e.target === element || e.target.matches('[data-dismiss="modal"]')) {
                 // Find the closest modal backdrop to the element clicked
                const modalToClose = e.target.closest('.modal-backdrop');
                if (modalToClose) {
                    // *** ADD CHECK: Do NOT close addWarrantyModal or editModal via this general listener for backdrop clicks ***
                    if ((modalToClose.id === 'addWarrantyModal' || modalToClose.id === 'editModal') && e.target === modalToClose) {
                        return; // Ignore backdrop clicks for the add and edit modals here
                    }
                    // *** END ADD CHECK ***

                    modalToClose.classList.remove('active');
                    // Reset edit form state if closing edit modal
                    if (modalToClose.id === 'editModal') {
                        // Optional: Add any edit form reset logic here if needed
                    }
                }
            }
        });
    });

    // Prevent modal content clicks from closing the modal (Keep for all modals)
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
}

// --- CSV Import Functionality ---

async function handleImport(file) {
    if (!file) {
        showToast('No file selected.', 'warning');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('Invalid file type. Please select a .csv file.', 'error');
        return;
    }

    // Show loading indicator
    showLoadingSpinner();

    const formData = new FormData();
    formData.append('csv_file', file);

    try {
        // const token = localStorage.getItem('token'); // Incorrect key
        const token = localStorage.getItem('auth_token'); // Correct key used elsewhere
        if (!token) {
            showToast('Authentication error. Please log in again.', 'error');
            hideLoadingSpinner();
            // Maybe redirect to login: window.location.href = '/login.html';
            return;
        }

        const response = await fetch('/api/warranties/import', {
            method: 'POST',
            headers: {
                // Content-Type is automatically set by browser when using FormData
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        hideLoadingSpinner();
        const result = await response.json();

        if (response.ok) {
            const { success_count, failure_count, errors } = result;
            let message = `${success_count} warranties imported successfully.`;
            if (failure_count > 0) {
                message += ` ${failure_count} rows failed.`;
                // Log detailed errors to the console for now
                console.warn('Import errors:', errors);
                // Consider showing errors in a modal or separate report later
            }
            showToast(message, 'success');

            // ***** FIX: Reload the tags list *****
            console.log("Import successful, reloading tags...");
            await loadTags(true); // Fetch the updated list of all tags
            // ***** END FIX *****

            // Add a small delay to ensure backend has processed the data
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Await the warranties load to ensure UI is updated
            await loadWarranties(true);
            
            // Force a UI refresh by reapplying filters
            applyFilters();
        } else {
            showToast(`Import failed: ${result.error || 'Unknown error'}`, 'error');
            if (result.errors) {
                 console.error('Detailed import errors:', result.errors);
            }
        }

    } catch (error) {
        hideLoadingSpinner();
        console.error('Error during file import:', error);
        showToast('An error occurred during import. Check console for details.', 'error');
    } finally {
        // Reset the file input so the user can select the same file again if needed
        if (csvFileInput) {
            csvFileInput.value = '';
        }
    }
}

// --- End CSV Import Functionality ---

// --- Add Storage Event Listener for Real-time Sync ---
window.addEventListener('storage', (event) => {
    const currentPrefix = getPreferenceKeyPrefix(); // Re-calculate prefix
    const viewKeysToWatch = [
        `${currentPrefix}defaultView`,
        'viewPreference',
        `${currentPrefix}warrantyView`,
        // Add `${currentPrefix}viewPreference` if still used/relevant
        `${currentPrefix}viewPreference` 
    ];

    // Check for view preference changes
    if (viewKeysToWatch.includes(event.key) && event.newValue) {
        console.log(`Storage event detected for view preference (${event.key}). New value: ${event.newValue}`);
        // Check if the new value is different from the current view to avoid loops
        if (event.newValue !== currentView) {
             // Ensure view buttons exist before switching (we're on the main page)
             if (gridViewBtn || listViewBtn || tableViewBtn) {
                 switchView(event.newValue, false); // Apply change, don't re-save to API
             }
        } else {
             console.log('Storage event value matches current view, ignoring.');
        }
    }

    // --- Added: Check for date format changes ---
    if (event.key === 'dateFormat' && event.newValue) {
        console.log(`Storage event detected for dateFormat. New value: ${event.newValue}`);
        // Re-apply filters to re-render warranties with the new date format
        if (warrantiesList) { // Only apply if the warranty list exists on the page
             applyFilters();
             showToast('Date format updated.', 'info'); // Optional: Notify user
        }
    }
    // --- End Added Check ---

    // --- Added: Check for currency symbol changes ---
    if (event.key === `${currentPrefix}currencySymbol` && event.newValue) {
        console.log(`Storage event detected for ${currentPrefix}currencySymbol. New value: ${event.newValue}`);
        if (warrantiesList) { // Only apply if on the main page
            updateCurrencySymbols(); // Update symbols outside cards (e.g., in forms if they exist)
            applyFilters(); // Re-render cards to update symbols inside them
            showToast('Currency symbol updated.', 'info'); // Optional: Notify user
        }
    }
    // --- End Added Check ---
});
// --- End Storage Event Listener ---

// Add modal HTML to the end of the body if not present
if (!document.getElementById('notesModal')) {
    const notesModal = document.createElement('div');
    notesModal.id = 'notesModal';
    notesModal.className = 'modal-backdrop';
    notesModal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h3 class="modal-title">Warranty Notes</h3>
                <button class="close-btn" id="closeNotesModal">&times;</button>
            </div>
            <div class="modal-body">
                <div id="notesModalContent" style="white-space: pre-line;"></div>
                <textarea id="notesModalTextarea" style="display:none;width:100%;min-height:100px;"></textarea>
            </div>
            <div class="modal-footer" id="notesModalFooter">
                <button class="btn btn-secondary" id="editNotesBtn">Edit Notes</button>
                <button class="btn btn-info" id="editWarrantyBtn">Edit Warranty</button>
                <button class="btn btn-primary" id="saveNotesBtn" style="display:none;">Save</button>
                <button class="btn btn-danger" id="cancelEditNotesBtn" style="display:none;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(notesModal);
    document.getElementById('closeNotesModal').addEventListener('click', () => {
        notesModal.classList.remove('active');
    });
    
    // Add event listener for Edit Warranty button
    document.getElementById('editWarrantyBtn').addEventListener('click', async () => {
        // Find the current warranty data from the global array
        const currentWarranty = warranties.find(w => w.id === notesModalWarrantyId);
        if (currentWarranty) {
            console.log('[DEBUG] Edit Warranty button clicked, opening edit modal with warranty:', currentWarranty.id, 'notes:', currentWarranty.notes);
            // Close the notes modal first
            notesModal.classList.remove('active');
            // Open the edit modal with current data
            await openEditModal(currentWarranty);
        } else {
            showToast(window.t('messages.warranty_not_found_refresh'), 'error');
        }
    });
}

// Add global to track which warranty is being edited in the notes modal
let notesModalWarrantyId = null;
let notesModalWarrantyObj = null;

function showNotesModal(notes, warrantyOrId = null) {
    const notesModal = document.getElementById('notesModal');
    const notesModalContent = document.getElementById('notesModalContent');
    const notesModalTextarea = document.getElementById('notesModalTextarea');
    const editBtn = document.getElementById('editNotesBtn');
    const saveBtn = document.getElementById('saveNotesBtn');
    const cancelBtn = document.getElementById('cancelEditNotesBtn');

    // Support both (notes, warrantyObj) and (notes, id) for backward compatibility
    if (typeof warrantyOrId === 'object' && warrantyOrId !== null) {
        notesModalWarrantyId = warrantyOrId.id;
        notesModalWarrantyObj = warrantyOrId;
    } else {
        notesModalWarrantyId = warrantyOrId;
        // Try to find the warranty object from global warranties array
        notesModalWarrantyObj = warranties.find(w => w.id === notesModalWarrantyId) || null;
    }

    // Show note content, hide textarea and edit controls
    notesModalContent.style.display = '';
    notesModalContent.textContent = notes;
    notesModalTextarea.style.display = 'none';
    editBtn.style.display = '';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';

    // Edit button handler
    editBtn.onclick = function() {
        notesModalContent.style.display = 'none';
        notesModalTextarea.style.display = '';
        // Use the current content from the modal display instead of the stale notes parameter
        notesModalTextarea.value = notesModalContent.textContent;
        editBtn.style.display = 'none';
        saveBtn.style.display = '';
        cancelBtn.style.display = '';
        notesModalTextarea.focus();
    };
    // Save button handler
    saveBtn.onclick = async function() {
        const newNote = notesModalTextarea.value.trim(); // Trim the note
        if (!notesModalWarrantyId || !notesModalWarrantyObj) {
            showToast('No warranty selected for note update', 'error');
            return;
        }

        // Frontend check for invalid duration before attempting to save notes
        if (!notesModalWarrantyObj.is_lifetime &&
            (parseInt(notesModalWarrantyObj.warranty_duration_years) || 0) === 0 &&
            (parseInt(notesModalWarrantyObj.warranty_duration_months) || 0) === 0 &&
            (parseInt(notesModalWarrantyObj.warranty_duration_days) || 0) === 0 &&
            !notesModalWarrantyObj.expiration_date) {
            showToast('Cannot save notes: The warranty has an invalid duration. Please edit the full warranty details to set a valid duration first.', 'error', 7000); // Longer toast duration
            return; // Prevent API call
        }

        // Save note via API, sending all required fields
        try {
            showLoadingSpinner();
            const token = localStorage.getItem('auth_token');
            const formData = new FormData();
            // --- Populate with existing data to avoid clearing fields ---
            formData.append('product_name', notesModalWarrantyObj.product_name);
            formData.append('purchase_date', (notesModalWarrantyObj.purchase_date || '').split('T')[0]);
            formData.append('is_lifetime', notesModalWarrantyObj.is_lifetime ? 'true' : 'false');
            if (!notesModalWarrantyObj.is_lifetime) {
                // Append duration components instead of warranty_years
                formData.append('warranty_duration_years', notesModalWarrantyObj.warranty_duration_years || 0);
                formData.append('warranty_duration_months', notesModalWarrantyObj.warranty_duration_months || 0);
                formData.append('warranty_duration_days', notesModalWarrantyObj.warranty_duration_days || 0);
                
                // If all duration fields are 0 but we have an expiration date, this was created with exact date method
                const isExactDateWarranty = (notesModalWarrantyObj.warranty_duration_years || 0) === 0 &&
                                          (notesModalWarrantyObj.warranty_duration_months || 0) === 0 &&
                                          (notesModalWarrantyObj.warranty_duration_days || 0) === 0 &&
                                          notesModalWarrantyObj.expiration_date;
                
                if (isExactDateWarranty) {
                    // For exact date warranties, send the expiration date as exact_expiration_date
                    formData.append('exact_expiration_date', notesModalWarrantyObj.expiration_date.split('T')[0]);
                }
            }
            if (notesModalWarrantyObj.product_url) {
                formData.append('product_url', notesModalWarrantyObj.product_url);
            }
            if (notesModalWarrantyObj.purchase_price !== null && notesModalWarrantyObj.purchase_price !== undefined) { // Check for null/undefined
                formData.append('purchase_price', notesModalWarrantyObj.purchase_price);
            }
            // Correctly append serial numbers
            if (notesModalWarrantyObj.serial_numbers && Array.isArray(notesModalWarrantyObj.serial_numbers)) {
                notesModalWarrantyObj.serial_numbers.forEach(sn => {
                    // Ensure sn is treated as a string before trim, and append with [] for array
                    if (sn && String(sn).trim() !== '') {
                        formData.append('serial_numbers[]', String(sn).trim());
                    }
                });
            }
            // If notesModalWarrantyObj.serial_numbers is empty or not an array, 
            // no 'serial_numbers[]' fields will be appended, which is typically interpreted as an empty list by backends.

            if (notesModalWarrantyObj.tags && Array.isArray(notesModalWarrantyObj.tags)) {
                const tagIds = notesModalWarrantyObj.tags.map(tag => tag.id);
                formData.append('tag_ids', JSON.stringify(tagIds));
            }
            // Send empty array if no tags exist or are provided
            else {
                 formData.append('tag_ids', JSON.stringify([]));
            }
            // --- End Populate ---

            formData.append('notes', newNote); // Append the potentially empty, trimmed note

            // Add vendor/retailer to form data
            const editVendorOrRetailer = document.getElementById('editVendorOrRetailer');
            formData.append('vendor', editVendorOrRetailer ? editVendorOrRetailer.value.trim() : '');

            const response = await fetch(`/api/warranties/${notesModalWarrantyId}`, { // Added await and response handling
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                body: formData
            });

            if (!response.ok) { // Check if the API call was successful
                 const errorData = await response.json().catch(() => ({})); // Try to parse error, default to empty object
                 throw new Error(errorData.error || `Failed to update note (Status: ${response.status})`);
            }


            hideLoadingSpinner();
            showToast('Note updated', 'success');

            // Update the warranty in the global warranties array immediately
            const warrantyIndex = warranties.findIndex(w => w.id === notesModalWarrantyId);
            if (warrantyIndex !== -1) {
                warranties[warrantyIndex].notes = newNote;
            }

            // --- Updated UI logic ---
             if (newNote === '') {
                // If the note is now empty, close the modal
                document.getElementById('notesModal').classList.remove('active');
            } else {
                // If note is not empty, update the view and stay in the modal
                notesModalContent.textContent = newNote;
                notesModalContent.style.display = '';
                notesModalTextarea.style.display = 'none';
                editBtn.style.display = '';
                saveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                 // Update the local warranty object's notes
                 if (notesModalWarrantyObj) {
                    notesModalWarrantyObj.notes = newNote;
                }
            }
             // --- End Updated UI logic ---

            // Refresh warranties list and THEN update UI
            await loadWarranties(true); // Wait for data refresh
            applyFilters(); // Re-render the list with updated data

        } catch (e) {
            hideLoadingSpinner();
            console.error("Error updating note:", e); // Log the error
            showToast(e.message || 'Failed to update note', 'error'); // Show specific error if available
        }
    };
    // Cancel button handler
    cancelBtn.onclick = function() {
        notesModalContent.style.display = '';
        notesModalTextarea.style.display = 'none';
        editBtn.style.display = '';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
    };
    notesModal.classList.add('active');
}

// Utility to get currency symbol from preferences/localStorage
function getCurrencySymbol() {
    // Use the global prefix determined after auth ready
    let prefix = userPreferencePrefix; // Use let to allow default override
     if (!prefix) {
         console.warn('[getCurrencySymbol] User preference prefix not set yet, defaulting prefix to user_');
         prefix = 'user_'; // Default prefix if called too early
    }
    console.log(`[getCurrencySymbol] Using determined prefix: ${prefix}`);
    let symbol = '$'; // Default value

    const rawValue = localStorage.getItem(`${prefix}currencySymbol`);
    console.log(`[getCurrencySymbol Debug] Raw value read from localStorage key '${prefix}currencySymbol':`, rawValue);
    // +++ END ADDED LOG +++

    // --- Priority 1: Load from individual key --- (Saved by settings-new.js)
    const individualSymbol = rawValue; // Use the already read value
    if (individualSymbol) { // Check uses the already read value
        symbol = individualSymbol;
        console.log(`[getCurrencySymbol] Loaded symbol from individual key (${prefix}currencySymbol): ${symbol}`);
        return symbol;
    }

    // --- Priority 2: Load from preferences object (Legacy/Fallback) ---
    try {
        const prefsString = localStorage.getItem(`${prefix}preferences`);
        console.log(`[getCurrencySymbol] Read prefsString for ${prefix}preferences:`, prefsString);
        if (prefsString) {
            const prefs = JSON.parse(prefsString);
            if (prefs && prefs.currency_symbol) {
                symbol = prefs.currency_symbol;
                console.log(`[getCurrencySymbol] Loaded symbol from object key (${prefix}preferences): ${symbol}`);
            }
        }
    } catch (e) {
        console.error(`Error reading ${prefix}preferences from localStorage:`, e);
        // Keep the default '$' symbol in case of error parsing the object
    }

    console.log(`[getCurrencySymbol] Returning symbol (default or from object): ${symbol}`);
    return symbol;
}

// Function to get user's preferred currency code
function getCurrencyCode() {
    // Use the global prefix determined after auth ready
    let prefix = userPreferencePrefix;
    if (!prefix) {
        console.warn('[getCurrencyCode] User preference prefix not set yet, defaulting prefix to user_');
        prefix = 'user_';
    }
    console.log(`[getCurrencyCode] Using determined prefix: ${prefix}`);
    
    // Default to USD
    let currencyCode = 'USD';
    
    // Try to get currency code from localStorage
    const rawValue = localStorage.getItem(`${prefix}currencyCode`);
    console.log(`[getCurrencyCode Debug] Raw value read from localStorage key '${prefix}currencyCode':`, rawValue);
    
    if (rawValue) {
        currencyCode = rawValue;
        console.log(`[getCurrencyCode] Loaded currency code from individual key (${prefix}currencyCode): ${currencyCode}`);
        return currencyCode;
    }
    
    // Fallback: Try to derive currency code from symbol
    const symbol = getCurrencySymbol();
    const symbolToCurrencyMap = {
        '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW',
        'CHF': 'CHF', 'C$': 'CAD', 'A$': 'AUD', 'kr': 'SEK', 'zł': 'PLN', 
        'Kč': 'CZK', 'Ft': 'HUF', '₽': 'RUB', 'R$': 'BRL', '₦': 'NGN',
        '₪': 'ILS', '₺': 'TRY', '₨': 'PKR', '৳': 'BDT', '฿': 'THB',
        '₫': 'VND', 'RM': 'MYR', 'S$': 'SGD', 'Rp': 'IDR', '₱': 'PHP',
        'NT$': 'TWD', 'HK$': 'HKD', '₮': 'MNT', '₸': 'KZT', '₼': 'AZN',
        '₾': 'GEL', '₴': 'UAH', 'NZ$': 'NZD'
    };
    
    if (symbolToCurrencyMap[symbol]) {
        currencyCode = symbolToCurrencyMap[symbol];
        console.log(`[getCurrencyCode] Derived currency code from symbol '${symbol}': ${currencyCode}`);
    } else {
        console.log(`[getCurrencyCode] Could not derive currency code from symbol '${symbol}', using default: ${currencyCode}`);
    }
    
    return currencyCode;
}

// Function to load currencies from API and populate dropdowns
async function loadCurrencies() {
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
        
        // Get user's preferred currency code for default selection
        const preferredCurrencyCode = getCurrencyCode();
        
        // Populate add warranty currency dropdown
        if (currencySelect) {
            currencySelect.innerHTML = '';
            currencies.forEach(currency => {
                const option = document.createElement('option');
                option.value = currency.code;
                option.textContent = `${currency.code} - ${currency.name} (${currency.symbol})`;
                currencySelect.appendChild(option);
            });
            
            // Set default selection to user's preferred currency
            console.log(`[loadCurrencies] Preferred currency code: ${preferredCurrencyCode}`);
            console.log(`[loadCurrencies] Available currency options:`, Array.from(currencySelect.options).map(opt => opt.value));
            
            if (preferredCurrencyCode) {
                // Use setTimeout to ensure DOM is fully updated
                setTimeout(() => {
                    currencySelect.value = preferredCurrencyCode;
                    console.log(`[loadCurrencies] Set add warranty currency default to: ${preferredCurrencyCode}`);
                    console.log(`[loadCurrencies] Current selected value: ${currencySelect.value}`);
                    
                    // Trigger change event to update any dependent UI
                    const changeEvent = new Event('change', { bubbles: true });
                    currencySelect.dispatchEvent(changeEvent);
                }, 10);
            } else {
                console.log(`[loadCurrencies] No preferred currency code found, keeping default USD`);
            }
        }
        
        // Populate edit warranty currency dropdown
        if (editCurrencySelect) {
            editCurrencySelect.innerHTML = '';
            currencies.forEach(currency => {
                const option = document.createElement('option');
                option.value = currency.code;
                option.textContent = `${currency.code} - ${currency.name} (${currency.symbol})`;
                editCurrencySelect.appendChild(option);
            });
        }
        
        console.log('Currencies loaded successfully');
    } catch (error) {
        console.error('Error loading currencies:', error);
        // Fallback to USD if loading fails
        if (currencySelect) {
            currencySelect.innerHTML = '<option value="USD">USD - US Dollar ($)</option>';
        }
        if (editCurrencySelect) {
            editCurrencySelect.innerHTML = '<option value="USD">USD - US Dollar ($)</option>';
        }
    }
}

function getCurrencySymbolByCode(currencyCode) {
    const currencyMap = {
        'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥', 'INR': '₹', 'KRW': '₩',
        'CHF': 'CHF', 'CAD': 'C$', 'AUD': 'A$', 'SEK': 'kr', 'NOK': 'kr', 'DKK': 'kr',
        'PLN': 'zł', 'CZK': 'Kč', 'HUF': 'Ft', 'BGN': 'лв', 'RON': 'lei', 'HRK': 'kn',
        'RUB': '₽', 'BRL': 'R$', 'MXN': '$', 'ARS': '$', 'CLP': '$', 'COP': '$',
        'PEN': 'S/', 'VES': 'Bs', 'ZAR': 'R', 'EGP': '£', 'NGN': '₦', 'KES': 'KSh',
        'GHS': '₵', 'MAD': 'DH', 'TND': 'DT', 'AED': 'AED', 'SAR': 'SR', 'QAR': 'QR',
        'KWD': 'KD', 'BHD': 'BD', 'OMR': 'OR', 'JOD': 'JD', 'LBP': 'LL', 'ILS': '₪',
        'TRY': '₺', 'IRR': '﷼', 'PKR': '₨', 'BDT': '৳', 'LKR': 'Rs', 'NPR': 'Rs',
        'BTN': 'Nu', 'MMK': 'K', 'THB': '฿', 'VND': '₫', 'LAK': '₭', 'KHR': '៛',
        'MYR': 'RM', 'SGD': 'S$', 'IDR': 'Rp', 'PHP': '₱', 'TWD': 'NT$', 'HKD': 'HK$',
        'MOP': 'MOP', 'KPW': '₩', 'MNT': '₮', 'KZT': '₸', 'UZS': 'soʻm', 'TJS': 'SM',
        'KGS': 'с', 'TMT': 'T', 'AFN': '؋', 'AMD': '֏', 'AZN': '₼', 'GEL': '₾',
        'MDL': 'L', 'UAH': '₴', 'BYN': 'Br', 'RSD': 'дин', 'MKD': 'ден', 'ALL': 'L',
        'BAM': 'KM', 'ISK': 'kr', 'FJD': 'FJ$', 'PGK': 'K', 'SBD': 'SI$', 'TOP': 'T$',
        'VUV': 'VT', 'WST': 'WS$', 'XPF': '₣', 'NZD': 'NZ$'
    };
    return currencyMap[currencyCode] || currencyCode;
}

function getCurrencyPosition() {
    let prefix = userPreferencePrefix;
    if (!prefix) {
        console.warn('[getCurrencyPosition] User preference prefix not set yet, defaulting prefix to user_');
        prefix = 'user_';
    }
    
    let position = 'left'; // Default position
    const rawValue = localStorage.getItem(`${prefix}currencyPosition`);
    console.log(`[getCurrencyPosition] Raw value from localStorage (${prefix}currencyPosition):`, rawValue);
    
    if (rawValue) {
        position = rawValue;
        console.log(`[getCurrencyPosition] Loaded position from localStorage: ${position}`);
    } else {
        console.log(`[getCurrencyPosition] No position found, using default: ${position}`);
    }
    
    return position;
}

function formatCurrencyHTML(amount, symbol, position) {
    const formattedAmount = parseFloat(amount).toFixed(2);
    
    if (position === 'right') {
        return `<span>${formattedAmount}</span><span class="currency-symbol currency-right">${symbol}</span>`;
    } else {
        return `<span class="currency-symbol">${symbol}</span><span>${formattedAmount}</span>`;
    }
}

function updateCurrencySymbols() {
    const symbol = getCurrencySymbol();
    const position = getCurrencyPosition();
    console.log(`Updating currency symbols to: ${symbol}, position: ${position}`);
    
    // Update all currency symbols
    const elements = document.querySelectorAll('.currency-symbol');
    console.log(`Found ${elements.length} elements with class 'currency-symbol'.`);
    elements.forEach(el => {
        el.textContent = symbol;
    });
    
    // Update form currency positioning
    updateFormCurrencyPosition(symbol, position);
}

function updateFormCurrencyPosition(symbol, position) {
    // Handle add warranty form
    const addPriceWrapper = document.getElementById('addPriceInputWrapper');
    const addCurrencySymbol = document.getElementById('addCurrencySymbol');
    const addPriceInput = document.getElementById('purchasePrice');
    
    if (addPriceWrapper && addCurrencySymbol) {
        addCurrencySymbol.textContent = symbol;
        if (position === 'right') {
            addPriceWrapper.classList.add('currency-right');
            // Set up dynamic positioning for right-aligned currency
            if (addPriceInput) {
                setupDynamicCurrencyPosition(addPriceInput, addCurrencySymbol);
            }
        } else {
            addPriceWrapper.classList.remove('currency-right');
            // Reset any dynamic positioning
            if (addCurrencySymbol) {
                addCurrencySymbol.style.right = '';
            }
        }
        console.log(`Updated add form currency position: ${position}`);
    }
    
    // Handle edit warranty form
    const editPriceWrapper = document.getElementById('editPriceInputWrapper');
    const editCurrencySymbol = document.getElementById('editCurrencySymbol');
    const editPriceInput = document.getElementById('editPurchasePrice');
    
    if (editPriceWrapper && editCurrencySymbol) {
        editCurrencySymbol.textContent = symbol;
        if (position === 'right') {
            editPriceWrapper.classList.add('currency-right');
            // Set up dynamic positioning for right-aligned currency
            if (editPriceInput) {
                setupDynamicCurrencyPosition(editPriceInput, editCurrencySymbol);
            }
        } else {
            editPriceWrapper.classList.remove('currency-right');
            // Reset any dynamic positioning
            if (editCurrencySymbol) {
                editCurrencySymbol.style.right = '';
            }
        }
        console.log(`Updated edit form currency position: ${position}`);
    }
}

function setupDynamicCurrencyPosition(input, currencySymbol) {
    if (!input || !currencySymbol) return;
    
    function updatePosition() {
        const wrapper = input.closest('.price-input-wrapper');
        if (!wrapper || !wrapper.classList.contains('currency-right')) return;
        
        // Wait for elements to be fully rendered
        if (wrapper.offsetWidth === 0) {
            setTimeout(updatePosition, 50);
            return;
        }
        
        // Get the input value or placeholder
        const text = input.value || input.placeholder || '0.00';
        
        // Create a temporary element to measure text width
        const tempSpan = document.createElement('span');
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.fontSize = window.getComputedStyle(input).fontSize;
        tempSpan.style.fontFamily = window.getComputedStyle(input).fontFamily;
        tempSpan.style.fontWeight = window.getComputedStyle(input).fontWeight;
        tempSpan.style.letterSpacing = window.getComputedStyle(input).letterSpacing;
        tempSpan.textContent = text;
        
        document.body.appendChild(tempSpan);
        const textWidth = tempSpan.offsetWidth;
        document.body.removeChild(tempSpan);
        
        // Calculate position: input padding + text width + small gap
        const inputPaddingLeft = parseInt(window.getComputedStyle(input).paddingLeft) || 12;
        const gap = 4; // Small gap between text and currency symbol
        const wrapperWidth = wrapper.offsetWidth;
        const rightPosition = Math.max(8, wrapperWidth - inputPaddingLeft - textWidth - gap - 20);
        
        currencySymbol.style.right = rightPosition + 'px';
        console.log(`[Dynamic Currency] Positioned currency symbol at ${rightPosition}px from right for text: "${text}"`);
    }
    
    // Update position on various events
    input.addEventListener('input', updatePosition);
    input.addEventListener('focus', updatePosition);
    input.addEventListener('blur', updatePosition);
    
    // Initial positioning with better timing
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
        updatePosition();
        // Also set up additional fallback timers
        setTimeout(updatePosition, 100);
        setTimeout(updatePosition, 300);
    });
}

// If you want to update currency symbols live when storage changes (e.g. settings page open in another tab):
window.addEventListener('storage', function(e) {
    const prefix = getPreferenceKeyPrefix();
    // Only update if the main preferences object for the current user type changed
    if (e.key === `${prefix}preferences`) {
        console.log(`Storage event detected for ${prefix}preferences. Updating currency symbols.`);
        updateCurrencySymbols();
    }
    // Also update when currency position changes
    if (e.key === `${prefix}currencyPosition`) {
        console.log(`Storage event detected for ${prefix}currencyPosition. Re-rendering warranties to update currency position.`);
        // Update forms immediately
        const symbol = getCurrencySymbol();
        const position = getCurrencyPosition();
        updateFormCurrencyPosition(symbol, position);
        // Re-render warranties to apply new currency position
        if (typeof processAllWarranties === 'function') {
            processAllWarranties();
        }
    }
});

// +++ NEW FUNCTION TO LOAD PREFS AND SAVE TO LOCALSTORAGE +++
async function loadAndApplyUserPreferences(isAuthenticated) { // Added isAuthenticated parameter
    // Use the global prefix determined after auth ready
    let prefix = userPreferencePrefix; // <<< CHANGED const to let
    if (!prefix) {
         console.error('[Prefs Loader] Cannot load preferences: User preference prefix not set yet. Defaulting to user_');
         // Setting a default might be risky if the user *is* admin but prefix wasn't set in time.
         // Consider how authStateReady ensures prefix is set before this runs.
         // For now, let's try defaulting, but this might need review.
         prefix = 'user_'; 
    }
    console.log(`[Prefs Loader] Attempting to load preferences using prefix: ${prefix}, isAuthenticated: ${isAuthenticated}`);
    
    if (isAuthenticated && window.auth) { // Use passed isAuthenticated and check if window.auth exists
        const token = window.auth.getToken(); // Still need token for the API call
        if (!token) {
            console.error('[Prefs Loader] Cannot load preferences: No auth token found, even though isAuthenticated was true.');
            return; // Exit if no token
        }
        
        try {
            console.log('[Prefs Loader] Fetching /api/auth/preferences with token.');
            const response = await fetch('/api/auth/preferences', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const apiPrefs = await response.json();
                console.log('[Prefs Loader] Preferences loaded from API:', apiPrefs);

                // Save relevant prefs to localStorage
                if (apiPrefs.currency_symbol) {
                    localStorage.setItem(`${prefix}currencySymbol`, apiPrefs.currency_symbol);
                    console.log(`[Prefs Loader] Saved ${prefix}currencySymbol: ${apiPrefs.currency_symbol}`);
                }
                if (apiPrefs.currency_position) {
                    localStorage.setItem(`${prefix}currencyPosition`, apiPrefs.currency_position);
                    console.log(`[Prefs Loader] Saved ${prefix}currencyPosition: ${apiPrefs.currency_position}`);
                }
                if (apiPrefs.default_view) {
                    localStorage.setItem(`${prefix}defaultView`, apiPrefs.default_view);
                     console.log(`[Prefs Loader] Saved ${prefix}defaultView: ${apiPrefs.default_view}`);
                }
                // Apply theme from API and sync to localStorage
                if (apiPrefs.theme) {
                    const isDark = apiPrefs.theme === 'dark';
                    // Apply without triggering API save to avoid loops
                    await saveThemePreference(isDark, false);
                    console.log(`[Prefs Loader] Applied theme from API: ${apiPrefs.theme}`);
                }
                // Save filter preferences from API to localStorage
                if (apiPrefs.saved_filters) {
                    localStorage.setItem(`${prefix}warrantyFilters`, JSON.stringify(apiPrefs.saved_filters));
                    console.log(`[Prefs Loader] Saved ${prefix}warrantyFilters:`, apiPrefs.saved_filters);
                }
                if (apiPrefs.expiring_soon_days !== undefined) {
                    localStorage.setItem(`${prefix}expiringSoonDays`, apiPrefs.expiring_soon_days);
                    // Also update the global variable used by processWarrantyData
                    expiringSoonDays = apiPrefs.expiring_soon_days;
                    console.log(`[Prefs Loader] Saved ${prefix}expiringSoonDays: ${apiPrefs.expiring_soon_days}`);
                    console.log(`[Prefs Loader] Updated global expiringSoonDays variable to: ${expiringSoonDays}`);
                }
                if (apiPrefs.date_format) {
                    localStorage.setItem('dateFormat', apiPrefs.date_format);
                    console.log(`[Prefs Loader] Saved dateFormat: ${apiPrefs.date_format}`);
                }
                
                // Optionally trigger immediate UI updates if needed, although renderWarranties will use these new values
                // updateCurrencySymbols(); 

            } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn(`[Prefs Loader] Failed to load preferences from API: ${response.status}`, errorData.message || '');
                // Set defaults in localStorage maybe?
                if (!localStorage.getItem('dateFormat')) localStorage.setItem('dateFormat', 'MDY');
                if (!localStorage.getItem(`${prefix}currencySymbol`)) localStorage.setItem(`${prefix}currencySymbol`, '$');
                // etc.
            }
        } catch (error) {
            console.error('[Prefs Loader] Error fetching/applying preferences from API:', error);
            // Set defaults in localStorage on error?
            if (!localStorage.getItem('dateFormat')) localStorage.setItem('dateFormat', 'MDY');
            if (!localStorage.getItem(`${prefix}currencySymbol`)) localStorage.setItem(`${prefix}currencySymbol`, '$');
            // etc.
        }
    } else {
        console.warn('[Prefs Loader] Cannot load preferences: User not authenticated or auth module not available.');
        // Apply defaults if not authenticated?
         if (!localStorage.getItem('dateFormat')) localStorage.setItem('dateFormat', 'MDY');
         if (!localStorage.getItem(`${prefix}currencySymbol`)) localStorage.setItem(`${prefix}currencySymbol`, '$');
         // etc.
    }
}
// +++ END NEW FUNCTION +++

// Warranty method change handlers
function handleWarrantyMethodChange() {
    console.log('[DEBUG] handleWarrantyMethodChange called');
    const isLifetime = isLifetimeCheckbox && isLifetimeCheckbox.checked;
    const isDurationMethod = durationMethodRadio && durationMethodRadio.checked;
    
    console.log('[DEBUG] isLifetime:', isLifetime, 'isDurationMethod:', isDurationMethod);
    console.log('[DEBUG] Elements found:', {
        warrantyDurationFields: !!warrantyDurationFields,
        exactExpirationField: !!exactExpirationField,
        exactExpirationDateInput: !!exactExpirationDateInput
    });
    
    if (isLifetime) {
        // Hide both methods when lifetime is selected
        console.log('[DEBUG] Lifetime selected, hiding both methods');
        if (warrantyDurationFields) warrantyDurationFields.style.display = 'none';
        if (exactExpirationField) exactExpirationField.style.display = 'none';
        return;
    }
    
    if (isDurationMethod) {
        console.log('[DEBUG] Duration method selected');
        if (warrantyDurationFields) warrantyDurationFields.style.display = 'block';
        if (exactExpirationField) exactExpirationField.style.display = 'none';
        // Clear exact date when switching to duration
        if (exactExpirationDateInput) exactExpirationDateInput.value = '';
    } else {
        console.log('[DEBUG] Exact date method selected');
        if (warrantyDurationFields) warrantyDurationFields.style.display = 'none';
        if (exactExpirationField) exactExpirationField.style.display = 'block';
        // Clear duration fields when switching to exact date
        if (warrantyDurationYearsInput) warrantyDurationYearsInput.value = '';
        if (warrantyDurationMonthsInput) warrantyDurationMonthsInput.value = '';
        if (warrantyDurationDaysInput) warrantyDurationDaysInput.value = '';
    }
}

function handleEditWarrantyMethodChange() {
    console.log('[DEBUG] handleEditWarrantyMethodChange called');
    const isLifetime = editIsLifetimeCheckbox && editIsLifetimeCheckbox.checked;
    const isDurationMethod = editDurationMethodRadio && editDurationMethodRadio.checked;
    
    console.log('[DEBUG Edit] isLifetime:', isLifetime, 'isDurationMethod:', isDurationMethod);
    console.log('[DEBUG Edit] Radio button states:', {
        editDurationMethodRadio: editDurationMethodRadio ? editDurationMethodRadio.checked : 'element not found',
        editExactDateMethodRadio: editExactDateMethodRadio ? editExactDateMethodRadio.checked : 'element not found'
    });
    console.log('[DEBUG Edit] Elements found:', {
        editWarrantyDurationFields: !!editWarrantyDurationFields,
        editExactExpirationField: !!editExactExpirationField,
        editExactExpirationDateInput: !!editExactExpirationDateInput
    });
    
    if (isLifetime) {
        // Hide both methods when lifetime is selected
        console.log('[DEBUG Edit] Lifetime selected, hiding both methods');
        if (editWarrantyDurationFields) editWarrantyDurationFields.style.display = 'none';
        if (editExactExpirationField) editExactExpirationField.style.display = 'none';
        return;
    }
    
    if (isDurationMethod) {
        console.log('[DEBUG Edit] Duration method selected');
        if (editWarrantyDurationFields) {
            editWarrantyDurationFields.style.display = 'block';
            console.log('[DEBUG Edit] Set duration fields to block');
        }
        if (editExactExpirationField) {
            editExactExpirationField.style.display = 'none';
            console.log('[DEBUG Edit] Set exact date field to none');
        }
        // Clear exact date when switching to duration
        if (editExactExpirationDateInput) editExactExpirationDateInput.value = '';
    } else {
        console.log('[DEBUG Edit] Exact date method selected');
        if (editWarrantyDurationFields) {
            editWarrantyDurationFields.style.display = 'none';
            console.log('[DEBUG Edit] Set duration fields to none');
        }
        if (editExactExpirationField) {
            editExactExpirationField.style.display = 'block';
            console.log('[DEBUG Edit] Set exact date field to block');
        }
        // Clear duration fields when switching to exact date
        if (editWarrantyDurationYearsInput) editWarrantyDurationYearsInput.value = '';
        if (editWarrantyDurationMonthsInput) editWarrantyDurationMonthsInput.value = '';
        if (editWarrantyDurationDaysInput) editWarrantyDurationDaysInput.value = '';
    }
}

// Function to calculate duration between two dates
function calculateDurationFromDates(startDate, endDate) {
    if (!startDate || !endDate) return null;
    
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
        
        let years = end.getFullYear() - start.getFullYear();
        let months = end.getMonth() - start.getMonth();
        let days = end.getDate() - start.getDate();
        
        // Adjust for negative days
        if (days < 0) {
            months--;
            const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
            days += prevMonth.getDate();
        }
        
        // Adjust for negative months
        if (months < 0) {
            years--;
            months += 12;
        }
        
        return { years, months, days };
    } catch (error) {
        console.error('Error calculating duration:', error);
        return null;
    }
}

/**
 * Load secure images with authentication
 */
async function loadSecureImages() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.log('[DEBUG] No auth token available for secure image loading');
        return;
    }

    // Also find images that may already have src but need to be refreshed
    const secureImages = document.querySelectorAll('img.secure-image[data-secure-src]');
    console.log(`[DEBUG] Found ${secureImages.length} secure images to load/refresh`);

    for (const img of secureImages) {
        try {
            const secureUrl = img.getAttribute('data-secure-src');
            console.log(`[DEBUG] Loading secure image: ${secureUrl}`);
            
            // Clean up existing blob URL if present
            const existingBlobUrl = img.getAttribute('data-blob-url');
            if (existingBlobUrl) {
                URL.revokeObjectURL(existingBlobUrl);
                img.removeAttribute('data-blob-url');
            }
            
            const response = await fetch(secureUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                img.src = blobUrl;
                
                // Clean up blob URL when image is removed from DOM
                img.addEventListener('load', () => {
                    console.log(`[DEBUG] Secure image loaded successfully: ${secureUrl}`);
                }, { once: true });
                
                // Store blob URL for cleanup
                img.setAttribute('data-blob-url', blobUrl);
            } else {
                console.error(`[DEBUG] Failed to load secure image: ${secureUrl}, status: ${response.status}`);
                img.style.display = 'none';
            }
        } catch (error) {
            console.error(`[DEBUG] Error loading secure image:`, error);
            img.style.display = 'none';
        }
    }
}

// ============================================================================
// Paperless-ngx Integration Functions
// ============================================================================

// Global variable to store Paperless-ngx enabled state
let paperlessNgxEnabled = false;

/**
 * Check if Paperless-ngx integration is enabled
 */
async function checkPaperlessNgxStatus() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return false;

        const response = await fetch('/api/admin/settings', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const settings = await response.json();
            paperlessNgxEnabled = settings.paperless_enabled === 'true';
            window.paperlessNgxEnabled = paperlessNgxEnabled; // Set global variable
            console.log('[Paperless-ngx] Integration status:', paperlessNgxEnabled);
            return paperlessNgxEnabled;
        }
    } catch (error) {
        console.error('[Paperless-ngx] Error checking status:', error);
    }
    return false;
}

/**
 * Initialize Paperless-ngx integration UI
 */
async function initPaperlessNgxIntegration() {
    // Check if Paperless-ngx is enabled
    const isEnabled = await checkPaperlessNgxStatus();
    
    if (isEnabled) {
        // Show the info alert
        const infoAlert = document.getElementById('paperlessInfoAlert');
        if (infoAlert) {
            infoAlert.style.display = 'block';
        }
        
        // Show storage selection options for add modal (only invoice and manual)
        const storageSelections = [
            'invoiceStorageSelection',
            'manualStorageSelection'
        ];
        
        storageSelections.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'block';
            }
        });
        
        // Show storage selection options for edit modal (only invoice and manual)
        const editStorageSelections = [
            'editInvoiceStorageSelection',
            'editManualStorageSelection'
        ];
        
        editStorageSelections.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'block';
            }
        });
        
        // Show Paperless browse sections
        console.log('[Paperless-ngx] Calling togglePaperlessBrowseSections...');
        togglePaperlessBrowseSections();
        
        console.log('[Paperless-ngx] UI elements initialized and shown');
    } else {
        console.log('[Paperless-ngx] Integration disabled, hiding UI elements');
        
        // Hide Paperless browse sections
        console.log('[Paperless-ngx] Calling togglePaperlessBrowseSections (disabled)...');
        togglePaperlessBrowseSections();
    }
}

/**
 * Get selected storage option for a document type
 * @param {string} documentType - The document type (productPhoto, invoice, manual, otherDocument)
 * @param {boolean} isEdit - Whether this is for the edit modal
 * @returns {string} - 'local' or 'paperless'
 */
function getStorageOption(documentType, isEdit = false) {
    // Only allow Paperless-ngx storage for invoices and manuals
    const paperlessAllowedTypes = ['invoice', 'manual'];
    
    if (!paperlessAllowedTypes.includes(documentType)) {
        return 'local'; // Force local storage for productPhoto and otherDocument
    }
    
    const prefix = isEdit ? 'edit' : '';
    const capitalizedType = documentType.charAt(0).toUpperCase() + documentType.slice(1);
    const name = `${prefix}${capitalizedType}Storage`;
    const radio = document.querySelector(`input[name="${name}"]:checked`);
    return radio ? radio.value : 'local';
}

/**
 * Upload file to Paperless-ngx
 * @param {File} file - The file to upload
 * @param {string} documentType - The type of document for tagging
 * @returns {Promise<Object>} - Upload result with document ID
 */
async function uploadToPaperlessNgx(file, documentType) {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            throw new Error('Authentication token not available');
        }

        // Show upload loading screen
        showPaperlessUploadLoading(documentType);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('document_type', documentType);
        formData.append('title', `Warracker ${documentType} - ${file.name}`);
        
        // Add tags for organization
        const tags = ['warracker', documentType];
        formData.append('tags', tags.join(','));
        
        console.log('[Paperless-ngx] Upload FormData contents:');
        console.log('  - file:', file.name, '(' + file.size + ' bytes, ' + file.type + ')');
        console.log('  - document_type:', documentType);
        console.log('  - title:', `Warracker ${documentType} - ${file.name}`);
        console.log('  - tags:', tags.join(','));

        updatePaperlessUploadStatus('Uploading file to Paperless-ngx...');

        const response = await fetch('/api/paperless/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            let errorMessage = 'Failed to upload to Paperless-ngx';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
                console.error('[Paperless-ngx] Server error details:', errorData);
            } catch (parseError) {
                console.error('[Paperless-ngx] Could not parse error response:', parseError);
                errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
            hidePaperlessUploadLoading();
            throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log('[Paperless-ngx] Upload successful:', result);
        
        // Update status based on result
        if (result.document_id) {
            updatePaperlessUploadStatus('Document uploaded and ready!');
        } else {
            updatePaperlessUploadStatus('Document uploaded, processing...', true);
        }
        
        return {
            success: true,
            document_id: result.document_id,
            message: result.message,
            error: result.error  // Add this
        };
        
    } catch (error) {
        console.error('[Paperless-ngx] Upload error:', error);
        hidePaperlessUploadLoading();
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Handle warranty form submission with Paperless-ngx integration
 * This extends the existing saveWarranty function
 */
async function processPaperlessNgxUploads(formData) {
    if (!paperlessNgxEnabled) {
        return {}; // Return empty object if not enabled
    }

    const uploads = {};
    // Only process invoice and manual for Paperless-ngx uploads
    const documentTypes = ['invoice', 'manual'];
    
    for (const docType of documentTypes) {
        // Use storage option from formData, not DOM
        const storageKey = docType + 'Storage';
        const storageOption = formData.get(storageKey) || 'local';
        const fileInput = document.getElementById(docType);
        const file = fileInput?.files[0];
        console.log(`[DEBUG][processPaperlessNgxUploads] docType:`, docType, '| storageOption (from formData):', storageOption, '| file:', file);
        if (storageOption === 'paperless') {
            if (file) {
                console.log(`[Paperless-ngx] Uploading ${docType} to Paperless-ngx`);
                // Upload to Paperless-ngx
                const uploadResult = await uploadToPaperlessNgx(file, docType);
                console.log(`[DEBUG][processPaperlessNgxUploads] uploadResult for ${docType}:`, uploadResult);
                if (uploadResult.success || (uploadResult.error && uploadResult.error.includes("duplicate") && uploadResult.document_id)) {
                    // Map frontend document types to database column names
                    const fieldMapping = {
                        'productPhoto': 'paperless_photo_id',
                        'invoice': 'paperless_invoice_id', 
                        'manual': 'paperless_manual_id',
                        'otherDocument': 'paperless_other_id'
                    };
                    const dbField = fieldMapping[docType];
                    if (dbField && uploadResult.document_id) {
                        uploads[dbField] = uploadResult.document_id;
                        console.log(`[Paperless-ngx] ${docType} uploaded/linked successfully, ID: ${uploadResult.document_id}, stored as: ${dbField}`);
                        // Hide loading screen immediately for direct uploads
                        hidePaperlessUploadLoading();
                        if (uploadResult.error && uploadResult.error.includes("duplicate")) {
                            showToast("Duplicate document detected in Paperless-ngx. Linked to existing document.", 'info');
                        }
                    } else if (dbField && !uploadResult.document_id) {
                        console.log(`[Paperless-ngx] ${docType} uploaded successfully but no document ID received (async processing). Not storing reference.`);
                        // Don't hide loading screen yet - auto-link will handle it
                        updatePaperlessUploadStatus('Document processing, searching for link...', true);
                    }
                    // ALWAYS remove the file from FormData since it's been uploaded to Paperless-ngx
                    // This prevents the backend from also saving it locally
                    if (formData.has(docType)) {
                        formData.delete(docType);
                        console.log(`[Paperless-ngx] Removed ${docType} from FormData to prevent local storage`);
                    }
                } else {
                    console.error(`[Paperless-ngx] Failed to upload ${docType} to Paperless-ngx:`, uploadResult.error);
                    throw new Error(`Failed to upload ${docType} to Paperless-ngx: ${uploadResult.error}`);
                }
            } else {
                console.log(`[DEBUG][processPaperlessNgxUploads] No file found for ${docType} with paperless storage option.`);
            }
        } else {
            console.log(`[DEBUG][processPaperlessNgxUploads] Skipping ${docType}, storageOption is not paperless.`);
        }
    }
    
    return uploads;
}

/**
 * Handle warranty edit form submission with Paperless-ngx integration
 * This extends the existing edit warranty functionality
 */
async function processEditPaperlessNgxUploads(formData) {
    if (!paperlessNgxEnabled) {
        return {}; // Return empty object if not enabled
    }

    const uploads = {};
    // Only process invoice and manual for Paperless-ngx uploads
    const documentTypes = ['invoice', 'manual'];
    
    for (const docType of documentTypes) {
        const storageOption = getStorageOption(docType, true); // true for edit modal
        
        if (storageOption === 'paperless') {
            const fileInput = document.getElementById(`edit${docType.charAt(0).toUpperCase() + docType.slice(1)}`);
            const file = fileInput?.files[0];
            
            if (file) {
                console.log(`[Paperless-ngx] Uploading ${docType} to Paperless-ngx (edit mode)`);
                
                // Upload to Paperless-ngx
                const uploadResult = await uploadToPaperlessNgx(file, docType);
                
                if (uploadResult.success || (uploadResult.error && uploadResult.error.includes("duplicate") && uploadResult.document_id)) {
                    // Map frontend document types to database column names
                    const fieldMapping = {
                        'productPhoto': 'paperless_photo_id',
                        'invoice': 'paperless_invoice_id', 
                        'manual': 'paperless_manual_id',
                        'otherDocument': 'paperless_other_id'
                    };
                    
                    const dbField = fieldMapping[docType];
                    if (dbField && uploadResult.document_id) {
                        uploads[dbField] = uploadResult.document_id;
                        console.log(`[Paperless-ngx] ${docType} uploaded/linked successfully (edit), ID: ${uploadResult.document_id}, stored as: ${dbField}`);
                        // Hide loading screen immediately for direct uploads
                        hidePaperlessUploadLoading();
                        if (uploadResult.error && uploadResult.error.includes("duplicate")) {
                            showToast("Duplicate document detected in Paperless-ngx. Linked to existing document.", 'info');
                        }
                    } else if (dbField && !uploadResult.document_id) {
                        console.log(`[Paperless-ngx] ${docType} uploaded successfully (edit) but no document ID received (async processing). Not storing reference.`);
                        // Don't hide loading screen yet - auto-link will handle it
                        updatePaperlessUploadStatus('Document processing, searching for link...', true);
                    }
                    
                    // ALWAYS remove the file from FormData since it's been uploaded to Paperless-ngx
                    // This prevents the backend from also saving it locally
                    // Note: In edit mode, the form field names don't have 'edit' prefix in FormData
                    if (formData.has(docType)) {
                        formData.delete(docType);
                        console.log(`[Paperless-ngx] Removed ${docType} from FormData to prevent local storage`);
                    }
                } else {
                    throw new Error(`Failed to upload ${docType} to Paperless-ngx: ${uploadResult.error}`);
                }
            }
        }
    }
    
    return uploads;
}

// Initialize Paperless-ngx integration when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Initialize after a short delay to ensure other components are loaded
    setTimeout(() => {
        initPaperlessNgxIntegration();
    }, 1000);
});

/**
 * Debug Paperless-ngx configuration
 */
async function debugPaperlessConfiguration() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.error('[Paperless Debug] No auth token found');
            return null;
        }

        console.log('[Paperless Debug] Checking configuration...');
        
        const response = await fetch('/api/paperless/debug', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('[Paperless Debug] Debug endpoint failed:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('[Paperless Debug] Error response:', errorText);
            return null;
        }

        const result = await response.json();
        console.log('[Paperless Debug] Configuration:', result);
        
        return result;
    } catch (error) {
        console.error('[Paperless Debug] Error:', error);
        return null;
    }
}

/**
 * Open a Paperless-ngx document either in Warracker interface or in Paperless-ngx directly
 */
async function openPaperlessDocument(paperlessId, warrantyContext = null) {
    console.log(`[openPaperlessDocument] Opening Paperless document: ${paperlessId}`, warrantyContext);
    
    // First, debug the Paperless configuration
    const debugInfo = await debugPaperlessConfiguration();
    if (debugInfo) {
        console.log('[openPaperlessDocument] Debug info:', debugInfo);
        
        if (!debugInfo.paperless_enabled || debugInfo.paperless_enabled === 'false') {
            showToast('Paperless-ngx integration is not enabled', 'error');
            return;
        }
        
        if (!debugInfo.paperless_handler_available) {
            showToast('Paperless-ngx is not properly configured. Please check the settings.', 'error');
            console.error('[openPaperlessDocument] Paperless handler not available');
            if (debugInfo.paperless_handler_error) {
                console.error('[openPaperlessDocument] Handler error:', debugInfo.paperless_handler_error);
            }
            return;
        }
        
        if (debugInfo.test_connection_result && !debugInfo.test_connection_result.success) {
            showToast(`Paperless-ngx connection failed: ${debugInfo.test_connection_result.message || debugInfo.test_connection_result.error}`, 'error');
            return;
        }
    }
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.error('[openPaperlessDocument] No auth token available');
        showToast('Authentication required', 'error');
        return;
    }
    
    // Check user preference for viewing documents, considering Global View context
    const viewInApp = await getUserPaperlessViewPreference(warrantyContext);
    console.log(`[openPaperlessDocument] User preference view in app: ${viewInApp}`);
    
    if (viewInApp) {
        // Open document in Warracker interface
        console.log(`[openPaperlessDocument] Opening document ${paperlessId} in Warracker interface`);
        const documentUrl = `/api/paperless-file/${paperlessId}?token=${encodeURIComponent(token)}`;
        
        const newTab = window.open(documentUrl, '_blank');
        if (!newTab) {
            showToast('Please allow popups to view documents', 'warning');
        } else {
            showToast('Opening document in Warracker...', 'info');
        }
        return;
    }
    
    // Default behavior: open in Paperless-ngx interface
    try {
        // Get the Paperless-ngx base URL
        const response = await fetch('/api/paperless/url', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[openPaperlessDocument] URL endpoint failed:', response.status, errorText);
            throw new Error(`Failed to get Paperless-ngx URL: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to get Paperless-ngx URL');
        }
        
        // Construct the direct link to the document in Paperless-ngx
        const paperlessUrl = result.url.replace(/\/$/, ''); // Remove trailing slash
        const documentUrl = `${paperlessUrl}/documents/${paperlessId}/details`;
        
        console.log(`[openPaperlessDocument] Opening Paperless-ngx document at: ${documentUrl}`);
        
        // Open the document directly in Paperless-ngx interface
        const newTab = window.open(documentUrl, '_blank');
        if (!newTab) {
            showToast('Please allow popups to view documents in Paperless-ngx', 'warning');
        } else {
            showToast('Opening document in Paperless-ngx...', 'info');
        }
        
    } catch (error) {
        console.error('Error opening Paperless document:', error);
        showToast(`Error opening document: ${error.message}`, 'error');
        
        // Try to determine the base URL from debug info for fallback
        if (debugInfo && debugInfo.paperless_url) {
            const fallbackUrl = `${debugInfo.paperless_url.replace(/\/$/, '')}/documents/${paperlessId}/details`;
            console.log(`[openPaperlessDocument] Trying fallback URL: ${fallbackUrl}`);
            
            const fallbackTab = window.open(fallbackUrl, '_blank');
            if (fallbackTab) {
                showToast('Opened with fallback URL - please check if Paperless-ngx is accessible', 'warning');
            }
        } else {
            // Last resort fallback
            const genericFallbackUrl = `${window.location.protocol}//${window.location.hostname}:8000/documents/${paperlessId}/details`;
            console.log(`[openPaperlessDocument] Trying generic fallback URL: ${genericFallbackUrl}`);
            
            const genericTab = window.open(genericFallbackUrl, '_blank');
            if (genericTab) {
                showToast('Opened with generic fallback URL', 'warning');
            }
        }
    }
}

/**
 * Get user preference for viewing Paperless documents in app
 */
async function getUserPaperlessViewPreference(warrantyContext = null) {
    // Special handling for Global View: default to view in app for other users' documents
    if (warrantyContext && isGlobalView) {
        const currentUserId = (() => {
            try {
                const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                return userInfo.id;
            } catch (e) {
                return null;
            }
        })();
        
        // If viewing another user's document in Global View, default to view in app
        if (currentUserId && warrantyContext.user_id && warrantyContext.user_id !== currentUserId) {
            console.log(`[getUserPaperlessViewPreference] Global View: Defaulting to view in app for other user's document (warranty user: ${warrantyContext.user_id}, current user: ${currentUserId})`);
            return true;
        }
    }
    
    // First check localStorage
    const prefix = getPreferenceKeyPrefix();
    const localPreference = localStorage.getItem(`${prefix}paperlessViewInApp`);
    if (localPreference !== null) {
        return localPreference === 'true';
    }
    
    // If not in localStorage, check API
    if (window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated()) {
        try {
            const response = await fetch('/api/auth/preferences', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${window.auth.getToken()}`
                }
            });
            if (response.ok) {
                const prefs = await response.json();
                return prefs.paperless_view_in_app || false;
            }
        } catch (e) {
            console.warn('Failed to load preferences from API:', e);
        }
    }
    
    // Default to false (open in Paperless-ngx)
    return false;
}

/**
 * Debug function to test Paperless document status
 */
async function debugPaperlessDocument(paperlessId) {
    console.log(`[debugPaperlessDocument] Debugging Paperless document: ${paperlessId}`);
    
    const token = auth.getToken();
    if (!token) {
        console.error('[debugPaperlessDocument] No auth token available');
        return;
    }
    
    try {
        const response = await fetch(`/api/paperless/debug-document/${paperlessId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[debugPaperlessDocument] HTTP ${response.status}: ${errorText}`);
            return;
        }
        
        const debugInfo = await response.json();
        console.log(`[debugPaperlessDocument] Debug info for document ${paperlessId}:`, debugInfo);
        
        // Show debug info in a more readable format
        let debugMessage = `Debug info for Paperless document ${paperlessId}:\n\n`;
        debugMessage += `Document exists: ${debugInfo.document_exists}\n`;
        debugMessage += `Database references: ${debugInfo.database_references?.length || 0}\n\n`;
        
        debugMessage += 'Endpoint test results:\n';
        for (const [endpoint, result] of Object.entries(debugInfo.endpoints_tested || {})) {
            debugMessage += `- ${endpoint}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.status_code || result.error})\n`;
        }
        
        if (debugInfo.recent_documents && Array.isArray(debugInfo.recent_documents)) {
            debugMessage += `\nDocument in recent list: ${debugInfo.document_in_recent}\n`;
            debugMessage += `Recent documents: ${debugInfo.recent_documents.map(d => `${d.id}: ${d.title}`).join(', ')}\n`;
        }
        
        alert(debugMessage);
        
    } catch (error) {
        console.error('Error debugging Paperless document:', error);
        alert(`Debug failed: ${error.message}`);
    }
}

/**
 * Clean up invalid Paperless-ngx document references
 */
async function cleanupInvalidPaperlessDocuments() {
    console.log('[cleanupInvalidPaperlessDocuments] Starting cleanup...');
    
    const token = auth.getToken();
    if (!token) {
        console.error('[cleanupInvalidPaperlessDocuments] No auth token available');
        return;
    }
    
    try {
        const response = await fetch('/api/paperless/cleanup-invalid', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[cleanupInvalidPaperlessDocuments] HTTP ${response.status}: ${errorText}`);
            return;
        }
        
        const result = await response.json();
        console.log('[cleanupInvalidPaperlessDocuments] Cleanup result:', result);
        
        // Show result to user
        let message = result.message || 'Cleanup completed';
        if (result.details) {
            message += `\n\nDetails:\n`;
            message += `- Documents checked: ${result.details.checked}\n`;
            message += `- Invalid documents found: ${result.details.invalid_found}\n`;
            message += `- References cleaned up: ${result.details.cleaned_up}\n`;
            
            if (result.details.errors && result.details.errors.length > 0) {
                message += `\nErrors:\n${result.details.errors.join('\n')}`;
            }
        }
        
        alert(message);
        
        // Reload warranties to reflect changes
        if (result.details && result.details.cleaned_up > 0) {
            console.log('[cleanupInvalidPaperlessDocuments] Reloading warranties after cleanup...');
            await loadWarranties(true);
        }
        
    } catch (error) {
        console.error('Error cleaning up Paperless documents:', error);
        alert(`Cleanup failed: ${error.message}`);
    }
}

/**
 * Search for and link a Paperless document by title
 * Used when documents were uploaded with async processing and we lost the document ID
 */
async function searchAndLinkPaperlessDocument(warrantyId, documentType, searchTitle) {
    try {
        console.log(`[Paperless-ngx] Searching for document: ${searchTitle}`);
        
        const response = await fetch('/api/paperless-search-and-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
                warranty_id: warrantyId,
                document_type: documentType,
                search_title: searchTitle
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`[Paperless-ngx] Document linked successfully: ID ${result.document_id}`);
            showToast('Document linked successfully! Refreshing...', 'success');
            
            // Reload warranties to show the updated document links
            setTimeout(async () => {
                console.log('🔄 [Search&Link] Reloading warranties to show updated document links...');
                await loadWarranties(true);  // Pass isAuthenticated parameter
                
                // Force re-render of the warranty cards
                applyFilters();
                
                // Also reload secure images to update cloud icons
                await loadSecureImages();
                
                console.log('✅ [Search&Link] Warranties reloaded and UI updated');
            }, 1000);
            
            return { success: true, document_id: result.document_id };
        } else {
            console.error(`[Paperless-ngx] Failed to link document: ${result.message}`);
            showToast(`Failed to link document: ${result.message}`, 'error');
            return { success: false, message: result.message };
        }
    } catch (error) {
        console.error(`[Paperless-ngx] Error searching for document:`, error);
        showToast('Error searching for document', 'error');
        return { success: false, message: error.message };
    }
}

/**
 * Automatically search for and link recently uploaded documents
 * This handles the case where Paperless-ngx async processing returns task_id instead of document_id
 */
async function autoLinkRecentDocuments(warrantyId, documentTypes = ['invoice', 'manual'], maxRetries = 10, retryDelay = 10000, fileInfo = {}) {
    console.log(`[Auto-Link] Starting automatic document linking for warranty ${warrantyId}`);
    
    const token = auth.getToken();
    if (!token) {
        console.error('[Auto-Link] No auth token available');
        return;
    }
    
    let attempt = 0;
    let linkedDocuments = [];
    
    const tryLinking = async () => {
        attempt++;
        console.log(`[Auto-Link] Attempt ${attempt}/${maxRetries} for warranty ${warrantyId}`);
        
        try {
            // First check if Paperless-ngx is properly configured
            const debugInfo = await debugPaperlessConfiguration();
            if (!debugInfo) {
                console.error('[Auto-Link] Could not get Paperless debug info');
                return;
            }
            
            if (!debugInfo.paperless_enabled || debugInfo.paperless_enabled === 'false') {
                console.log('[Auto-Link] Paperless-ngx integration is not enabled, skipping auto-link');
                return;
            }
            
            if (!debugInfo.paperless_handler_available) {
                console.error('[Auto-Link] Paperless handler not available:', debugInfo.paperless_handler_error || 'Unknown error');
                return;
            }
            
            if (debugInfo.test_connection_result && !debugInfo.test_connection_result.success) {
                console.error('[Auto-Link] Paperless connection test failed:', debugInfo.test_connection_result.message || debugInfo.test_connection_result.error);
                return;
            }
            
            console.log(`[Auto-Link] Using intelligent filename-based search. File info:`, fileInfo);
            
            // Strategy 1: Search by exact filename (most reliable)
            let candidateDocuments = [];
            
            for (const [docType, filename] of Object.entries(fileInfo)) {
                if (!documentTypes.includes(docType)) continue;
                
                console.log(`[Auto-Link] Searching for ${docType} with filename: "${filename}"`);
                
                // Remove file extension for searching
                const baseFilename = filename.replace(/\.[^/.]+$/, '');
                
                // Try multiple search strategies
                const searchQueries = [
                    filename,                                    // Exact filename with extension
                    baseFilename,                               // Filename without extension
                    `"${filename}"`,                            // Quoted exact match
                    `"${baseFilename}"`,                        // Quoted base filename
                    `Warracker ${docType} - ${baseFilename}`    // Warracker format
                ];
                
                for (const query of searchQueries) {
                    try {
                        console.log(`[Auto-Link] Trying search query: "${query}"`);
                        
                        const response = await fetch(`/api/paperless/search?ordering=-created&query=${encodeURIComponent(query)}`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            const docs = result.results || [];
                            
                            console.log(`[Auto-Link] Query "${query}" found ${docs.length} documents`);
                            
                            if (docs.length > 0) {
                                // Filter for recent documents (last 24 hours)
                                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                                const recentDocs = docs.filter(doc => {
                                    try {
                                        const docDate = new Date(doc.created);
                                        return docDate > oneDayAgo;
                                    } catch {
                                        return true; // Include if we can't parse the date
                                    }
                                });
                                
                                if (recentDocs.length > 0) {
                                    console.log(`[Auto-Link] Found ${recentDocs.length} recent documents for ${docType}`);
                                    candidateDocuments.push({
                                        docType,
                                        filename,
                                        documents: recentDocs,
                                        searchQuery: query
                                    });
                                    break; // Found documents, no need to try other queries for this file
                                } else if (docs.length > 0) {
                                    // If no recent docs but we found some documents, include them anyway
                                    console.log(`[Auto-Link] Found ${docs.length} older documents for ${docType}, including them anyway`);
                                    candidateDocuments.push({
                                        docType,
                                        filename,
                                        documents: docs.slice(0, 3), // Take up to 3 most recent
                                        searchQuery: query
                                    });
                                    break;
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`[Auto-Link] Error searching with query "${query}":`, error);
                    }
                }
            }
            
            // Strategy 2: Fallback to Warracker tag search if filename search fails
            if (candidateDocuments.length === 0) {
                console.log('[Auto-Link] No documents found by filename, trying Warracker tag search...');
                
                const response = await fetch('/api/paperless/search?ordering=-created&created__gte=' + 
                    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const searchResult = await response.json();
                    let recentDocs = searchResult.results || [];
                    
                    // Filter for Warracker documents
                    const warrackerDocs = recentDocs.filter(doc => 
                        doc.title && doc.title.includes('Warracker')
                    );
                    
                    console.log(`[Auto-Link] Found ${warrackerDocs.length} Warracker documents from last 2 hours`);
                    
                    // Group by document type
                    for (const docType of documentTypes) {
                        const typeDocs = warrackerDocs.filter(doc => 
                            doc.title && doc.title.includes(docType)
                        );
                        
                        if (typeDocs.length > 0) {
                            candidateDocuments.push({
                                docType,
                                filename: fileInfo[docType] || `${docType} document`,
                                documents: typeDocs,
                                searchQuery: `Warracker ${docType}`
                            });
                        }
                    }
                }
            }
            
            // Debug: Show what candidate documents we found
            if (candidateDocuments.length > 0) {
                console.log('[Auto-Link] Candidate documents found:');
                candidateDocuments.forEach(candidate => {
                    console.log(`   ${candidate.docType}: ${candidate.documents.length} documents found with query "${candidate.searchQuery}"`);
                    candidate.documents.forEach((doc, i) => {
                        console.log(`     ${i+1}. ID: ${doc.id}, Title: "${doc.title}", Created: ${doc.created}`);
                    });
                });
            }
            
            // Try to link the best candidate for each document type
            for (const candidate of candidateDocuments) {
                // Use the most recent document (first in the ordered list)
                const doc = candidate.documents[0];
                
                console.log(`[Auto-Link] Attempting to link ${candidate.docType}: ${doc.title} (ID: ${doc.id})`);
                
                try {
                    const linkResponse = await fetch('/api/paperless-search-and-link', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                        },
                        body: JSON.stringify({
                            warranty_id: warrantyId,
                            document_type: candidate.docType,
                            search_title: doc.title.replace('Warracker ' + candidate.docType + ' - ', '')
                        })
                    });
                    
                    const linkResult = await linkResponse.json();
                    
                    if (linkResult.success) {
                        console.log(`[Auto-Link] Successfully linked ${candidate.docType}: ${doc.title}`);
                        linkedDocuments.push({ 
                            type: candidate.docType, 
                            title: doc.title, 
                            id: doc.id,
                            filename: candidate.filename
                        });
                    } else {
                        console.log(`[Auto-Link] Failed to link ${candidate.docType}: ${linkResult.message}`);
                    }
                } catch (error) {
                    console.error(`[Auto-Link] Error linking ${candidate.docType}:`, error);
                }
            }
            
            // If we found and linked documents, we're done
            if (linkedDocuments.length > 0) {
                console.log(`[Auto-Link] Successfully linked ${linkedDocuments.length} documents:`, linkedDocuments);
                
                // Update loading screen to show success
                updatePaperlessUploadStatus('Documents linked successfully!');
                
                // Show success message with filenames
                const docInfo = linkedDocuments.map(d => `${d.type} (${d.filename || d.title})`).join(', ');
                showToast(`Automatically linked ${linkedDocuments.length} document(s): ${docInfo}`, 'success');
                
                // Reload warranties to show the updated document links
                setTimeout(async () => {
                    console.log('🔄 [Auto-Link] Reloading warranties to show updated document links...');
                    await loadWarranties(true);  // Pass isAuthenticated parameter
                    
                    // Force re-render of the warranty cards
                    applyFilters();
                    
                    // Also reload secure images to update cloud icons
                    await loadSecureImages();
                    
                    console.log('✅ [Auto-Link] Warranties reloaded and UI updated');
                    
                    // Hide loading screen after successful completion
                    hidePaperlessUploadLoading();
                }, 1000);
                
                return true;
            }
            
            // If no documents found and we have retries left, try again
            if (attempt < maxRetries) {
                console.log(`[Auto-Link] No documents found, retrying in ${retryDelay}ms...`);
                updatePaperlessUploadStatus(`Searching for documents (attempt ${attempt + 1}/${maxRetries})...`, true);
                setTimeout(tryLinking, retryDelay);
            } else {
                console.log(`[Auto-Link] No documents found after ${maxRetries} attempts`);
                updatePaperlessUploadStatus('Document uploaded but could not auto-link');
                showToast('Document uploaded to Paperless-ngx but could not be automatically linked. You can manually link it later.', 'warning');
                // Hide loading screen after failed auto-link
                setTimeout(() => {
                    hidePaperlessUploadLoading();
                }, 2000);
            }
            
        } catch (error) {
            console.error(`[Auto-Link] Error in attempt ${attempt}:`, error);
            
            if (attempt < maxRetries) {
                console.log(`[Auto-Link] Retrying in ${retryDelay}ms...`);
                updatePaperlessUploadStatus(`Error occurred, retrying (${attempt + 1}/${maxRetries})...`, true);
                setTimeout(tryLinking, retryDelay);
            } else {
                updatePaperlessUploadStatus('Upload completed with errors');
                showToast('Document uploaded but auto-linking failed due to errors. You can manually link it later.', 'warning');
                // Hide loading screen after final error
                setTimeout(() => {
                    hidePaperlessUploadLoading();
                }, 2000);
            }
        }
    };
    
    // Start the linking process
    tryLinking();
}

// Make debug and cleanup functions available globally for console testing
window.debugPaperlessDocument = debugPaperlessDocument;
window.cleanupInvalidPaperlessDocuments = cleanupInvalidPaperlessDocuments;
window.searchAndLinkPaperlessDocument = searchAndLinkPaperlessDocument;
window.autoLinkRecentDocuments = autoLinkRecentDocuments;

// Helper function to manually link a specific document by title
window.manualLinkDocument = async function(warrantyId, documentType, titleSearchTerm) {
    console.log(`🔗 Manually linking document for warranty ${warrantyId}`);
    console.log(`   Document type: ${documentType}`);
    console.log(`   Searching for title containing: "${titleSearchTerm}"`);
    
    const token = auth.getToken();
    if (!token) {
        console.error('❌ No auth token available');
        return;
    }
    
    try {
        // Search for documents containing the search term
        const response = await fetch(`/api/paperless/search?ordering=-created&query=${encodeURIComponent(titleSearchTerm)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error(`❌ Search failed: ${response.status}`);
            return;
        }
        
        const result = await response.json();
        const docs = result.results || [];
        
        console.log(`📄 Found ${docs.length} documents matching "${titleSearchTerm}"`);
        
        if (docs.length === 0) {
            console.log('❌ No documents found. The document might still be processing in Paperless-ngx.');
            return;
        }
        
        // Show all matching documents
        docs.forEach((doc, index) => {
            console.log(`   ${index + 1}. ID: ${doc.id}, Title: "${doc.title}", Created: ${doc.created}`);
        });
        
        // Try to link the first matching document
        const docToLink = docs[0];
        console.log(`🔗 Attempting to link document ID ${docToLink.id}: "${docToLink.title}"`);
        
        const linkResponse = await fetch('/api/paperless-search-and-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                warranty_id: warrantyId,
                document_type: documentType,
                search_title: docToLink.title.replace('Warracker ' + documentType + ' - ', '')
            })
        });
        
        const linkResult = await linkResponse.json();
        
        if (linkResult.success) {
            console.log(`✅ Successfully linked ${documentType}: ${docToLink.title}`);
            showToast(`Document linked successfully: ${documentType}`, 'success');
            
            // Reload warranties to show the updated document links
            setTimeout(async () => {
                console.log('🔄 Reloading warranties to show updated document links...');
                await loadWarranties(true);  // Pass isAuthenticated parameter
                
                // Force re-render of the warranty cards
                applyFilters();
                
                // Also reload secure images to update cloud icons
                await loadSecureImages();
                
                console.log('✅ Warranties reloaded and UI updated');
            }, 1000);
        } else {
            console.error(`❌ Failed to link ${documentType}: ${linkResult.message}`);
        }
        
        return docToLink;
        
    } catch (error) {
        console.error('❌ Error in manual linking:', error);
    }
};

// Helper function to search for documents in Paperless-ngx (debug function)
window.debugSearchPaperlessDocuments = async function(searchTerm = 'Warracker', limit = 10) {
    console.log(`🔍 Searching for documents containing: "${searchTerm}"`);
    
    const token = auth.getToken();
    if (!token) {
        console.error('❌ No auth token available');
        return;
    }
    
    try {
        const response = await fetch(`/api/paperless/search?ordering=-created&query=${encodeURIComponent(searchTerm)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error(`❌ Search failed: ${response.status}`);
            return;
        }
        
        const result = await response.json();
        const docs = result.results || [];
        
        console.log(`📄 Found ${docs.length} documents:`);
        docs.slice(0, limit).forEach((doc, index) => {
            console.log(`   ${index + 1}. ID: ${doc.id}, Title: "${doc.title}", Created: ${doc.created}`);
        });
        
        if (docs.length > limit) {
            console.log(`   ... and ${docs.length - limit} more documents`);
        }
        
        return docs;
    } catch (error) {
        console.error('❌ Error searching documents:', error);
    }
};

// Helper function for users to debug Paperless-ngx configuration
window.debugPaperlessSetup = async function() {
    console.log('🔍 Debugging Paperless-ngx setup...');
    
    const debugInfo = await debugPaperlessConfiguration();
    if (!debugInfo) {
        console.error('❌ Could not get debug information');
        return;
    }
    
    console.log('📋 Paperless-ngx Configuration:');
    console.log(`   Enabled: ${debugInfo.paperless_enabled}`);
    console.log(`   URL: ${debugInfo.paperless_url || 'Not set'}`);
    console.log(`   API Token Set: ${debugInfo.paperless_api_token_set}`);
    console.log(`   Handler Available: ${debugInfo.paperless_handler_available}`);
    
    if (debugInfo.paperless_handler_error) {
        console.error(`   Handler Error: ${debugInfo.paperless_handler_error}`);
    }
    
    if (debugInfo.test_connection_result) {
        console.log(`   Connection Test: ${debugInfo.test_connection_result.success ? '✅ Success' : '❌ Failed'}`);
        console.log(`   Message: ${debugInfo.test_connection_result.message || debugInfo.test_connection_result.error}`);
    }
    
    // Provide recommendations
    console.log('\n💡 Recommendations:');
    
    if (!debugInfo.paperless_enabled || debugInfo.paperless_enabled === 'false') {
        console.log('   - Enable Paperless-ngx integration in Settings');
    }
    
    if (!debugInfo.paperless_url) {
        console.log('   - Set Paperless-ngx URL in Settings (e.g., http://paperless:8000)');
    }
    
    if (!debugInfo.paperless_api_token_set) {
        console.log('   - Set API token in Settings (generate from Paperless-ngx → Settings → API Tokens)');
    }
    
    if (debugInfo.test_connection_result && !debugInfo.test_connection_result.success) {
        console.log('   - Check if Paperless-ngx is running and accessible');
        console.log('   - Verify URL and API token are correct');
        console.log('   - Check network connectivity between Warracker and Paperless-ngx');
    }
    
    return debugInfo;
};

// ===== PAPERLESS DOCUMENT BROWSER FUNCTIONALITY =====

// Global variables for paperless browser
let currentPaperlessDocuments = [];
let selectedPaperlessDocument = null;
let currentPaperlessPage = 1;
let totalPaperlessPages = 1;
let currentDocumentType = '';
let paperlessSearchQuery = '';

/**
 * Open the Paperless document browser modal
 * @param {string} documentType - Type of document being selected (invoice, manual, product_photo, other_document)
 */
function openPaperlessBrowser(documentType) {
    currentDocumentType = documentType;
    selectedPaperlessDocument = null;
    
    // Reset pagination state
    currentPaperlessPage = 1;
    totalPaperlessPages = 1;
    paperlessSearchQuery = '';
    
    // Show the modal
    const modal = document.getElementById('paperlessBrowserModal');
    modal.classList.add('active');
    
    // Reset search and filters
    document.getElementById('paperlessSearchInput').value = '';
    document.getElementById('paperlessTypeFilter').value = '';
    document.getElementById('paperlessTagFilter').value = '';
    
    // Load documents
    loadAllPaperlessDocuments();
    
    // Load tags for filter
    loadPaperlessTags();
    
    // Hide select button initially
    const selectBtn = document.getElementById('selectPaperlessDocBtn');
    if (selectBtn) {
        selectBtn.style.display = 'none';
    }
}

/**
 * Load all Paperless documents
 */
async function loadAllPaperlessDocuments() {
    try {
        showPaperlessLoading();
        
        const params = new URLSearchParams();
        const offset = (currentPaperlessPage - 1) * 25;
        params.append('limit', '25');
        params.append('offset', offset.toString());
        
        const response = await fetch(`/api/paperless/search?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        currentPaperlessDocuments = data.results || [];
        totalPaperlessPages = Math.ceil(data.count / 25) || 1;
        
        renderPaperlessDocuments();
        updatePaperlessPagination();
        
    } catch (error) {
        console.error('Error loading Paperless documents:', error);
        showPaperlessError('Failed to load documents from Paperless-ngx');
    }
}

/**
 * Search Paperless documents
 */
async function searchPaperlessDocuments() {
    const searchInput = document.getElementById('paperlessSearchInput');
    const typeFilter = document.getElementById('paperlessTypeFilter');
    const tagFilter = document.getElementById('paperlessTagFilter');
    
    paperlessSearchQuery = searchInput.value.trim();
    
    try {
        showPaperlessLoading();
        
        const params = new URLSearchParams();
        if (paperlessSearchQuery) {
            params.append('query', paperlessSearchQuery);
        }
        if (typeFilter.value) {
            params.append('document_type', typeFilter.value);
        }
        if (tagFilter.value) {
            params.append('tags__id__in', tagFilter.value);
        }
        
        // Add pagination
        const offset = (currentPaperlessPage - 1) * 25;
        params.append('limit', '25');
        params.append('offset', offset.toString());
        
        const response = await fetch(`/api/paperless/search?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        currentPaperlessDocuments = data.results || [];
        totalPaperlessPages = Math.ceil(data.count / 25) || 1;
        
        renderPaperlessDocuments();
        updatePaperlessPagination();
        
    } catch (error) {
        console.error('Error searching Paperless documents:', error);
        showPaperlessError('Failed to search documents');
    }
}

/**
 * Load Paperless tags for filter dropdown
 */
async function loadPaperlessTags() {
    try {
        const response = await fetch('/api/paperless/tags', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const tagFilter = document.getElementById('paperlessTagFilter');
            
            // Clear existing options except the first one
            tagFilter.innerHTML = '<option value="">All Tags</option>';
            
            // Add tag options
            if (data.results) {
                data.results.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.id;
                    option.textContent = tag.name;
                    tagFilter.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading Paperless tags:', error);
    }
}

/**
 * Render the list of Paperless documents
 */
function renderPaperlessDocuments() {
    const container = document.getElementById('paperlessDocumentsList');
    
    if (currentPaperlessDocuments.length === 0) {
        container.innerHTML = `
            <div class="no-documents-message">
                <i class="fas fa-file-alt"></i>
                <h4>No documents found</h4>
                <p>Try adjusting your search terms or filters.</p>
            </div>
        `;
        return;
    }
    
    const documentsHtml = currentPaperlessDocuments.map(doc => {
        const createdDate = new Date(doc.created).toLocaleDateString();
        const fileType = doc.mime_type || 'Unknown';
        const tags = doc.tags || [];
        
        return `
            <div class="paperless-document-item" data-id="${doc.id}" onclick="selectPaperlessDocument(${doc.id})">
                <div class="document-title">${escapeHtml(doc.title)}</div>
                <div class="document-meta">
                    <span><i class="fas fa-calendar"></i> ${createdDate}</span>
                    <span><i class="fas fa-file"></i> ${fileType}</span>
                    ${doc.correspondent ? `<span><i class="fas fa-user"></i> ${escapeHtml(doc.correspondent)}</span>` : ''}
                </div>
                ${tags.length > 0 ? `
                    <div class="document-tags">
                        ${tags.map(tag => `<span class="document-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = documentsHtml;
}

/**
 * Select a Paperless document
 * @param {number} documentId - ID of the document to select
 */
function selectPaperlessDocument(documentId) {
    // Remove previous selection
    document.querySelectorAll('.paperless-document-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selection to clicked item
    const selectedItem = document.querySelector(`[data-id="${documentId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedPaperlessDocument = currentPaperlessDocuments.find(doc => doc.id === documentId);
        
        // Show select button
        const selectBtn = document.getElementById('selectPaperlessDocBtn');
        selectBtn.style.display = 'inline-block';
        selectBtn.onclick = () => confirmPaperlessSelection();
    }
}

/**
 * Confirm the selection of a Paperless document
 */
function confirmPaperlessSelection() {
    if (!selectedPaperlessDocument) return;
    
    // Update the UI to show the selected document
    updatePaperlessSelectionUI();
    
    // Close the modal
    closePaperlessBrowser();
}

/**
 * Update the UI to show the selected Paperless document
 */
function updatePaperlessSelectionUI() {
    if (!selectedPaperlessDocument || !currentDocumentType) return;
    
    const docName = selectedPaperlessDocument.title;
    const docId = selectedPaperlessDocument.id;
    
    // Map document types to their UI elements (only for invoice and manual)
    const typeMapping = {
        'invoice': {
            selectedDiv: 'selectedInvoiceFromPaperless',
            hiddenInput: 'selectedPaperlessInvoice'
        },
        'manual': {
            selectedDiv: 'selectedManualFromPaperless',
            hiddenInput: 'selectedPaperlessManual'
        },
        // Edit modal versions
        'edit_invoice': {
            selectedDiv: 'selectedEditInvoiceFromPaperless',
            hiddenInput: 'selectedEditPaperlessInvoice'
        },
        'edit_manual': {
            selectedDiv: 'selectedEditManualFromPaperless',
            hiddenInput: 'selectedEditPaperlessManual'
        }
    };
    
    const mapping = typeMapping[currentDocumentType];
    if (!mapping) return;
    
    // Show the selected document
    const selectedDiv = document.getElementById(mapping.selectedDiv);
    if (selectedDiv) {
        selectedDiv.style.display = 'flex';
        selectedDiv.querySelector('.selected-doc-name').textContent = docName;
    }
    
    // Create or update hidden input to store the document ID
    let hiddenInput = document.getElementById(mapping.hiddenInput);
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = mapping.hiddenInput;
        hiddenInput.name = mapping.hiddenInput;
        document.body.appendChild(hiddenInput);
    }
    hiddenInput.value = docId;
}

/**
 * Clear the Paperless document selection
 * @param {string} documentType - Type of document to clear
 */
function clearPaperlessSelection(documentType) {
    const typeMapping = {
        'invoice': {
            selectedDiv: 'selectedInvoiceFromPaperless',
            hiddenInput: 'selectedPaperlessInvoice'
        },
        'manual': {
            selectedDiv: 'selectedManualFromPaperless',
            hiddenInput: 'selectedPaperlessManual'
        },
        // Edit modal versions
        'edit_invoice': {
            selectedDiv: 'selectedEditInvoiceFromPaperless',
            hiddenInput: 'selectedEditPaperlessInvoice'
        },
        'edit_manual': {
            selectedDiv: 'selectedEditManualFromPaperless',
            hiddenInput: 'selectedEditPaperlessManual'
        }
    };
    
    const mapping = typeMapping[documentType];
    if (!mapping) return;
    
    // Hide the selected document display
    const selectedDiv = document.getElementById(mapping.selectedDiv);
    if (selectedDiv) {
        selectedDiv.style.display = 'none';
    }
    
    // Clear the hidden input
    const hiddenInput = document.getElementById(mapping.hiddenInput);
    if (hiddenInput) {
        hiddenInput.value = '';
    }
}

/**
 * Close the Paperless browser modal
 */
function closePaperlessBrowser() {
    const modal = document.getElementById('paperlessBrowserModal');
    modal.classList.remove('active');
    
    // Reset state
    selectedPaperlessDocument = null;
    currentDocumentType = '';
    
    // Hide select button
    const selectBtn = document.getElementById('selectPaperlessDocBtn');
    selectBtn.style.display = 'none';
}

/**
 * Change page in Paperless document browser
 * @param {number} direction - Direction to change page (-1 for previous, 1 for next)
 */
function changePage(direction) {
    const newPage = currentPaperlessPage + direction;
    if (newPage < 1 || newPage > totalPaperlessPages) return;
    
    currentPaperlessPage = newPage;
    
    // Check if we have any active filters
    const searchInput = document.getElementById('paperlessSearchInput');
    const typeFilter = document.getElementById('paperlessTypeFilter');
    const tagFilter = document.getElementById('paperlessTagFilter');
    
    const hasFilters = (searchInput && searchInput.value.trim()) || 
                      (typeFilter && typeFilter.value) || 
                      (tagFilter && tagFilter.value);
    
    if (hasFilters) {
        searchPaperlessDocuments();
    } else {
        loadAllPaperlessDocuments();
    }
}

/**
 * Update pagination controls
 */
function updatePaperlessPagination() {
    const paginationDiv = document.getElementById('paperlessPagination');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    
    if (totalPaperlessPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }
    
    paginationDiv.style.display = 'flex';
    prevBtn.disabled = currentPaperlessPage <= 1;
    nextBtn.disabled = currentPaperlessPage >= totalPaperlessPages;
    pageInfo.textContent = `Page ${currentPaperlessPage} of ${totalPaperlessPages}`;
}

/**
 * Show loading state in Paperless browser
 */
function showPaperlessLoading() {
    const container = document.getElementById('paperlessDocumentsList');
    container.innerHTML = `
        <div class="loading-message" style="text-align: center; padding: 40px;">
            <i class="fas fa-spinner fa-spin"></i> Loading documents...
        </div>
    `;
}

/**
 * Show error message in Paperless browser
 * @param {string} message - Error message to display
 */
function showPaperlessError(message) {
    const container = document.getElementById('paperlessDocumentsList');
    container.innerHTML = `
        <div class="no-documents-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>Error</h4>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

/**
 * Show/hide Paperless browse sections based on Paperless-ngx availability
 */
function togglePaperlessBrowseSections() {
    const paperlessEnabled = window.paperlessNgxEnabled || false;
    console.log('[togglePaperlessBrowseSections] Paperless enabled:', paperlessEnabled);
    
    // List of paperless browse section IDs (only for invoice and manual)
    const browseSectionIds = [
        'invoicePaperlessBrowse', 
        'manualPaperlessBrowse',
        'editInvoicePaperlessBrowse',
        'editManualPaperlessBrowse'
    ];
    
    let foundSections = 0;
    browseSectionIds.forEach(id => {
        const section = document.getElementById(id);
        if (section) {
            foundSections++;
            section.style.display = paperlessEnabled ? 'block' : 'none';
            console.log(`[togglePaperlessBrowseSections] ${id}: ${paperlessEnabled ? 'shown' : 'hidden'}`);
        } else {
            console.warn(`[togglePaperlessBrowseSections] Section not found: ${id}`);
        }
    });
    
    console.log(`[togglePaperlessBrowseSections] Found ${foundSections} of ${browseSectionIds.length} sections`);
}

// Initialize Paperless browser functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for modal close buttons
    const paperlessModal = document.getElementById('paperlessBrowserModal');
    if (paperlessModal) {
        // Close on backdrop click
        paperlessModal.addEventListener('click', function(e) {
            if (e.target === paperlessModal) {
                closePaperlessBrowser();
            }
        });
        
        // Close on close button click
        const closeBtn = paperlessModal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closePaperlessBrowser);
        }
        
        // Close on cancel button click - but only the Cancel button, not all secondary buttons
        const cancelBtn = paperlessModal.querySelector('.modal-footer .btn-secondary');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closePaperlessBrowser);
        }
    }
    
    // Add event listeners for search and filters
    const searchInput = document.getElementById('paperlessSearchInput');
    if (searchInput) {
        // Search on Enter key
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                currentPaperlessPage = 1; // Reset to first page
                searchPaperlessDocuments();
            }
        });
        
        // Search on input change (with debounce)
        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPaperlessPage = 1; // Reset to first page
                searchPaperlessDocuments();
            }, 500);
        });
    }
    
    // Add event listeners for filter dropdowns
    const typeFilter = document.getElementById('paperlessTypeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', function() {
            currentPaperlessPage = 1; // Reset to first page
            searchPaperlessDocuments();
        });
    }
    
    const tagFilter = document.getElementById('paperlessTagFilter');
    if (tagFilter) {
        tagFilter.addEventListener('change', function() {
            currentPaperlessPage = 1; // Reset to first page
            searchPaperlessDocuments();
        });
    }
    
    // Add event listener for search button
    const searchBtn = document.getElementById('paperlessSearchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            currentPaperlessPage = 1; // Reset to first page
            searchPaperlessDocuments();
        });
    }
    
    // Add event listener for "Show All" button
    const showAllBtn = document.getElementById('paperlessShowAllBtn');
    if (showAllBtn) {
        showAllBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Clear all filters
            if (searchInput) searchInput.value = '';
            if (typeFilter) typeFilter.value = '';
            if (tagFilter) tagFilter.value = '';
            
            // Reset page and load all documents
            currentPaperlessPage = 1;
            paperlessSearchQuery = '';
            loadAllPaperlessDocuments();
        });
    }
    
    // Toggle browse sections will be handled by initPaperlessNgxIntegration()
    // togglePaperlessBrowseSections();
});

// Make functions available globally
window.openPaperlessBrowser = openPaperlessBrowser;
window.loadAllPaperlessDocuments = loadAllPaperlessDocuments;
window.selectPaperlessDocument = selectPaperlessDocument;
window.clearPaperlessSelection = clearPaperlessSelection;
window.changePage = changePage;
window.openPaperlessDocument = openPaperlessDocument;
window.openSecureFile = openSecureFile;

// ===== END PAPERLESS BROWSER FUNCTIONALITY =====
