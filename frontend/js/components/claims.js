import authService from '../services/authService.js';
import { getWarranties, getIsGlobalView } from '../store.js';
import { showToast } from './ui.js';
import { formatDate } from '../lib/dates.js';

const state = {
	currentWarrantyId: null,
	claims: [],
	canEdit: false,
};

const dom = {
	claimsModal: null,
	claimFormModal: null,
	claimsListBody: null,
	addClaimBtn: null,
	claimForm: null,
	warrantyClaimInfo: null,
	editClaimId: null,
	claimFormTitle: null,
};

const t = (key, fallback) => {
	try {
		if (window.i18next?.t) return window.i18next.t(key);
	} catch (error) {
		console.warn('[claims] translation failed', key, error);
	}
	return fallback;
};

const formatDateSafe = (value) => {
	const date = value instanceof Date ? value : value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return 'N/A';
	return formatDate(date);
};

const escapeHtml = (text = '') => {
	if (typeof text !== 'string') return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
};

function queryDom() {
	dom.claimsModal = document.getElementById('claimsModal');
	dom.claimFormModal = document.getElementById('claimFormModal');
	dom.claimsListBody = document.getElementById('claimsListBody');
	dom.addClaimBtn = document.getElementById('addClaimBtn');
	dom.claimForm = document.getElementById('claimForm');
	dom.warrantyClaimInfo = document.getElementById('warrantyClaimInfo');
	dom.editClaimId = document.getElementById('editClaimId');
	dom.claimFormTitle = document.getElementById('claimFormTitle');
}

function getToken() {
	return authService.getToken?.() || window.auth?.getToken?.() || localStorage.getItem('auth_token');
}

function bindCloseButtons(modal, handler) {
	if (!modal || modal._claimsCloseBound) return;
	modal.querySelectorAll('[data-dismiss="modal"]').forEach((btn) => {
		btn.addEventListener('click', handler);
	});
	modal._claimsCloseBound = true;
}

function bindClaimsListDelegation() {
	const list = document.getElementById('warrantiesList');
	if (!list || list._claimsLinkDelegated) return;
	if (list._wlcDelegated) return;
	list.addEventListener('click', (event) => {
		const claimsLink = event.target.closest('.claims-link');
		if (claimsLink) {
			event.preventDefault();
			const id = parseInt(claimsLink.dataset.id, 10);
			if (Number.isFinite(id)) openClaimsModal(id);
		}
	});
	list._claimsLinkDelegated = true;
}

function bindClaimsListBodyActions() {
	if (!dom.claimsListBody || dom.claimsListBody._claimsActionsBound) return;
	dom.claimsListBody.addEventListener('click', (event) => {
		if (!state.canEdit) return;
		const editBtn = event.target.closest('.edit-claim-btn');
		if (editBtn) {
			const claimId = parseInt(editBtn.dataset.claimId, 10);
			const claim = state.claims.find((c) => c.id === claimId);
			if (claim) openClaimFormModal(claim);
			return;
		}
		const deleteBtn = event.target.closest('.delete-claim-btn');
		if (deleteBtn) {
			const claimId = parseInt(deleteBtn.dataset.claimId, 10);
			const confirmMessage =
				t('claims.confirm_delete_claim', 'Are you sure you want to delete this claim?');
			if (window.confirm(confirmMessage)) {
				deleteClaim(claimId);
			}
		}
	});
	dom.claimsListBody._claimsActionsBound = true;
}

function updateAddClaimVisibility() {
	if (dom.addClaimBtn) {
		dom.addClaimBtn.style.display = state.canEdit ? 'inline-block' : 'none';
	}
}

function updateWarrantyInfo(warranty) {
	if (!dom.warrantyClaimInfo) return;
	if (!warranty) {
		dom.warrantyClaimInfo.textContent = '';
		return;
	}
	const vendorLabel = warranty.vendor || t('claims.unknown_vendor', 'Unknown Vendor');
	const expiresLabel = `${t('claims.expires_label', 'Expires')}: ${formatDateSafe(warranty.expiration_date)}`;
	const statusClass = warranty.status || 'unknown';
	const statusText = warranty.statusText || t('warranties.unknown_status', 'Unknown Status');
	dom.warrantyClaimInfo.innerHTML = `
		<div class="warranty-info-card">
			<h4>${warranty.product_name || t('warranties.unnamed_product', 'Unnamed Product')}</h4>
			<div class="warranty-details">
				<span><i class="fas fa-building"></i> ${vendorLabel}</span>
				<span><i class="fas fa-calendar"></i> ${expiresLabel}</span>
				<span class="warranty-status status-${statusClass}">
					${statusText}
				</span>
			</div>
		</div>
	`;
}

