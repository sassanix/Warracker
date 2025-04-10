// Global variables
let warranties = [];
let currentTabIndex = 0;
let tabContents;
let editMode = false;
let currentWarrantyId = null;
let currentFilters = {
    status: 'all',
    tag: 'all',
    search: '',
    sortBy: 'expiration'
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
const exportBtn = document.getElementById('exportBtn');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const tableViewHeader = document.querySelector('.table-view-header');
const fileInput = document.getElementById('invoice');
const fileName = document.getElementById('fileName');
const manualInput = document.getElementById('manual');
const manualFileName = document.getElementById('manualFileName');
const editModal = document.getElementById('editModal');
const deleteModal = document.getElementById('deleteModal');
const editWarrantyForm = document.getElementById('editWarrantyForm');
const saveWarrantyBtn = document.getElementById('saveWarrantyBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const loadingContainer = document.getElementById('loadingContainer');
const toastContainer = document.getElementById('toastContainer');

// Tag DOM Elements
const selectedTagsContainer = document.getElementById('selectedTags');
const tagSearch = document.getElementById('tagSearch');
const tagsList = document.getElementById('tagsList');
const manageTagsBtn = document.getElementById('manageTagsBtn');
const tagManagementModal = document.getElementById('tagManagementModal');
const newTagForm = document.getElementById('newTagForm');
const existingTagsContainer = document.getElementById('existingTags');

// --- Add near other DOM Element declarations ---
const isLifetimeCheckbox = document.getElementById('isLifetime');
const warrantyYearsGroup = document.getElementById('warrantyYearsGroup');
const warrantyYearsInput = document.getElementById('warrantyYears');
const editIsLifetimeCheckbox = document.getElementById('editIsLifetime');
const editWarrantyYearsGroup = document.getElementById('editWarrantyYearsGroup');
const editWarrantyYearsInput = document.getElementById('editWarrantyYears');

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
 * Get the appropriate localStorage key prefix based on user type
 * @returns {string} The prefix to use for localStorage keys
 */
function getPreferenceKeyPrefix() {
    return getUserType() === 'admin' ? 'admin_' : 'user_';
}

// Theme Management
function setTheme(isDark) {
    // Get the appropriate key prefix based on user type
    const prefix = getPreferenceKeyPrefix();
    console.log(`Setting theme with prefix: ${prefix}`);
    
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    
    // Update darkMode settings
    localStorage.setItem(`${prefix}darkMode`, isDark);
    localStorage.setItem('darkMode', isDark); // Keep for backward compatibility
    
    // Update DOM
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    // Set toggle state
    if (darkModeToggle) {
        darkModeToggle.checked = isDark;
    }
    
    // Also update preferences in localStorage for consistency
    try {
        let userPrefs = {};
        const storedPrefs = localStorage.getItem(`${prefix}preferences`);
        if (storedPrefs) {
            userPrefs = JSON.parse(storedPrefs);
        }
        userPrefs.theme = isDark ? 'dark' : 'light';
        localStorage.setItem(`${prefix}preferences`, JSON.stringify(userPrefs));
    } catch (e) {
        console.error(`Error updating theme in ${prefix}preferences:`, e);
    }
}

// Initialize theme based on user preference or system preference
function initializeTheme() {
    // Get the appropriate key prefix based on user type
    const prefix = getPreferenceKeyPrefix();
    console.log(`Initializing theme with prefix: ${prefix}`);
    
    // First check user-specific setting
    const userDarkMode = localStorage.getItem(`${prefix}darkMode`);
    if (userDarkMode !== null) {
        console.log(`Found user-specific dark mode setting: ${userDarkMode}`);
        setTheme(userDarkMode === 'true');
        return;
    }
    
    // Then check global setting for backward compatibility
    const globalDarkMode = localStorage.getItem('darkMode');
    if (globalDarkMode !== null) {
        console.log(`Found global dark mode setting: ${globalDarkMode}`);
        setTheme(globalDarkMode === 'true');
        return;
    }
    
    // Check for system preference if no stored preference
    const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    console.log(`No saved preference, using system preference: ${prefersDarkMode}`);
    setTheme(prefersDarkMode);
}

// Initialize theme when page loads
initializeTheme();

// Variables
let currentView = 'grid'; // Default view
let expiringSoonDays = 30; // Default value, will be updated from user preferences

// API URL
const API_URL = '/api/warranties';

// Form tab navigation variables
const formTabs = Array.from(document.querySelectorAll('.form-tab'));
const tabContentsArray = document.querySelectorAll('.tab-content');
tabContents = Array.from(tabContentsArray);  // Convert NodeList to Array
const nextButton = document.querySelector('.next-tab');
const prevButton = document.querySelector('.prev-tab');

// Initialize form tabs
function initFormTabs() {
    console.log('Initializing form tabs...');
    
    // Hide the submit button initially
    const submitButton = document.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.style.display = 'none';
    }
    
    // Show/hide navigation buttons based on current tab
    updateNavigationButtons();
    
    // Remove any existing event listeners before adding new ones
    if (nextButton && prevButton) {
        const nextTabClone = nextButton.cloneNode(true);
        const prevTabClone = prevButton.cloneNode(true);
        
        nextButton.parentNode.replaceChild(nextTabClone, nextButton);
        prevButton.parentNode.replaceChild(prevTabClone, prevButton);
        
        // Add event listeners for tab navigation
        document.querySelector('.next-tab').addEventListener('click', () => {
            console.log('Next button clicked, current tab:', currentTabIndex);
            if (validateTab(currentTabIndex)) {
                switchToTab(currentTabIndex + 1);
            } else {
                showValidationErrors(currentTabIndex);
            }
        });
        
        document.querySelector('.prev-tab').addEventListener('click', () => {
            console.log('Previous button clicked, current tab:', currentTabIndex);
            switchToTab(currentTabIndex - 1);
        });
    }
    
    // Add click event for tab headers
    formTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            // Only allow clicking on previous tabs or current tab
            if (index <= currentTabIndex) {
                switchToTab(index);
            }
        });
    });
}

// Switch to a specific tab
function switchToTab(index) {
    console.log(`Switching to tab ${index} from tab ${currentTabIndex}`);
    
    // Ensure index is within bounds
    if (index < 0 || index >= formTabs.length) {
        console.log(`Invalid tab index: ${index}, not switching`);
        return;
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
    
    // Update summary if on summary tab
    if (index === formTabs.length - 1) {
        updateSummary();
    }
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
    const requiredInputs = tabContent.querySelectorAll('input[required]');
    
    // If there are no required inputs in this tab, it's automatically valid
    if (requiredInputs.length === 0) {
        return true;
    }
    
    let isValid = true;
    
    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
            input.classList.add('invalid');
        } else {
            input.classList.remove('invalid');
        }
    });
    
    return isValid;
}

