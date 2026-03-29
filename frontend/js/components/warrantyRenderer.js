import { getCurrentView, getFilters, getIsGlobalView } from '../store.js';
import { renderEmptyState } from './ui.js';
import authService from '../services/authService.js';
import {
	formatDate,
	calculateProductAge,
	calculateDurationFromDates,
} from '../lib/dates.js';
import {
	getCurrencySymbol,
	getCurrencySymbolByCode,
	getCurrencyPosition,
	formatCurrencyHTML,
} from '../lib/currency.js';
import { loadSecureImages } from './paperless.js';

const VIEW_BUTTON_IDS = {
	grid: 'gridViewBtn',
	list: 'listViewBtn',
	table: 'tableViewBtn',
};

const PHOTO_CONFIG = {
	grid: { size: 80, radius: 8, border: '2px solid var(--border-color)' },
	list: { size: 180, radius: 6, border: '2px solid var(--border-color)' },
	table: { size: 55, radius: 4, border: '1px solid var(--border-color)' },
};

const t = (key, fallback, options) => {
	try {
		if (window.i18next?.t) {
			return window.i18next.t(key, options);
		}
		return fallback;
	} catch (error) {
		console.warn('[warrantyRenderer] failed to translate', key, error);
		return fallback;
	}
};

function getContrastColor(hexColor) {
	if (!hexColor) return '#ffffff';
	const hex = hexColor.replace('#', '');
	const bigint = parseInt(hex, 16);
	if (Number.isNaN(bigint)) return '#ffffff';
	const r = (bigint >> 16) & 255;
	const g = (bigint >> 8) & 255;
	const b = bigint & 255;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? '#000000' : '#ffffff';
}

function getElements() {
	return {
		list: document.getElementById('warrantiesList'),
		tableHeader: document.querySelector('.table-view-header'),
		gridBtn: document.getElementById(VIEW_BUTTON_IDS.grid),
		listBtn: document.getElementById(VIEW_BUTTON_IDS.list),
		tableBtn: document.getElementById(VIEW_BUTTON_IDS.table),
	};
}

function updateViewUI(currentView, isArchivedView, elements) {
	if (elements.tableHeader) {
		elements.tableHeader.classList.toggle('visible', currentView === 'table');
	}
	['grid', 'list', 'table'].forEach((view) => {
		const btn = elements[`${view}Btn`];
		if (btn) btn.classList.toggle('active', view === currentView);
	});
	if (elements.list) {
		elements.list.className = `warranties-list ${currentView}-view ${isArchivedView ? 'archived-view' : ''}`;
	}
}

function normalizeWarranties(warranties) {
	return Array.isArray(warranties) ? warranties.slice() : [];
}