function ensureFormSubmissionHandler() {
	if (!dom.claimForm || dom.claimForm._claimsSubmitBound) return;
	dom.claimForm.addEventListener('submit', handleClaimFormSubmit);
	dom.claimForm._claimsSubmitBound = true;
}

function ensureAddClaimHandler() {
	if (!dom.addClaimBtn || dom.addClaimBtn._claimsAddBound) return;
	dom.addClaimBtn.addEventListener('click', () => openClaimFormModal());
	dom.addClaimBtn._claimsAddBound = true;
}

function renderClaims() {
	if (!dom.claimsListBody) return;
	if (!state.claims.length) {
		const message = state.canEdit
			? t('claims.no_claims_message', 'Click "Add New Claim" to get started')
			: t('claims.no_claims_view_only', 'No claims have been filed for this warranty');
		dom.claimsListBody.innerHTML = `
			<div class="no-claims-message" style="text-align: center; padding: 40px;">
				<i class="fas fa-clipboard-list" style="font-size: 3rem; color: var(--medium-gray); margin-bottom: 1rem;"></i>
				<h4>${t('claims.no_claims_yet', 'No Claims Yet')}</h4>
				<p>${message}</p>
			</div>
		`;
		return;
}
	const claimsHtml = state.claims
		.map((claim) => {
			const statusClass = claim.status ? claim.status.toLowerCase().replace(/\s+/g, '-') : 'unknown';
			const resolutionDateHtml =
				claim.resolution_date && claim.resolution_date.trim()
					? `<span style="margin-left: 10px;"><i class="fas fa-check-circle"></i> ${t('claims.resolved_label', 'Resolved')}: ${formatDateSafe(claim.resolution_date)}</span>`
					: '';
			const actionsHtml = state.canEdit
				? `
					<button class="btn btn-sm btn-secondary edit-claim-btn" data-claim-id="${claim.id}">
						<i class="fas fa-edit"></i> ${t('actions.edit', 'Edit')}
					</button>
					<button class="btn btn-sm btn-danger delete-claim-btn" data-claim-id="${claim.id}">
						<i class="fas fa-trash"></i> ${t('actions.delete', 'Delete')}
					</button>
				`
				: `
					<span class="claim-readonly-indicator" style="color: var(--medium-gray); font-size: 0.9em;">
						<i class="fas fa-eye"></i> ${t('claims.view_only', 'View Only')}
					</span>
				`;
			return `
				<div class="claim-item" data-claim-id="${claim.id}">
					<div class="claim-header">
						<div class="claim-info">
							<div class="claim-title">
								${claim.claim_number ? `<strong>${escapeHtml(claim.claim_number)}</strong>` : `<strong>${t('claims.claim_number_label', 'Claim #')}${claim.id}</strong>`}
								<span class="claim-status-badge claim-status-${statusClass}">
									${escapeHtml(claim.status || t('claims.status_unknown', 'Unknown'))}
								</span>
							</div>
							<div class="claim-date">
								<i class="fas fa-calendar"></i> ${formatDateSafe(claim.claim_date)}
								${resolutionDateHtml}
							</div>
						</div>
						<div class="claim-actions">
							${actionsHtml}
						</div>
					</div>
					${claim.description ? `<div class="claim-description">${escapeHtml(claim.description)}</div>` : ''}
					${claim.resolution ? `<div class="claim-resolution"><strong>${t('claims.resolution_label', 'Resolution')}:</strong> ${escapeHtml(claim.resolution)}</div>` : ''}
				</div>
			`;
		})
		.join('');
	dom.claimsListBody.innerHTML = claimsHtml;
}

