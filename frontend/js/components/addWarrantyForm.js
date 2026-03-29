import { showToast, showLoadingSpinner, hideLoadingSpinner } from './ui.js';
import { createWarranty } from '../services/apiService.js';
import { loadWarranties, applyFilters } from '../controllers/warrantyListController.js';
import {
	processPaperlessUploads,
	clearPaperlessSelection,
	getStorageOption,
	autoLinkRecentDocuments,
} from './paperless.js';
import {
	getCurrencySymbol,
	getCurrencySymbolByCode,
	getCurrencyCode,
	getCurrencyPosition,
	formatCurrencyHTML,
	updateFormCurrencyPosition,
} from '../lib/currency.js';
import {
	getSelectedTags,
	setSelectedTags,
	StoreEvents,
} from '../store.js';
import {
	renderSelectedTags,
} from './tagManager.js';

const state = {
	modal: null,
	form: null,
	tabs: [],
	tabContents: [],
	currentTabIndex: 0,
	nextBtn: null,
	prevBtn: null,
	submitBtn: null,
	serialContainer: null,
	isLifetimeCheckbox: null,
	durationMethodRadio: null,
	exactDateMethodRadio: null,
	durationFields: null,
	exactDateField: null,
	exactDateInput: null,
	fileInputs: {},
	summary: {},
	initialised: false,
	tagListenerBound: false,
};

const SERIAL_PLACEHOLDER = () => (window.i18next ? window.i18next.t('warranties.enter_serial_number') : 'Enter serial number');
const ADD_SERIAL_LABEL = () => (window.i18next ? window.i18next.t('warranties.add_serial_number') : 'Add Serial Number');

export function init() {
	if (state.initialised) return;
	cacheDom();
	if (!state.form) return;
	bindEvents();
	refreshTabs();
	resetAddWarrantyWizard();
	updateSummary();
	state.initialised = true;
}

function cacheDom() {
	state.modal = document.getElementById('addWarrantyModal');
	state.form = document.getElementById('warrantyForm');
	state.serialContainer = document.getElementById('serialNumbersContainer');
	state.isLifetimeCheckbox = document.getElementById('isLifetime');
	state.durationMethodRadio = document.getElementById('durationMethod');
	state.exactDateMethodRadio = document.getElementById('exactDateMethod');
	state.durationFields = document.getElementById('warrantyDurationFields');
	state.exactDateField = document.getElementById('exactExpirationField');
	state.exactDateInput = document.getElementById('exactExpirationDate');
	state.nextBtn = document.getElementById('nextTabBtn');
	state.prevBtn = document.getElementById('prevTabBtn');
	state.submitBtn = document.getElementById('submitWarrantyBtn');
	state.fileInputs = {
		productPhoto: {
			input: document.getElementById('productPhoto'),
			label: document.getElementById('productPhotoFileName'),
			previewWrapper: document.getElementById('productPhotoPreview'),
			previewImage: document.getElementById('productPhotoImg'),
		},
		invoice: {
			input: document.getElementById('invoice'),
			label: document.getElementById('fileName'),
		},
		manual: {
			input: document.getElementById('manual'),
			label: document.getElementById('manualFileName'),
		},
		other: {
			input: document.getElementById('otherDocument'),
			label: document.getElementById('otherDocumentFileName'),
		},
	};
	state.summary = {
		productName: document.getElementById('summary-product-name'),
		productUrl: document.getElementById('summary-product-url'),
		serialNumbers: document.getElementById('summary-serial-numbers'),
		purchaseDate: document.getElementById('summary-purchase-date'),
		warrantyDuration: document.getElementById('summary-warranty-duration'),
		warrantyType: document.getElementById('summary-warranty-type'),
		purchasePrice: document.getElementById('summary-purchase-price'),
		productPhoto: document.getElementById('summary-product-photo'),
		invoice: document.getElementById('summary-invoice'),
		manual: document.getElementById('summary-manual'),
		otherDocument: document.getElementById('summary-other-document'),
		tags: document.getElementById('summary-tags'),
		vendor: document.getElementById('summary-vendor'),
	};
}

