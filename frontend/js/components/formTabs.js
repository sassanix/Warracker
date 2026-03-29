import { getSelectedTags } from '../store.js';

// Module-scoped variables (previously global)
let formTabs = [];
let tabContents = [];
let currentTabIndex = 0;

// References to form elements
let warrantyForm = null;
let serialNumbersContainer = null;
let isLifetimeCheckbox = null;
let warrantyDurationYearsInput = null;
let warrantyDurationMonthsInput = null;
let warrantyDurationDaysInput = null;

function initFormTabs() {
    console.log('Initializing form tabs...');
    // Use the modal context if available, otherwise query document
    const modalContext = document.getElementById('addWarrantyModal');
    const context = modalContext && modalContext.classList.contains('active') ? modalContext : document;

    const tabsContainer = context.querySelector('.form-tabs');
    const contentsElements = context.querySelectorAll('.tab-content');
    tabContents = contentsElements ? Array.from(contentsElements) : [];

    const tabsElements = tabsContainer ? tabsContainer.querySelectorAll('.form-tab') : [];
    formTabs = tabsElements ? Array.from(tabsElements) : [];

    const nextButton = context.querySelector('#nextTabBtn');
    const prevButton = context.querySelector('#prevTabBtn');
    const submitButton = context.querySelector('#submitWarrantyBtn');

    if (!tabsContainer || !tabContents.length || !formTabs.length || !nextButton || !prevButton || !submitButton) {
        console.warn('Form tab elements not found in the expected context. Skipping tab initialization.');
        return;
    }

    // Get form element references
    warrantyForm = document.getElementById('warrantyForm');
    serialNumbersContainer = document.getElementById('serialNumbersContainer');
    isLifetimeCheckbox = document.getElementById('isLifetime');
    warrantyDurationYearsInput = document.getElementById('warrantyDurationYears');
    warrantyDurationMonthsInput = document.getElementById('warrantyDurationMonths');
    warrantyDurationDaysInput = document.getElementById('warrantyDurationDays');

    // Clone and replace nav buttons to remove old listeners
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

    // Setup tab click listeners
    formTabs.forEach((tab, index) => {
        if (tab) {
            tab.addEventListener('click', () => {
                if (index < currentTabIndex) {
                    let canSwitch = true;
                    for (let i = 0; i < index; i++) {
                        if (!validateTab(i)) {
                            canSwitch = false;
                            break;
                        }
                    }
                    if (canSwitch) switchToTab(index);
                } else if (index === currentTabIndex) {
                    // Clicking current tab does nothing
                } else {
                    if (validateTab(currentTabIndex)) {
                        if (formTabs[currentTabIndex]) formTabs[currentTabIndex].classList.add('completed');
                        switchToTab(index);
                    } else {
                        showValidationErrors(currentTabIndex);
                    }
                }
            });
        }
    });

    if (nextButtonCloned) {
        nextButtonCloned.addEventListener('click', () => {
            if (validateTab(currentTabIndex)) {
                if (formTabs[currentTabIndex]) formTabs[currentTabIndex].classList.add('completed');
                if (currentTabIndex < formTabs.length - 1) {
                    switchToTab(currentTabIndex + 1);
                }
            } else {
                showValidationErrors(currentTabIndex);
            }
        });
    } else {
        console.warn("Cloned Next button not found, listener not added.");
    }

    if (prevButtonCloned) {
        prevButtonCloned.addEventListener('click', () => {
            if (currentTabIndex > 0) {
                switchToTab(currentTabIndex - 1);
            }
        });
    }

    // Initialize the first tab
    switchToTab(0);
}

function switchToTab(index) {
    console.log(`Switching to tab ${index} from tab ${currentTabIndex}`);
    
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
    
    currentTabIndex = index;
    
    // Update progress indicator
    const formTabsContainer = document.querySelector('.form-tabs');
    if (formTabsContainer) {
        formTabsContainer.setAttribute('data-step', currentTabIndex);
    }
    
    updateCompletedTabs();
    updateNavigationButtons();
}