async function loadClaims(warrantyId) {
	if (!dom.claimsListBody) return;
	dom.claimsListBody.innerHTML = `
		<div class="loading-message" style="text-align: center; padding: 20px;">
			<i class="fas fa-spinner fa-spin"></i> ${t('claims.loading', 'Loading claims...')}
		</div>
	`;
	try {
		const token = getToken();
		if (!token) throw new Error(t('messages.authentication_required', 'Authentication required'));
		const response = await fetch(`/api/warranties/${warrantyId}/claims`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});
		if (!response.ok) throw new Error(t('claims.failed_to_load', 'Failed to load claims'));
		state.claims = await response.json();
		renderClaims();
	} catch (error) {
		console.error('[claims] loadClaims failed', error);
		dom.claimsListBody.innerHTML = `
			<div class="error-message" style="text-align: center; padding: 20px; color: var(--danger-color);">
				<i class="fas fa-exclamation-triangle"></i> ${t('claims.failed_to_load', 'Failed to load claims')}
			</div>
		`;
	}
}

function openClaimFormModal(claim = null) {
	if (!dom.claimFormModal) return;
	if (dom.claimFormTitle) {
		dom.claimFormTitle.textContent = claim
			? t('claims.edit_claim', 'Edit Claim')
			: t('claims.add_new_claim', 'Add New Claim');
	}
	if (dom.claimForm) dom.claimForm.reset();
	if (dom.editClaimId) dom.editClaimId.value = claim ? claim.id : '';

	const fields = {
		claimDate: claim?.claim_date || new Date().toISOString().split('T')[0],
		claimStatus: claim?.status || 'Submitted',
		claimNumber: claim?.claim_number || '',
		claimDescription: claim?.description || '',
		claimResolution: claim?.resolution || '',
		resolutionDate: claim?.resolution_date || '',
	};
	Object.entries(fields).forEach(([id, value]) => {
		const input = document.getElementById(id);
		if (input) input.value = value || '';
	});
	dom.claimFormModal.classList.add('active');
}

async function handleClaimFormSubmit(event) {
	if (event) event.preventDefault();
	if (!dom.claimForm || !state.currentWarrantyId) return;
	try {
		const token = getToken();
		if (!token) throw new Error(t('messages.authentication_required', 'Authentication required'));
		const formData = new FormData(dom.claimForm);
		const claimId = dom.editClaimId?.value;
		const payload = {
			claim_date: formData.get('claim_date') || null,
			status: formData.get('status') || null,
			claim_number: formData.get('claim_number') || null,
			description: formData.get('description') || null,
			resolution: formData.get('resolution') || null,
			resolution_date: formData.get('resolution_date') || null,
		};
		const isEdit = Boolean(claimId);
		const url = isEdit
			? `/api/warranties/${state.currentWarrantyId}/claims/${claimId}`
			: `/api/warranties/${state.currentWarrantyId}/claims`;
		const response = await fetch(url, {
			method: isEdit ? 'PUT' : 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.error || t('claims.failed_to_save', 'Failed to save claim'));
		}
		showToast(
			isEdit ? t('claims.claim_updated_successfully', 'Claim updated successfully') : t('claims.claim_created_successfully', 'Claim created successfully'),
			'success',
		);
		closeClaimFormModal();
		await loadClaims(state.currentWarrantyId);
	} catch (error) {
		console.error('[claims] save failed', error);
		showToast(error.message || t('claims.failed_to_save', 'Failed to save claim'), 'error');
	}
}