function bindEvents() {
	if (!state.form) return;
	
	// Guard against multiple submit listener attachments
	if (!state.form._awfSubmitBound) {
		state.form.addEventListener('submit', handleFormSubmit);
		state.form._awfSubmitBound = true;
	}
	
	if (!state.form._awfInputBound) {
		state.form.addEventListener('input', handleFormInput, true);
		state.form.addEventListener('change', handleFormInput, true);
		state.form._awfInputBound = true;
	}

	if (state.serialContainer && !state.serialContainer._awfBound) {
		state.serialContainer.addEventListener('click', handleSerialContainerClick);
		state.serialContainer._awfBound = true;
	}

	if (state.isLifetimeCheckbox && !state.isLifetimeCheckbox._awfBound) {
		state.isLifetimeCheckbox.addEventListener('change', handleLifetimeChange);
		state.isLifetimeCheckbox._awfBound = true;
	}
	if (state.durationMethodRadio && !state.durationMethodRadio._awfBound) {
		state.durationMethodRadio.addEventListener('change', handleWarrantyMethodChange);
		state.durationMethodRadio._awfBound = true;
	}
	if (state.exactDateMethodRadio && !state.exactDateMethodRadio._awfBound) {
		state.exactDateMethodRadio.addEventListener('change', handleWarrantyMethodChange);
		state.exactDateMethodRadio._awfBound = true;
	}

	const showModalBtn = document.getElementById('showAddWarrantyBtn');
	if (showModalBtn && !showModalBtn._awfBound) {
		showModalBtn.addEventListener('click', (event) => {
			event.preventDefault();
			openModal();
		});
		showModalBtn._awfBound = true;
	}

	const closeBtn = state.modal ? state.modal.querySelector('[data-dismiss="modal"]') : null;
	if (closeBtn && !closeBtn._awfBound) {
		closeBtn.addEventListener('click', () => {
			closeModal();
		});
		closeBtn._awfBound = true;
	}

	if (state.nextBtn && !state.nextBtn._awfBound) {
		state.nextBtn.addEventListener('click', handleNextTab);
		state.nextBtn._awfBound = true;
	}
	if (state.prevBtn && !state.prevBtn._awfBound) {
		state.prevBtn.addEventListener('click', handlePrevTab);
		state.prevBtn._awfBound = true;
	}

	if (!state.tagListenerBound) {
		window.addEventListener(StoreEvents.SELECTED_TAGS_CHANGED, updateSummary);
		state.tagListenerBound = true;
	}

	Object.values(state.fileInputs).forEach((entry) => {
		if (entry.input && !entry.input._awfBound) {
			entry.input.addEventListener('change', () => updateFileDisplay(entry));
			entry.input._awfBound = true;
		}
	});
}

function refreshTabs() {
	if (!state.modal) return;
	state.tabs = Array.from(state.modal.querySelectorAll('.form-tab'));
	state.tabContents = Array.from(state.modal.querySelectorAll('.tab-content'));
	state.tabs.forEach((tab, index) => {
		if (tab._awfBound) return;
		tab.addEventListener('click', () => handleTabClick(index));
		tab._awfBound = true;
	});
	updateCompletedTabs();
	updateNavigationButtons();
}

function handleTabClick(targetIndex) {
	if (targetIndex === state.currentTabIndex) return;
	if (targetIndex < state.currentTabIndex) {
		switchToTab(targetIndex);
		return;
	}
	if (validateTab(state.currentTabIndex)) {
		markTabCompleted(state.currentTabIndex);
		switchToTab(targetIndex);
	} else {
		showValidationErrors(state.currentTabIndex);
	}
}

function handleNextTab() {
	if (validateTab(state.currentTabIndex)) {
		markTabCompleted(state.currentTabIndex);
		switchToTab(state.currentTabIndex + 1);
	} else {
		showValidationErrors(state.currentTabIndex);
	}
}

function handlePrevTab() {
	switchToTab(state.currentTabIndex - 1);
}

export function switchToTab(index) {
	if (!state.tabs.length) return;
	if (index < 0 || index >= state.tabs.length) return;
	state.tabs.forEach((tab, idx) => tab.classList.toggle('active', idx === index));
	state.tabContents.forEach((content, idx) => content.classList.toggle('active', idx === index));
	state.currentTabIndex = index;
	const container = state.modal?.querySelector('.form-tabs');
	if (container) container.setAttribute('data-step', String(index));
	updateCompletedTabs();
	updateNavigationButtons();
	if (index === state.tabs.length - 1) {
		updateSummary();
	}
}

