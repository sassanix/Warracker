// Expiry history modal, list renderer, and edit-modal helper (issue #209)
// Builds all user-controlled content via DOM nodes and textContent (XSS-safe).
import { formatDate } from '../lib/dates.js';

function t(key, fallback, options) {
	try {
		if (window.i18next && typeof window.i18next.t === 'function') {
			const translated = window.i18next.t(key, options);
			if (translated && translated !== key) {
				return translated;
			}
		}
	} catch (error) {
		console.warn('[expiryHistory] failed to translate', key, error);
	}
	if (options && typeof fallback === 'string') {
		return fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => (options[k] !== undefined ? String(options[k]) : ''));
	}
	return fallback;
}

function getToken() {
	if (window.auth && typeof window.auth.getToken === 'function') {
		return window.auth.getToken();
	}
	return localStorage.getItem('auth_token');
}

function formatExpiryValue(dateStr, isLifetime) {
	if (isLifetime) {
		return t('warranties.lifetime', 'Lifetime');
	}
	if (!dateStr) {
		return t('warranties.na', 'N/A');
	}
	return formatDate(dateStr);
}

function clearElement(el) {
	if (!el) return;
	while (el.firstChild) {
		el.removeChild(el.firstChild);
	}
}

export async function fetchExpiryHistory(warrantyId) {
	const token = getToken();
	const headers = {};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	const response = await fetch(`/api/warranties/${encodeURIComponent(warrantyId)}/expiry-history`, {
		headers,
	});
	if (!response.ok) {
		let message = t('warranties.expiry_history_load_error', 'Failed to load expiry history.');
		try {
			const data = await response.json();
			if (data && data.error) message = data.error;
		} catch {
			// ignore JSON parse failure
		}
		throw new Error(message);
	}
	return response.json();
}

export function renderExpiryHistoryList(container, entries) {
	if (!container) return;
	clearElement(container);

	if (!Array.isArray(entries) || entries.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'expiry-history-empty';
		empty.textContent = t('warranties.expiry_history_empty', 'No expiration date changes recorded.');
		container.appendChild(empty);
		return;
	}

	const list = document.createElement('ul');
	list.className = 'expiry-history-list';

	entries.forEach((entry) => {
		const item = document.createElement('li');
		item.className = 'expiry-history-item';

		const transition = document.createElement('div');
		transition.className = 'expiry-history-transition';

		const prevSpan = document.createElement('span');
		prevSpan.className = 'expiry-history-date expiry-history-prev';
		prevSpan.textContent = formatExpiryValue(entry.previous_expiration_date, entry.previous_is_lifetime);

		const arrowSpan = document.createElement('span');
		arrowSpan.className = 'expiry-history-arrow';
		arrowSpan.setAttribute('aria-hidden', 'true');
		arrowSpan.textContent = '→';

		const nextSpan = document.createElement('span');
		nextSpan.className = 'expiry-history-date expiry-history-new';
		nextSpan.textContent = formatExpiryValue(entry.new_expiration_date, entry.new_is_lifetime);

		transition.appendChild(prevSpan);
		transition.appendChild(arrowSpan);
		transition.appendChild(nextSpan);
		item.appendChild(transition);

		if (entry.reason && String(entry.reason).trim() !== '') {
			const reasonEl = document.createElement('div');
			reasonEl.className = 'expiry-history-reason';
			reasonEl.textContent = String(entry.reason);
			item.appendChild(reasonEl);
		}

		const metaEl = document.createElement('div');
		metaEl.className = 'expiry-history-meta';
		const changedDate = entry.changed_at ? formatDate(entry.changed_at) : t('warranties.na', 'N/A');
		if (entry.changed_by) {
			metaEl.textContent = t(
				'warranties.expiry_history_changed_on_by',
				'Changed on {{date}} by {{user}}',
				{ date: changedDate, user: entry.changed_by },
			);
		} else {
			metaEl.textContent = t(
				'warranties.expiry_history_changed_on',
				'Changed on {{date}}',
				{ date: changedDate },
			);
		}
		item.appendChild(metaEl);

		list.appendChild(item);
	});

	container.appendChild(list);
}

let modalDom = null;
let modalRequestToken = 0;