function updateNavigationButtons() {
    const prevButton = document.querySelector('.prev-tab');
    const nextButton = document.querySelector('.next-tab');
    const submitButton = document.querySelector('button[type="submit"]');
    
    if (prevButton) {
        prevButton.style.display = currentTabIndex === 0 ? 'none' : 'block';
    }
    
    if (currentTabIndex === formTabs.length - 1) {
        if (nextButton) nextButton.style.display = 'none';
        if (submitButton) submitButton.style.display = 'block';
    } else {
        if (nextButton) nextButton.style.display = 'block';
        if (submitButton) submitButton.style.display = 'none';
    }
}

function updateCompletedTabs() {
    formTabs.forEach((tab, index) => {
        if (index < currentTabIndex) {
            tab.classList.add('completed');
        } else {
            tab.classList.remove('completed');
        }
    });
}

function validateTab(tabIndex) {
    const tabContent = tabContents[tabIndex];
    const controls = tabContent.querySelectorAll('input, textarea, select');
    let isTabValid = true;

    controls.forEach(control => {
        control.classList.remove('invalid');
        let validationMessageElement = control.nextElementSibling;
        if (validationMessageElement && validationMessageElement.classList.contains('validation-message')) {
            validationMessageElement.remove();
        }

        if (control.hasAttribute('required') && control.value.trim() === '') {
            isTabValid = false;
            control.classList.add('invalid');
        } else if (!control.validity.valid) {
            isTabValid = false;
            control.classList.add('invalid');
        }
    });
    return isTabValid;
}

function showValidationErrors(tabIndex) {
    const tabContent = tabContents[tabIndex];
    const controls = tabContent.querySelectorAll('input, textarea, select');
    let validationToast = document.querySelector('.validation-toast');

    controls.forEach(control => {
        if (!control.validity.valid) {
            control.classList.add('invalid');

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
            control.classList.remove('invalid');
            let validationMessageElement = control.nextElementSibling;
            if (validationMessageElement && validationMessageElement.classList.contains('validation-message')) {
                validationMessageElement.remove();
            }
        }
    });
    
    if (!validationToast && window.showToast) {
        validationToast = window.showToast(window.t('messages.correct_errors_in_tab'), 'error', 0);
        if (validationToast) {
            validationToast.classList.add('validation-toast');
        }
    } else if (validationToast && validationToast.querySelector('span')) {
        validationToast.querySelector('span').textContent = window.t('messages.correct_errors_in_tab');
    }
}