export function updateNavigationButtons() {
	if (!state.nextBtn || !state.prevBtn || !state.submitBtn) return;
	state.prevBtn.style.display = state.currentTabIndex === 0 ? 'none' : 'block';
	const isLast = state.currentTabIndex === state.tabs.length - 1;
	state.nextBtn.style.display = isLast ? 'none' : 'block';
	state.submitBtn.style.display = isLast ? 'block' : 'none';
}

export function updateCompletedTabs() {
	state.tabs.forEach((tab, idx) => {
		tab.classList.toggle('completed', idx < state.currentTabIndex);
	});
}

function markTabCompleted(index) {
	const tab = state.tabs[index];
	if (tab) tab.classList.add('completed');
}

export function validateTab(index) {
	const content = state.tabContents[index];
	if (!content) return true;
	let isValid = true;
	const controls = content.querySelectorAll('input, textarea, select');
	controls.forEach((control) => {
		removeValidationMessage(control);
		control.classList.remove('invalid');
		if (control.disabled || control.type === 'hidden') return;
		const value = control.value || '';
		if (control.hasAttribute('required') && !value.trim()) {
			isValid = false;
			markInvalid(control, window.i18next ? window.i18next.t('messages.please_fill_out_this_field') : 'Please fill out this field.');
		} else if (!control.checkValidity()) {
			isValid = false;
			markInvalid(control, control.validationMessage || (window.i18next ? window.i18next.t('messages.field_is_invalid') : 'This field is invalid.'));
		}
	});
	return isValid;
}

export function showValidationErrors(index) {
	const content = state.tabContents[index];
	if (!content) return;
	const firstInvalid = content.querySelector('.invalid');
	if (firstInvalid) firstInvalid.focus();
	showToast(window.i18next ? window.i18next.t('messages.correct_errors_in_tab') : 'Please correct the errors on this tab.', 'error', 4000);
}

function handleFormInput(event) {
	const target = event.target;
	if (!target || !state.form.contains(target)) return;
	if (target.classList.contains('invalid') && target.value.trim()) {
		target.classList.remove('invalid');
		removeValidationMessage(target);
	}
	if (!state.tabs.length || state.currentTabIndex === state.tabs.length - 1) {
		updateSummary();
	}
}

function handleSerialContainerClick(event) {
	const addButton = event.target.closest('.add-serial-number');
	if (addButton) {
		event.preventDefault();
		addSerialNumberInput('');
		return;
	}
	const removeButton = event.target.closest('.remove-serial');
	if (removeButton) {
		event.preventDefault();
		const row = removeButton.closest('.serial-number-input');
		if (row && state.serialContainer && state.serialContainer.children.length > 1) {
			row.remove();
		}
	}
}

function addSerialNumberInput(value = '') {
	if (!state.serialContainer) return;
	const isFirst = state.serialContainer.querySelectorAll('.serial-number-input').length === 0;
	const row = document.createElement('div');
	row.className = 'serial-number-input d-flex mb-2';
	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'form-control';
	input.name = 'serial_numbers[]';
	input.placeholder = SERIAL_PLACEHOLDER();
	input.value = value || '';
	row.appendChild(input);
	const button = document.createElement('button');
	button.type = 'button';
	if (isFirst) {
		button.className = 'btn btn-sm btn-primary add-serial-number';
		button.innerHTML = `<i class="fas fa-plus"></i> ${ADD_SERIAL_LABEL()}`;
	} else {
		button.className = 'btn btn-sm btn-danger remove-serial';
		button.innerHTML = '<i class="fas fa-times"></i>';
	}
	row.appendChild(button);
	if (isFirst) {
		state.serialContainer.appendChild(row);
	} else {
		state.serialContainer.appendChild(row);
	}
}

export function handleLifetimeChange() {
	if (!state.isLifetimeCheckbox || !state.durationFields) return;
	const isLifetime = state.isLifetimeCheckbox.checked;
	const methodWrapper = document.getElementById('warrantyEntryMethod');
	if (isLifetime) {
		if (methodWrapper) methodWrapper.style.display = 'none';
		state.durationFields.style.display = 'none';
		if (state.exactDateField) state.exactDateField.style.display = 'none';
		clearDurationFields();
		if (state.exactDateInput) state.exactDateInput.value = '';
	} else {
		if (methodWrapper) methodWrapper.style.display = 'block';
		handleWarrantyMethodChange();
	}
	updateSummary();
}

