import { getWarranties, setWarranties } from '../store.js';
import { showLoadingSpinner, hideLoadingSpinner, showToast } from './ui.js';

function tNotes(key, fallback) {
	try {
		if (window.i18next && typeof window.i18next.t === 'function' && window.i18next.isInitialized) {
			const translated = window.i18next.t(key);
			if (translated && translated !== key) return translated;
		}
		if (window.i18n && typeof window.i18n.t === 'function') {
			const translated = window.i18n.t(key);
			if (translated && translated !== key) return translated;
		}
	} catch (_) {}
	return fallback;
}

function buildDefaultModalHtml() {
	return `
	<div class="modal" style="max-width: 500px;">
		<div class="modal-header">
			<h3 class="modal-title" data-i18n="warranties.notes_title">${tNotes('warranties.notes_title', 'Warranty Notes')}</h3>
			<button class="close-btn" id="closeNotesModal">&times;</button>
		</div>
		<div class="modal-body">
			<div id="notesModalContent" style="white-space: pre-line;"></div>
			<textarea id="notesModalTextarea" style="display:none;width:100%;min-height:100px;"></textarea>
			<div id="notesThread" style="margin-top: 12px;"></div>
			<div id="notesAddBox" style="margin-top: 12px;">
				<textarea id="notesAddTextarea" data-i18n-placeholder="warranties.team_note_placeholder" placeholder="${tNotes('warranties.team_note_placeholder', 'Add a note for the team...')}" style="width:100%;min-height:60px;"></textarea>
				<button class="btn btn-primary" id="addNoteEntryBtn" data-i18n="actions.add_note" style="margin-top: 6px;">${tNotes('actions.add_note', 'Add Note')}</button>
			</div>
		</div>
		<div class="modal-footer" id="notesModalFooter">
			<button class="btn btn-secondary" id="editNotesBtn" data-i18n="actions.edit_notes">${tNotes('actions.edit_notes', 'Edit Notes')}</button>
			<button class="btn btn-info" id="editWarrantyBtn" data-i18n="actions.edit_warranty">${tNotes('actions.edit_warranty', 'Edit Warranty')}</button>
			<button class="btn btn-primary" id="saveNotesBtn" data-i18n="actions.save" style="display:none;">${tNotes('actions.save', 'Save')}</button>
			<button class="btn btn-danger" id="cancelEditNotesBtn" data-i18n="actions.cancel" style="display:none;">${tNotes('actions.cancel', 'Cancel')}</button>
		</div>
	</div>
`;
}

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

// Editing is owner and admin only: the update endpoint rejects anyone
// else, so the Edit Warranty button is disabled for other viewers rather
// than promising an edit that fails on save. When ownership cannot be
// determined, keep the previous behavior.
function canEditWarranty(warranty) {
	if (!warranty || warranty.user_id === undefined || warranty.user_id === null) return true;
	const currentUser = callIfExists(window.auth?.getCurrentUser) || null;
	if (!currentUser) return true;
	return Boolean(currentUser.is_admin) || Number(warranty.user_id) === Number(currentUser.id);
}