function updateSummary() {
    // Product information
    const summaryProductName = document.getElementById('summary-product-name');
    if (summaryProductName) {
        summaryProductName.textContent = document.getElementById('productName')?.value || '-';
    }
    
    const summaryProductUrl = document.getElementById('summary-product-url');
    if (summaryProductUrl) {
        summaryProductUrl.textContent = document.getElementById('productUrl')?.value || '-';
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
            const parts = String(purchaseDateStr).split('-');
            let formattedDate = '-';
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                const dateObj = new Date(Date.UTC(year, month, day));
                if (!isNaN(dateObj.getTime())) {
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
    
    // Handle Lifetime in Summary
    const isLifetime = isLifetimeCheckbox ? isLifetimeCheckbox.checked : false;
    const summaryWarrantyDuration = document.getElementById('summary-warranty-duration');

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
    
    // Warranty type
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
    const summaryPurchasePrice = document.getElementById('summary-purchase-price');
    if (summaryPurchasePrice) {
        if (purchasePrice) {
            const symbol = window.getCurrencySymbol ? window.getCurrencySymbol() : '$';
            const position = window.getCurrencyPosition ? window.getCurrencyPosition() : 'before';
            const amount = parseFloat(purchasePrice).toFixed(2);
            if (window.formatCurrencyHTML) {
                summaryPurchasePrice.innerHTML = window.formatCurrencyHTML(amount, symbol, position);
            } else {
                summaryPurchasePrice.textContent = `${symbol}${amount}`;
            }
        } else {
            summaryPurchasePrice.textContent = 'Not specified';
        }
    }
    
    // Documents
    const productPhotoFile = document.getElementById('productPhoto')?.files[0];
    const summaryProductPhoto = document.getElementById('summary-product-photo');
    if (summaryProductPhoto) {
        summaryProductPhoto.textContent = productPhotoFile ? productPhotoFile.name : 'No photo selected';
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
    const selectedTags = getSelectedTags();
    const summaryTags = document.getElementById('summary-tags');
    if (summaryTags) {
        if (selectedTags && selectedTags.length > 0) {
            summaryTags.innerHTML = '';
            
            selectedTags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'tag';
                tagElement.style.backgroundColor = tag.color;
                if (window.getContrastColor) {
                    tagElement.style.color = window.getContrastColor(tag.color);
                }
                tagElement.textContent = tag.name;
                
                summaryTags.appendChild(tagElement);
            });
        } else {
            summaryTags.textContent = 'No tags selected';
        }
    }

    // Vendor/Retailer
    const vendor = document.getElementById('vendor');
    const summaryVendor = document.getElementById('summary-vendor');
    if (summaryVendor) {
        summaryVendor.textContent = vendor && vendor.value ? vendor.value : '-';
    }
}

function resetForm() {
    if (!warrantyForm) {
        warrantyForm = document.getElementById('warrantyForm');
    }
    
    if (warrantyForm) {
        warrantyForm.reset();
    }
    
    // Reset serial numbers container
    if (!serialNumbersContainer) {
        serialNumbersContainer = document.getElementById('serialNumbersContainer');
    }
    
    if (serialNumbersContainer) {
        serialNumbersContainer.innerHTML = '';
    }
    
    // Add the first serial number input
    if (window.addSerialNumberInput) {
        window.addSerialNumberInput();
    }
    
    // Reset form tabs
    currentTabIndex = 0;
    switchToTab(0);
    
    // Clear any file input displays
    const productPhotoFileName = document.getElementById('productPhotoFileName');
    if (productPhotoFileName) productPhotoFileName.textContent = '';
    
    const fileName = document.getElementById('fileName');
    if (fileName) fileName.textContent = '';
    
    const manualFileName = document.getElementById('manualFileName');
    if (manualFileName) manualFileName.textContent = '';
    
    const otherDocumentFileName = document.getElementById('otherDocumentFileName');
    if (otherDocumentFileName) otherDocumentFileName.textContent = '';
    
    // Reset photo preview
    const productPhotoPreview = document.getElementById('productPhotoPreview');
    if (productPhotoPreview) {
        productPhotoPreview.style.display = 'none';
    }
}

// Add input event listener to remove validation errors when user types
document.addEventListener('input', (e) => {
    if (e.target.hasAttribute('required') && e.target.classList.contains('invalid')) {
        if (e.target.value.trim()) {
            e.target.classList.remove('invalid');
            
            const validationMessage = e.target.nextElementSibling;
            if (validationMessage && validationMessage.classList.contains('validation-message')) {
                validationMessage.remove();
            }
        }
    }
});

// Export functions
export {
    initFormTabs,
    switchToTab,
    updateNavigationButtons,
    updateCompletedTabs,
    validateTab,
    showValidationErrors,
    updateSummary,
    resetForm
};

// Expose to window for backward compatibility
if (typeof window !== 'undefined') {
    window.formTabs = {
        init: initFormTabs,
        switchToTab,
        updateNavigationButtons,
        updateCompletedTabs,
        validateTab,
        showValidationErrors,
        updateSummary,
        reset: resetForm
    };
    
    // Also expose individual functions
    window.initFormTabs = initFormTabs;
    window.switchToTab = switchToTab;
    window.updateNavigationButtons = updateNavigationButtons;
    window.updateCompletedTabs = updateCompletedTabs;
    window.validateTab = validateTab;
    window.showValidationErrors = showValidationErrors;
    window.updateSummary = updateSummary;
    window.resetForm = resetForm;
}