export function handleWarrantyMethodChange() {
	const isLifetime = state.isLifetimeCheckbox?.checked;
	const useDuration = state.durationMethodRadio?.checked;
	if (isLifetime) {
		if (state.durationFields) state.durationFields.style.display = 'none';
		if (state.exactDateField) state.exactDateField.style.display = 'none';
		return;
	}
	if (useDuration) {
		if (state.durationFields) state.durationFields.style.display = 'block';
		if (state.exactDateField) state.exactDateField.style.display = 'none';
		if (state.exactDateInput) state.exactDateInput.value = '';
	} else {
		if (state.durationFields) state.durationFields.style.display = 'none';
		clearDurationFields();
		if (state.exactDateField) state.exactDateField.style.display = 'block';
	}
	updateSummary();
}

export function updateSummary() {
	if (!state.summary) return;
	const getValue = (id) => (document.getElementById(id)?.value || '').trim();
	setTextContent(state.summary.productName, getValue('productName') || '-');
	setTextContent(state.summary.productUrl, getValue('productUrl') || '-');

	const serialValues = Array.from(state.serialContainer?.querySelectorAll('input[name="serial_numbers[]"]') || [])
		.map((input) => input.value.trim())
		.filter(Boolean);
	if (state.summary.serialNumbers) {
		if (serialValues.length) {
			state.summary.serialNumbers.innerHTML = `<ul>${serialValues.map((sn) => `<li>${sn}</li>`).join('')}</ul>`;
		} else {
			state.summary.serialNumbers.textContent = window.i18next ? window.i18next.t('warranties.none') : 'None';
		}
	}

	const purchaseDate = getValue('purchaseDate');
	setTextContent(state.summary.purchaseDate, formatDisplayDate(purchaseDate));

	const isLifetime = state.isLifetimeCheckbox?.checked;
	if (state.summary.warrantyDuration) {
		if (isLifetime) {
			setTextContent(state.summary.warrantyDuration, window.i18next ? window.i18next.t('warranties.lifetime') : 'Lifetime');
		} else if (state.durationMethodRadio?.checked) {
			const years = Number.parseInt(getValue('warrantyDurationYears'), 10) || 0;
			const months = Number.parseInt(getValue('warrantyDurationMonths'), 10) || 0;
			const days = Number.parseInt(getValue('warrantyDurationDays'), 10) || 0;
			const parts = [];
			if (years) parts.push(`${years} ${pluralize('warranties.year', 'year', years)}`);
			if (months) parts.push(`${months} ${pluralize('warranties.month', 'month', months)}`);
			if (days) parts.push(`${days} ${pluralize('warranties.day', 'day', days)}`);
			setTextContent(state.summary.warrantyDuration, parts.length ? parts.join(', ') : '-');
		} else if (state.exactDateInput?.value) {
			setTextContent(state.summary.warrantyDuration, formatDisplayDate(state.exactDateInput.value));
		} else {
			setTextContent(state.summary.warrantyDuration, '-');
		}
	}

	const warrantyTypeSelect = document.getElementById('warrantyType');
	const warrantyTypeCustom = document.getElementById('warrantyTypeCustom');
	let warrantyTypeText = window.i18next ? window.i18next.t('warranties.not_specified') : 'Not specified';
	if (warrantyTypeSelect?.value === 'other' && warrantyTypeCustom?.value.trim()) {
		warrantyTypeText = warrantyTypeCustom.value.trim();
	} else if (warrantyTypeSelect?.value) {
		warrantyTypeText = warrantyTypeSelect.value;
	}
	setTextContent(state.summary.warrantyType, warrantyTypeText);

	const currencySelect = document.getElementById('currency');
	const purchasePrice = getValue('purchasePrice');
	if (state.summary.purchasePrice) {
		if (purchasePrice) {
			const code = currencySelect?.value || getCurrencyCode();
			const symbol = code ? getCurrencySymbolByCode(code) : getCurrencySymbol();
			const position = getCurrencyPosition();
			state.summary.purchasePrice.innerHTML = formatCurrencyHTML(purchasePrice, symbol, position);
		} else {
			state.summary.purchasePrice.textContent = window.i18next ? window.i18next.t('warranties.not_specified') : 'Not specified';
		}
	}

	updateFileSummary(state.summary.productPhoto, state.fileInputs.productPhoto);
	updateFileSummary(state.summary.invoice, state.fileInputs.invoice, getValue('invoiceUrl'));
	updateFileSummary(state.summary.manual, state.fileInputs.manual, getValue('manualUrl'));
	updateFileSummary(state.summary.otherDocument, state.fileInputs.other, getValue('otherDocumentUrl'));

	renderSummaryTags();

	setTextContent(state.summary.vendor, getValue('vendor') || '-');
}