// Show validation errors for a specific tab
function showValidationErrors(tabIndex) {
    const tabContent = tabContents[tabIndex];
    const requiredInputs = tabContent.querySelectorAll('input[required]');
    
    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('invalid');
            
            // Add validation message if not already present
            let validationMessage = input.nextElementSibling;
            if (!validationMessage || !validationMessage.classList.contains('validation-message')) {
                validationMessage = document.createElement('div');
                validationMessage.className = 'validation-message';
                validationMessage.textContent = 'This field is required';
                input.parentNode.insertBefore(validationMessage, input.nextSibling);
            }
        }
    });
    
    // Show toast message
    showToast('Please fill in all required fields', 'error');
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
    const purchaseDate = document.getElementById('purchaseDate')?.value;
    const summaryPurchaseDate = document.getElementById('summary-purchase-date');
    if (summaryPurchaseDate) {
        summaryPurchaseDate.textContent = purchaseDate ? 
            new Date(purchaseDate).toLocaleDateString() : '-';
    }
    
    // --- Handle Lifetime in Summary ---
    const isLifetime = isLifetimeCheckbox ? isLifetimeCheckbox.checked : false;
    const warrantyYears = warrantyYearsInput ? warrantyYearsInput.value : null;
    const summaryWarrantyYears = document.getElementById('summary-warranty-years');

    if (summaryWarrantyYears) {
        if (isLifetime) {
            summaryWarrantyYears.textContent = 'Lifetime';
        } else if (warrantyYears) {
            summaryWarrantyYears.textContent = `${warrantyYears} ${parseInt(warrantyYears) === 1 ? 'year' : 'years'}`;
        } else {
            summaryWarrantyYears.textContent = '-';
        }
    }
    
    // Calculate and display expiration date
    const summaryExpirationDate = document.getElementById('summary-expiration-date');
    if (summaryExpirationDate && purchaseDate && warrantyYears) {
        const expirationDate = new Date(purchaseDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + parseInt(warrantyYears));
        summaryExpirationDate.textContent = expirationDate.toLocaleDateString();
    } else if (summaryExpirationDate) {
        summaryExpirationDate.textContent = '-';
    }
    
    // Purchase price
    const purchasePrice = document.getElementById('purchasePrice')?.value;
    const summaryPurchasePrice = document.getElementById('summary-purchase-price');
    if (summaryPurchasePrice) {
        summaryPurchasePrice.textContent = purchasePrice ? 
            `$${parseFloat(purchasePrice).toFixed(2)}` : 'Not specified';
    }
    
    // Documents
    const invoiceFile = document.getElementById('invoice')?.files[0];
    const summaryInvoice = document.getElementById('summary-invoice');
    if (summaryInvoice) {
        summaryInvoice.textContent = invoiceFile ? 
            invoiceFile.name : 'No file selected';
    }
    
    const manualFile = document.getElementById('manual')?.files[0];
    const summaryManual = document.getElementById('summary-manual');
    if (summaryManual) {
        summaryManual.textContent = manualFile ? 
            manualFile.name : 'No file selected';
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
    fileName.textContent = '';
    manualFileName.textContent = '';
}