function ensureModal() {
	let modal = document.getElementById('notesModal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'notesModal';
		modal.className = 'modal-backdrop';
		modal.innerHTML = buildDefaultModalHtml();
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
		thread: document.getElementById('notesThread'),
		addTextarea: document.getElementById('notesAddTextarea'),
		addBtn: document.getElementById('addNoteEntryBtn'),
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
	dom.addBtn?.addEventListener('click', addNoteEntry);
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
		showToast((window.i18next && window.i18next.t('messages.warranty_not_found_refresh') || 'Warranty not found'), 'error');
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
	if (warranty.vendor !== null && warranty.vendor !== undefined && warranty.vendor !== '') {
		formData.append('vendor', warranty.vendor);
	}
	if (warranty.warranty_type) formData.append('warranty_type', warranty.warranty_type);
	if (typeof warranty.model_number !== 'undefined' && warranty.model_number !== null) {
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
		showToast((window.i18next && window.i18next.t('messages.warranty_not_found_refresh') || 'Warranty not found'), 'error');
		return;
	}
	const noteValue = dom.textarea.value.trim();
	if (!validateDuration(state.warranty)) {
		showToast(
			(window.i18next && window.i18next.t('messages.invalid_warranty_duration_before_notes') || 'Cannot save notes until warranty duration is valid.'),
			'error',
			7000,
		);
		return;
	}
	const token = getToken();
	if (!token) {
		showToast((window.i18next && window.i18next.t('messages.authentication_required') || 'Authentication required'), 'error');
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
		showToast((window.i18next && window.i18next.t('messages.note_updated_successfully') || 'Note updated'), 'success');
		updateStoreNotes(noteValue);
		const hasTeamNotes = Boolean(dom?.thread && dom.thread.children.length > 0);
		if (!noteValue && !hasTeamNotes) {
			hideModal();
		} else if (dom) {
			dom.content.textContent = noteValue;
			exitEditMode();
		}
		await refreshWarranties();
	} catch (error) {
		hideLoadingSpinner();
		console.error('[notes] Failed to update note', error);
		showToast(error.message || ((window.i18next && window.i18next.t('messages.failed_to_update_note') || 'Failed to update note')), 'error');
	}
}

let noteEntriesRequestToken = 0;

function updateStoreNoteEntryCount(count) {
	const warranties = getWarranties();
	const index = warranties.findIndex((w) => w.id === state.warrantyId);
	if (index === -1) return;
	const updated = [...warranties];
	updated[index] = { ...updated[index], note_entry_count: count };
	setWarranties(updated);
	state.warranty = updated[index];
}

// Team note entries: anyone who can view the warranty may add one,
// and each entry shows its author and time. Deleting is for the entry
// author, the warranty owner, or an admin. Entry text and usernames
// are set with textContent, never interpolated into HTML.
function canDeleteNoteEntry(entry) {
	const currentUser = callIfExists(window.auth?.getCurrentUser) || null;
	if (!currentUser) return false;
	if (Boolean(currentUser.is_admin)) return true;
	if (Number(entry.user_id) === Number(currentUser.id)) return true;
	if (state.warranty && Number(state.warranty.user_id) === Number(currentUser.id)) return true;
	return false;
}

function renderNoteEntries(entries) {
	if (!dom || !dom.thread) return;
	dom.thread.innerHTML = '';
	if (!entries || entries.length === 0) return;
	for (const entry of entries) {
		const row = document.createElement('div');
		row.className = 'note-entry';
		const content = document.createElement('div');
		content.className = 'note-entry-content';
		const meta = document.createElement('div');
		meta.className = 'note-entry-meta';
		const when = entry.created_at ? new Date(entry.created_at).toLocaleString() : '';
		meta.textContent = entry.username + ' - ' + when;
		const text = document.createElement('div');
		text.className = 'note-entry-text';
		text.textContent = entry.text;
		content.appendChild(meta);
		content.appendChild(text);
		row.appendChild(content);
		if (canDeleteNoteEntry(entry)) {
			const del = document.createElement('button');
			del.type = 'button';
			del.className = 'note-entry-delete';
			const deleteLabel = entry.username ? `Delete note by ${entry.username}` : 'Delete note';
			del.setAttribute('aria-label', deleteLabel);
			del.title = 'Delete note';
			const icon = document.createElement('i');
			icon.className = 'fas fa-trash';
			icon.setAttribute('aria-hidden', 'true');
			del.appendChild(icon);
			del.addEventListener('click', () => deleteNoteEntry(entry.id));
			row.appendChild(del);
		}
		dom.thread.appendChild(row);
	}
}

async function loadNoteEntries() {
	if (!dom || !state.warrantyId) return;
	const token = getToken();
	if (!token) return;
	const requestToken = ++noteEntriesRequestToken;
	const requestedWarrantyId = state.warrantyId;
	try {
		const response = await fetch(`/api/warranties/${state.warrantyId}/notes`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) return;
		const entries = await response.json();
		if (requestToken !== noteEntriesRequestToken || state.warrantyId !== requestedWarrantyId) return;
		renderNoteEntries(entries);
		updateStoreNoteEntryCount(Array.isArray(entries) ? entries.length : 0);
	} catch (error) {
		console.error('[notes] Failed to load note entries', error);
	}
}

async function addNoteEntry() {
	if (!dom || !state.warrantyId) return;
	const text = dom.addTextarea.value.trim();
	if (!text) return;
	const token = getToken();
	if (!token) {
		showToast((window.i18next && window.i18next.t('messages.authentication_required') || 'Authentication required'), 'error');
		return;
	}
	if (dom.addBtn?.disabled) return;
	if (dom.addBtn) dom.addBtn.disabled = true;
	try {
		const response = await fetch(`/api/warranties/${state.warrantyId}/notes`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ text }),
		});
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || `Failed to add note (Status: ${response.status})`);
		}
		dom.addTextarea.value = '';
		await loadNoteEntries();
		await refreshWarranties();
	} catch (error) {
		console.error('[notes] Failed to add note entry', error);
		showToast(error.message || 'Failed to add note', 'error');
	} finally {
		if (dom?.addBtn) dom.addBtn.disabled = false;
	}
}