function renderSummaryTags() {
	if (!state.summary.tags) return;
	const tags = getSelectedTags();
	state.summary.tags.innerHTML = '';
	if (!tags.length) {
		state.summary.tags.textContent = window.i18next
			? window.i18next.t('tags.no_selected', { defaultValue: 'No tags selected' })
			: 'No tags selected';
		return;
	}
	tags.forEach((tag) => {
		const span = document.createElement('span');
		span.className = 'tag';
		span.style.backgroundColor = tag.color;
		span.textContent = tag.name;
		state.summary.tags.appendChild(span);
	});
}

let isSubmitting = false;

export async function handleFormSubmit(event) {
	event.preventDefault();
	
	// Prevent double submission
	if (isSubmitting) {
		console.log('[addWarrantyForm] Submission already in progress, ignoring duplicate submit');
		return;
	}
	
	if (!state.form) return;
	
	for (let i = 0; i < state.tabContents.length; i += 1) {
		if (!validateTab(i)) {
			switchToTab(i);
			showValidationErrors(i);
			return;
		}
	}
	if (!validateWarrantySelection()) return;
	
	isSubmitting = true;

	const invoiceStorage = getStorageOption('invoice');
	const manualStorage = getStorageOption('manual');
	const formData = new FormData();
	appendBasicFields(formData);
	appendSerialNumbers(formData);
	appendTagIds(formData);
	appendDocumentUrls(formData);
	appendFiles(formData, { invoiceStorage, manualStorage });
	appendPaperlessSelections(formData, { invoiceStorage, manualStorage });
	appendWarrantyMethod(formData);
	const invoiceFileInput = state.fileInputs.invoice.input;
	const manualFileInput = state.fileInputs.manual.input;
	const invoiceFile = invoiceFileInput?.files?.[0] || null;
	const manualFile = manualFileInput?.files?.[0] || null;

	try {
		showLoadingSpinner();
		const uploads = await processPaperlessUploads(formData);
		Object.entries(uploads || {}).forEach(([key, value]) => formData.append(key, value));
		console.log('[addWarrantyForm] Creating warranty with tags:', getSelectedTags());
		const created = await createWarranty(formData);
		console.log('[addWarrantyForm] Warranty created:', created);
		hideLoadingSpinner();
		showToast(window.i18next ? window.i18next.t('messages.warranty_added_successfully') : 'Warranty added successfully', 'success');
		state.modal?.classList.remove('active');
		resetAddWarrantyWizard();
		console.log('[addWarrantyForm] Loading warranties after creation...');
		await loadWarranties(true);
		console.log('[addWarrantyForm] Applying filters...');
		applyFilters();
		handleAutoLink(created?.id, {
			invoice: invoiceStorage === 'paperless' ? invoiceFile : null,
			manual: manualStorage === 'paperless' ? manualFile : null,
		});
	} catch (error) {
		hideLoadingSpinner();
		console.error('[addWarrantyForm] Failed to save warranty', error);
		showToast(error?.message || (window.i18next ? window.i18next.t('messages.failed_to_add_warranty') : 'Failed to add warranty'), 'error');
	} finally {
		isSubmitting = false;
		console.log('[addWarrantyForm] Submission complete, flag reset');
	}
}

