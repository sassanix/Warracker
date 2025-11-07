(function() {
    // DOM Elements
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');
    const errorDetails = document.getElementById('errorDetails');
    const dashboardContent = document.getElementById('dashboardContent');
    const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
    
    // Elements specific to status page's own filtering/sorting UI - Activated
    const searchWarranties = document.getElementById('searchWarranties'); 
    const statusFilter = document.getElementById('statusFilter'); 
    const exportBtn = document.getElementById('exportBtn'); 
    // sortableHeaders will be queried inside attachSortListeners

    // Configuration
    const STATUS_PAGE_API_BASE_URL = '/api/statistics';
    const GLOBAL_STATUS_PAGE_API_BASE_URL = '/api/statistics/global';
    const STATISTICS_API_URL = window.location.origin + STATUS_PAGE_API_BASE_URL;
    const GLOBAL_STATISTICS_API_URL = window.location.origin + GLOBAL_STATUS_PAGE_API_BASE_URL;
    let EXPIRING_SOON_DAYS = 30;

    // IIFE-local variables
    let currentSort = { column: 'expiration_date', direction: 'asc' };
    let allWarranties = []; 
    let statusChart = null;
    let timelineChart = null;
    let currentStatusData = null; 
    let currentTimelineData = null; 
    let userCurrencySymbol = '$'; // Default currency symbol
    let isGlobalView = false; // Track current view mode
    let isViewControlsInitialized = false;
    let isDashboardInitialized = false; // Prevent multiple initializations
    let isDOMHandlerAttached = false; // Prevent multiple DOM handlers
    let initDashboardPromise = null; // Track ongoing initialization

    function setTheme(isDark) {
        const theme = isDark ? 'dark' : 'light';
        console.log('Setting theme from status.js IIFE to:', theme);
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('darkMode', isDark);
        // The visual state of any shared header toggle is handled by other scripts (e.g., script.js or auth.js)
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
    
    function redrawChartsWithNewTheme() {
        console.log("Theme changed, redrawing charts from status.js IIFE...");
        try {
            if (statusChart && typeof statusChart.destroy === 'function') {
                statusChart.destroy(); 
                statusChart = null;
                console.log('Destroyed status chart for theme change');
            }
            if (timelineChart && typeof timelineChart.destroy === 'function') {
                timelineChart.destroy(); 
                timelineChart = null;
                console.log('Destroyed timeline chart for theme change');
            }
            if (currentStatusData) {
                createStatusChart(currentStatusData);
            }
            if (currentTimelineData) {
                createTimelineChart(currentTimelineData);
            }
        } catch (e) {
            console.error('Error redrawing charts with new theme:', e);
        }
    }

    function showLoading() {
        if (loadingIndicator) loadingIndicator.classList.add('active');
        if (dashboardContent) dashboardContent.style.opacity = '0.5';
    }

    function hideLoading() {
        if (loadingIndicator) loadingIndicator.classList.remove('active');
        if (dashboardContent) dashboardContent.style.opacity = '1';
    }

    function showError(message, details = '') {
        if (errorMessage) errorMessage.textContent = message;
        if (errorDetails) errorDetails.textContent = details;
        if (errorContainer) errorContainer.style.display = 'block';
        if (dashboardContent) dashboardContent.style.display = 'none';
    }

    function hideError() {
        if (errorContainer) errorContainer.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
    }

    async function fetchStatistics() {
        try {
            console.log('Checking authentication status... (status.js IIFE)');
            if (!window.auth || !window.auth.isAuthenticated()) {
                 throw new Error('Authentication required.');
            }
            const token = window.auth.getToken();
            if (!token) {
                throw new Error('Authentication token not available.');
            }
            const options = {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'}
            };
            
            // Check saved view scope preference to determine which API endpoint to use
            const savedScope = loadViewScopePreference();
            const shouldUseGlobalView = savedScope === 'global';
            
            // Choose API endpoint based on saved preference
            const apiUrl = shouldUseGlobalView ? GLOBAL_STATISTICS_API_URL : STATISTICS_API_URL;
            console.log('Fetching statistics from:', apiUrl, '(Global view preference:', savedScope, ')');
            
            const response = await fetch(apiUrl, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch statistics: ${response.status} ${errorText}`);
            }
            
            // Update isGlobalView to match the loaded data
            isGlobalView = shouldUseGlobalView;
            console.log(`[DEBUG] Set isGlobalView to: ${isGlobalView}`);
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching statistics (status.js IIFE):', error);
            throw error;
        }
    }

    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `${message} <button class="toast-close">&times;</button>`;
        const closeButton = toast.querySelector('.toast-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => toast.remove());
        }
        toastContainer.appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3000);
    }

    // Global view functions
    async function initViewControls() {
        if (isViewControlsInitialized) return;
        
        try {
            // Check if global view is enabled for this user
            const token = window.auth.getToken();
            if (!token) return;
            
            const response = await fetch('/api/settings/global-view-status', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.enabled) {
                    showViewSwitcher();
                    setupViewSwitcherListeners();
                    
                    // Load and apply saved view scope preference
                    const savedScope = loadViewScopePreference();
                    if (savedScope === 'global') {
                        // Apply global view silently without saving preference again
                        isGlobalView = true;
                        updateViewButtons();
                        updateDashboardTitle();
                        updateTableColumns();
                    } else {
                        // Apply personal view (default)
                        isGlobalView = false;
                        updateViewButtons();
                        updateDashboardTitle();
                        updateTableColumns();
                    }
                    
                    isViewControlsInitialized = true;
                }
            }
        } catch (error) {
            console.error('Error checking global view status:', error);
            // Default to showing view switcher if error occurs (for admins)
            if (getUserType() === 'admin') {
                showViewSwitcher();
                setupViewSwitcherListeners();
                
                // Load and apply saved view scope preference
                const savedScope = loadViewScopePreference();
                if (savedScope === 'global') {
                    // Apply global view silently without saving preference again
                    isGlobalView = true;
                    updateViewButtons();
                    updateDashboardTitle();
                    updateTableColumns();
                } else {
                    // Apply personal view (default)
                    isGlobalView = false;
                    updateViewButtons();
                    updateDashboardTitle();
                    updateTableColumns();
                }
                
                isViewControlsInitialized = true;
            }
        }
    }

    function getUserType() {
        try {
            const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
            return userInfo.is_admin ? 'admin' : 'user';
        } catch {
            return 'user';
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

    // --- Status filter persistence for Status Page ---
    function saveStatusFilterPreference(value) {
        try {
            const prefix = getPreferenceKeyPrefix();
            const key = `${prefix}statusPageStatusFilter`;
            if (!value || value === 'all') {
                // Treat 'all' as reset; clear saved preference
                localStorage.removeItem(key);
                console.log(`Cleared saved status filter (key=${key})`);
            } else {
                localStorage.setItem(key, value);
                console.log(`Saved status filter '${value}' (key=${key})`);
            }
        } catch (error) {
            console.error('Error saving status filter preference:', error);
        }
    }

    function loadStatusFilterPreference() {
        try {
            const prefix = getPreferenceKeyPrefix();
            const key = `${prefix}statusPageStatusFilter`;
            const saved = localStorage.getItem(key);
            console.log(`Loaded status filter preference: ${saved} (key=${key})`);
            return saved || 'all';
        } catch (error) {
            console.error('Error loading status filter preference:', error);
            return 'all';
        }
    }

    function showViewSwitcher() {
        const viewSwitcher = document.getElementById('viewSwitcher');
        if (viewSwitcher) {
            viewSwitcher.style.display = 'flex';
        }
    }

    function hideViewSwitcher() {
        const viewSwitcher = document.getElementById('viewSwitcher');
        if (viewSwitcher) {
            viewSwitcher.style.display = 'none';
        }
    }

    function setupViewSwitcherListeners() {
        const personalViewBtn = document.getElementById('personalViewBtn');
        const globalViewBtn = document.getElementById('globalViewBtn');

        if (personalViewBtn) {
            personalViewBtn.addEventListener('click', () => switchToPersonalView());
        }
        if (globalViewBtn) {
            globalViewBtn.addEventListener('click', () => switchToGlobalView());
        }
    }

    async function switchToPersonalView() {
        if (!isGlobalView) return; // Already in personal view
        
        isGlobalView = false;
        updateViewButtons();
        updateDashboardTitle();
        updateTableColumns();
        
        // Save view preference
        saveViewScopePreference('personal');
        
        isDashboardInitialized = false; // Reset to allow refresh with new view
        await initDashboard();
    }

    async function switchToGlobalView() {
        if (isGlobalView) return; // Already in global view
        
        try {
            // Check if global view is still available
            const token = window.auth.getToken();
            const response = await fetch('/api/settings/global-view-status', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.enabled) {
                    isGlobalView = true;
                    updateViewButtons();
                    updateDashboardTitle();
                    updateTableColumns();
                    
                    // Save view preference
                    saveViewScopePreference('global');
                    
                    isDashboardInitialized = false; // Reset to allow refresh with new view
                    await initDashboard();
                } else {
                    showToast('Global view is not available', 'error');
                    // Switch back to personal view if global is disabled
                    await switchToPersonalView();
                }
            } else {
                throw new Error('Failed to check global view status');
            }
        } catch (error) {
            console.error('Error switching to global view:', error);
            showToast('Unable to switch to global view', 'error');
            // Switch back to personal view on error
            await switchToPersonalView();
        }
    }

    function updateViewButtons() {
        const personalViewBtn = document.getElementById('personalViewBtn');
        const globalViewBtn = document.getElementById('globalViewBtn');

        if (personalViewBtn && globalViewBtn) {
            if (isGlobalView) {
                personalViewBtn.classList.remove('active');
                globalViewBtn.classList.add('active');
            } else {
                personalViewBtn.classList.add('active');
                globalViewBtn.classList.remove('active');
            }
        }
    }

    function updateDashboardTitle() {
        const dashboardTitle = document.getElementById('dashboardTitle');
        if (dashboardTitle) {
            if (window.i18next && window.i18next.t) {
                dashboardTitle.textContent = isGlobalView ? 
                    window.i18next.t('status.global_dashboard_title') : 
                    window.i18next.t('status.dashboard_title');
            } else {
                dashboardTitle.textContent = isGlobalView ? 'Global Warranty Status Dashboard' : 'Warranty Status Dashboard';
            }
        }
    }

    function updateTableColumns() {
        const ownerHeader = document.getElementById('ownerHeader');
        if (ownerHeader) {
            ownerHeader.style.display = isGlobalView ? 'table-cell' : 'none';
        }
    }

    function updateSummaryCounts(statusData) {
        const totalEl = document.getElementById('totalCount');
        const activeEl = document.getElementById('activeCount');
        const expiringEl = document.getElementById('expiringCount');
        const expiredEl = document.getElementById('expiredCount');
        if (totalEl) totalEl.textContent = statusData.total || 0;
        if (activeEl) activeEl.textContent = statusData.active || 0;
        if (expiringEl) expiringEl.textContent = statusData.expiring_soon || 0;
        if (expiredEl) expiredEl.textContent = statusData.expired || 0;
    }

    function createStatusChart(stats) {
        const ctxEl = document.getElementById('statusChart');
        if (!ctxEl) { console.warn("statusChart canvas not found"); return; }
        
        // Properly destroy existing chart
        if (statusChart && typeof statusChart.destroy === 'function') {
            try {
                statusChart.destroy();
                statusChart = null;
                console.log('Destroyed existing status chart');
            } catch (e) {
                console.warn('Error destroying status chart:', e);
                statusChart = null;
            }
        }
        
        // Additional check: Clear any Chart.js instances on this canvas
        const chartInstance = Chart.getChart(ctxEl);
        if (chartInstance) {
            console.log('Found existing Chart.js instance on statusChart canvas, destroying it');
            chartInstance.destroy();
        }
        
        const ctx = ctxEl.getContext('2d');
        if (!stats || typeof stats !== 'object') stats = { active: 0, expiring_soon: 0, expired: 0, total: 0 }; // Added total for safety
        const active = stats.active || 0;
        const expiringSoon = stats.expiring_soon || 0;
        const expired = stats.expired || 0;
        const trulyActive = Math.max(0, active - expiringSoon);
        
        try {
            // Get translated labels for chart
            const activeLabel = i18next.t('warranties.active');
            const expiringSoonLabel = i18next.t('warranties.expiring_soon');
            const expiredLabel = i18next.t('warranties.expired');
            
            statusChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [activeLabel, expiringSoonLabel, expiredLabel],
                    datasets: [{ data: [trulyActive, expiringSoon, expired], backgroundColor: ['#4CAF50', '#FF9800', '#F44336'], borderWidth: 1 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });
            console.log('Created new status chart');
        } catch (e) {
            console.error('Error creating status chart:', e);
        }
    }

    function createTimelineChart(timelineData) {
        const ctxEl = document.getElementById('timelineChart');
        if (!ctxEl) { console.warn("timelineChart canvas not found"); return; }
        
        // Properly destroy existing chart
        if (timelineChart && typeof timelineChart.destroy === 'function') {
            try {
                timelineChart.destroy();
                timelineChart = null;
                console.log('Destroyed existing timeline chart');
            } catch (e) {
                console.warn('Error destroying timeline chart:', e);
                timelineChart = null;
            }
        }
        
        // Additional check: Clear any Chart.js instances on this canvas
        const chartInstance = Chart.getChart(ctxEl);
        if (chartInstance) {
            console.log('Found existing Chart.js instance on timelineChart canvas, destroying it');
            chartInstance.destroy();
        }
        
        const ctx = ctxEl.getContext('2d');
        let labels = [];
        let counts = [];

        if (!Array.isArray(timelineData) || timelineData.length === 0) {
            console.warn('Timeline data is empty or not an array. Displaying default empty chart.');
            const currentDate = new Date();
            for (let i = 2; i >= 0; i--) { // Last 3 months
                const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                labels.push(d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }));
                counts.push(0);
            }
        } else {
            labels = timelineData.map(item => {
                try {
                    let year, monthVal;
                    if (item.year !== undefined && item.month !== undefined) {
                        year = item.year; monthVal = item.month - 1; // JS month is 0-indexed
                    } else if (item.date) { // Assuming item.date is a parsable date string
                        const d = new Date(item.date); year = d.getFullYear(); monthVal = d.getMonth();
                    } else { // Fallback if structure is unknown
                        const d = new Date(); year = d.getFullYear(); monthVal = d.getMonth(); 
                    }
                    return new Date(year, monthVal, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                } catch (e) { 
                    console.error("Error formatting timeline label item:", item, e);
                    return 'Unknown'; 
                }
            });
            counts = timelineData.map(item => item.count || 0);
        }

        try {
            // Get translated label for timeline chart
            const timelineLabel = i18next.t('status.expiration_timeline');
            
            timelineChart = new Chart(ctx, {
                type: 'bar',
                data: { 
                    labels: labels, 
                    datasets: [{ label: timelineLabel, data: counts, backgroundColor: '#3498db', borderWidth: 1 }] 
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
            console.log('Created new timeline chart');
        } catch (e) {
            console.error('Error creating timeline chart:', e);
        }
    }
    
    function updateRecentExpirations(recentWarrantiesData) {
        if (!Array.isArray(recentWarrantiesData)) {
            console.error('Recent warranties data is not an array (status.js IIFE):', recentWarrantiesData);
            allWarranties = [];
        } else {
            allWarranties = recentWarrantiesData.map(warranty => ({
                id: warranty.id || String(Math.random()).slice(2, 11), // Ensure ID is a string for consistency
                product_name: warranty.product_name || warranty.name || 'Unknown Product',
                purchase_date: warranty.purchase_date,
                expiration_date: warranty.expiration_date,
                is_lifetime: warranty.is_lifetime || false,
                invoice_path: warranty.invoice_path || null,
                product_url: warranty.product_url,
                purchase_price: warranty.purchase_price,
                vendor: warranty.vendor,
                model_number: warranty.model_number, // include model number for searching
                serial_numbers: warranty.serial_numbers || [],
                notes: warranty.notes,
                manual_path: warranty.manual_path || null,
                other_document_path: warranty.other_document_path || null,
                is_archived: !!warranty.is_archived,
                // Add user fields for global view
                user_display_name: warranty.user_display_name,
                username: warranty.username,
                first_name: warranty.first_name,
                last_name: warranty.last_name
            }));
        }
        filterAndSortWarranties(); // This will render the table
    }

    function filterAndSortWarranties() {
        const tableBody = document.getElementById('recentExpirationsBody');
        if (!tableBody) { console.warn("recentExpirationsBody not found for rendering warranties."); return; }
        
        const currentSearchTerm = searchWarranties && searchWarranties.value ? searchWarranties.value.toLowerCase() : '';
        const currentStatusValue = statusFilter && statusFilter.value ? statusFilter.value : 'all';
        
        tableBody.innerHTML = ''; 

        if (!allWarranties || allWarranties.length === 0) {
            const colspan = isGlobalView ? 5 : 4;
            const noWarrantiesMessage = i18next.t('status.recent_expirations_empty', 'No recently expired or expiring warranties.');
            tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding: 20px;">${noWarrantiesMessage}</td></tr>`;
            return;
        }

        const today = new Date();
        today.setHours(0,0,0,0); // Normalize today to start of day for consistent comparisons

        let displayWarranties = allWarranties.filter(w => {
            const productName = (w.product_name || '').toLowerCase();
            const modelNumber = (w.model_number || '').toLowerCase();
            if (currentSearchTerm && !(productName.includes(currentSearchTerm) || modelNumber.includes(currentSearchTerm))) return false;
            
            // Explicit archived filter
            if (currentStatusValue === 'archived') {
                return !!w.is_archived;
            }

            // Exclude archived from other filters
            if (w.is_archived) {
                return currentStatusValue === 'all';
            }

            if (w.is_lifetime) {
                if (currentStatusValue === 'expired' || currentStatusValue === 'expiring') return false;
                return true; // Included in 'all' and 'active'
            }

            if (!w.expiration_date) return false; // Non-lifetime must have an expiration date
            const expirationDate = new Date(w.expiration_date);
            expirationDate.setHours(0,0,0,0); // Normalize for comparison

            if (currentStatusValue === 'all') return true;
            if (currentStatusValue === 'expired') return expirationDate <= today;
            
            const timeDiff = expirationDate - today;
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

            if (currentStatusValue === 'expiring') return expirationDate > today && daysDiff <= EXPIRING_SOON_DAYS;
            if (currentStatusValue === 'active') return expirationDate > today && daysDiff > EXPIRING_SOON_DAYS;
            
            return true; // Should ideally not be reached if statusValue is one of the handled ones
        });

        displayWarranties.sort((a, b) => { 
            let valA, valB;
            const aIsLifetime = a.is_lifetime;
            const bIsLifetime = b.is_lifetime;

            // Prioritize lifetime sort or handle them based on specific column
            if (currentSort.column === 'status') {
                 valA = getStatusPriority(a.expiration_date, today, aIsLifetime, !!a.is_archived);
                 valB = getStatusPriority(b.expiration_date, today, bIsLifetime, !!b.is_archived);
            } else {
                if (aIsLifetime && !bIsLifetime) return -1; 
                if (!aIsLifetime && bIsLifetime) return 1;
                if (aIsLifetime && bIsLifetime) {
                     valA = (a.product_name || '').toLowerCase();
                     valB = (b.product_name || '').toLowerCase();
                } else {
                    switch (currentSort.column) {
                        case 'product': valA = (a.product_name || '').toLowerCase(); valB = (b.product_name || '').toLowerCase(); break;
                        case 'purchase': valA = new Date(a.purchase_date || 0); valB = new Date(b.purchase_date || 0); break;
                        default: valA = new Date(a.expiration_date || 0); valB = new Date(b.expiration_date || 0); // Default is expiration
                    }
                }
            }
            if (valA instanceof Date && valB instanceof Date) return currentSort.direction === 'asc' ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
            if (typeof valA === 'number' && typeof valB === 'number') return currentSort.direction === 'asc' ? valA - valB : valB - valA;
            if (typeof valA === 'string' && typeof valB === 'string') return currentSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            return 0;
        });

        if (displayWarranties.length === 0) {
            const colspan = isGlobalView ? 5 : 4;
            const noMatchMessage = i18next.t('messages.no_results', 'No results found');
            tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding: 20px;">${noMatchMessage}</td></tr>`;
            return;
        }

        displayWarranties.forEach(warranty => {
            const row = tableBody.insertRow();
            row.setAttribute('data-warranty-id', String(warranty.id)); // Ensure ID is string for dataset
            row.style.cursor = 'pointer';
            
            let statusText, statusClass;
            const todayForStatus = new Date(); todayForStatus.setHours(0,0,0,0);

            // Archived takes precedence: show as Archived regardless of expiration
            if (warranty.is_archived) {
                statusText = i18next.t('warranties.archived', 'Archived');
                statusClass = 'status-archived';
            } else if (warranty.is_lifetime) {
                statusText = i18next.t('warranties.lifetime');
                statusClass = 'status-lifetime';
            } else {
                const expirationDate = new Date(warranty.expiration_date);
                expirationDate.setHours(0,0,0,0);
                if (expirationDate <= todayForStatus) { 
                    statusText = i18next.t('warranties.expired'); 
                    statusClass = 'status-expired'; 
                } else {
                    const timeDiff = expirationDate - todayForStatus;
                    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                    if (daysDiff <= EXPIRING_SOON_DAYS) { 
                        statusText = i18next.t('warranties.expiring_soon'); 
                        statusClass = 'status-expiring'; 
                    } else { 
                        statusText = i18next.t('warranties.active'); 
                        statusClass = 'status-active'; 
                    }
                }
            }
            row.className = statusClass;

            // Build row HTML based on current view mode
            const lifetimeText = i18next.t('warranties.lifetime');
            const naText = i18next.t('warranties.na', 'N/A');
            let rowHTML = `
                <td title="${escapeHTML(warranty.product_name)}">${escapeHTML(warranty.product_name)}</td>
                <td>${warranty.purchase_date ? formatDateYYYYMMDD(new Date(warranty.purchase_date)) : naText}</td>
                <td>${warranty.is_lifetime ? lifetimeText : (warranty.expiration_date ? formatDateYYYYMMDD(new Date(warranty.expiration_date)) : naText)}</td>
                <td><span class="${statusClass}">${statusText}</span></td>
            `;
            
            // Add owner column if in global view
            if (isGlobalView) {
                const ownerDisplay = warranty.user_display_name || warranty.username || 'Unknown User';
                rowHTML += `<td title="${escapeHTML(ownerDisplay)}">${escapeHTML(ownerDisplay)}</td>`;
            }
            
            row.innerHTML = rowHTML; // Make sure escapeHTML is used on all string data from warranty
            row.addEventListener('click', () => toggleWarrantyDetails(warranty.id, row));
        });
    }
    
    function getStatusPriority(expirationDateStr, today, isLifetime = false, isArchived = false) {
        if (isArchived) return -1; // Archived comes first (or last depending on sort direction)
        if (isLifetime) return 0; 
        if (!expirationDateStr) return 4; 
        const expirationDate = new Date(expirationDateStr);
        expirationDate.setHours(0,0,0,0);
        const todayNormalized = new Date(today); // Ensure today is also normalized if not already
        todayNormalized.setHours(0,0,0,0);

        if (isNaN(expirationDate.getTime())) return 4;
        if (expirationDate <= todayNormalized) return 3; 
        const timeDiff = expirationDate - todayNormalized;
        const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        if (daysDiff <= EXPIRING_SOON_DAYS) return 2; 
        return 1; 
    }

    async function toggleWarrantyDetails(warrantyId, clickedRow, forceRefetch = false) {
        const existingDetailsRow = clickedRow.nextElementSibling;
        if (existingDetailsRow && existingDetailsRow.classList.contains('warranty-details-row')) {
            existingDetailsRow.remove();
            clickedRow.classList.remove('details-expanded');
            return;
        }
        document.querySelectorAll('.warranty-details-row').forEach(r => r.remove());
        document.querySelectorAll('tr.details-expanded').forEach(r => r.classList.remove('details-expanded'));
        clickedRow.classList.add('details-expanded');
        showLoading();
        try {
            let warrantyDetails = null;

            if (!forceRefetch) {
                warrantyDetails = allWarranties.find(w => String(w.id) === String(warrantyId));
            }

            // If forcing a refetch, or if cache lookup failed, or if cached data is deemed incomplete (e.g., missing notes)
            if (forceRefetch || !warrantyDetails || !warrantyDetails.notes) {
                if (forceRefetch) {
                    console.log(`[toggleWarrantyDetails] Force refetching details for warranty ID: ${warrantyId}`);
                } else if (!warrantyDetails) {
                    console.warn(`[toggleWarrantyDetails] Warranty ID: ${warrantyId} not found in local cache. Fetching.`);
                } else { // Implies !warrantyDetails.notes or other incompleteness checks in future
                    console.warn(`[toggleWarrantyDetails] Warranty details for ID: ${warrantyId} in cache are incomplete. Fetching.`);
                }

                const token = window.auth.getToken();
                if (!token) throw new Error('Authentication token not available.');
                const response = await fetch(`/api/debug/warranty/${warrantyId}`, { headers: { 'Authorization': `Bearer ${token}` }});
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch full warranty details for toggle.');
                }
                const fetchedData = await response.json();
                if (!fetchedData) throw new Error('Warranty data not found in fetch response for toggle.');
                
                // API might return { warranty: {...} } or just {...}
                warrantyDetails = fetchedData.warranty ? fetchedData.warranty : fetchedData; 

                // Update allWarranties cache in status.js with this fresh data
                const index = allWarranties.findIndex(w => String(w.id) === String(warrantyId));
                if (index !== -1) {
                    // Merge to preserve any local-only properties if necessary, though fetched should be canonical here
                    allWarranties[index] = {...allWarranties[index], ...warrantyDetails};
                    console.log(`[toggleWarrantyDetails] Updated allWarranties cache for ID ${warrantyId} with fetched details.`);
                } else {
                    allWarranties.push(warrantyDetails); // Should be rare if initDashboard ran
                    console.log(`[toggleWarrantyDetails] Added fetched details for ID ${warrantyId} to allWarranties cache as it was not found.`);
                }
            }
            
            // At this point, warrantyDetails should be the one we want to render.
            // If forceRefetch was true, it's the data just fetched.
            // If forceRefetch was false, it's from cache.
            console.log('[toggleWarrantyDetails] FINAL warrantyDetails object to be rendered:', JSON.parse(JSON.stringify(warrantyDetails)));

            // Normalize paths in warrantyDetails, regardless of source (cache or fetch)
            warrantyDetails.invoice_path = warrantyDetails.invoice_path || null;
            warrantyDetails.manual_path = warrantyDetails.manual_path || null;
            warrantyDetails.other_document_path = warrantyDetails.other_document_path || null;

            const detailsRow = document.createElement('tr');
            detailsRow.classList.add('warranty-details-row');
            const detailsCell = document.createElement('td');
            detailsCell.colSpan = clickedRow.cells.length;
            detailsCell.style.padding = '15px';
            detailsCell.style.backgroundColor = 'var(--details-bg, #f9f9f9)';

            let dHtml = '<div class="warranty-details-content" style="display: flex; flex-wrap: wrap; gap: 20px;">';
            dHtml += '<div style="flex: 1 1 300px;"><h4>Core Information</h4>';
            dHtml += `<p><strong>Product URL:</strong> ${warrantyDetails.product_url ? `<a href="${warrantyDetails.product_url}" target="_blank" rel="noopener noreferrer">${escapeHTML(warrantyDetails.product_url)}</a>` : 'N/A'}</p>`;
            dHtml += `<p><strong>Purchase Price:</strong> ${warrantyDetails.purchase_price !== null && warrantyDetails.purchase_price !== undefined ? escapeHTML(userCurrencySymbol) + parseFloat(warrantyDetails.purchase_price).toFixed(2) : 'N/A'}</p>`;
            dHtml += `<p><strong>Vendor:</strong> ${escapeHTML(warrantyDetails.vendor || '') || 'N/A'}</p>`;
            dHtml += `<p><strong>Warranty Type:</strong> ${escapeHTML(warrantyDetails.warranty_type || '') || 'N/A'}</p></div>`;
            
            dHtml += '<div style="flex: 1 1 300px;"><h4>Documents & Files</h4>';
            
            // Invoice - check both local and Paperless-ngx
            if(warrantyDetails.invoice_path) {
                dHtml += `<p><strong data-i18n="warranties.invoice_receipt_short">Invoice:</strong> <a href="#" onclick="window.openSecureFile('${escapeHTML(warrantyDetails.invoice_path)}'); return false;">View Invoice</a></p>`;
            } else if(warrantyDetails.paperless_invoice_id) {
                dHtml += `<p><strong data-i18n="warranties.invoice_receipt_short">Invoice:</strong> <a href="#" onclick="window.openPaperlessDocument(${warrantyDetails.paperless_invoice_id}); return false;">View Invoice</a> <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i></p>`;
            } else {
                dHtml += `<p><strong data-i18n="warranties.invoice_receipt_short">Invoice:</strong> N/A</p>`;
            }
            
            // Manual - check both local and Paperless-ngx
            if(warrantyDetails.manual_path) {
                dHtml += `<p><strong data-i18n="warranties.product_manual_short">Manual:</strong> <a href="#" onclick="window.openSecureFile('${escapeHTML(warrantyDetails.manual_path)}'); return false;">View Manual</a></p>`;
            } else if(warrantyDetails.paperless_manual_id) {
                dHtml += `<p><strong data-i18n="warranties.product_manual_short">Manual:</strong> <a href="#" onclick="window.openPaperlessDocument(${warrantyDetails.paperless_manual_id}); return false;">View Manual</a> <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i></p>`;
            } else {
                dHtml += `<p><strong data-i18n="warranties.product_manual_short">Manual:</strong> N/A</p>`;
            }
            
            // Other Files - check both local and Paperless-ngx
            if(warrantyDetails.other_document_path) {
                dHtml += `<p><strong data-i18n="warranties.files_short">Other Files:</strong> <a href="#" onclick="window.openSecureFile('${escapeHTML(warrantyDetails.other_document_path)}'); return false;">View Files</a></p>`;
            } else if(warrantyDetails.paperless_other_id) {
                dHtml += `<p><strong data-i18n="warranties.files_short">Other Files:</strong> <a href="#" onclick="window.openPaperlessDocument(${warrantyDetails.paperless_other_id}); return false;">View Files</a> <i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i></p>`;
            } else {
                dHtml += `<p><strong data-i18n="warranties.files_short">Other Files:</strong> N/A</p>`;
            }
            
            dHtml += '</div>';

            // DEBUG: Log serial numbers before rendering them in details view
            console.log('[toggleWarrantyDetails] Serial numbers in warrantyDetails before rendering HTML:', JSON.parse(JSON.stringify(warrantyDetails.serial_numbers || [])));

            if (warrantyDetails.serial_numbers && warrantyDetails.serial_numbers.length > 0) {
                dHtml += '<div style="flex: 1 1 300px;"><h4>Serial Numbers</h4><ul>';
                warrantyDetails.serial_numbers.forEach(sn => { // Assuming sn is an object {serial_number: "value"}
                    dHtml += `<li>${escapeHTML(sn.serial_number || sn)}</li>`; // Handle if sn is string or object
                });
                dHtml += '</ul></div>';
            }
            if (warrantyDetails.notes && String(warrantyDetails.notes).trim() !== '') {
                dHtml += '<div style="flex: 1 1 100%; margin-top: 10px;"><h4>Notes</h4>';
                dHtml += `<pre style="white-space: pre-wrap; word-wrap: break-word; background-color: var(--notes-bg, #efefef); padding: 10px; border-radius: 4px;">${escapeHTML(warrantyDetails.notes)}</pre></div>`;
            }
            dHtml += '</div>'; // end warranty-details-content
            dHtml += '<div class="warranty-details-actions" style="margin-top: 15px; text-align: right;">';
            dHtml += `<button class="btn btn-primary edit-warranty-status-btn" data-warranty-id="${warrantyDetails.id}">Edit Warranty</button></div>`;
            
            detailsCell.innerHTML = dHtml;
            detailsRow.appendChild(detailsCell);
            clickedRow.parentNode.insertBefore(detailsRow, clickedRow.nextSibling);
        } catch (error) {
            console.error('Error in toggleWarrantyDetails (status.js IIFE):', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    function escapeHTML(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"'\/]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'})[s]);
    }

    function refreshDashboard() {
        console.log("Refreshing dashboard from status.js IIFE...");
        isDashboardInitialized = false; // Reset flag to allow refresh
        initDashboardPromise = null; // Clear any existing promise
        if (refreshDashboardBtn) refreshDashboardBtn.classList.add('loading');
        initDashboard().finally(() => {
            if (refreshDashboardBtn) refreshDashboardBtn.classList.remove('loading');
        });
    }

    async function initDashboard() {
        // If already initialized and not being refreshed, skip
        if (isDashboardInitialized && !initDashboardPromise) {
            console.log('Dashboard already initialized, skipping...');
            return;
        }
        
        // If currently initializing, wait for the existing promise
        if (initDashboardPromise) {
            console.log('Dashboard initialization already in progress, waiting...');
            return initDashboardPromise;
        }
        
        console.log('Initializing dashboard (status.js IIFE)...');
        
        // Create promise to track initialization
        initDashboardPromise = (async () => {
            try {
                showLoading();
                await loadUserPreferences();
                await initViewControls(); // Initialize view controls before fetching data
                const data = await fetchStatistics();
                hideError();

                // 1. Use data.all_warranties for the main table content
                updateRecentExpirations(data.all_warranties || []);

                // 2. Construct the status_distribution object for charts and summary
                const statusDistributionData = {
                    active: data.active || 0,
                    expiring_soon: data.expiring_soon || 0,
                    expired: data.expired || 0,
                    total: data.total || 0
                };

                if (Object.keys(statusDistributionData).length > 0 && statusDistributionData.total > 0) {
                    currentStatusData = statusDistributionData;
                    updateSummaryCounts(statusDistributionData);
                    createStatusChart(statusDistributionData);
                } else {
                    console.warn("Status distribution data from API is incomplete or zero. Displaying empty/default chart/summary.");
                    updateSummaryCounts({});
                    createStatusChart({});
                }

                // --- BEGIN: Expiration Timeline Chart Fix ---
                // Instead of using only API timeline, generate a comprehensive timeline from all warranties
                let allWarrantiesForTimeline = [];
                try {
                    // Try to fetch all warranties for a complete timeline
                    const token = window.auth && window.auth.getToken ? window.auth.getToken() : null;
                    if (token) {
                        const allWarrantiesResponse = await fetch('/api/warranties', {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        if (allWarrantiesResponse.ok) {
                            allWarrantiesForTimeline = await allWarrantiesResponse.json();
                        } else {
                            console.warn('Could not fetch all warranties for timeline, falling back to data.all_warranties');
                            allWarrantiesForTimeline = data.all_warranties || [];
                        }
                    } else {
                        allWarrantiesForTimeline = data.all_warranties || [];
                    }
                } catch (err) {
                    console.error('Error fetching all warranties for timeline:', err);
                    allWarrantiesForTimeline = data.all_warranties || [];
                }

                // Helper: Extract timeline data from all warranties
                function extractTimelineData(warranties) {
                    // Map: { 'YYYY-MM': count }
                    const timelineMap = {};
                    warranties.forEach(w => {
                        if (w.is_lifetime) return; // Skip lifetime warranties
                        if (!w.expiration_date) return;
                        let expDate = w.expiration_date;
                        if (typeof expDate === 'string') {
                            // Accept both 'YYYY-MM-DD' and ISO
                            expDate = expDate.split('T')[0];
                            const [year, month] = expDate.split('-');
                            if (year && month) {
                                const key = `${year}-${month}`;
                                timelineMap[key] = (timelineMap[key] || 0) + 1;
                            }
                        } else if (expDate instanceof Date && !isNaN(expDate.getTime())) {
                            const year = expDate.getFullYear();
                            const month = (expDate.getMonth() + 1).toString().padStart(2, '0');
                            const key = `${year}-${month}`;
                            timelineMap[key] = (timelineMap[key] || 0) + 1;
                        }
                    });
                    // Convert to array sorted by date ascending
                    const timelineArr = Object.entries(timelineMap)
                        .map(([key, count]) => {
                            const [year, month] = key.split('-');
                            return { year: parseInt(year), month: parseInt(month), count };
                        })
                        .sort((a, b) => (a.year !== b.year) ? a.year - b.year : a.month - b.month);
                    return timelineArr;
                }

                let timelineData = [];
                if (Array.isArray(allWarrantiesForTimeline) && allWarrantiesForTimeline.length > 0) {
                    timelineData = extractTimelineData(allWarrantiesForTimeline);
                }
                if (timelineData.length > 0) {
                    currentTimelineData = timelineData;
                    createTimelineChart(timelineData);
                } else if (data.timeline && Array.isArray(data.timeline)) {
                    // Fallback to API timeline if extraction fails
                    currentTimelineData = data.timeline;
                    createTimelineChart(data.timeline);
                } else {
                    createTimelineChart([]);
                }
                // --- END: Expiration Timeline Chart Fix ---
                
                isDashboardInitialized = true;
                
            } catch (error) {
                console.error('Failed to initialize dashboard (status.js IIFE):', error);
                showError('Failed to load dashboard data.', error.message);
                isDashboardInitialized = false; // Allow retry on error
            } finally {
                hideLoading();
                initDashboardPromise = null; // Clear the promise
            }
        })();
        
        return initDashboardPromise;
    }

    async function loadUserPreferences() {
        try {
            if (!window.auth || !window.auth.getToken()) { console.warn('Auth or token not available for prefs in status.js'); return; }
            const token = window.auth.getToken();
            const response = await fetch('/api/auth/preferences', { headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) {
                const prefs = await response.json();
                if (prefs && prefs.expiring_soon_days !== undefined) { // Check for undefined specifically
                    EXPIRING_SOON_DAYS = parseInt(prefs.expiring_soon_days, 10);
                    console.log('Loaded EXPIRING_SOON_DAYS from prefs (status.js IIFE):', EXPIRING_SOON_DAYS);
                }
                if (prefs && prefs.currency_symbol) {
                    userCurrencySymbol = prefs.currency_symbol;
                    console.log('Loaded currency_symbol from prefs (status.js IIFE):', userCurrencySymbol);
                }
            } else {
                console.warn("Failed to load user preferences in status.js, status:", response.status);
            }
        } catch (error) { console.error('Error loading user preferences (status.js IIFE):', error); }
    }
    
    function attachSortListeners() { // DEFINITION ENSURED INSIDE IIFE
        const headers = document.querySelectorAll('#recentExpirationsTable th.sortable');
        headers.forEach(header => {
            const newHeader = header.cloneNode(true); // Re-clone to ensure clean listeners
            if (header.parentNode) {
                 header.parentNode.replaceChild(newHeader, header);
            } else {
                console.warn("Header's parentNode is null, cannot attach sort listener:", header);
                return; // Skip if header isn't properly in DOM
            }
            newHeader.addEventListener('click', () => {
                const column = newHeader.getAttribute('data-sort');
                if (currentSort.column === column) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.column = column;
                    currentSort.direction = 'asc';
                }
                // TODO: Implement updateSortHeaderClasses() to visually show sort direction
                filterAndSortWarranties();
            });
        });
        console.log("Attached sort listeners (status.js IIFE). Found headers:", headers.length);
    }
    
    document.addEventListener('click', async function(event) {
        if (event.target && event.target.classList.contains('edit-warranty-status-btn')) {
            const warrantyId = event.target.dataset.warrantyId;
            if (!warrantyId) { showToast('Cannot edit warranty: ID is missing.', 'error'); return; }
            console.log(`Edit button clicked for warranty ID (status.js IIFE): ${warrantyId}`);
            showLoading();
            let finalWarrantyForModal = null;

            try {
                // ALWAYS fetch fresh details when editing from the status page to ensure modal has latest data.
                console.log(`[DEBUG status.js] Edit from status page for warranty ${warrantyId}. ALWAYS fetching fresh details from /api/debug/warranty/:id.`);
                showLoadingSpinner(); // Show spinner for this specific fetch
                const token = localStorage.getItem('auth_token') || (window.auth && window.auth.getToken());
                if (!token) throw new Error('Authentication token not available for fetching fresh details.');
                
                const response = await fetch(`/api/debug/warranty/${warrantyId}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `Failed to fetch fresh warranty details: ${response.status}`);
                }

                let freshlyFetchedWarranty = await response.json();
                // IMPORTANT: Check if the API nests the warranty object (e.g., under a 'warranty' key)
                if (freshlyFetchedWarranty && freshlyFetchedWarranty.warranty && typeof freshlyFetchedWarranty.warranty === 'object') {
                    freshlyFetchedWarranty = freshlyFetchedWarranty.warranty;
                }

                hideLoadingSpinner();
                console.log(`[DEBUG status.js] Freshly fetched warranty data (from /api/debug/warranty):`, JSON.parse(JSON.stringify(freshlyFetchedWarranty)));

                // Start with freshly fetched data as the base
                finalWarrantyForModal = { ...freshlyFetchedWarranty };

                // Attempt to get from cache just for potentially more complete local-only properties if needed (e.g. if API is sometimes slow to update derived fields)
                // This is a cautious approach; ideally, freshlyFetchedWarranty is canonical.
                let cachedWarranty = allWarranties.find(w => String(w.id) === String(warrantyId));
                if (cachedWarranty) {
                    console.log(`[DEBUG status.js] Also found cached warranty for ID ${warrantyId}:`, JSON.parse(JSON.stringify(cachedWarranty)));
                    // Merge tags: Prioritize tags from cachedWarranty if available and fresh data lacks them or has empty
                    if (Array.isArray(cachedWarranty.tags) && cachedWarranty.tags.length > 0 && 
                        (!finalWarrantyForModal.hasOwnProperty('tags') || (Array.isArray(finalWarrantyForModal.tags) && finalWarrantyForModal.tags.length === 0))) {
                        console.log(`[DEBUG status.js] Using tags from cachedWarranty. Tags from cache:`, cachedWarranty.tags);
                        finalWarrantyForModal.tags = cachedWarranty.tags;
                    } else if (!finalWarrantyForModal.hasOwnProperty('tags') || !Array.isArray(finalWarrantyForModal.tags)) {
                        console.log(`[DEBUG status.js] No valid 'tags' property in fresh or cached. Defaulting to empty array. Current final.tags:`, finalWarrantyForModal.tags);
                        finalWarrantyForModal.tags = [];
                    }

                    // Merge/Format serial_numbers: Prioritize cached if simple array and fresh data has objects or is missing.
                    // This logic might need refinement based on consistent API output for serials.
                    const cachedSerialsAreSimpleArray = Array.isArray(cachedWarranty.serial_numbers) &&
                                                      (cachedWarranty.serial_numbers.length === 0 || typeof cachedWarranty.serial_numbers[0] === 'string');
                    
                    if (cachedSerialsAreSimpleArray && cachedWarranty.serial_numbers.length > 0 && 
                        (!Array.isArray(finalWarrantyForModal.serial_numbers) || typeof finalWarrantyForModal.serial_numbers[0] === 'object')) {
                        console.log(`[DEBUG status.js] Using serial_numbers from cachedWarranty (simple array). Serials:`, cachedWarranty.serial_numbers);
                        finalWarrantyForModal.serial_numbers = cachedWarranty.serial_numbers;
                    } else if (Array.isArray(finalWarrantyForModal.serial_numbers) && finalWarrantyForModal.serial_numbers.length > 0 && typeof finalWarrantyForModal.serial_numbers[0] === 'object') {
                        console.log(`[DEBUG status.js] Freshly fetched serial_numbers are objects. Mapping to strings. Original:`, finalWarrantyForModal.serial_numbers);
                        finalWarrantyForModal.serial_numbers = finalWarrantyForModal.serial_numbers
                            .map(snObj => snObj && snObj.serial_number) 
                            .filter(sn => typeof sn === 'string' && sn.trim() !== ''); 
                    } else if (!Array.isArray(finalWarrantyForModal.serial_numbers) || 
                               (Array.isArray(finalWarrantyForModal.serial_numbers) && finalWarrantyForModal.serial_numbers.length > 0 && typeof finalWarrantyForModal.serial_numbers[0] !== 'string')){
                        console.log(`[DEBUG status.js] serial_numbers in final object is not a simple array of strings. Defaulting to empty array. Current serials:`, finalWarrantyForModal.serial_numbers);
                        finalWarrantyForModal.serial_numbers = [];
                    }

                    // Vendor: Prioritize cached if available and fresh data lacks it or is empty
                    if (typeof cachedWarranty.vendor === 'string' && cachedWarranty.vendor.trim() !== '' && 
                        (typeof finalWarrantyForModal.vendor !== 'string' || finalWarrantyForModal.vendor.trim() === '')) {
                        console.log(`[DEBUG status.js] Using vendor from cachedWarranty. Vendor:`, cachedWarranty.vendor);
                        finalWarrantyForModal.vendor = cachedWarranty.vendor;
                    }
                }
                 // Ensure vendor is at least an empty string if null/undefined after merging attempts
                if (typeof finalWarrantyForModal.vendor !== 'string') {
                    console.log(`[DEBUG status.js] Vendor in final object is not a string after potential merge. Defaulting to empty string. Current vendor:`, finalWarrantyForModal.vendor);
                    finalWarrantyForModal.vendor = '';
                }

                if (!finalWarrantyForModal) {
                    throw new Error('Failed to prepare warranty data for the modal.');
                }

                // --- Date Formatting - CRITICAL: Ensure dates are YYYY-MM-DD strings for the modal --- 
                console.log(`[DEBUG status.js] Before date formatting - Purchase Date: ${finalWarrantyForModal.purchase_date}, Type: ${typeof finalWarrantyForModal.purchase_date}`);
                console.log(`[DEBUG status.js] Before date formatting - Expiration Date: ${finalWarrantyForModal.expiration_date}, Type: ${typeof finalWarrantyForModal.expiration_date}`);

                if (finalWarrantyForModal.purchase_date) {
                    try {
                        finalWarrantyForModal.purchase_date = formatDateYYYYMMDD(new Date(finalWarrantyForModal.purchase_date));
                    } catch (e) {
                        console.error(`Error formatting purchase_date ('${finalWarrantyForModal.purchase_date}'):`, e);
                        // Decide on fallback: keep as is, or set to null/empty string if critical for modal
                        // For now, let's log and keep it, openEditModal might handle it or throw error.
                    }
                }
                
                if (finalWarrantyForModal.is_lifetime) {
                    finalWarrantyForModal.expiration_date = null; // Lifetime warranties shouldn't have an expiration date for the form
                } else if (finalWarrantyForModal.expiration_date) {
                    try {
                        finalWarrantyForModal.expiration_date = formatDateYYYYMMDD(new Date(finalWarrantyForModal.expiration_date));
                    } catch (e) {
                        console.error(`Error formatting expiration_date ('${finalWarrantyForModal.expiration_date}'):`, e);
                    }
                }
                // Ensure all essential fields for the modal are present, even if null
                finalWarrantyForModal.product_name = finalWarrantyForModal.product_name || '';
                finalWarrantyForModal.tags = finalWarrantyForModal.tags || [];
                finalWarrantyForModal.serial_numbers = finalWarrantyForModal.serial_numbers || [];
                finalWarrantyForModal.vendor = finalWarrantyForModal.vendor || ''; // Added explicit fallback for vendor
                finalWarrantyForModal.warranty_duration_years = finalWarrantyForModal.warranty_duration_years || 0;
                finalWarrantyForModal.warranty_duration_months = finalWarrantyForModal.warranty_duration_months || 0;
                finalWarrantyForModal.warranty_duration_days = finalWarrantyForModal.warranty_duration_days || 0;
                // Ensure file paths are present, default to null if not
                finalWarrantyForModal.invoice_path = finalWarrantyForModal.invoice_path || null;
                finalWarrantyForModal.manual_path = finalWarrantyForModal.manual_path || null;
                finalWarrantyForModal.other_document_path = finalWarrantyForModal.other_document_path || null;

                console.log('[DEBUG status.js] Final warranty object being passed to openEditModal (full object):', JSON.parse(JSON.stringify(finalWarrantyForModal)));
                console.log(`[DEBUG status.js] Final Tags:`, JSON.stringify(finalWarrantyForModal.tags));
                console.log(`[DEBUG status.js] Final Serial Numbers:`, JSON.stringify(finalWarrantyForModal.serial_numbers));
                console.log(`[DEBUG status.js] Final Vendor: '${finalWarrantyForModal.vendor}'`);

                if (typeof window.openEditModal === 'function') {
                    window.currentEditingWarrantyIdStatusPage = warrantyId; // For observer
                    await window.openEditModal(finalWarrantyForModal); 
                } else {
                    showToast('Edit modal functionality is not available.', 'error');
                    console.error("window.openEditModal is not a function. Ensure script.js is loaded and exposes it.");
                }

            } catch (error) {
                console.error('Error preparing for editing (status.js IIFE):', error);
                showToast(`Error: ${error.message || 'Could not load warranty details for editing.'}`, 'error');
            } finally {
                hideLoading(); // Hide main page loading, spinner for fetch is handled separately
            }
        }
    });

    // Save Warranty Observer logic (for refreshing after edit)
    if (typeof window.setupSaveWarrantyObserver !== 'function') { // Define only if not already defined (e.g. by script.js)
        window.setupSaveWarrantyObserver = (originalSaveFunction) => {
            return async function() { // This is the wrapper function
                const originalArguments = arguments; // Capture original arguments for the save function
                let warrantyIdToReopen = null;

                // Check if the edit was initiated from the status page *before* saving
                if (window.currentEditingWarrantyIdStatusPage) {
                    warrantyIdToReopen = window.currentEditingWarrantyIdStatusPage;
                    console.log(`[Observer status.js] Edit initiated from status page. Captured warrantyIdToReopen: ${warrantyIdToReopen}`);
                } else {
                    console.log(`[Observer status.js] Edit NOT initiated from status page (window.currentEditingWarrantyIdStatusPage is falsy).`);
                }

                // Call the original save function (e.g., window.saveWarranty from script.js)
                const result = await originalSaveFunction.apply(this, originalArguments);
                console.log(`[Observer status.js] Original save function completed. Result:`, result);

                // After the save is complete and if it was a status page edit:
                console.log(`[Observer status.js] Checking condition to refresh dashboard. warrantyIdToReopen value: "${warrantyIdToReopen}"`);
                if (warrantyIdToReopen) {
                    console.log(`[Observer status.js] Condition PASSED. Warranty ID ${warrantyIdToReopen} found. Refreshing dashboard and scheduling details re-open.`);
                    console.log(`[Observer status.js] Warranty update detected for ID: ${warrantyIdToReopen}. Refreshing dashboard.`);
                    showToast('Warranty updated. Refreshing list...', 'success');
                    
                    // Refresh the dashboard (which re-fetches and re-renders the table)
                    await initDashboard(); 

                    // After dashboard refresh, find and re-open the details for the edited warranty
                    // Use a timeout to allow the DOM to fully update after initDashboard
                    setTimeout(() => {
                        console.log(`[Observer status.js] setTimeout: Attempting to re-open details for ID: ${warrantyIdToReopen}`);
                        if (!warrantyIdToReopen) {
                            console.error("[Observer status.js] setTimeout: warrantyIdToReopen is NULL or undefined! Cannot re-open.");
                            delete window.currentEditingWarrantyIdStatusPage;
                            return;
                        }

                        const rowSelector = `#recentExpirationsBody tr[data-warranty-id="${warrantyIdToReopen}"]`;
                        console.log(`[Observer status.js] setTimeout: Looking for row with selector: "${rowSelector}"`);
                        const rowToReopen = document.querySelector(rowSelector);
                        
                        if (rowToReopen) {
                            console.log(`[Observer status.js] setTimeout: Found row for warranty ID: ${warrantyIdToReopen}. Calling toggleWarrantyDetails.`);
                            try {
                                toggleWarrantyDetails(warrantyIdToReopen, rowToReopen, true); // Pass true for forceRefetch 
                                console.log(`[Observer status.js] setTimeout: toggleWarrantyDetails called successfully for ID: ${warrantyIdToReopen}`);
                            } catch (e) {
                                console.error(`[Observer status.js] setTimeout: Error calling toggleWarrantyDetails for ID ${warrantyIdToReopen}:`, e);
                            }
                        } else {
                            console.warn(`[Observer status.js] setTimeout: Could NOT find row for warranty ID ${warrantyIdToReopen} after refresh. Selector used: "${rowSelector}"`);
                        }
                        // It's crucial to clean up the global flag after we're done with it.
                        delete window.currentEditingWarrantyIdStatusPage;
                        console.log(`[Observer status.js] Cleaned up window.currentEditingWarrantyIdStatusPage for ID: ${warrantyIdToReopen}`);
                    }, 100); // 100ms delay, can be adjusted if necessary

                }
                return result; // Return the result of the original save function
            };
        };
    }
    
    // DOMContentLoaded listener to initialize the dashboard and event listeners
    function initStatusPage() {
        if (isDOMHandlerAttached) {
            console.log('Status page DOM handler already attached, skipping...');
            return;
        }
        
        isDOMHandlerAttached = true;
        console.log('Status page DOM loaded (status.js IIFE). Waiting for i18n initialization...');
        
        const headerDarkModeToggle = document.getElementById('darkModeToggle');
        if (headerDarkModeToggle) {
            headerDarkModeToggle.addEventListener('change', function() {
                setTheme(this.checked);  // IIFE's setTheme (manages data-theme and localStorage)
                redrawChartsWithNewTheme(); // IIFE's redraw (manages status page charts)
            });
        } else {
            console.log('Header darkModeToggle not found by status.js for direct listener attachment. Theme changes via localStorage/theme-loader.js should still work.');
        }
        
        // Wait for i18n to be ready before initializing dashboard
        function waitForI18nAndInit() {
            if (window.i18n && window.i18n.t) {
                console.log('i18n is ready, initializing dashboard...');
                initDashboard(); // Call IIFE's initDashboard
            } else {
                console.log('Waiting for i18n ready event...');
                window.addEventListener('i18nReady', function(event) {
                    console.log('i18n ready event received, initializing dashboard...', event.detail);
                    initDashboard(); // Call IIFE's initDashboard
                }, { once: true });
                
                // Fallback timeout in case i18n event doesn't fire
                setTimeout(() => {
                    if (!window.i18n || !window.i18n.t) {
                        console.warn('i18n initialization timeout, proceeding anyway...');
                        initDashboard();
                    }
                }, 5000);
            }
        }
        
        waitForI18nAndInit();

        // Setup event listeners for status page specific controls
        if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', refreshDashboard);
        if (searchWarranties) searchWarranties.addEventListener('input', filterAndSortWarranties);
        // Restore saved status filter selection on load
        if (statusFilter) {
            const savedStatus = loadStatusFilterPreference();
            if (savedStatus && statusFilter.value !== savedStatus) {
                statusFilter.value = savedStatus;
            }
            statusFilter.addEventListener('change', function() {
                saveStatusFilterPreference(statusFilter.value);
                filterAndSortWarranties();
            });
        }
        if (exportBtn) { 
            exportBtn.addEventListener('click', function() { 
                console.log("Status page export button clicked (status.js IIFE).");
                // Placeholder for actual export logic for status page data
                showToast('Export for status page table not fully implemented yet.', 'info');
            });
        }
        attachSortListeners(); // Call IIFE's attachSortListeners

        // Simplified attempt to wrap saveWarranty from script.js, within DOMContentLoaded
        setTimeout(() => {
            if (typeof window.saveWarranty === 'function' && window.saveWarrantyObserverAttachedByStatus !== true) {
                console.log('(STATUS.JS) Attempting to wrap window.saveWarranty via DOMContentLoaded/setTimeout.');
                const originalSave = window.saveWarranty;
                window.saveWarranty = window.setupSaveWarrantyObserver(originalSave);
                window.saveWarrantyObserverAttachedByStatus = true;
                console.log('(STATUS.JS) window.saveWarranty hopefully WRAPPED by DOMContentLoaded/setTimeout.');
            } else if (window.saveWarrantyObserverAttachedByStatus === true) {
                console.log('(STATUS.JS) window.saveWarranty ALREADY WRAPPED (checked in DOMContentLoaded/setTimeout).');
            } else if (typeof window.saveWarranty !== 'function') {
                console.warn(`(STATUS.JS) DOMContentLoaded/setTimeout: window.saveWarranty NOT FOUND. Observer NOT attached.`);
            } else {
                 console.warn(`(STATUS.JS) DOMContentLoaded/setTimeout: window.saveWarranty found, but NOT WRAPPED (flag: ${window.saveWarrantyObserverAttachedByStatus}). Observer NOT attached.`);
            }
        }, 500); // Delay by 500ms
    }

    // Add event listener with protection against multiple calls
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStatusPage, { once: true });
    } else {
        // DOM is already loaded
        setTimeout(initStatusPage, 0);
    }
})();