async function deleteNoteEntry(entryId) {
	if (!dom || !state.warrantyId) return;
	const token = getToken();
	if (!token) return;
	try {
		const response = await fetch(`/api/warranties/${state.warrantyId}/notes/${entryId}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || `Failed to delete note (Status: ${response.status})`);
		}
		await loadNoteEntries();
		await refreshWarranties();
	} catch (error) {
		console.error('[notes] Failed to delete note entry', error);
		showToast(error.message || 'Failed to delete note', 'error');
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
	const titleEl = refs.modal.querySelector('.modal-title');
	if (titleEl) titleEl.textContent = tNotes('warranties.notes_title', 'Warranty Notes');
	if (refs.addTextarea) refs.addTextarea.placeholder = tNotes('warranties.team_note_placeholder', 'Add a note for the team...');
	if (refs.addBtn) refs.addBtn.textContent = tNotes('actions.add_note', 'Add Note');
	if (refs.editBtn) refs.editBtn.textContent = tNotes('actions.edit_notes', 'Edit Notes');
	if (refs.editWarrantyBtn) refs.editWarrantyBtn.textContent = tNotes('actions.edit_warranty', 'Edit Warranty');
	if (refs.saveBtn) refs.saveBtn.textContent = tNotes('actions.save', 'Save');
	if (refs.cancelBtn) refs.cancelBtn.textContent = tNotes('actions.cancel', 'Cancel');
	refs.content.textContent = contentText || '';
	refs.textarea.value = contentText || '';
	if (refs.thread) refs.thread.innerHTML = '';
	if (refs.editWarrantyBtn) {
		const canEdit = canEditWarranty(warranty);
		refs.editWarrantyBtn.disabled = !canEdit;
		if (canEdit) {
			refs.editWarrantyBtn.removeAttribute('title');
		} else {
			refs.editWarrantyBtn.title = tNotes('warranties.view_only_not_your_warranty', 'View only - not your warranty');
		}
	}
	if (refs.editBtn) {
		// Notes save through the same ownership-gated PUT, so the
		// Edit Notes button gets the same treatment: disabled for
		// viewers who are neither the owner nor an admin.
		const canEdit = canEditWarranty(warranty);
		refs.editBtn.disabled = !canEdit;
		if (canEdit) {
			refs.editBtn.removeAttribute('title');
		} else {
			refs.editBtn.title = tNotes('warranties.view_only_not_your_warranty', 'View only - not your warranty');
		}
	}
	if (refs.addTextarea) refs.addTextarea.value = '';
	exitEditMode();
	loadNoteEntries();
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
