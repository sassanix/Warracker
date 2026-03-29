import { getWarranties, setWarranties } from '../store.js';
import { showLoadingSpinner, hideLoadingSpinner, showToast } from './ui.js';

const DEFAULT_MODAL_HTML = `
	<div class="modal" style="max-width: 500px;">
		<div class="modal-header">
			<h3 class="modal-title">${window.i18next ? window.i18next.t('warranties.notes_title') : 'Warranty Notes'}</h3>
			<button class="close-btn" id="closeNotesModal">&times;</button>
		</div>
		<div class="modal-body">
			<div id="notesModalContent" style="white-space: pre-line;"></div>
			<textarea id="notesModalTextarea" style="display:none;width:100%;min-height:100px;"></textarea>
		</div>
		<div class="modal-footer" id="notesModalFooter">
			<button class="btn btn-secondary" id="editNotesBtn">${window.i18next ? window.i18next.t('actions.edit_notes') : 'Edit Notes'}</button>
			<button class="btn btn-info" id="editWarrantyBtn">${window.i18next ? window.i18next.t('actions.edit_warranty') : 'Edit Warranty'}</button>
			<button class="btn btn-primary" id="saveNotesBtn" style="display:none;">${window.i18next ? window.i18next.t('actions.save') : 'Save'}</button>
			<button class="btn btn-danger" id="cancelEditNotesBtn" style="display:none;">${window.i18next ? window.i18next.t('actions.cancel') : 'Cancel'}</button>
		</div>
	</div>
`;

const state = {
	warrantyId: null,
	warranty: null,
};

let dom = null;

function callIfExists(fn, ...args) {
	if (typeof fn === 'function') {
		return fn(...args);
	}
	return undefined;
}

function getToken() {
	return callIfExists(window.auth?.getToken) || localStorage.getItem('auth_token');
}

function ensureModal() {
	let modal = document.getElementById('notesModal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'notesModal';
		modal.className = 'modal-backdrop';
		modal.innerHTML = DEFAULT_MODAL_HTML;
		document.body.appendChild(modal);
	}
	refreshDomRefs();
	bindEvents();
	return dom;
}

function refreshDomRefs() {
	dom = {
		modal: document.getElementById('notesModal'),
		content: document.getElementById('notesModalContent'),
		textarea: document.getElementById('notesModalTextarea'),
		editBtn: document.getElementById('editNotesBtn'),
		saveBtn: document.getElementById('saveNotesBtn'),
		cancelBtn: document.getElementById('cancelEditNotesBtn'),
		editWarrantyBtn: document.getElementById('editWarrantyBtn'),
		closeBtn: document.getElementById('closeNotesModal'),
	};
}

function bindEvents() {
	if (!dom || dom.modal?._notesBound) return;
	dom.closeBtn?.addEventListener('click', hideModal);
	dom.editBtn?.addEventListener('click', enterEditMode);
	dom.saveBtn?.addEventListener('click', saveNotes);
	dom.cancelBtn?.addEventListener('click', exitEditMode);
	dom.editWarrantyBtn?.addEventListener('click', handleEditWarranty);
	dom.modal._notesBound = true;
}

function handleEditWarranty() {
	if (!state.warrantyId) return;
	hideModal();
	// Use already-stored warranty first (set when modal was opened), then try to resolve by ID
	let warranty = state.warranty;
	if (!warranty) {
		warranty = resolveWarranty(state.warrantyId);
	}
	if (!warranty) {
		showToast(window.i18next ? window.i18next.t('messages.warranty_not_found_refresh') : 'Warranty not found', 'error');
		return;
	}
	callIfExists(window.openEditModal, warranty);
}

function hideModal() {
	if (dom?.modal) {
		dom.modal.classList.remove('active');
	}
	exitEditMode();
}

function enterEditMode() {
	if (!dom) return;
	dom.content.style.display = 'none';
	dom.textarea.style.display = '';
	dom.textarea.value = dom.content.textContent;
	dom.editBtn.style.display = 'none';
	dom.saveBtn.style.display = '';
	dom.cancelBtn.style.display = '';
	dom.textarea.focus();
}

function exitEditMode() {
	if (!dom) return;
	dom.content.style.display = '';
	dom.textarea.style.display = 'none';
	dom.editBtn.style.display = '';
	dom.saveBtn.style.display = 'none';
	dom.cancelBtn.style.display = 'none';
}

function resolveWarranty(warrantyOrId) {
	if (warrantyOrId && typeof warrantyOrId === 'object') return warrantyOrId;
	const id = typeof warrantyOrId === 'number' ? warrantyOrId : parseInt(warrantyOrId, 10);
	if (!Number.isFinite(id)) return null;
	// Try store first
	let found = getWarranties().find((w) => w.id === id);
	// Fallback to global warranties array (script.js compatibility)
	if (!found && Array.isArray(window.warranties)) {
		found = window.warranties.find((w) => w.id === id);
	}
	return found || null;
}

function validateDuration(warranty) {
	if (!warranty) return false;
	if (warranty.is_lifetime) return true;
	const years = parseInt(warranty.warranty_duration_years, 10) || 0;
	const months = parseInt(warranty.warranty_duration_months, 10) || 0;
	const days = parseInt(warranty.warranty_duration_days, 10) || 0;
	return years > 0 || months > 0 || days > 0 || Boolean(warranty.expiration_date);
}