export function resetAddWarrantyWizard() {
	if (!state.form) return;
	console.log('[addWarrantyForm] Resetting wizard, tags before reset:', getSelectedTags());
	state.form.reset();
	setSelectedTags([]);
	if (Array.isArray(window.selectedTags)) {
		window.selectedTags = [];
	}
	console.log('[addWarrantyForm] Tags after reset:', getSelectedTags());
	renderSelectedTags();
	if (state.serialContainer) {
		state.serialContainer.innerHTML = '';
		addSerialNumberInput('');
	}
	Object.values(state.fileInputs).forEach((entry) => {
		if (entry.label) entry.label.textContent = '';
		if (entry.previewWrapper) entry.previewWrapper.style.display = 'none';
	});
	clearPaperlessSelection('invoice');
	clearPaperlessSelection('manual');
	clearPaperlessSelection('productPhoto');
	clearPaperlessSelection('otherDocument');
	const invoiceLocal = document.querySelector('input[name="invoiceStorage"][value="local"]');
	const manualLocal = document.querySelector('input[name="manualStorage"][value="local"]');
	if (invoiceLocal) invoiceLocal.checked = true;
	if (manualLocal) manualLocal.checked = true;
	if (state.isLifetimeCheckbox) state.isLifetimeCheckbox.checked = false;
	if (state.durationMethodRadio) state.durationMethodRadio.checked = true;
	if (state.exactDateMethodRadio) state.exactDateMethodRadio.checked = false;
	clearDurationFields();
	if (state.exactDateInput) state.exactDateInput.value = '';
	clearValidationState();
	state.currentTabIndex = 0;
	refreshTabs();
	switchToTab(0);
	updateCurrencyDefaults();
	updateSummary();
}

function openModal() {
	resetAddWarrantyWizard();
	updateCurrencyDefaults();
	state.modal?.classList.add('active');
}

function closeModal() {
	state.modal?.classList.remove('active');
	resetAddWarrantyWizard();
}

function updateCurrencyDefaults() {
	const currencySelect = document.getElementById('currency');
	const preferred = getCurrencyCode();
	if (currencySelect && preferred) {
		currencySelect.value = preferred;
	}
	const symbol = getCurrencySymbol();
	const position = getCurrencyPosition();
	updateFormCurrencyPosition(symbol, position);
}

function appendBasicFields(formData) {
	const getValue = (id) => (document.getElementById(id)?.value || '').trim();
	const productName = getValue('productName');
	const purchaseDate = getValue('purchaseDate');
	if (!productName) throw new Error(window.i18next ? window.i18next.t('messages.product_name_required') : 'Product name is required');
	if (!purchaseDate) throw new Error(window.i18next ? window.i18next.t('messages.purchase_date_required') : 'Purchase date is required');
	formData.append('product_name', productName);
	formData.append('purchase_date', purchaseDate);
	let productUrl = getValue('productUrl');
	if (productUrl && !productUrl.startsWith('http://') && !productUrl.startsWith('https://')) {
		productUrl = `https://${productUrl}`;
	}
	formData.append('product_url', productUrl || '');
	formData.append('model_number', getValue('modelNumber'));
	formData.append('vendor', getValue('vendor'));

	const warrantyTypeSelect = document.getElementById('warrantyType');
	const warrantyTypeCustom = document.getElementById('warrantyTypeCustom');
	let warrantyTypeValue = '';
	if (warrantyTypeSelect) {
		if (warrantyTypeSelect.value === 'other' && warrantyTypeCustom?.value.trim()) {
			warrantyTypeValue = warrantyTypeCustom.value.trim();
		} else {
			warrantyTypeValue = warrantyTypeSelect.value || '';
		}
	}
	formData.append('warranty_type', warrantyTypeValue);
	formData.append('currency', document.getElementById('currency')?.value || '');
	formData.append('purchase_price', getValue('purchasePrice'));
	formData.append('notes', (document.getElementById('notes')?.value || '').trim());
}

function appendSerialNumbers(formData) {
	const serialValues = Array.from(state.serialContainer?.querySelectorAll('input[name="serial_numbers[]"]') || [])
		.map((input) => input.value.trim())
		.filter(Boolean);
	formData.delete('serial_numbers[]');
	if (!serialValues.length) return;
	serialValues.forEach((value) => formData.append('serial_numbers[]', value));
}

function appendTagIds(formData) {
	const tags = getSelectedTags() || [];
	console.log('[addWarrantyForm] Selected tags:', tags);
	const ids = tags.map((tag) => tag.id);
	console.log('[addWarrantyForm] Tag IDs being sent:', ids);
	formData.append('tag_ids', JSON.stringify(ids));
}