function ensureModal() {
	let modal = document.getElementById('expiryHistoryModal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'expiryHistoryModal';
		modal.className = 'modal-backdrop';

		const dialog = document.createElement('div');
		dialog.className = 'modal expiry-history-modal';

		const header = document.createElement('div');
		header.className = 'modal-header';

		const titleWrap = document.createElement('div');
		titleWrap.className = 'expiry-history-header-titles';

		const title = document.createElement('h3');
		title.className = 'modal-title';
		title.id = 'expiryHistoryModalTitle';

		const subtitle = document.createElement('div');
		subtitle.className = 'expiry-history-modal-subtitle';
		subtitle.id = 'expiryHistoryModalSubtitle';

		titleWrap.appendChild(title);
		titleWrap.appendChild(subtitle);

		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'close-btn';
		closeBtn.id = 'closeExpiryHistoryModal';
		closeBtn.setAttribute('aria-label', t('actions.close', 'Close'));
		closeBtn.textContent = '×';

		header.appendChild(titleWrap);
		header.appendChild(closeBtn);

		const body = document.createElement('div');
		body.className = 'modal-body';
		body.id = 'expiryHistoryModalBody';

		const footer = document.createElement('div');
		footer.className = 'modal-footer';

		const closeFooterBtn = document.createElement('button');
		closeFooterBtn.type = 'button';
		closeFooterBtn.className = 'btn btn-secondary';
		closeFooterBtn.id = 'closeExpiryHistoryFooterBtn';
		closeFooterBtn.textContent = t('actions.close', 'Close');

		footer.appendChild(closeFooterBtn);

		dialog.appendChild(header);
		dialog.appendChild(body);
		dialog.appendChild(footer);
		modal.appendChild(dialog);
		document.body.appendChild(modal);
	}

	modalDom = {
		modal,
		title: document.getElementById('expiryHistoryModalTitle'),
		subtitle: document.getElementById('expiryHistoryModalSubtitle'),
		body: document.getElementById('expiryHistoryModalBody'),
		closeBtn: document.getElementById('closeExpiryHistoryModal'),
		closeFooterBtn: document.getElementById('closeExpiryHistoryFooterBtn'),
	};

	if (!modal._expiryHistoryBound) {
		modalDom.closeBtn?.addEventListener('click', closeExpiryHistoryModal);
		modalDom.closeFooterBtn?.addEventListener('click', closeExpiryHistoryModal);
		modal.addEventListener('click', (event) => {
			if (event.target === modal) closeExpiryHistoryModal();
		});
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && modal.classList.contains('active')) {
				closeExpiryHistoryModal();
			}
		});
		modal._expiryHistoryBound = true;
	}

	return modalDom;
}

export function closeExpiryHistoryModal() {
	if (modalDom && modalDom.modal) {
		modalDom.modal.classList.remove('active');
	}
}

export async function openExpiryHistoryModal(warrantyOrId) {
	const dom = ensureModal();
	const warranty = warrantyOrId && typeof warrantyOrId === 'object' ? warrantyOrId : null;
	const warrantyId = warranty ? warranty.id : parseInt(warrantyOrId, 10);
	if (!Number.isFinite(warrantyId)) return;

	if (dom.title) {
		dom.title.textContent = t('warranties.expiry_history_title', 'Expiry History');
	}
	if (dom.subtitle) {
		dom.subtitle.textContent = warranty && warranty.product_name ? String(warranty.product_name) : '';
		dom.subtitle.style.display = dom.subtitle.textContent ? '' : 'none';
	}
	if (dom.closeFooterBtn) {
		dom.closeFooterBtn.textContent = t('actions.close', 'Close');
	}

	clearElement(dom.body);
	const loadingEl = document.createElement('p');
	loadingEl.className = 'expiry-history-loading';
	loadingEl.textContent = t('warranties.expiry_history_loading', 'Loading expiry history...');
	dom.body.appendChild(loadingEl);
	dom.modal.classList.add('active');

	const currentToken = ++modalRequestToken;
	try {
		const entries = await fetchExpiryHistory(warrantyId);
		if (currentToken !== modalRequestToken) return;
		renderExpiryHistoryList(dom.body, entries);
	} catch (error) {
		if (currentToken !== modalRequestToken) return;
		clearElement(dom.body);
		const errorEl = document.createElement('p');
		errorEl.className = 'expiry-history-error';
		errorEl.textContent = error && error.message
			? error.message
			: t('warranties.expiry_history_load_error', 'Failed to load expiry history.');
		dom.body.appendChild(errorEl);
	}
}

// --- Edit Modal helpers (shared by editModal.js and legacy script.js) ---

let editExpiryBaseline = null;
let editHistoryRequestToken = 0;

function readCurrentEditExpiryState() {
	const purchaseDate = (document.getElementById('editPurchaseDate') || {}).value || '';
	const isLifetime = !!(document.getElementById('editIsLifetime') || {}).checked;
	const exactRadio = document.getElementById('editExactDateMethod');
	const useExact = !isLifetime && !!(exactRadio && exactRadio.checked);
	const years = parseInt((document.getElementById('editWarrantyDurationYears') || {}).value || '0', 10) || 0;
	const months = parseInt((document.getElementById('editWarrantyDurationMonths') || {}).value || '0', 10) || 0;
	const days = parseInt((document.getElementById('editWarrantyDurationDays') || {}).value || '0', 10) || 0;
	const exactDate = (document.getElementById('editExactExpirationDate') || {}).value || '';
	return { purchaseDate, isLifetime, useExact, years, months, days, exactDate };
}