function buildFormData(warranty, noteValue) {
	const formData = new FormData();
	formData.append('product_name', warranty.product_name);
	formData.append('purchase_date', (warranty.purchase_date || '').split('T')[0]);
	formData.append('is_lifetime', warranty.is_lifetime ? 'true' : 'false');
	if (!warranty.is_lifetime) {
		formData.append('warranty_duration_years', warranty.warranty_duration_years || 0);
		formData.append('warranty_duration_months', warranty.warranty_duration_months || 0);
		formData.append('warranty_duration_days', warranty.warranty_duration_days || 0);
		const isExactDateWarranty =
			(parseInt(warranty.warranty_duration_years, 10) || 0) === 0 &&
			(parseInt(warranty.warranty_duration_months, 10) || 0) === 0 &&
			(parseInt(warranty.warranty_duration_days, 10) || 0) === 0 &&
			warranty.expiration_date;
		if (isExactDateWarranty) {
			formData.append('exact_expiration_date', warranty.expiration_date.split('T')[0]);
		}
	}
	if (warranty.product_url) formData.append('product_url', warranty.product_url);
	if (warranty.purchase_price !== null && warranty.purchase_price !== undefined) {
		formData.append('purchase_price', warranty.purchase_price);
	}
	const vendorInput = document.getElementById('editVendorOrRetailer');
	if (vendorInput) {
		formData.append('vendor', vendorInput.value.trim());
	} else if (warranty.vendor) {
		formData.append('vendor', warranty.vendor);
	}
	if (warranty.warranty_type) formData.append('warranty_type', warranty.warranty_type);
	const modelNumberInput = document.getElementById('editModelNumber');
	if (modelNumberInput && modelNumberInput.value.trim() !== '') {
		formData.append('model_number', modelNumberInput.value.trim());
	} else if (typeof warranty.model_number !== 'undefined' && warranty.model_number !== null) {
		formData.append('model_number', warranty.model_number);
	}
	if (Array.isArray(warranty.serial_numbers)) {
		warranty.serial_numbers.forEach((sn) => {
			if (sn && String(sn).trim() !== '') {
				formData.append('serial_numbers[]', String(sn).trim());
			}
		});
	}
	if (Array.isArray(warranty.tags)) {
		const tagIds = warranty.tags.map((tag) => tag.id);
		formData.append('tag_ids', JSON.stringify(tagIds));
	} else {
		formData.append('tag_ids', JSON.stringify([]));
	}
	formData.append('notes', noteValue);
	return formData;
}

async function refreshWarranties() {
	if (window.warrantyListController?.loadWarranties) {
		await window.warrantyListController.loadWarranties(true);
		callIfExists(window.warrantyListController.applyFilters);
		return;
	}
	if (typeof window.loadWarranties === 'function') {
		await window.loadWarranties(true);
		callIfExists(window.applyFilters);
	}
}

function updateStoreNotes(noteValue) {
	const warranties = getWarranties();
	const index = warranties.findIndex((w) => w.id === state.warrantyId);
	if (index === -1) return;
	const updated = [...warranties];
	updated[index] = { ...updated[index], notes: noteValue };
	setWarranties(updated);
	state.warranty = updated[index];
}

async function saveNotes() {
	if (!dom || !state.warrantyId || !state.warranty) {
		showToast(window.i18next ? window.i18next.t('messages.warranty_not_found_refresh') : 'Warranty not found', 'error');
		return;
	}
	const noteValue = dom.textarea.value.trim();
	if (!validateDuration(state.warranty)) {
		showToast(
			window.i18next
				? window.i18next.t('messages.invalid_warranty_duration_before_notes')
				: 'Cannot save notes until warranty duration is valid.',
			'error',
			7000,
		);
		return;
	}
	const token = getToken();
	if (!token) {
		showToast(window.i18next ? window.i18next.t('messages.authentication_required') : 'Authentication required', 'error');
		return;
	}
	try {
		showLoadingSpinner();
		const formData = buildFormData(state.warranty, noteValue);
		const response = await fetch(`/api/warranties/${state.warrantyId}`, {
			method: 'PUT',
			headers: { Authorization: `Bearer ${token}` },
			body: formData,
		});
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || `Failed to update note (Status: ${response.status})`);
		}
		hideLoadingSpinner();
		showToast(window.i18next ? window.i18next.t('messages.note_updated_successfully') : 'Note updated', 'success');
		updateStoreNotes(noteValue);
		if (!noteValue) {
			hideModal();
		} else if (dom) {
			dom.content.textContent = noteValue;
			exitEditMode();
		}
		await refreshWarranties();
	} catch (error) {
		hideLoadingSpinner();
		console.error('[notes] Failed to update note', error);
		showToast(error.message || (window.i18next ? window.i18next.t('messages.failed_to_update_note') : 'Failed to update note'), 'error');
	}
}

export function showNotesModal(notes, warrantyOrId = null) {
	const refs = ensureModal();
	// If warrantyOrId is already a warranty object, use it directly
	let warranty = null;
	if (warrantyOrId && typeof warrantyOrId === 'object' && warrantyOrId.id) {
		warranty = warrantyOrId;
	} else {
		warranty = resolveWarranty(warrantyOrId);
	}
	state.warrantyId = warranty?.id || (typeof warrantyOrId === 'number' ? warrantyOrId : null);
	state.warranty = warranty || null;
	const contentText = typeof notes === 'string' ? notes : warranty?.notes || '';
	if (!refs.modal) return;
	refs.content.textContent = contentText || '';
	refs.textarea.value = contentText || '';
	exitEditMode();
	refs.modal.classList.add('active');
}

export function init() {
	ensureModal();
}

// Global exposure - expose all public functions
if (typeof window !== 'undefined') {
	window.components = window.components || {};
	window.components.notes = {
		init,
		showNotesModal,
	};
}