async function exportWarranties() {
    // Get filtered warranties
    let warrantiesToExport = [...warranties];
    
    // Apply current filters
    if (currentFilters.search) {
        const searchTerm = currentFilters.search.toLowerCase();
        warrantiesToExport = warrantiesToExport.filter(warranty => {
            // Check if product name contains search term
            const productNameMatch = warranty.product_name.toLowerCase().includes(searchTerm);
            
            // Check if any tag name contains search term
            const tagMatch = warranty.tags && Array.isArray(warranty.tags) && 
                warranty.tags.some(tag => tag.name.toLowerCase().includes(searchTerm));
            
            // Return true if either product name or tag name matches
            return productNameMatch || tagMatch;
        });
    }
    
    if (currentFilters.status !== 'all') {
        warrantiesToExport = warrantiesToExport.filter(warranty => 
            warranty.status === currentFilters.status
        );
    }
    
    // Apply tag filter
    if (currentFilters.tag !== 'all') {
        const tagId = parseInt(currentFilters.tag);
        warrantiesToExport = warrantiesToExport.filter(warranty => 
            warranty.tags && Array.isArray(warranty.tags) &&
            warranty.tags.some(tag => tag.id === tagId)
        );
    }
    
    // Create CSV content
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Add headers
    csvContent += "Product Name,Purchase Date,Warranty Period,Expiration Date,Status,Serial Numbers,Tags\n";
    
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
        
        // Format row data
        const row = [
            warranty.product_name || '',
            formatDate(new Date(warranty.purchase_date)),
            `${warranty.warranty_years || 0} ${warranty.warranty_years === 1 ? 'year' : 'years'}`,
            formatDate(new Date(warranty.expiration_date)),
            warranty.status || '',
            serialNumbers,
            tags
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
    showToast('Warranties exported successfully', 'success');
}

// Switch view of warranties list
function switchView(viewType) {
    console.log(`Switching to ${viewType} view...`);
    
    // Update currentView
    currentView = viewType;
    
    // Remove active class from all view buttons
    gridViewBtn.classList.remove('active');
    listViewBtn.classList.remove('active');
    tableViewBtn.classList.remove('active');
    
    // Update the view
    warrantiesList.className = `warranties-list ${viewType}-view`;
    
    // Hide table header if not in table view
    if (tableViewHeader) {
        tableViewHeader.style.display = viewType === 'table' ? 'flex' : 'none';
    }
    
    // Add active class to the selected view button
    if (viewType === 'grid') {
        gridViewBtn.classList.add('active');
    } else if (viewType === 'list') {
        listViewBtn.classList.add('active');
    } else if (viewType === 'table') {
        tableViewBtn.classList.add('active');
    }
    
    // Re-render warranties with the new view
    console.log('Applying filters after switching view...');
    applyFilters();
    
    // Get prefix for user-specific preferences
    const prefix = getPreferenceKeyPrefix();
    
    // Save view preference to localStorage with the appropriate prefix
    localStorage.setItem(`${prefix}warrantyView`, viewType);
    localStorage.setItem('warrantyView', viewType); // Keep global setting for backward compatibility
}

// Load saved view preference
function loadViewPreference() {
    // Get prefix for user-specific preferences
    const prefix = getPreferenceKeyPrefix();
    
    // First check for user-specific warrantyView
    const userSavedView = localStorage.getItem(`${prefix}warrantyView`);
    
    if (userSavedView) {
        console.log(`Found user-specific view preference: ${userSavedView}`);
        switchView(userSavedView);
        return;
    }
    
    // If not found, check for user-specific defaultView
    const userDefaultView = localStorage.getItem(`${prefix}defaultView`);
    if (userDefaultView) {
        console.log(`Found user-specific default view: ${userDefaultView}`);
        switchView(userDefaultView);
        return;
    }
    
    // If no user-specific preferences found, check global preferences for backward compatibility
    const globalSavedView = localStorage.getItem('warrantyView');
    if (globalSavedView) {
        console.log(`Found global view preference: ${globalSavedView}`);
        switchView(globalSavedView);
        return;
    }
    
    const globalDefaultView = localStorage.getItem('defaultView');
    if (globalDefaultView) {
        console.log(`Found global default view: ${globalDefaultView}`);
        switchView(globalDefaultView);
        return;
    }
    
    // Default to grid view if no preferences found
    console.log('No view preference found, defaulting to grid view');
    switchView('grid');
}

// Dark mode toggle
darkModeToggle.addEventListener('change', (e) => {
    setTheme(e.target.checked);
});

const serialNumbersContainer = document.getElementById('serialNumbersContainer');

// Add event listener for adding new serial number inputs
serialNumbersContainer.addEventListener('click', (e) => {
    if (e.target.closest('.add-serial-number')) {
        addSerialNumberInput();
    }
});

// Add a serial number input field
function addSerialNumberInput(container = serialNumbersContainer) {
    if (!container) return;
    
    // Create a new input group
    const inputGroup = document.createElement('div');
    inputGroup.className = 'serial-number-input';
    
    // Create an input element
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.name = 'serial_numbers[]';
    input.placeholder = 'Enter serial number';
    
    // Check if this is the first serial number input
    const isFirstInput = container.querySelectorAll('.serial-number-input').length === 0;
    
    // Append input to the input group
    inputGroup.appendChild(input);
    
    // Only add remove button if this is not the first input
    if (!isFirstInput) {
        // Create a remove button
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-sm btn-danger remove-serial';
        removeButton.innerHTML = '<i class="fas fa-times"></i>';
        
        // Add event listener to remove button
        removeButton.addEventListener('click', function() {
            container.removeChild(inputGroup);
        });
        
        // Append remove button to the input group
        inputGroup.appendChild(removeButton);
    }
    
    // Insert the new input group before the add button
    const addButton = container.querySelector('.add-serial');
    if (addButton) {
        container.insertBefore(inputGroup, addButton);
    } else {
        container.appendChild(inputGroup);
        
        // Create and append an add button if it doesn't exist
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'btn btn-sm btn-secondary add-serial';
        addButton.innerHTML = '<i class="fas fa-plus"></i> Add Serial Number';
        
        addButton.addEventListener('click', function() {
            addSerialNumberInput(container);
        });
        
        container.appendChild(addButton);
    }
}

// Functions
function showLoading() {
    loadingContainer.classList.add('active');
}

function hideLoading() {
    loadingContainer.classList.remove('active');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        ${message}
        <button class="toast-close">&times;</button>
    `;
    
    // Add close event
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 3000);
}

// Update file name display when a file is selected
function updateFileName(event, inputId = 'invoice', outputId = 'fileName') {
    const input = event ? event.target : document.getElementById(inputId);
    const output = document.getElementById(outputId);
    
    if (!input || !output) return;
    
    if (input.files && input.files[0]) {
        output.textContent = input.files[0].name;
    } else {
        output.textContent = '';
    }
}

// Helper function to process warranty data
function processWarrantyData(warranty) {
    console.log('Processing warranty data:', warranty);
    
    // Create a copy of the warranty object to avoid modifying the original
    const processedWarranty = { ...warranty };
    
    // Ensure product_name exists
    if (!processedWarranty.product_name) {
        processedWarranty.product_name = 'Unnamed Product';
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to midnight for accurate date comparisons

    processedWarranty.purchaseDate = processedWarranty.purchase_date ? new Date(processedWarranty.purchase_date) : null;
    processedWarranty.expirationDate = processedWarranty.expiration_date ? new Date(processedWarranty.expiration_date) : null;

    // --- Lifetime Handling ---
    if (processedWarranty.is_lifetime) {
        processedWarranty.status = 'active';
        processedWarranty.statusText = 'Lifetime';
        processedWarranty.daysRemaining = Infinity;
    } else if (processedWarranty.expirationDate && !isNaN(processedWarranty.expirationDate.getTime())) {
        // Existing logic for dated warranties
        const expirationDateOnly = new Date(processedWarranty.expirationDate);
        expirationDateOnly.setHours(0,0,0,0);

        const timeDiff = expirationDateOnly - today;
        const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        processedWarranty.daysRemaining = daysRemaining;

        if (daysRemaining < 0) {
            processedWarranty.status = 'expired';
            processedWarranty.statusText = 'Expired';
        } else if (daysRemaining < expiringSoonDays) {
            processedWarranty.status = 'expiring';
            processedWarranty.statusText = `Expiring Soon (${daysRemaining} day${daysRemaining !== 1 ? 's' : ''})`;
        } else {
            processedWarranty.status = 'active';
            processedWarranty.statusText = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
        }
    } else {
        processedWarranty.status = 'unknown';
        processedWarranty.statusText = 'Unknown Status';
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

async function loadWarranties() {
    try {
        console.log('Loading warranties...');
        showLoading();
        
        // Get expiring soon days from user preferences if available
        try {
            const prefsResponse = await fetch('/api/auth/preferences', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (prefsResponse.ok) {
                const data = await prefsResponse.json();
                if (data && data.expiring_soon_days) {
                    const oldValue = expiringSoonDays;
                    expiringSoonDays = data.expiring_soon_days;
                    console.log('Updated expiring soon days from preferences:', expiringSoonDays);
                    
                    // If we already have warranties loaded and the value changed, reprocess them
                    if (warranties && warranties.length > 0 && oldValue !== expiringSoonDays) {
                        console.log('Reprocessing warranties with new expiringSoonDays value');
                        warranties = warranties.map(warranty => processWarrantyData(warranty));
                        renderWarrantiesTable(warranties);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading preferences:', error);
            // Continue with default value
        }
        
        // Use the full URL to avoid path issues
        const apiUrl = window.location.origin + '/api/warranties';
        
        // Check if auth is available and user is authenticated
        if (!window.auth || !window.auth.isAuthenticated()) {
            console.log('User not authenticated, showing empty state');
            renderEmptyState('Please log in to view your warranties.');
            hideLoading();
            return;
        }
        
        // Get the auth token
        const token = window.auth.getToken();
        if (!token) {
            console.log('No auth token available');
            renderEmptyState('Authentication error. Please log in again.');
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
        console.log('Received warranties from server:', data);
        
        // Process each warranty to calculate status and days remaining
        warranties = data.map(warranty => {
            return processWarrantyData(warranty);
        });
        
        console.log('Processed warranties:', warranties);
        
        if (warranties.length === 0) {
            console.log('No warranties found, showing empty state');
            renderEmptyState('No warranties found. Add your first warranty using the form.');
        } else {
            console.log('Applying filters to display warranties');
            
            // Populate tag filter dropdown with tags from warranties
            populateTagFilter();
            
            applyFilters();
        }
    } catch (error) {
        console.error('Error loading warranties:', error);
        renderEmptyState('Error loading warranties. Please try again later.');
    } finally {
        hideLoading();
    }
}

function renderEmptyState(message = 'No warranties yet. Add your first warranty to get started.') {
    warrantiesList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-box-open"></i>
            <h3>No warranties found</h3>
            <p>${message}</p>
        </div>
    `;
}

function formatDate(date) {
    if (!date) return 'N/A';
    
    // If date is already a Date object, use it directly
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
        return 'N/A';
    }
    
    return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

async function renderWarranties(warrantiesToRender) {
    console.log('renderWarranties called with:', warrantiesToRender);
    if (!warrantiesToRender || warrantiesToRender.length === 0) {
        renderEmptyState();
        return;
    }
    
    const today = new Date();
    
    warrantiesList.innerHTML = '';
    
    // Apply sorting based on current sort selection
    const sortedWarranties = [...warrantiesToRender].sort((a, b) => {
        switch (currentFilters.sortBy) {
            case 'name':
                return a.product_name.localeCompare(b.product_name);
            case 'purchase':
                return new Date(b.purchase_date || 0) - new Date(a.purchase_date || 0);
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
    warrantiesList.className = `warranties-list ${currentView}-view`;
    
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
        const statusClass = warranty.status || 'unknown';
        const statusText = warranty.statusText || 'Unknown Status';
        const warrantyYearsText = isLifetime ? 'Lifetime' : (warranty.warranty_years !== undefined ? `${warranty.warranty_years} ${warranty.warranty_years === 1 ? 'year' : 'years'}` : 'N/A');
        const expirationDateText = isLifetime ? 'Lifetime' : formatDate(expirationDate);
        
        // Debug file paths
        console.log(`Warranty ID ${warranty.id} - Product: ${warranty.product_name}`);
        console.log(`- Invoice path: ${warranty.invoice_path}`);
        console.log(`- Manual path: ${warranty.manual_path}`);
        
        // Make sure serial numbers array exists and is valid
        const validSerialNumbers = Array.isArray(warranty.serial_numbers) 
            ? warranty.serial_numbers.filter(sn => sn && typeof sn === 'string' && sn.trim() !== '')
            : [];
        
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
        
        const cardElement = document.createElement('div');
        cardElement.className = `warranty-card ${statusClass === 'expired' ? 'expired' : statusClass === 'expiring' ? 'expiring-soon' : 'active'}`;
        
        if (currentView === 'grid') {
            // Grid view HTML structure
            cardElement.innerHTML = `
                <div class="product-name-header">
                    <h3 class="warranty-title">${warranty.product_name || 'Unnamed Product'}</h3>
                    <div class="warranty-actions">
                        <button class="action-btn edit-btn" title="Edit" data-id="${warranty.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Delete" data-id="${warranty.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="warranty-content">
                    <div class="warranty-info">
                        <div>Purchased: <span>${formatDate(purchaseDate)}</span></div>
                        <div>Warranty: <span>${warrantyYearsText}</span></div>
                        <div>Expires: <span>${expirationDateText}</span></div>
                        ${warranty.purchase_price ? `<div>Price: <span>$${parseFloat(warranty.purchase_price).toFixed(2)}</span></div>` : ''}
                        ${validSerialNumbers.length > 0 ? `
                            <div class="serial-numbers">
                                <strong>Serial Numbers:</strong>
                                <ul>
                                    ${validSerialNumbers.map(sn => `<li>${sn}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="warranty-status-row status-${statusClass}">
                    <span>${statusText}</span>
                </div>
                <div class="document-links-row">
                    ${warranty.product_url ? `
                        <a href="${warranty.product_url}" class="product-link" target="_blank">
                            <i class="fas fa-globe"></i> Product Website
                        </a>
                    ` : ''}
                    ${warranty.invoice_path && warranty.invoice_path !== 'null' ? `
                        <a href="#" onclick="openSecureFile('${warranty.invoice_path}'); return false;" class="invoice-link">
                            <i class="fas fa-file-invoice"></i> Invoice
                        </a>` : ''}
                    ${warranty.manual_path && warranty.manual_path !== 'null' ? `
                        <a href="#" onclick="openSecureFile('${warranty.manual_path}'); return false;" class="manual-link">
                            <i class="fas fa-book"></i> Manual
                        </a>` : ''}
                </div>
                ${tagsHtml}
            `;
        } else if (currentView === 'list') {
            // List view HTML structure
            cardElement.innerHTML = `
                <div class="product-name-header">
                    <h3 class="warranty-title">${warranty.product_name || 'Unnamed Product'}</h3>
                    <div class="warranty-actions">
                        <button class="action-btn edit-btn" title="Edit" data-id="${warranty.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Delete" data-id="${warranty.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="warranty-content">
                    <div class="warranty-info">
                        <div>Purchased: <span>${formatDate(purchaseDate)}</span></div>
                        <div>Warranty: <span>${warrantyYearsText}</span></div>
                        <div>Expires: <span>${expirationDateText}</span></div>
                        ${warranty.purchase_price ? `<div>Price: <span>$${parseFloat(warranty.purchase_price).toFixed(2)}</span></div>` : ''}
                        ${validSerialNumbers.length > 0 ? `
                            <div class="serial-numbers">
                                <strong>Serial Numbers:</strong>
                                <ul>
                                    ${validSerialNumbers.map(sn => `<li>${sn}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="warranty-status-row status-${statusClass}">
                    <span>${statusText}</span>
                </div>
                <div class="document-links-row">
                    ${warranty.product_url ? `
                        <a href="${warranty.product_url}" class="product-link" target="_blank">
                            <i class="fas fa-globe"></i> Product Website
                        </a>
                    ` : ''}
                    ${warranty.invoice_path && warranty.invoice_path !== 'null' ? `
                        <a href="#" onclick="openSecureFile('${warranty.invoice_path}'); return false;" class="invoice-link">
                            <i class="fas fa-file-invoice"></i> Invoice
                        </a>` : ''}
                    ${warranty.manual_path && warranty.manual_path !== 'null' ? `
                        <a href="#" onclick="openSecureFile('${warranty.manual_path}'); return false;" class="manual-link">
                            <i class="fas fa-book"></i> Manual
                        </a>` : ''}
                </div>
                ${tagsHtml}
            `;
        } else if (currentView === 'table') {
            // Table view HTML structure
            cardElement.innerHTML = `
                <div class="product-name-header">
                    <h3 class="warranty-title">${warranty.product_name || 'Unnamed Product'}</h3>
                    <div class="warranty-actions">
                        <button class="action-btn edit-btn" title="Edit" data-id="${warranty.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Delete" data-id="${warranty.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="warranty-content">
                    <div class="warranty-info">
                        <div>Purchased: <span>${formatDate(purchaseDate)}</span></div>
                        <div>Expires: <span>${expirationDateText}</span></div>
                    </div>
                </div>
                <div class="warranty-status-row status-${statusClass}">
                    <span>${statusText}</span>
                </div>
                <div class="document-links-row">
                    ${warranty.product_url ? `
                        <a href="${warranty.product_url}" class="product-link" target="_blank">
                            <i class="fas fa-globe"></i>
                        </a>
                    ` : ''}
                    ${warranty.invoice_path && warranty.invoice_path !== 'null' ? `
                        <a href="#" onclick="openSecureFile('${warranty.invoice_path}'); return false;" class="invoice-link">
                            <i class="fas fa-file-invoice"></i>
                        </a>` : ''}
                    ${warranty.manual_path && warranty.manual_path !== 'null' ? `
                        <a href="#" onclick="openSecureFile('${warranty.manual_path}'); return false;" class="manual-link">
                            <i class="fas fa-book"></i>
                        </a>` : ''}
                </div>
                ${tagsHtml}
            `;
        }
        
        // Add event listeners
        warrantiesList.appendChild(cardElement);
        
        // Edit button event listener
        cardElement.querySelector('.edit-btn').addEventListener('click', () => {
            openEditModal(warranty);
        });
        
        // Delete button event listener
        cardElement.querySelector('.delete-btn').addEventListener('click', () => {
            openDeleteModal(warranty.id, warranty.product_name);
        });
    });
}

function filterWarranties() {
    const searchTerm = searchInput.value.toLowerCase();
    
    // Show or hide the clear search button
    clearSearchBtn.style.display = searchTerm ? 'flex' : 'none';
    
    if (!searchTerm) {
        renderWarranties();
        return;
    }
    
    const filtered = warranties.filter(warranty => {
        // Check product name
        if (warranty.product_name.toLowerCase().includes(searchTerm)) {
            return true;
        }
        
        // Check tags
        if (warranty.tags && Array.isArray(warranty.tags)) {
            return warranty.tags.some(tag => tag.name.toLowerCase().includes(searchTerm));
        }
        
        return false;
    });
    
    // Add visual feedback if no results found
    if (filtered.length === 0) {
        renderEmptyState(`No matches found for "${searchTerm}". Try a different search term.`);
    } else {
        renderWarranties(filtered);
    }
}

function applyFilters() {
    console.log('Applying filters with:', currentFilters);
    
    // Filter warranties based on currentFilters
    const filtered = warranties.filter(warranty => {
        // Status filter
        if (currentFilters.status !== 'all' && warranty.status !== currentFilters.status) {
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
        
        // Search filter
        if (currentFilters.search) {
            const searchTerm = currentFilters.search.toLowerCase();
            
            // Check if product name contains search term
            const productNameMatch = warranty.product_name.toLowerCase().includes(searchTerm);
            
            // Check if any tag name contains search term
            const tagMatch = warranty.tags && Array.isArray(warranty.tags) && 
                warranty.tags.some(tag => tag.name.toLowerCase().includes(searchTerm));
            
            // Return true if either product name or tag name matches
            if (!productNameMatch && !tagMatch) {
                return false;
            }
        }
        
        return true;
    });
    
    console.log('Filtered warranties:', filtered);
    
    // Render the filtered warranties
    renderWarranties(filtered);
}

function openEditModal(warranty) {
    currentWarrantyId = warranty.id;
    
    // Populate form fields
    document.getElementById('editProductName').value = warranty.product_name;
    document.getElementById('editProductUrl').value = warranty.product_url || '';
    document.getElementById('editPurchaseDate').value = warranty.purchase_date.split('T')[0];
    document.getElementById('editWarrantyYears').value = warranty.warranty_years;
    document.getElementById('editPurchasePrice').value = warranty.purchase_price || '';
    
    // Clear existing serial number inputs
    const editSerialNumbersContainer = document.getElementById('editSerialNumbersContainer');
    editSerialNumbersContainer.innerHTML = '';
    
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
            <input type="text" name="serial_numbers[]" class="form-control" placeholder="Enter serial number" value="${validSerialNumbers[0]}">
            <button type="button" class="btn btn-sm btn-primary add-serial-number">
                <i class="fas fa-plus"></i> Add Another
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
                <input type="text" name="serial_numbers[]" class="form-control" placeholder="Enter serial number" value="${validSerialNumbers[i]}">
                <button type="button" class="btn btn-sm btn-danger remove-serial-number">
                    <i class="fas fa-minus"></i> Remove
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
    if (currentInvoiceElement) {
        if (warranty.invoice_path && warranty.invoice_path !== 'null') {
            currentInvoiceElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> Current invoice: 
                    <a href="#" onclick="openSecureFile('${warranty.invoice_path}'); return false;">View</a>
                    (Upload a new file to replace)
                </span>
            `;
        } else {
            currentInvoiceElement.innerHTML = '<span>No invoice uploaded</span>';
        }
    }
    
    // Show current manual if exists
    const currentManualElement = document.getElementById('currentManual');
    if (currentManualElement) {
        if (warranty.manual_path && warranty.manual_path !== 'null') {
            currentManualElement.innerHTML = `
                <span class="text-success">
                    <i class="fas fa-check-circle"></i> Current manual: 
                    <a href="#" onclick="openSecureFile('${warranty.manual_path}'); return false;">View</a>
                    (Upload a new file to replace)
                </span>
            `;
        } else {
            currentManualElement.innerHTML = '<span>No manual uploaded</span>';
        }
    }
    
    // Reset file inputs
    document.getElementById('editInvoice').value = '';
    document.getElementById('editManual').value = '';
    document.getElementById('editFileName').textContent = '';
    document.getElementById('editManualFileName').textContent = '';
    
    // Initialize file input event listeners
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

    // --- Set Lifetime Checkbox and Toggle Years Input ---
    if (editIsLifetimeCheckbox && editWarrantyYearsGroup && editWarrantyYearsInput) {
        editIsLifetimeCheckbox.checked = warranty.is_lifetime || false;
        handleEditLifetimeChange(); // Call handler to set initial state

        // Remove previous listener if exists
        editIsLifetimeCheckbox.removeEventListener('change', handleEditLifetimeChange);
        // Add new listener
        editIsLifetimeCheckbox.addEventListener('change', handleEditLifetimeChange);

        // Set years value only if NOT lifetime
        editWarrantyYearsInput.value = warranty.is_lifetime ? '' : (warranty.warranty_years || '');
    } else {
        console.error("Lifetime warranty elements not found in edit form");
    }
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
function submitForm(event) {
    event.preventDefault();
    
    // --- Add Lifetime Check ---
    if (!isLifetimeCheckbox.checked && !warrantyYearsInput.value) {
        showToast('Warranty period (years) is required unless it\'s a lifetime warranty', 'error');
        switchToTab(1); // Switch to warranty details tab
        warrantyYearsInput.focus();
        warrantyYearsInput.classList.add('invalid');
        return;
    }
    
    // Validate all tabs
    for (let i = 0; i < tabContents.length; i++) {
        if (!validateTab(i)) {
            // Switch to the first invalid tab
            switchToTab(i);
            return;
        }
    }
    
    // Create form data object
    const formData = new FormData(warrantyForm);
    
    // Add serial numbers to form data
    const serialInputs = document.querySelectorAll('#serialNumbersContainer input');
    serialInputs.forEach(input => {
        if (input.value.trim()) {
            formData.append('serial_numbers', input.value.trim());
        }
    });
    
    // Add tag IDs to form data as JSON string
    if (selectedTags && selectedTags.length > 0) {
        const tagIds = selectedTags.map(tag => tag.id);
        formData.append('tag_ids', JSON.stringify(tagIds));
    }
    
    // --- Ensure is_lifetime is correctly added ---
    if (!isLifetimeCheckbox.checked) {
        formData.append('is_lifetime', 'false');
    }
    
    // Show loading spinner
    showLoadingSpinner();
    
    // Send the form data to the server
    fetch('/api/warranties', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Failed to add warranty');
            });
        }
        return response.json();
    })
    .then(data => {
        hideLoadingSpinner();
        showToast('Warranty added successfully', 'success');
        
        // Reset form and reload warranties
        resetForm();
        
        // Reset selected tags
        selectedTags = [];
        if (selectedTagsContainer) {
            selectedTagsContainer.innerHTML = '';
        }
        
        loadWarranties();
    })
    .catch(error => {
        hideLoadingSpinner();
        console.error('Error adding warranty:', error);
        showToast(error.message || 'Failed to add warranty', 'error');
    });
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the warranty form
    initWarrantyForm();
    
    // Load warranties
    loadWarranties();
    
    // Initialize theme
    initializeTheme();
    
    // Set up event listeners for other UI controls
    setupUIEventListeners();
});

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
    let isValid = true;
    
    // Get all required inputs in this tab
    const requiredInputs = tab.querySelectorAll('input[required]');
    
    // Check if all required fields are filled
    requiredInputs.forEach(input => {
        if (!input.value) {
            isValid = false;
            input.classList.add('invalid');
        } else {
            input.classList.remove('invalid');
        }
    });
    
    // Update the tab button to show completion status
    const tabBtn = document.querySelector(`.edit-tab-btn[data-tab="${tabId}"]`);
    if (isValid) {
        tabBtn.classList.add('completed');
    } else {
        tabBtn.classList.remove('completed');
    }
    
    return isValid;
}

// Add this function for secure file access
function openSecureFile(filePath) {
    if (!filePath || filePath === 'null') {
        console.error('Invalid file path:', filePath);
        showToast('Invalid file path', 'error');
        return false;
    }
    
    console.log('Opening secure file:', filePath);
    
    // Get the file name from the path
    const fileName = filePath.split('/').pop();
    
    // Get auth token
    const token = window.auth.getToken();
    if (!token) {
        showToast('Authentication error. Please log in again.', 'error');
        return false;
    }
    
    // Use fetch with proper authorization header
    fetch(`/api/secure-file/${fileName}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
        return response.blob();
    })
    .then(blob => {
        // Create a URL for the blob
        const blobUrl = window.URL.createObjectURL(blob);
        
        // Open in new tab
        window.open(blobUrl, '_blank');
    })
    .catch(error => {
        console.error('Error fetching file:', error);
        showToast('Error opening file: ' + error.message, 'error');
    });
    
    return false;
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
    
    // Initialize tag functionality
    initTagFunctionality();
    
    // Form submission
    if (warrantyForm) {
        warrantyForm.addEventListener('submit', submitForm);
    }

    // Initialize lifetime checkbox listener
    if (isLifetimeCheckbox && warrantyYearsGroup && warrantyYearsInput) {
        isLifetimeCheckbox.addEventListener('change', handleLifetimeChange);
        handleLifetimeChange(); // Initial check
    } else {
        console.error("Lifetime warranty elements not found in add form");
    }
}

// Initialize tag functionality
function initTagFunctionality() {
    // Skip if tag elements don't exist
    if (!tagSearch || !tagsList || !manageTagsBtn || !selectedTagsContainer) {
        console.log('Tag elements not found, skipping tag initialization');
        return;
    }

    // Load tags from API if not already loaded
    if (allTags.length === 0) {
        loadTags();
    }
    
    // Tag search input
    tagSearch.addEventListener('focus', () => {
        renderTagsList();
        tagsList.classList.add('show');
    });
    
    tagSearch.addEventListener('input', () => {
        renderTagsList(tagSearch.value);
    });
    
    document.addEventListener('click', (e) => {
        if (!tagSearch.contains(e.target) && !tagsList.contains(e.target)) {
            tagsList.classList.remove('show');
        }
    });
    
    // Manage tags button
    manageTagsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openTagManagementModal();
    });
    
    // Tag management form
    if (newTagForm) {
        newTagForm.addEventListener('submit', (e) => {
            e.preventDefault();
            createNewTag();
        });
    }
    
    // Close modal buttons
    if (tagManagementModal) {
        const closeButtons = tagManagementModal.querySelectorAll('[data-dismiss="modal"]');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                tagManagementModal.style.display = 'none';
            });
        });
    }
}

// Function to load all tags
async function loadTags() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.error('No auth token found');
            return;
        }
        
        showLoadingSpinner();
        
        const response = await fetch('/api/tags', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load tags: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Loaded tags:', data);
        
        // Store tags globally
        allTags = data;
        
        // Populate the tag filter
        populateTagFilter();
        
        // Render selected tags if any
        if (selectedTagsContainer) {
            renderSelectedTags();
        }
        
        hideLoadingSpinner();
        
        return data;
    } catch (error) {
        console.error('Error loading tags:', error);
        hideLoadingSpinner();
        return [];
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
            createTag(searchTerm);
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

// Create a new tag
function createTag(name) {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.error('No authentication token found');
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
            throw new Error('Failed to create tag');
        }
        return response.json();
    })
    .then(data => {
        // Add new tag to allTags array
        allTags.push({
            id: data.id,
            name: data.name,
            color: data.color
        });
        
        // Select the new tag
        selectedTags.push({
            id: data.id,
            name: data.name,
            color: data.color
        });
        
        // Clear search and rerender
        if (tagSearch) tagSearch.value = '';
        renderSelectedTags();
        
        showToast('Tag created successfully', 'success');
    })
    .catch(error => {
        console.error('Error creating tag:', error);
        showToast(error.message || 'Failed to create tag', 'error');
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
    
    // Show modal
    tagManagementModal.style.display = 'block';
}

// Render existing tags in the management modal
function renderExistingTags() {
    if (!existingTagsContainer) return;
    
    existingTagsContainer.innerHTML = '';
    
    if (allTags.length === 0) {
        existingTagsContainer.innerHTML = '<div class="no-tags">No tags created yet</div>';
        return;
    }
    
    allTags.forEach(tag => {
        const tagElement = document.createElement('div');
        tagElement.className = 'existing-tag';
        
        tagElement.innerHTML = `
            <div class="existing-tag-info">
                <div class="existing-tag-color" style="background-color: ${tag.color}"></div>
                <div class="existing-tag-name">${tag.name}</div>
            </div>
            <div class="existing-tag-actions">
                <button class="btn btn-sm btn-secondary edit-tag" data-id="${tag.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger delete-tag" data-id="${tag.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listeners for edit and delete
        tagElement.querySelector('.edit-tag').addEventListener('click', () => {
            editTag(tag);
        });
        
        tagElement.querySelector('.delete-tag').addEventListener('click', () => {
            deleteTag(tag.id);
        });
        
        existingTagsContainer.appendChild(tagElement);
    });
}

// Edit a tag
function editTag(tag) {
    const tagInfoElement = document.querySelector(`.existing-tag .existing-tag-info:has(+ .existing-tag-actions button[data-id="${tag.id}"])`);
    
    if (!tagInfoElement) {
        // Alternative selector for browsers that don't support :has
        const tagElement = document.querySelector(`.existing-tag`);
        const buttons = tagElement?.querySelectorAll(`.existing-tag-actions button[data-id="${tag.id}"]`);
        if (buttons?.length > 0) {
            const parent = buttons[0].closest('.existing-tag');
            if (parent) {
                const infoElement = parent.querySelector('.existing-tag-info');
                if (infoElement) {
                    tagInfoElement = infoElement;
                }
            }
        }
        
        if (!tagInfoElement) return;
    }
    
    const originalHTML = tagInfoElement.innerHTML;
    
    tagInfoElement.innerHTML = `
        <input type="text" class="form-control edit-tag-name" value="${tag.name}" style="width: 60%;">
        <input type="color" class="edit-tag-color" value="${tag.color}" style="width: 40px; height: 38px;">
        <button class="btn btn-sm btn-primary save-edit" data-id="${tag.id}">Save</button>
        <button class="btn btn-sm btn-secondary cancel-edit">Cancel</button>
    `;
    
    // Add event listeners
    tagInfoElement.querySelector('.save-edit').addEventListener('click', () => {
        const newName = tagInfoElement.querySelector('.edit-tag-name').value.trim();
        const newColor = tagInfoElement.querySelector('.edit-tag-color').value;
        
        if (!newName) {
            showToast('Tag name is required', 'error');
            return;
        }
        
        updateTag(tag.id, newName, newColor);
    });
    
    tagInfoElement.querySelector('.cancel-edit').addEventListener('click', () => {
        // Restore original HTML
        tagInfoElement.innerHTML = originalHTML;
    });
}

// Update a tag
function updateTag(id, name, color) {
    const token = localStorage.getItem('auth_token');
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
            throw new Error('Failed to update tag');
        }
        return response.json();
    })
    .then(data => {
        // Update tag in allTags array
        const index = allTags.findIndex(tag => tag.id === id);
        if (index !== -1) {
            allTags[index].name = name;
            allTags[index].color = color;
        }
        
        // Update tag in selectedTags if present
        const selectedIndex = selectedTags.findIndex(tag => tag.id === id);
        if (selectedIndex !== -1) {
            selectedTags[selectedIndex].name = name;
            selectedTags[selectedIndex].color = color;
        }
        
        // Rerender existing tags and selected tags
        renderExistingTags();
        renderSelectedTags();
        
        // Update summary if needed
        if (document.getElementById('summary-tags')) {
            updateSummary();
        }
        
        showToast('Tag updated successfully', 'success');
    })
    .catch(error => {
        console.error('Error updating tag:', error);
        showToast(error.message || 'Failed to update tag', 'error');
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
        showToast('Authentication required', 'error'); // Added toast for better feedback
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
        
        // --- FIX: Re-render UI elements ---
        renderExistingTags(); // Update the list in the modal
        renderSelectedTags(); // Update selected tags in the add form
        renderEditSelectedTags(); // Update selected tags in the edit form
        populateTagFilter(); // Update the filter dropdown on the main page
        // --- END FIX ---
        
        showToast('Tag deleted successfully', 'success');
    })
    .catch(error => {
        console.error('Error deleting tag:', error);
        showToast(error.message || 'Failed to delete tag', 'error'); // Show specific error message
    })
    .finally(() => {
        hideLoadingSpinner(); // Hide loading indicator
    });
}

// Set up event listeners for UI controls
function setupUIEventListeners() {
    // Initialize settings button
    const settingsBtn = document.querySelector('.settings-btn');
    const settingsMenu = document.querySelector('.settings-menu');
    
    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsMenu.classList.toggle('active');
        });
        
        // Close settings menu when clicking outside
        document.addEventListener('click', (e) => {
            if (settingsMenu.classList.contains('active') && 
                !settingsMenu.contains(e.target) && 
                !settingsBtn.contains(e.target)) {
                settingsMenu.classList.remove('active');
            }
        });
    }
    
    // Initialize edit tabs
    initEditTabs();
    
    // Close modals when clicking outside or on close button
    document.querySelectorAll('.modal-backdrop, [data-dismiss="modal"]').forEach(element => {
        element.addEventListener('click', (e) => {
            if (e.target === element) {
                closeModals();
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
    
    if (searchInput) {
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
            
            applyFilters();
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
            }
        });
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            currentFilters.status = statusFilter.value;
            applyFilters();
        });
    }
    
    if (tagFilter) {
        tagFilter.addEventListener('change', () => {
            currentFilters.tag = tagFilter.value;
            applyFilters();
        });
    }
    
    if (sortBySelect) {
        sortBySelect.addEventListener('change', () => {
            currentFilters.sortBy = sortBySelect.value;
            applyFilters();
        });
    }
    
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
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadWarranties);
    
    // Save warranty changes
    const saveWarrantyBtn = document.getElementById('saveWarrantyBtn');
    if (saveWarrantyBtn) saveWarrantyBtn.addEventListener('click', saveWarranty);
    
    // Confirm delete button
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', deleteWarranty);
    
    // Load saved view preference
    loadViewPreference();
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

// Delete warranty function
function deleteWarranty() {
    if (!currentWarrantyId) {
        showToast('No warranty selected for deletion', 'error');
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
        loadWarranties();
    })
    .catch(error => {
        hideLoadingSpinner();
        console.error('Error deleting warranty:', error);
        showToast('Failed to delete warranty', 'error');
    });
}

// Save warranty updates
function saveWarranty() {
    if (!currentWarrantyId) {
        showToast('No warranty selected for update', 'error');
        return;
    }
    
    const productName = document.getElementById('editProductName').value.trim();
    const purchaseDate = document.getElementById('editPurchaseDate').value;
    const warrantyYears = document.getElementById('editWarrantyYears').value;
    
    // Basic validation
    if (!productName) {
        showToast('Product name is required', 'error');
        return;
    }
    
    if (!purchaseDate) {
        showToast('Purchase date is required', 'error');
        return;
    }
    
    if (!warrantyYears || warrantyYears <= 0) {
        showToast('Warranty period must be greater than 0', 'error');
        return;
    }
    
    // Create form data
    const formData = new FormData();
    formData.append('product_name', productName);
    formData.append('purchase_date', purchaseDate);
    formData.append('warranty_years', warrantyYears);
    
    // Optional fields
    const productUrl = document.getElementById('editProductUrl').value.trim();
    if (productUrl) {
        formData.append('product_url', productUrl);
    }
    
    const purchasePrice = document.getElementById('editPurchasePrice').value;
    if (purchasePrice) {
        formData.append('purchase_price', purchasePrice);
    }
    
    // Serial numbers
    const serialInputs = document.querySelectorAll('#editSerialNumbersContainer input');
    serialInputs.forEach(input => {
        if (input.value.trim()) {
            formData.append('serial_numbers', input.value.trim());
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
    
    // Files
    const invoiceFile = document.getElementById('editInvoice').files[0];
    if (invoiceFile) {
        formData.append('invoice', invoiceFile);
    }
    
    const manualFile = document.getElementById('editManual').files[0];
    if (manualFile) {
        formData.append('manual', manualFile);
    }
    
    // --- Add Lifetime Check ---
    if (!editIsLifetimeCheckbox.checked && !editWarrantyYearsInput.value) {
        showToast('Warranty period (years) is required unless it\'s a lifetime warranty', 'error');
        // Switch to the warranty details tab in the edit modal
        const warrantyTabBtn = document.querySelector('.edit-tab-btn[data-tab="edit-warranty-details"]');
        if (warrantyTabBtn) warrantyTabBtn.click();
        editWarrantyYearsInput.focus();
        editWarrantyYearsInput.classList.add('invalid');
        return;
    }

    // --- Append is_lifetime and warranty_years ---
    const isLifetime = editIsLifetimeCheckbox.checked;
    formData.append('is_lifetime', isLifetime.toString());
    if (!isLifetime) {
        formData.append('warranty_years', editWarrantyYearsInput.value);
    }
    
    // Get auth token
    const token = localStorage.getItem('auth_token');
    if (!token) {
        showToast('Authentication required', 'error');
        return;
    }
    
    showLoadingSpinner();
    
    // Send request
    fetch(`/api/warranties/${currentWarrantyId}`, {
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: formData
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
        loadWarranties();
    })
    .catch(error => {
        hideLoadingSpinner();
        console.error('Error updating warranty:', error);
        showToast(error.message || 'Failed to update warranty', 'error');
    });
}

// Render the tags dropdown list for edit mode
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
            createTag(searchTerm);
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
    sortedTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag.id;
        option.textContent = tag.name;
        option.style.backgroundColor = tag.color;
        tagFilter.appendChild(option);
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

// Create a new tag via the management modal form
function createNewTag() {
    const tagNameInput = document.getElementById('newTagName');
    const tagColorInput = document.getElementById('newTagColor');
    
    const name = tagNameInput ? tagNameInput.value.trim() : '';
    const color = tagColorInput ? tagColorInput.value : '#808080'; // Default color if input not found
    
    if (!name) {
        showToast('Tag name cannot be empty', 'error');
        return;
    }
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.error('No authentication token found');
        showToast('Authentication required', 'error');
        return;
    }
    
    showLoadingSpinner(); // Show loading indicator
    
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
            if (response.status === 409) {
                throw new Error('A tag with this name already exists');
            }
            // Try to get error message from response body
            return response.json().then(errData => {
                throw new Error(errData.error || errData.message || 'Failed to create tag');
            }).catch(() => {
                 // If response body is not JSON or empty
                throw new Error(`Failed to create tag. Status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        // Add new tag to allTags array
        allTags.push({
            id: data.id,
            name: data.name,
            color: data.color
        });
        
        // --- FIX: Clear input fields and re-render existing tags ---
        if (tagNameInput) tagNameInput.value = '';
        if (tagColorInput) tagColorInput.value = '#808080'; // Reset color picker
        renderExistingTags(); // Update the list in the modal
        populateTagFilter(); // Update the filter dropdown on the main page
        // --- END FIX ---
        
        showToast('Tag created successfully', 'success');
    })
    .catch(error => {
        console.error('Error creating tag:', error);
        showToast(error.message || 'Failed to create tag', 'error');
    })
    .finally(() => {
        hideLoadingSpinner(); // Hide loading indicator
    });
}

// --- Add New Function ---
function handleLifetimeChange(event) {
    const checkbox = event ? event.target : isLifetimeCheckbox;
    const group = warrantyYearsGroup;
    const input = warrantyYearsInput;

    if (!checkbox || !group || !input) return;

    if (checkbox.checked) {
        group.style.display = 'none';
        input.required = false;
        input.value = '';
    } else {
        group.style.display = 'block';
        input.required = true;
    }
}

// --- Add New Function ---
function handleEditLifetimeChange(event) {
    const checkbox = event ? event.target : editIsLifetimeCheckbox;
    const group = editWarrantyYearsGroup;
    const input = editWarrantyYearsInput;

    if (!checkbox || !group || !input) return;

    if (checkbox.checked) {
        group.style.display = 'none';
        input.required = false;
        input.value = '';
    } else {
        group.style.display = 'block';
        input.required = true;
    }
}