async function deleteClaim(claimId) {
	if (!state.currentWarrantyId) return;
	try {
		const token = getToken();
		if (!token) throw new Error(t('messages.authentication_required', 'Authentication required'));
		const response = await fetch(`/api/warranties/${state.currentWarrantyId}/claims/${claimId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});
		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.error || t('claims.failed_to_delete', 'Failed to delete claim'));
		}
		showToast(t('claims.claim_deleted_successfully', 'Claim deleted successfully'), 'success');
		await loadClaims(state.currentWarrantyId);
	} catch (error) {
		console.error('[claims] delete failed', error);
		showToast(error.message || t('claims.failed_to_delete', 'Failed to delete claim'), 'error');
	}
}

export function closeClaimsModal() {
	if (dom.claimsModal) dom.claimsModal.classList.remove('active');
	state.currentWarrantyId = null;
	state.claims = [];
	state.canEdit = false;
	if (dom.claimsListBody) dom.claimsListBody.innerHTML = '';
}

export function closeClaimFormModal() {
	if (dom.claimFormModal) dom.claimFormModal.classList.remove('active');
	if (dom.claimForm) dom.claimForm.reset();
	if (dom.editClaimId) dom.editClaimId.value = '';
}

export async function openClaimsModal(warrantyId) {
	queryDom();
	if (!dom.claimsModal) {
		console.warn('[claims] claims modal not found');
		return;
	}
	const warranty = getWarranties().find((w) => w.id === warrantyId);
	if (!warranty) {
		showToast(t('claims.warranty_not_found', 'Warranty not found'), 'error');
		return;
	}
	state.currentWarrantyId = warrantyId;
	const currentUser = authService.getCurrentUser?.() || null;
	const isAdmin = Boolean(currentUser?.is_admin);
	const globalView = getIsGlobalView();
	if (typeof warranty.permissions?.canEdit === 'boolean') {
		state.canEdit = warranty.permissions.canEdit;
	} else {
		state.canEdit = !globalView || warranty.user_id === currentUser?.id || isAdmin;
	}
	updateAddClaimVisibility();
	updateWarrantyInfo(warranty);
	dom.claimsModal.classList.add('active');
	await loadClaims(warrantyId);
}

export function init() {
	queryDom();
	ensureAddClaimHandler();
	ensureFormSubmissionHandler();
	bindCloseButtons(dom.claimsModal, closeClaimsModal);
	bindCloseButtons(dom.claimFormModal, closeClaimFormModal);
	bindClaimsListDelegation();
	bindClaimsListBodyActions();
}

if (typeof window !== 'undefined') {
	window.components = window.components || {};
	window.components.claims = {
		init,
		openClaimsModal,
		closeClaimsModal,
		closeClaimFormModal,
	};
	window.openClaimsModal = openClaimsModal;
	window.closeClaimsModal = closeClaimsModal;
	window.closeClaimFormModal = closeClaimFormModal;
}
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function renderWarrantyInfo(container, warranty, formatDateFn) {
  if (!container || !warranty) return;
  container.textContent = '';
  const card = el('div', 'warranty-info-card');
  const title = el('h4', null, warranty.product_name || 'Unnamed Product');
  const details = el('div', 'warranty-details');

  const vendor = el('span');
  const vendorIcon = el('i', 'fas fa-building');
  vendor.appendChild(vendorIcon);
  vendor.appendChild(document.createTextNode(' ' + (warranty.vendor || 'Unknown Vendor')));

  const exp = el('span');
  const calIcon = el('i', 'fas fa-calendar');
  const expText = (typeof formatDateFn === 'function')
    ? formatDateFn(warranty.expiration_date ? new Date(warranty.expiration_date) : null)
    : (warranty.expiration_date || '');
  exp.appendChild(calIcon);
  exp.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('warranties.expires')) || 'Expires') + ': ' + expText));

  const statusVal = warranty.status || 'unknown';
  const status = el('span', `warranty-status status-${statusVal}`);
  status.textContent = warranty.statusText || 'Unknown Status';

  details.appendChild(vendor);
  details.appendChild(exp);
  details.appendChild(status);

  card.appendChild(title);
  card.appendChild(details);
  container.appendChild(card);
}

function createClaimItem(claim, canEdit, formatDateFn) {
  const item = el('div', 'claim-item');
  item.dataset.claimId = String(claim.id);

  const header = el('div', 'claim-header');
  const info = el('div', 'claim-info');
  const title = el('div', 'claim-title');
  const strong = el('strong', null, claim.claim_number ? String(claim.claim_number) : `Claim #${claim.id}`);
  title.appendChild(strong);

  const statusClass = `claim-status-${String(claim.status || '').toLowerCase().replace(' ', '-')}`;
  const badge = el('span', `claim-status-badge ${statusClass}`, claim.status || '');
  title.appendChild(document.createTextNode(' '));
  title.appendChild(badge);

  const dateRow = el('div', 'claim-date');
  const calIcon = el('i', 'fas fa-calendar');
  dateRow.appendChild(calIcon);
  const dateText = (typeof formatDateFn === 'function') ? formatDateFn(claim.claim_date ? new Date(claim.claim_date) : null) : (claim.claim_date || '');
  dateRow.appendChild(document.createTextNode(' ' + dateText));

  if (claim.resolution_date && String(claim.resolution_date).trim()) {
    const resSpan = el('span');
    resSpan.style.marginLeft = '10px';
    const check = el('i', 'fas fa-check-circle');
    resSpan.appendChild(check);
    const resText = (typeof formatDateFn === 'function') ? formatDateFn(new Date(claim.resolution_date)) : claim.resolution_date;
    resSpan.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('claims.resolved')) || 'Resolved') + ': ' + resText));
    dateRow.appendChild(resSpan);
  }

  info.appendChild(title);
  info.appendChild(dateRow);

  const actions = el('div', 'claim-actions');
  if (canEdit) {
    const editBtn = el('button', 'btn btn-sm btn-secondary edit-claim-btn');
    editBtn.dataset.claimId = String(claim.id);
    const editIcon = el('i', 'fas fa-edit');
    editBtn.appendChild(editIcon);
    editBtn.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('actions.edit')) || 'Edit')));
    const delBtn = el('button', 'btn btn-sm btn-danger delete-claim-btn');
    delBtn.dataset.claimId = String(claim.id);
    const delIcon = el('i', 'fas fa-trash');
    delBtn.appendChild(delIcon);
    delBtn.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('actions.delete')) || 'Delete')));
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
  } else {
    const ro = el('span', 'claim-readonly-indicator');
    ro.style.color = 'var(--medium-gray)';
    ro.style.fontSize = '0.9em';
    const eye = el('i', 'fas fa-eye');
    ro.appendChild(eye);
    ro.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('actions.view_only')) || 'View Only')));
    actions.appendChild(ro);
  }

  header.appendChild(info);
  header.appendChild(actions);
  item.appendChild(header);

  if (claim.description) {
    const desc = el('div', 'claim-description');
    desc.textContent = claim.description;
    item.appendChild(desc);
  }
  if (claim.resolution) {
    const res = el('div', 'claim-resolution');
    const strong = el('strong', null, ((window.i18next && window.i18next.t('claims.resolution')) || 'Resolution') + ': ');
    res.appendChild(strong);
    res.appendChild(document.createTextNode(claim.resolution));
    item.appendChild(res);
  }

  return item;
}