function calculateProductAgeInDays(purchaseDate) {
	if (!purchaseDate) return 0;
	const purchase = new Date(purchaseDate);
	const now = new Date();
	if (Number.isNaN(purchase.getTime()) || purchase > now) return 0;
	const diffTime = now.getTime() - purchase.getTime();
	return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function sortWarranties(warranties, filters) {
	const today = new Date();
	return warranties.sort((a, b) => {
		switch (filters.sortBy) {
		case 'name':
			return (a.product_name || '').toLowerCase().localeCompare((b.product_name || '').toLowerCase());
		case 'purchase':
			return new Date(b.purchase_date || 0) - new Date(a.purchase_date || 0);
		case 'age':
			return calculateProductAgeInDays(b.purchase_date) - calculateProductAgeInDays(a.purchase_date);
		case 'vendor':
			return (a.vendor || '').toLowerCase().localeCompare((b.vendor || '').toLowerCase());
		case 'warranty_type':
			return (a.warranty_type || '').toLowerCase().localeCompare((b.warranty_type || '').toLowerCase());
		case 'expiration':
		default: {
			const dateA = new Date(a.expiration_date || 0);
			const dateB = new Date(b.expiration_date || 0);
			const isExpiredA = dateA < today;
			const isExpiredB = dateB < today;
			if (isExpiredA && !isExpiredB) return 1;
			if (!isExpiredA && isExpiredB) return -1;
			return dateA - dateB;
		}
		}
	});
}

function buildWarrantyDurationText(warranty) {
	if (warranty.is_lifetime) {
		return t('warranties.lifetime', 'Lifetime');
	}
	const duration = {
		years: warranty.display_duration_years ?? warranty.warranty_duration_years ?? 0,
		months: warranty.display_duration_months ?? warranty.warranty_duration_months ?? 0,
		days: warranty.display_duration_days ?? warranty.warranty_duration_days ?? 0,
	};
	let parts = [];
	if (duration.years === 0 && duration.months === 0 && duration.days === 0 && warranty.expiration_date && warranty.purchase_date) {
		const calculated = calculateDurationFromDates(warranty.purchase_date, warranty.expiration_date);
		if (calculated) {
			duration.years = calculated.years || 0;
			duration.months = calculated.months || 0;
			duration.days = calculated.days || 0;
		}
	}
	if (duration.years > 0) {
		const fallback = `year${duration.years !== 1 ? 's' : ''}`;
		parts.push(`${duration.years} ${t('warranties.year', fallback, { count: duration.years })}`);
	}
	if (duration.months > 0) {
		const fallback = `month${duration.months !== 1 ? 's' : ''}`;
		parts.push(`${duration.months} ${t('warranties.month', fallback, { count: duration.months })}`);
	}
	if (duration.days > 0) {
		const fallback = `day${duration.days !== 1 ? 's' : ''}`;
		parts.push(`${duration.days} ${t('warranties.day', fallback, { count: duration.days })}`);
	}
	return parts.length ? parts.join(', ') : t('warranties.na', 'N/A');
}

function buildTagsHtml(tags = []) {
	if (!tags.length) return '';
	return `
		<div class="tags-row">
			${tags.map((tag) => `
				<span class="tag" style="background-color: ${tag.color}; color: ${getContrastColor(tag.color)}">
					${tag.name}
				</span>
			`).join('')}
		</div>
	`;
}

function buildNotesLink(warranty) {
	const notes = (warranty.notes || '').trim();
	if (!notes) return { hasNotes: false, html: '' };
	const label = t('warranties.notes', 'Notes');
	return {
		hasNotes: true,
		html: `<a href="#" class="notes-link" data-id="${warranty.id}" title="${label}"><i class='fas fa-sticky-note'></i> ${label}</a>`,
	};
}

function buildDocumentLinks(warranty, notesLinkHtml) {
	const links = [];
	if (warranty.product_url) {
		links.push(`
			<a href="${warranty.product_url}" class="product-link" target="_blank">
				<i class="fas fa-globe"></i> ${t('warranties.product_website', 'Product Website')}
			</a>
		`);
	}
	const invoiceLink = generateDocumentLink(warranty, 'invoice');
	const manualLink = generateDocumentLink(warranty, 'manual');
	const otherLink = generateDocumentLink(warranty, 'other');
	if (invoiceLink) links.push(invoiceLink);
	if (manualLink) links.push(manualLink);
	if (otherLink) links.push(otherLink);
	if (notesLinkHtml) links.push(notesLinkHtml);
	if (!links.length) return '';
	return `
		<div class="document-links-row">
			<div class="document-links-inner-container">
				${links.join('')}
			</div>
		</div>
	`;
}

function generateDocumentLink(warranty, docType) {
	const config = {
		invoice: {
			localPath: warranty.invoice_path,
			paperlessId: warranty.paperless_invoice_id,
			url: warranty.invoice_url,
			icon: 'fas fa-file-invoice',
			label: t('warranties.invoice_receipt', 'Invoice'),
			className: 'invoice-link',
		},
		manual: {
			localPath: warranty.manual_path,
			paperlessId: warranty.paperless_manual_id,
			url: warranty.manual_url,
			icon: 'fas fa-book',
			label: t('warranties.product_manual', 'Manual'),
			className: 'manual-link',
		},
		other: {
			localPath: warranty.other_document_path,
			paperlessId: warranty.paperless_other_id,
			url: warranty.other_document_url,
			icon: 'fas fa-file-alt',
			label: t('warranties.files', 'Files'),
			className: 'other-document-link',
		},
		photo: {
			localPath: warranty.product_photo_path,
			paperlessId: warranty.paperless_photo_id,
			url: null,
			icon: 'fas fa-image',
			label: t('warranties.product_photo', 'Photo'),
			className: 'photo-link',
		},
	}[docType];

	if (!config) return '';

	const globalView = getIsGlobalView();
	const currentUser = authService.getCurrentUser?.() || null;
	const currentUserId = currentUser?.id;
	const isAdmin = Boolean(currentUser?.is_admin);

	if (docType === 'other' && globalView) {
		const canViewOtherDocs = warranty.user_id === currentUserId || isAdmin;
		if (!canViewOtherDocs) return '';
	}

	const hasLocal = config.localPath && config.localPath !== 'null';
	const hasPaperless = config.paperlessId && config.paperlessId !== null;
	const hasUrl = config.url && config.url.trim() !== '';

	let linksHtml = '';
	if (hasLocal) {
		linksHtml += `<a href="#" onclick="openSecureFile('${config.localPath}'); return false;" class="${config.className}">
			<i class="${config.icon}"></i> ${config.label}
		</a>`;
	} else if (hasPaperless) {
		const context = JSON.stringify({ user_id: warranty.user_id, id: warranty.id }).replace(/"/g, '&quot;');
		linksHtml += `<a href="#" onclick="openPaperlessDocument(${config.paperlessId}, JSON.parse('${context}')); return false;" class="${config.className}">
			<i class="${config.icon}"></i> ${config.label}
			<i class="fas fa-cloud" style="color: #4dabf7; margin-left: 4px; font-size: 0.8em;" title="Stored in Paperless-ngx"></i>
		</a>`;
	}

	if (hasUrl) {
		if (linksHtml) linksHtml += ' ';
		linksHtml += `<a href="${config.url}" target="_blank" class="document-url-link ${config.className}">
			<i class="fas fa-link"></i> ${config.label} ${t('warranties.link', 'Link')}
		</a>`;
	}
	return linksHtml;
}

function getPriceHtml(warranty) {
	if (!warranty.purchase_price) return '';
	const symbol = warranty.currency ? getCurrencySymbolByCode(warranty.currency) : getCurrencySymbol();
	const position = getCurrencyPosition();
	const formatted = formatCurrencyHTML(warranty.purchase_price, symbol, position);
	const label = t('warranties.price', 'Price');
	return `<div><i class="fas fa-coins"></i> ${label}: <span>${formatted}</span></div>`;
}

function buildSerialNumberHtml(serialNumbers = []) {
	if (!serialNumbers.length) return '';
	const label = t('warranties.serial_number', 'Serial Number');
	const [first, ...rest] = serialNumbers;
	const extra = rest.length
		? `
			<div style="margin-left: 28px;">
				<ul style="margin-top: 5px;">
					${rest.map((sn) => `<li>${sn}</li>`).join('')}
				</ul>
			</div>
		`
		: '';
	return `
		<div><i class="fas fa-barcode"></i> ${label}: <span>${first}</span></div>
		${extra}
	`;
}

function buildUserInfo(warranty, isGlobalView) {
	if (!isGlobalView || !warranty.user_display_name) return '';
	const ownerLabel = t('warranties.owner', 'Owner');
	return `<div><strong>${ownerLabel}:</strong> <span>${warranty.user_display_name}</span></div>`;
}

function resolveCanEdit(warranty, isGlobalView) {
	if (!isGlobalView) return warranty.permissions?.canEdit !== false;
	if (typeof warranty.permissions?.canEdit === 'boolean') {
		return warranty.permissions.canEdit;
	}
	const currentUser = authService.getCurrentUser?.() || {};
	const isAdmin = Boolean(currentUser?.is_admin);
	return isAdmin || warranty.user_id === currentUser?.id;
}

function buildClaimsMeta(warranty) {
	if (warranty.claim_status_summary === 'OPEN') {
		return { className: 'action-btn claims-link claims-open', title: 'Claims (Open)' };
	}
	if (warranty.claim_status_summary === 'FINISHED') {
		return { className: 'action-btn claims-link claims-finished', title: 'Claims (Finished)' };
	}
	return { className: 'action-btn claims-link', title: 'Claims' };
}

function buildActionButtons(warranty, { canEdit, isArchivedView, claimsMeta }) {
	if (!canEdit) {
		return `
			<button class="${claimsMeta.className}" title="${claimsMeta.title}" data-id="${warranty.id}">
				<i class="fas fa-clipboard-list"></i>
			</button>
			<span class="action-btn-placeholder" title="View only - not your warranty">
				<i class="fas fa-eye" style="color: #666;"></i>
			</span>
		`;
	}
	return `
		<button class="${claimsMeta.className}" title="${claimsMeta.title}" data-id="${warranty.id}">
			<i class="fas fa-clipboard-list"></i>
		</button>
		${isArchivedView || warranty.is_archived
		? `
				<button class="action-btn unarchive-btn" title="Unarchive" data-id="${warranty.id}">
					<i class="fas fa-box-open"></i>
				</button>
				<button class="action-btn edit-btn" title="Edit (disabled in archived view)" data-id="${warranty.id}" disabled>
					<i class="fas fa-edit"></i>
				</button>
			`
		: `
				<button class="action-btn edit-btn" title="Edit" data-id="${warranty.id}">
					<i class="fas fa-edit"></i>
				</button>
				<button class="action-btn archive-btn" title="Archive" data-id="${warranty.id}">
					<i class="fas fa-archive"></i>
				</button>
			`}
		<button class="action-btn delete-btn" title="Delete" data-id="${warranty.id}">
			<i class="fas fa-trash"></i>
		</button>
	`;
}

function cardClassName(warranty, view, statusClass) {
	const isArchived = warranty.is_archived || warranty.viewFlags?.isArchivedView;
	if (isArchived) return 'warranty-card archived';
	if (view === 'table') return `warranty-card status-${statusClass}`;
	if (statusClass === 'expired') return 'warranty-card expired';
	if (statusClass === 'expiring') return 'warranty-card expiring-soon';
	return 'warranty-card active';
}

function buildPhotoHtml(warranty, view) {
	const config = PHOTO_CONFIG[view];
	if (!config || !warranty.product_photo_path || warranty.product_photo_path === 'null') return '';
	const sanitizedPath = warranty.product_photo_path.replace('uploads/', '');
	return `
		<div class="product-photo-thumbnail">
			<a href="#" onclick="openSecureFile('${warranty.product_photo_path}'); return false;" title="Click to view full size image">
				<img data-secure-src="/api/secure-file/${sanitizedPath}" alt="Product Photo"
					style="width: ${config.size}px; height: ${config.size}px; object-fit: cover; border-radius: ${config.radius}px; border: ${config.border}; cursor: pointer;"
					onerror="this.style.display='none'" class="secure-image">
			</a>
		</div>
	`;
}

function buildInfoBlock(warranty, { userInfoHtml, productAge, warrantyDurationText, expirationDateText, priceHtml, serialsHtml }) {
	const pieces = [
		userInfoHtml,
		`<div><i class="fas fa-calendar"></i> ${t('warranties.age', 'Age')}: <span>${productAge}</span></div>`,
		`<div><i class="fas fa-file-alt"></i> ${t('warranties.warranty', 'Warranty')}: <span>${warrantyDurationText}</span></div>`,
		`<div><i class="fas fa-wrench"></i> ${t('warranties.warranty_ends', 'Warranty Ends')}: <span>${expirationDateText}</span></div>`,
		priceHtml,
		serialsHtml,
		warranty.model_number ? `<div><i class="fas fa-tag"></i> ${t('warranties.model_number', 'Model Number')}: <span>${warranty.model_number}</span></div>` : '',
		warranty.vendor ? `<div><i class="fas fa-store"></i> ${t('warranties.vendor', 'Vendor')}: <span>${warranty.vendor}</span></div>` : '',
		warranty.warranty_type ? `<div><i class="fas fa-shield-alt"></i> ${t('warranties.type', 'Type')}: <span>${warranty.warranty_type}</span></div>` : '',
	];
	return pieces.filter(Boolean).join('');
}

function buildCardInnerHtml(view, warranty, derived) {
	const photoHtml = buildPhotoHtml(warranty, view);
	const infoHtml = buildInfoBlock(warranty, derived);
	const statusRow = `
		<div class="warranty-status-row status-${derived.statusClass}">
			<span>${derived.statusText}</span>
		</div>
	`;
	const base = `
		<div class="product-name-header">
			<h3 class="warranty-title" title="${warranty.product_name || 'Unnamed Product'}">${warranty.product_name || 'Unnamed Product'}</h3>
			<div class="warranty-actions">
				${derived.actionButtons}
			</div>
		</div>
		<div class="warranty-content">
			${photoHtml}
			<div class="warranty-info">
				${infoHtml}
			</div>
		</div>
	`;
	const docs = derived.documentLinks || '';
	const tags = derived.tagsHtml || '';

	if (view === 'table') {
		return `
			${base}
			${statusRow}
			${docs}
			${tags}
		`;
	}
	return `
		${base}
		${docs}
		${tags}
		${statusRow}
	`;
}

function alignGridHeights(list) {
	if (!list) return;
	const cards = list.querySelectorAll('.warranty-card');
	if (!cards.length) return;
	const images = list.querySelectorAll('.secure-image');
	let loaded = 0;
	const total = images.length;
	const align = () => {
		let maxHeight = 0;
		cards.forEach((card) => {
			card.style.minHeight = '';
			maxHeight = Math.max(maxHeight, card.getBoundingClientRect().height);
		});
		cards.forEach((card) => { card.style.minHeight = `${maxHeight}px`; });
	};
	if (!total) {
		align();
		return;
	}
	images.forEach((img) => {
		const onDone = () => {
			loaded += 1;
			if (loaded === total) align();
		};
		if (img.complete) {
			onDone();
		} else {
			img.addEventListener('load', onDone);
			img.addEventListener('error', onDone);
		}
	});
}

function postRender(currentView, list) {
	loadSecureImages();
	if (currentView === 'grid') {
		alignGridHeights(list);
	}
}

export function renderWarrantiesList(warranties, options = {}) {
	const elements = getElements();
	if (!elements.list) return;

	const normalized = normalizeWarranties(warranties);
	if (!normalized.length) {
		const message = options.emptyMessage || (options.meta?.isArchivedView
			? t('messages.no_archived_warranties', 'No archived warranties.')
			: t('messages.no_warranties_found_add_first', 'No warranties yet. Add your first warranty to get started.'));
		renderEmptyState(elements.list, message);
		return;
	}

	const filters = getFilters();
	const currentView = options.meta?.currentView || getCurrentView() || 'grid';
	const isArchivedView = options.meta?.isArchivedView ?? filters.status === 'archived';
	const isGlobalView = getIsGlobalView();
	const sorted = sortWarranties(normalized, filters);

	updateViewUI(currentView, isArchivedView, elements);

	const fragment = document.createDocumentFragment();
	sorted.forEach((warranty) => {
		const statusText = (isArchivedView || warranty.is_archived)
			? t('warranties.archived', 'Archived')
			: warranty.statusText || t('warranties.unknown_status', 'Unknown Status');
		const statusClass = (isArchivedView || warranty.is_archived) ? 'archived' : (warranty.status || 'unknown');
		const notesLink = buildNotesLink(warranty);
		const documentLinks = buildDocumentLinks(warranty, notesLink.html);
		const tagsHtml = buildTagsHtml(warranty.tags);
		const priceHtml = getPriceHtml(warranty);
		const serialNumbers = Array.isArray(warranty.serial_numbers)
			? warranty.serial_numbers.filter((sn) => sn && typeof sn === 'string' && sn.trim() !== '')
			: [];
		const serialsHtml = serialNumbers.length ? buildSerialNumberHtml(serialNumbers) : '';
		const productAge = calculateProductAge(warranty.purchase_date);
		const expirationDateValue = warranty.expiration_date || warranty.expirationDate || null;
		const expirationDateText = warranty.is_lifetime
			? t('warranties.lifetime', 'Lifetime')
			: (expirationDateValue ? formatDate(expirationDateValue) : t('warranties.na', 'N/A'));
		const userInfoHtml = buildUserInfo(warranty, isGlobalView);
		const canEdit = resolveCanEdit(warranty, isGlobalView);
		const claimsMeta = buildClaimsMeta(warranty);
		const actionButtons = buildActionButtons(warranty, { canEdit, isArchivedView, claimsMeta });

		const card = document.createElement('div');
		card.className = cardClassName(warranty, currentView, statusClass);
		card.dataset.id = warranty.id;
		card.innerHTML = buildCardInnerHtml(currentView, warranty, {
			statusClass,
			statusText,
			actionButtons,
			userInfoHtml,
			productAge,
			warrantyDurationText: buildWarrantyDurationText(warranty),
			expirationDateText,
			priceHtml,
			serialsHtml,
			documentLinks,
			tagsHtml,
		});
		fragment.appendChild(card);
	});

	elements.list.innerHTML = '';
	elements.list.appendChild(fragment);
	postRender(currentView, elements.list);
}

if (typeof window !== 'undefined') {
	window.components = window.components || {};
	window.components.warrantyRenderer = { renderWarrantiesList };
}