export function hasEditExpiryChanged() {
	if (!editExpiryBaseline) return false;
	const current = readCurrentEditExpiryState();
	if (editExpiryBaseline.isLifetime && current.isLifetime) {
		return false;
	}
	if (editExpiryBaseline.isLifetime !== current.isLifetime) {
		return true;
	}
	if (editExpiryBaseline.useExact !== current.useExact) {
		return true;
	}
	if (current.useExact) {
		return current.exactDate !== editExpiryBaseline.exactDate;
	}
	return (
		current.purchaseDate !== editExpiryBaseline.purchaseDate ||
		current.years !== editExpiryBaseline.years ||
		current.months !== editExpiryBaseline.months ||
		current.days !== editExpiryBaseline.days
	);
}

export function updateEditExpiryReasonVisibility() {
	const group = document.getElementById('editExpiryChangeReasonGroup');
	if (!group) return;
	group.style.display = hasEditExpiryChanged() ? 'block' : 'none';
}

export function bindEditExpiryReasonInputs() {
	const ids = [
		'editPurchaseDate',
		'editIsLifetime',
		'editDurationMethod',
		'editExactDateMethod',
		'editWarrantyDurationYears',
		'editWarrantyDurationMonths',
		'editWarrantyDurationDays',
		'editExactExpirationDate',
	];
	ids.forEach((id) => {
		const el = document.getElementById(id);
		if (!el || el._expiryReasonBound) return;
		el.addEventListener('change', updateEditExpiryReasonVisibility);
		el.addEventListener('input', updateEditExpiryReasonVisibility);
		el._expiryReasonBound = true;
	});
}

export function initEditExpiryTracking(warranty) {
	bindEditExpiryReasonInputs();
	editExpiryBaseline = readCurrentEditExpiryState();
	const reasonInput = document.getElementById('editExpiryChangeReason');
	if (reasonInput) reasonInput.value = '';
	updateEditExpiryReasonVisibility();
	loadEditModalExpiryHistory(warranty);
}

export function getEditExpiryChangeReason() {
	if (!hasEditExpiryChanged()) return '';
	const input = document.getElementById('editExpiryChangeReason');
	return input ? (input.value || '').trim() : '';
}

export async function loadEditModalExpiryHistory(warranty) {
	const section = document.getElementById('editExpiryHistorySection');
	const details = document.getElementById('editExpiryHistoryDetails');
	const summary = document.getElementById('editExpiryHistorySummary');
	const content = document.getElementById('editExpiryHistoryContent');
	if (!section || !content) return;

	const count = Number(warranty && warranty.expiry_change_count) || 0;
	const currentToken = ++editHistoryRequestToken;

	if (!warranty || !warranty.id || count <= 0) {
		section.style.display = 'none';
		if (details) details.open = false;
		clearElement(content);
		return;
	}

	section.style.display = 'block';
	if (details) details.open = false;
	if (summary) {
		summary.textContent = t(
			'warranties.expiry_history_count_title',
			'Expiry History ({{count}})',
			{ count },
		);
	}
	clearElement(content);
	const loading = document.createElement('p');
	loading.className = 'expiry-history-loading';
	loading.textContent = t('warranties.expiry_history_loading', 'Loading expiry history...');
	content.appendChild(loading);

	try {
		const entries = await fetchExpiryHistory(warranty.id);
		if (currentToken !== editHistoryRequestToken) return;
		renderExpiryHistoryList(content, entries);
	} catch (error) {
		if (currentToken !== editHistoryRequestToken) return;
		clearElement(content);
		const errorEl = document.createElement('p');
		errorEl.className = 'expiry-history-error';
		errorEl.textContent = error && error.message
			? error.message
			: t('warranties.expiry_history_load_error', 'Failed to load expiry history.');
		content.appendChild(errorEl);
	}
}

export function init() {
	if (typeof window !== 'undefined') {
		window.openExpiryHistoryModal = openExpiryHistoryModal;
		window.closeExpiryHistoryModal = closeExpiryHistoryModal;
		window.fetchExpiryHistory = fetchExpiryHistory;
		window.renderExpiryHistoryList = renderExpiryHistoryList;
		window.initEditExpiryTracking = initEditExpiryTracking;
		window.getEditExpiryChangeReason = getEditExpiryChangeReason;
		window.updateEditExpiryReasonVisibility = updateEditExpiryReasonVisibility;
	}
}

// Auto-expose on window when loaded directly as a module (e.g. status.html)
init();