export function renderClaimsList(container, claims = [], canEdit = false, formatDateFn) {
  if (!container) return;
  container.textContent = '';

  if (!Array.isArray(claims) || claims.length === 0) {
    const wrapper = el('div', 'no-claims-message');
    wrapper.style.textAlign = 'center';
    wrapper.style.padding = '40px';
    const icon = el('i', 'fas fa-clipboard-list');
    icon.style.fontSize = '3rem';
    icon.style.color = 'var(--medium-gray)';
    icon.style.marginBottom = '1rem';
    const h4 = el('h4', null, (window.i18next && window.i18next.t('claims.no_claims_yet')) || 'No Claims Yet');
    h4.style.color = 'var(--text-color)';
    h4.style.marginBottom = '0.5rem';
    const msg = canEdit ? ((window.i18next && window.i18next.t('claims.no_claims_message')) || 'Click "Add New Claim" to get started') : 'No claims have been filed for this warranty';
    const p = el('p', null, msg);
    p.style.color = 'var(--dark-gray)';
    p.style.marginBottom = '0';
    wrapper.appendChild(icon);
    wrapper.appendChild(h4);
    wrapper.appendChild(p);
    container.appendChild(wrapper);
    return;
  }

  claims.forEach(claim => {
    container.appendChild(createClaimItem(claim, canEdit, formatDateFn));
  });
}

export function renderClaimsLoading(container) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'loading-message');
  wrap.style.textAlign = 'center';
  wrap.style.padding = '20px';
  const spinner = el('i', 'fas fa-spinner fa-spin');
  wrap.appendChild(spinner);
  wrap.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('claims.loading')) || 'Loading claims...')));
  container.appendChild(wrap);
}

export function renderClaimsError(container, text) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'error-message');
  wrap.style.textAlign = 'center';
  wrap.style.padding = '20px';
  wrap.style.color = 'var(--danger-color)';
  const warn = el('i', 'fas fa-exclamation-triangle');
  wrap.appendChild(warn);
  wrap.appendChild(document.createTextNode(' ' + (text || 'Failed to load claims')));
  container.appendChild(wrap);
}

// Global exposure
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.claims = {
    renderWarrantyInfo,
    renderClaimsList,
    renderClaimsLoading,
    renderClaimsError,
  };
}


