import { deleteWarranty as apiDeleteWarranty, request } from '../services/apiService.js';
import { showToast, showLoadingSpinner, hideLoadingSpinner } from './ui.js';
import { loadWarranties, applyFilters } from '../controllers/warrantyListController.js';
import { getCurrentWarrantyId, setCurrentWarrantyId } from '../store.js';

async function toggleArchiveStatus(warrantyId, shouldArchive) {
	if (!warrantyId) {
		showToast(window.i18next ? window.i18next.t('messages.no_warranty_selected') : 'No warranty selected', 'error');
		return;
	}
	try {
		showLoadingSpinner();
		await request(`/api/warranties/${warrantyId}/archive`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ archived: !!shouldArchive }),
		});
		hideLoadingSpinner();
		showToast(
			shouldArchive
				? window.i18next ? window.i18next.t('messages.archived_success') : 'Warranty archived'
				: window.i18next ? window.i18next.t('messages.unarchived_success') : 'Warranty unarchived',
			'success',
		);
		await loadWarranties(true);
		applyFilters();
	} catch (error) {
		hideLoadingSpinner();
		console.error('[warrantyActions] Failed to toggle archive', error);
		showToast(
			window.i18next ? window.i18next.t('messages.error_updating_archive_status') : 'Failed to update archive status',
			'error',
		);
	}
}

async function deleteWarranty() {
	let warrantyId = getCurrentWarrantyId();
	// Fallback to global variable (script.js compatibility)
	if (!warrantyId && typeof window !== 'undefined' && window.currentWarrantyId) {
		warrantyId = window.currentWarrantyId;
	}
	if (!warrantyId) {
		showToast(window.i18next ? window.i18next.t('messages.no_warranty_selected_for_deletion') : 'No warranty selected', 'error');
		return;
	}
	try {
		showLoadingSpinner();
		await apiDeleteWarranty(warrantyId);
		hideLoadingSpinner();
		showToast(window.i18next ? window.i18next.t('messages.deleted_successfully') : 'Warranty deleted', 'success');
		closeModals();
		setCurrentWarrantyId(null);
		// Also clear global variable for script.js compatibility
		if (typeof window !== 'undefined') {
			window.currentWarrantyId = null;
		}
		await loadWarranties(true);
		applyFilters();
	} catch (error) {
		hideLoadingSpinner();
		console.error('[warrantyActions] Failed to delete warranty', error);
		showToast(window.i18next ? window.i18next.t('messages.failed_to_delete_warranty') : 'Failed to delete warranty', 'error');
	}
}

async function confirmArchive() {
	let warrantyId = getCurrentWarrantyId();
	// Fallback to global variable (script.js compatibility)
	if (!warrantyId && typeof window !== 'undefined' && window.currentWarrantyId) {
		warrantyId = window.currentWarrantyId;
	}
	if (!warrantyId) {
		showToast(window.i18next ? window.i18next.t('messages.no_warranty_selected_for_update') : 'No warranty selected', 'error');
		return;
	}
	await toggleArchiveStatus(warrantyId, true);
	closeModals();
	setCurrentWarrantyId(null);
	// Also clear global variable for script.js compatibility
	if (typeof window !== 'undefined') {
		window.currentWarrantyId = null;
	}
}

function closeModals() {
	document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.classList.remove('active'));
}

export { toggleArchiveStatus, deleteWarranty, confirmArchive, closeModals };

if (typeof window !== 'undefined') {
	window.toggleArchiveStatus = toggleArchiveStatus;
	window.deleteWarranty = deleteWarranty;
	window.confirmArchive = confirmArchive;
	window.closeModals = closeModals;
}