function appendDocumentUrls(formData) {
	formData.append('invoice_url', document.getElementById('invoiceUrl')?.value || '');
	formData.append('manual_url', document.getElementById('manualUrl')?.value || '');
	formData.append('other_document_url', document.getElementById('otherDocumentUrl')?.value || '');
}

function appendFiles(formData, storageOptions = {}) {
	const appendFile = (entry, key) => {
		if (entry?.input?.files?.[0]) {
			formData.append(key, entry.input.files[0]);
		}
	};
	appendFile(state.fileInputs.productPhoto, 'product_photo');
	if (storageOptions.invoiceStorage !== 'paperless') {
		appendFile(state.fileInputs.invoice, 'invoice');
	}
	if (storageOptions.manualStorage !== 'paperless') {
		appendFile(state.fileInputs.manual, 'manual');
	}
	appendFile(state.fileInputs.other, 'other_document');
}

function appendPaperlessSelections(formData, storageOptions = {}) {
	const appendHidden = (id, key) => {
		const hidden = document.getElementById(id);
		if (hidden && hidden.value) formData.append(key, hidden.value);
	};
	appendHidden('selectedPaperlessInvoice', 'paperless_invoice_id');
	appendHidden('selectedPaperlessManual', 'paperless_manual_id');
	appendHidden('selectedPaperlessProductPhoto', 'paperless_photo_id');
	appendHidden('selectedPaperlessOtherDocument', 'paperless_other_id');
	const invoiceStorage = storageOptions.invoiceStorage || 'local';
	const manualStorage = storageOptions.manualStorage || 'local';
	formData.set('invoiceStorage', invoiceStorage);
	formData.set('manualStorage', manualStorage);
}

function appendWarrantyMethod(formData) {
	const isLifetime = state.isLifetimeCheckbox?.checked;
	formData.append('is_lifetime', String(Boolean(isLifetime)));
	if (isLifetime) {
		formData.append('warranty_duration_years', 0);
		formData.append('warranty_duration_months', 0);
		formData.append('warranty_duration_days', 0);
		return;
	}
	const useDuration = state.durationMethodRadio?.checked;
	if (useDuration) {
		const years = Number.parseInt(document.getElementById('warrantyDurationYears')?.value || '0', 10) || 0;
		const months = Number.parseInt(document.getElementById('warrantyDurationMonths')?.value || '0', 10) || 0;
		const days = Number.parseInt(document.getElementById('warrantyDurationDays')?.value || '0', 10) || 0;
		if (years === 0 && months === 0 && days === 0) {
			throw new Error(window.i18next ? window.i18next.t('messages.warranty_duration_required') : 'Warranty duration is required');
		}
		formData.append('warranty_duration_years', years);
		formData.append('warranty_duration_months', months);
		formData.append('warranty_duration_days', days);
		formData.delete('exact_expiration_date');
	} else if (state.exactDateInput?.value) {
		const expiration = state.exactDateInput.value;
		const purchase = document.getElementById('purchaseDate')?.value;
		if (purchase && expiration <= purchase) {
			throw new Error(window.i18next ? window.i18next.t('messages.expiration_date_after_purchase_date') : 'Expiration date must be after purchase date');
		}
		formData.append('exact_expiration_date', expiration);
		formData.append('warranty_duration_years', 0);
		formData.append('warranty_duration_months', 0);
		formData.append('warranty_duration_days', 0);
	} else {
		throw new Error(window.i18next ? window.i18next.t('messages.exact_expiration_date_required') : 'Exact expiration date is required');
	}
}

