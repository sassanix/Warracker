// Add Warranty Form Wizard (compat layer)
// Delegates to existing global implementations to preserve identical behavior.

function callIfExists(fn, ...args) {
	if (typeof fn === 'function') {
		return fn(...args);
	}
}

export function initFormTabs() {
	return callIfExists(window.initFormTabs);
}

export function switchToTab(index) {
	return callIfExists(window.switchToTab, index);
}

export function updateNavigationButtons() {
	return callIfExists(window.updateNavigationButtons);
}

export function updateCompletedTabs() {
	return callIfExists(window.updateCompletedTabs);
}

export function validateTab(tabIndex) {
	return callIfExists(window.validateTab, tabIndex);
}

export function showValidationErrors(tabIndex) {
	return callIfExists(window.showValidationErrors, tabIndex);
}

export function updateSummary() {
	return callIfExists(window.updateSummary);
}

export function handleFormSubmit(event) {
	return callIfExists(window.handleFormSubmit, event);
}

export function resetAddWarrantyWizard() {
	return callIfExists(window.resetAddWarrantyWizard);
}

export function handleLifetimeChange(event) {
	return callIfExists(window.handleLifetimeChange, event);
}

export function handleWarrantyMethodChange() {
	return callIfExists(window.handleWarrantyMethodChange);
}

export function init() {
	// Ensure tab structure initialized if present
	initFormTabs();
	// Wire form submit if form exists
	const form = document.getElementById('addWarrantyForm');
	if (form && !form._awfBound) {
		form.addEventListener('submit', (e) => handleFormSubmit(e));
		form._awfBound = true;
	}
}

// Backward compatibility on window if needed
if (typeof window !== 'undefined') {
	window.addWarrantyForm = {
		init,
		initFormTabs,
		switchToTab,
		updateNavigationButtons,
		updateCompletedTabs,
		validateTab,
		showValidationErrors,
		updateSummary,
		handleFormSubmit,
		resetAddWarrantyWizard,
		handleLifetimeChange,
		handleWarrantyMethodChange
	};
}