function validateWarrantySelection() {
	const isLifetime = state.isLifetimeCheckbox?.checked;
	if (isLifetime) return true;
	const useDuration = state.durationMethodRadio?.checked;
	if (useDuration) {
		const years = Number.parseInt(document.getElementById('warrantyDurationYears')?.value || '0', 10) || 0;
		const months = Number.parseInt(document.getElementById('warrantyDurationMonths')?.value || '0', 10) || 0;
		const days = Number.parseInt(document.getElementById('warrantyDurationDays')?.value || '0', 10) || 0;
		if (years === 0 && months === 0 && days === 0) {
			showToast(window.i18next ? window.i18next.t('messages.warranty_duration_required') : 'Warranty duration is required', 'error');
			state.durationFields?.classList.add('invalid-duration');
			switchToTab(1);
			return false;
		}
		state.durationFields?.classList.remove('invalid-duration');
		return true;
	}
	if (state.exactDateInput?.value) {
		const purchase = document.getElementById('purchaseDate')?.value;
		if (purchase && state.exactDateInput.value <= purchase) {
			showToast(window.i18next ? window.i18next.t('messages.expiration_date_after_purchase_date') : 'Expiration date must be after purchase date', 'error');
			switchToTab(1);
			state.exactDateInput.focus();
			return false;
		}
		return true;
	}
	showToast(window.i18next ? window.i18next.t('messages.exact_expiration_date_required') : 'Exact expiration date is required', 'error');
	switchToTab(1);
	return false;
}

function handleAutoLink(warrantyId, files = {}) {
	if (!warrantyId) return;
	const documentTypes = [];
	const fileInfo = {};
	if (files.invoice) {
		documentTypes.push('invoice');
		fileInfo.invoice = files.invoice.name;
	}
	if (files.manual) {
		documentTypes.push('manual');
		fileInfo.manual = files.manual.name;
	}
	if (!documentTypes.length) return;
	autoLinkRecentDocuments(warrantyId, documentTypes, 10, 10000, fileInfo);
}

function updateFileDisplay(entry) {
	if (!entry || !entry.input) return;
	const file = entry.input.files?.[0];
	if (entry.label) entry.label.textContent = file ? file.name : '';
	if (entry.previewWrapper && entry.previewImage) {
		if (file && file.type.startsWith('image/')) {
			const reader = new FileReader();
			reader.onload = (e) => {
				entry.previewImage.src = e.target.result;
				entry.previewWrapper.style.display = 'block';
			};
			reader.readAsDataURL(file);
		} else {
			entry.previewWrapper.style.display = 'none';
		}
	}
	updateSummary();
}

function markInvalid(control, message) {
	control.classList.add('invalid');
	let messageElement = control.nextElementSibling;
	if (!messageElement || !messageElement.classList.contains('validation-message')) {
		messageElement = document.createElement('div');
		messageElement.className = 'validation-message';
		control.parentNode.insertBefore(messageElement, control.nextSibling);
	}
	messageElement.textContent = message;
}

function removeValidationMessage(control) {
	if (!control) return;
	const messageElement = control.nextElementSibling;
	if (messageElement && messageElement.classList.contains('validation-message')) {
		messageElement.remove();
	}
}

function clearDurationFields() {
	const years = document.getElementById('warrantyDurationYears');
	const months = document.getElementById('warrantyDurationMonths');
	const days = document.getElementById('warrantyDurationDays');
	if (years) years.value = '';
	if (months) months.value = '';
	if (days) days.value = '';
}

function clearValidationState() {
	state.form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
	state.form.querySelectorAll('.validation-message').forEach((el) => el.remove());
	state.durationFields?.classList.remove('invalid-duration');
}

function setTextContent(element, text) {
	if (element) element.textContent = text ?? '';
}

function formatDisplayDate(value) {
	if (!value) return '-';
	const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
	if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return value;
	const date = new Date(Date.UTC(year, month - 1, day));
	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${monthNames[date.getUTCMonth()]} ${day}, ${year}`;
}

function pluralize(key, fallback, count) {
	if (window.i18next) {
		return window.i18next.t(key, { count });
	}
	return `${fallback}${count !== 1 ? 's' : ''}`;
}

function updateFileSummary(summaryElement, entry, urlValue = '') {
	if (!summaryElement) return;
	if (entry?.input?.files?.[0]) {
		summaryElement.textContent = entry.input.files[0].name;
	} else if (urlValue) {
		summaryElement.textContent = `URL: ${urlValue}`;
	} else {
		summaryElement.textContent = window.i18next ? window.i18next.t('warranties.not_specified') : 'Not specified';
	}
}

// Backward compatibility during transition
if (typeof window !== 'undefined') {
	window.addWarrantyForm = {
		init,
		switchToTab,
		updateNavigationButtons,
		updateCompletedTabs,
		validateTab,
		showValidationErrors,
		updateSummary,
		handleFormSubmit,
		resetAddWarrantyWizard,
		handleLifetimeChange,
		handleWarrantyMethodChange,
	};
}
