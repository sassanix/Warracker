import authService from '../services/authService.js';
import { showToast, showLoadingSpinner, hideLoadingSpinner } from './ui.js';
import { loadWarranties, applyFilters } from '../controllers/warrantyListController.js';
import { getIsGlobalView, getUserPreferencePrefix, setUserPreferencePrefix } from '../store.js';

let paperlessNgxEnabled = false;

const browserState = {
	isOpen: false,
	documentType: null,
	mode: 'add',
	currentPage: 1,
	totalPages: 1,
	searchQuery: '',
	documents: [],
};

function resolvePreferencePrefix() {
	let prefix = getUserPreferencePrefix();
	if (prefix) return prefix;
	const user = authService.getCurrentUser?.();
	prefix = user?.is_admin ? 'admin_' : 'user_';
	setUserPreferencePrefix(prefix);
	return prefix;
}

function getAuthToken() {
	return authService.getToken() || localStorage.getItem('auth_token');
}

function getSelectionInputId(documentType) {
	if (documentType.startsWith('edit_')) {
		const base = documentType.replace('edit_', '');
		return `selectedEditPaperless${capitalize(base)}`;
	}
	return `selectedPaperless${capitalize(documentType)}`;
}

function getSelectionDisplayId(documentType) {
	if (documentType.startsWith('edit_')) {
		return `selectedEdit${capitalize(documentType.replace('edit_', ''))}FromPaperless`;
	}
	return `selected${capitalize(documentType)}FromPaperless`;
}

function capitalize(value = '') {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export function showPaperlessUploadLoading(documentType) {
	let overlay = document.getElementById('paperless-upload-overlay');
	if (overlay) {
		overlay.style.display = 'flex';
		return;
	}
	overlay = document.createElement('div');
	overlay.id = 'paperless-upload-overlay';
	overlay.innerHTML = `
		<div class="paperless-upload-modal">
			<div class="paperless-upload-content">
				<div class="paperless-upload-spinner"></div>
				<h3>${window.t ? window.t('paperless.uploading_documents') : 'Uploading documents...'}</h3>
				<p id="paperless-upload-status">${window.t ? window.t('paperless.uploading', { documentType }) : `Uploading ${documentType}`} </p>
				<div class="paperless-upload-progress">
					<div class="paperless-upload-progress-bar" id="paperless-progress-bar"></div>
				</div>
			</div>
		</div>
	`;
	document.body.appendChild(overlay);
}

export function updatePaperlessUploadStatus(message, isProcessing = false) {
	const statusEl = document.getElementById('paperless-upload-status');
	const progressBar = document.getElementById('paperless-progress-bar');
	if (statusEl) statusEl.textContent = message;
	if (progressBar) {
		progressBar.classList.toggle('processing', isProcessing);
	}
}

export function hidePaperlessUploadLoading() {
	const overlay = document.getElementById('paperless-upload-overlay');
	if (!overlay) return;
	const progressBar = document.getElementById('paperless-progress-bar');
	if (progressBar) progressBar.classList.remove('processing');
	overlay.remove();
}

export async function checkPaperlessNgxStatus() {
	try {
		const token = getAuthToken();
		if (!token) return false;
		const response = await fetch('/api/admin/settings', {
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});
		if (!response.ok) return false;
		const settings = await response.json();
		paperlessNgxEnabled = settings.paperless_enabled === 'true';
		window.paperlessNgxEnabled = paperlessNgxEnabled;
		return paperlessNgxEnabled;
	} catch (error) {
		console.error('[paperless] Failed to check status', error);
		return false;
	}
}

export async function initPaperlessIntegration() {
	const isEnabled = await checkPaperlessNgxStatus();
	const infoAlert = document.getElementById('paperlessInfoAlert');
	['invoice', 'manual'].forEach((type) => {
		const addSelection = document.getElementById(`${type}StorageSelection`);
		const editSelection = document.getElementById(`edit${capitalize(type)}StorageSelection`);
		if (addSelection) addSelection.style.display = isEnabled ? 'block' : 'none';
		if (editSelection) editSelection.style.display = isEnabled ? 'block' : 'none';
	});
	if (infoAlert) infoAlert.style.display = isEnabled ? 'block' : 'none';
	togglePaperlessBrowseSections();
}

export function getStorageOption(documentType, isEdit = false) {
	const allowed = ['invoice', 'manual'];
	if (!allowed.includes(documentType)) return 'local';
	// For add form: invoiceStorage, manualStorage (lowercase)
	// For edit form: editInvoiceStorage, editManualStorage (capitalize after 'edit')
	const name = isEdit 
		? `edit${capitalize(documentType)}Storage`
		: `${documentType}Storage`;
	const radio = document.querySelector(`input[name="${name}"]:checked`);
	return radio ? radio.value : 'local';
}

async function uploadToPaperlessNgx(file, documentType) {
	try {
		const token = getAuthToken();
		if (!token) throw new Error('Authentication token not available');
		showPaperlessUploadLoading(documentType);

		const formData = new FormData();
		formData.append('file', file);
		formData.append('document_type', documentType);
		formData.append('title', `Warracker ${documentType} - ${file.name}`);
		formData.append('tags', ['warracker', documentType].join(','));

		updatePaperlessUploadStatus(window.t ? window.t('paperless.uploading_to_server') : 'Uploading file to Paperless-ngx...');
		const response = await fetch('/api/paperless/upload', {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: formData,
		});
		if (!response.ok) {
			let errorMessage = window.t ? window.t('paperless.upload_failed') : 'Failed to upload to Paperless-ngx';
			try {
				const errorData = await response.json();
				errorMessage = errorData.error || errorMessage;
			} catch {
				errorMessage = `HTTP ${response.status}: ${response.statusText}`;
			}
			hidePaperlessUploadLoading();
			throw new Error(errorMessage);
		}
		const result = await response.json();
		if (result.document_id) {
			updatePaperlessUploadStatus(window.t ? window.t('paperless.upload_complete') : 'Document uploaded and ready!');
		} else {
			updatePaperlessUploadStatus(window.t ? window.t('paperless.upload_processing') : 'Document uploaded, processing...', true);
		}
		return {
			success: true,
			document_id: result.document_id,
			message: result.message,
			error: result.error,
		};
	} catch (error) {
		console.error('[paperless] Upload error', error);
		hidePaperlessUploadLoading();
		return { success: false, error: error.message };
	}
}

export async function processPaperlessUploads(formData) {
	if (!paperlessNgxEnabled) return {};
	const uploads = {};
	const documentTypes = ['invoice', 'manual'];
	for (const docType of documentTypes) {
		const storage = formData.get(`${docType}Storage`) || 'local';
		const input = document.getElementById(docType);
		const file = input?.files[0];
		if (storage === 'paperless' && file) {
			const uploadResult = await uploadToPaperlessNgx(file, docType);
			if (uploadResult.success || (uploadResult.error?.includes('duplicate') && uploadResult.document_id)) {
				const mapping = {
					productPhoto: 'paperless_photo_id',
					invoice: 'paperless_invoice_id',
					manual: 'paperless_manual_id',
					otherDocument: 'paperless_other_id',
				};
				const dbField = mapping[docType];
				if (dbField && uploadResult.document_id) {
					uploads[dbField] = uploadResult.document_id;
					hidePaperlessUploadLoading();
					if (uploadResult.error?.includes('duplicate')) {
						showToast(window.t ? window.t('paperless.duplicate_linked') : 'Duplicate document detected in Paperless-ngx. Linked to existing document.', 'info');
					}
				} else if (dbField && !uploadResult.document_id) {
					updatePaperlessUploadStatus(window.t ? window.t('paperless.processing_search') : 'Document processing, searching for link...', true);
				}
				if (formData.has(docType)) formData.delete(docType);
			} else {
				throw new Error(uploadResult.error || 'Failed to upload document to Paperless-ngx');
			}
		}
	}
	return uploads;
}

export async function processEditPaperlessUploads(formData) {
	if (!paperlessNgxEnabled) return {};
	const uploads = {};
	const documentTypes = ['invoice', 'manual'];
	for (const docType of documentTypes) {
		const storage = getStorageOption(docType, true);
		if (storage !== 'paperless') continue;
		const input = document.getElementById(`edit${capitalize(docType)}`);
		const file = input?.files[0];
		if (!file) continue;
		const uploadResult = await uploadToPaperlessNgx(file, docType);
		if (uploadResult.success || (uploadResult.error?.includes('duplicate') && uploadResult.document_id)) {
			const mapping = {
				productPhoto: 'paperless_photo_id',
				invoice: 'paperless_invoice_id',
				manual: 'paperless_manual_id',
				otherDocument: 'paperless_other_id',
			};
			const dbField = mapping[docType];
			if (dbField && uploadResult.document_id) {
				uploads[dbField] = uploadResult.document_id;
				hidePaperlessUploadLoading();
				if (uploadResult.error?.includes('duplicate')) {
					showToast(window.t ? window.t('paperless.duplicate_linked') : 'Duplicate document detected in Paperless-ngx. Linked to existing document.', 'info');
				}
			} else if (dbField && !uploadResult.document_id) {
				updatePaperlessUploadStatus(window.t ? window.t('paperless.processing_search') : 'Document processing, searching for link...', true);
			}
			if (formData.has(docType)) formData.delete(docType);
		} else {
			throw new Error(uploadResult.error || 'Failed to upload document to Paperless-ngx');
		}
	}
	return uploads;
}

async function debugPaperlessConfiguration() {
	try {
		const token = getAuthToken();
		if (!token) return null;
		const response = await fetch('/api/paperless/debug', {
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});
		if (!response.ok) return null;
		return response.json();
	} catch (error) {
		console.error('[paperless] debug failed', error);
		return null;
	}
}

async function getUserPaperlessViewPreference(warrantyContext = null) {
	const prefix = resolvePreferencePrefix();
	const local = localStorage.getItem(`${prefix}paperlessViewInApp`);
	const globalView = getIsGlobalView();
	const currentUser = authService.getCurrentUser?.();
	if (warrantyContext && globalView && currentUser && warrantyContext.user_id && warrantyContext.user_id !== currentUser.id) {
		return true;
	}
	if (local !== null) return local === 'true';
	try {
		const token = getAuthToken();
		if (!token) return false;
		const response = await fetch('/api/auth/preferences', {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) return false;
		const prefs = await response.json();
		return Boolean(prefs.paperless_view_in_app);
	} catch (error) {
		console.warn('[paperless] Failed to read user preference', error);
		return false;
	}
}

export async function openPaperlessDocument(paperlessId, warrantyContext = null) {
	try {
		const debugInfo = await debugPaperlessConfiguration();
		if (debugInfo && (!debugInfo.paperless_enabled || debugInfo.paperless_enabled === 'false')) {
			showToast(window.t ? window.t('paperless.disabled') : 'Paperless-ngx integration is not enabled', 'error');
			return;
		}
		const token = getAuthToken();
		if (!token) {
			showToast(window.t ? window.t('messages.authentication_required') : 'Authentication required', 'error');
			return;
		}
		const viewInApp = await getUserPaperlessViewPreference(warrantyContext);
		if (viewInApp) {
			const url = `/api/paperless-file/${paperlessId}?token=${encodeURIComponent(token)}`;
			const win = window.open(url, '_blank');
			if (!win) showToast(window.t ? window.t('paperless.popup_blocked') : 'Please allow popups to view documents', 'warning');
			return;
		}
		const response = await fetch('/api/paperless/url', {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) throw new Error('Failed to get Paperless-ngx URL');
		const result = await response.json();
		if (!result.success) throw new Error(result.message || 'Failed to get Paperless-ngx URL');
		const baseUrl = result.url.replace(/\/$/, '');
		const docUrl = `${baseUrl}/documents/${paperlessId}/details`;
		const win = window.open(docUrl, '_blank');
		if (!win) showToast(window.t ? window.t('paperless.popup_blocked') : 'Please allow popups to view documents in Paperless-ngx', 'warning');
	} catch (error) {
		console.error('[paperless] openPaperlessDocument failed', error);
		showToast(error.message || 'Error opening document', 'error');
	}
}

export async function autoLinkRecentDocuments(warrantyId, documentTypes = ['invoice', 'manual'], maxRetries = 10, retryDelay = 10000, fileInfo = {}) {
	const token = getAuthToken();
	if (!token) return;
	let attempt = 0;
	const tryLinking = async () => {
		attempt += 1;
		try {
			const debugInfo = await debugPaperlessConfiguration();
			if (!debugInfo || !debugInfo.paperless_enabled) return;
			let linkedDocuments = [];
			for (const [docType, filename] of Object.entries(fileInfo)) {
				if (!documentTypes.includes(docType)) continue;
				const baseName = filename.replace(/\.[^/.]+$/, '');
				const queries = [filename, baseName, `"${filename}"`, `"${baseName}"`, `Warracker ${docType} - ${baseName}`];
				for (const query of queries) {
					const response = await fetch(`/api/paperless/search?ordering=-created&query=${encodeURIComponent(query)}`, {
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
						},
					});
					if (!response.ok) continue;
					const result = await response.json();
					const docs = result.results || [];
					const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
					const recentDocs = docs.filter((doc) => {
						try {
							const docDate = new Date(doc.created);
							return docDate > oneDayAgo;
						} catch {
							return true;
						}
					});
					if (recentDocs.length > 0) {
						linkedDocuments = linkedDocuments.concat(recentDocs.map((doc) => ({ docType, document_id: doc.id })));
						break;
					}
				}
			}
			if (!linkedDocuments.length) {
				if (attempt < maxRetries) {
					setTimeout(tryLinking, retryDelay);
				} else {
					hidePaperlessUploadLoading();
				}
				return;
			}
			const linkPayload = {
				warranty_id: warrantyId,
				documents: linkedDocuments,
			};
			const response = await fetch('/api/paperless/link-documents', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(linkPayload),
			});
			if (!response.ok) {
				throw new Error(await response.text());
			}
			hidePaperlessUploadLoading();
			showToast(window.t ? window.t('paperless.documents_linked') : 'Documents linked successfully', 'success');
			await loadWarranties(true);
			applyFilters();
			setTimeout(() => loadSecureImages(), 200);
		} catch (error) {
			console.error('[paperless] autoLink failed', error);
			if (attempt < maxRetries) {
				setTimeout(tryLinking, retryDelay);
			} else {
				hidePaperlessUploadLoading();
			}
		}
	};
	tryLinking();
}

export function openPaperlessBrowser(documentType) {
	browserState.documentType = documentType;
	browserState.mode = documentType.startsWith('edit_') ? 'edit' : 'add';
	browserState.currentPage = 1;
	browserState.searchQuery = '';
	const modal = document.getElementById('paperlessBrowserModal');
	if (modal) {
		modal.classList.add('active');
		fetchPaperlessDocuments();
	}
}

function closePaperlessBrowser() {
	const modal = document.getElementById('paperlessBrowserModal');
	if (modal) modal.classList.remove('active');
	browserState.documentType = null;
}

async function fetchPaperlessDocuments(page = 1, query = '') {
	try {
		const token = getAuthToken();
		if (!token) throw new Error('Authentication required');
		showPaperlessLoading();
		const params = new URLSearchParams({
			page: page.toString(),
			query,
			document_type: browserState.documentType.replace('edit_', ''),
		});
		const response = await fetch(`/api/paperless/documents?${params.toString()}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) throw new Error('Failed to fetch documents');
		const result = await response.json();
		browserState.currentPage = result.page || page;
		browserState.totalPages = result.total_pages || 1;
		browserState.documents = result.documents || [];
		renderPaperlessDocuments();
		updatePaperlessPagination();
	} catch (error) {
		console.error('[paperless] browse failed', error);
		showPaperlessError(error.message || 'Failed to load documents');
	}
}

function renderPaperlessDocuments() {
	const container = document.getElementById('paperlessDocumentsContainer');
	if (!container) return;
	container.textContent = '';
	if (!browserState.documents.length) {
		showPaperlessError(window.t ? window.t('paperless.no_documents_found') : 'No documents found');
		return;
	}
	browserState.documents.forEach((doc) => {
		const item = document.createElement('div');
		item.className = 'paperless-document-item';
		item.dataset.id = doc.id;
		item.innerHTML = `
			<div class="document-title">${doc.title || ''}</div>
			<div class="document-meta">
				<span><i class="fas fa-calendar"></i> ${doc.created ? new Date(doc.created).toLocaleDateString() : ''}</span>
				<span><i class="fas fa-file"></i> ${doc.mime_type || 'Unknown'}</span>
				${doc.correspondent ? `<span><i class="fas fa-user"></i> ${doc.correspondent}</span>` : ''}
			</div>
			${Array.isArray(doc.tags) && doc.tags.length ? `
				<div class="document-tags">
					${doc.tags.map((tag) => `<span class="document-tag">${tag}</span>`).join('')}
				</div>` : ''}
		`;
		item.addEventListener('click', () => selectPaperlessDocument(doc.id));
		container.appendChild(item);
	});
}

function selectPaperlessDocument(documentId) {
	const doc = browserState.documents.find((d) => d.id === documentId);
	if (!doc) return;
	const type = browserState.documentType;
	const inputId = getSelectionInputId(type);
	const input = document.getElementById(inputId);
	if (input) input.value = documentId;
	updatePaperlessSelectionUI();
	closePaperlessBrowser();
}

function updatePaperlessSelectionUI() {
	const types = ['invoice', 'manual', 'productPhoto', 'otherDocument', 'edit_invoice', 'edit_manual', 'edit_productPhoto', 'edit_otherDocument'];
	types.forEach((type) => {
		const input = document.getElementById(getSelectionInputId(type));
		const display = document.getElementById(getSelectionDisplayId(type));
		if (!input || !display) return;
		if (input.value) {
			display.style.display = 'flex';
			display.querySelector('.selected-doc-name').textContent = `${window.t ? window.t('paperless.document_selected') : 'Document selected'} (#${input.value})`;
		} else {
			display.style.display = 'none';
		}
	});
}

export function clearPaperlessSelection(documentType) {
	const input = document.getElementById(getSelectionInputId(documentType));
	if (input) input.value = '';
	const display = document.getElementById(getSelectionDisplayId(documentType));
	if (display) display.style.display = 'none';
}

function changePage(direction) {
	const targetPage = browserState.currentPage + direction;
	if (targetPage < 1 || targetPage > browserState.totalPages) return;
	fetchPaperlessDocuments(targetPage, browserState.searchQuery);
}

function updatePaperlessPagination() {
	const current = document.getElementById('paperlessCurrentPage');
	const total = document.getElementById('paperlessTotalPages');
	if (current) current.textContent = browserState.currentPage;
	if (total) total.textContent = browserState.totalPages;
	const prev = document.getElementById('paperlessPrevBtn');
	const next = document.getElementById('paperlessNextBtn');
	if (prev) prev.disabled = browserState.currentPage <= 1;
	if (next) next.disabled = browserState.currentPage >= browserState.totalPages;
}

function showPaperlessLoading() {
	const container = document.getElementById('paperlessDocumentsContainer');
	if (!container) return;
	container.innerHTML = `<div class="loading-message">
		<i class="fas fa-spinner fa-spin"></i> ${window.t ? window.t('paperless.loading_documents') : 'Loading documents...'}
	</div>`;
}

function showPaperlessError(message) {
	const container = document.getElementById('paperlessDocumentsContainer');
	if (!container) return;
	container.innerHTML = `<div class="no-documents-message">
		<i class="fas fa-exclamation-triangle"></i>
		<h4>${window.t ? window.t('errors.error') : 'Error'}</h4>
		<p>${message}</p>
	</div>`;
}

export function togglePaperlessBrowseSections() {
	const browseSections = document.querySelectorAll('.paperless-browse-section');
	browseSections.forEach((section) => {
		section.style.display = paperlessNgxEnabled ? 'block' : 'none';
	});
}

// Image preload cache - stores blob URLs by secure path
const imageCache = new Map();

// Preload images from warranties data before rendering
export async function preloadWarrantyImages(warranties) {
	const token = getAuthToken();
	if (!token || !Array.isArray(warranties)) return;
	
	const imagePaths = warranties
		.filter(w => w.product_photo_path && w.product_photo_path !== 'null')
		.map(w => {
			const sanitizedPath = w.product_photo_path.replace('uploads/', '');
			return `/api/secure-file/${sanitizedPath}`;
		})
		.filter(path => !imageCache.has(path)); // Only load uncached images
	
	if (imagePaths.length === 0) return;
	
	// Preload all images in parallel
	const loadPromises = imagePaths.map(async (secureUrl) => {
		try {
			const response = await fetch(secureUrl, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!response.ok) return;
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			imageCache.set(secureUrl, blobUrl);
		} catch (error) {
			// Silently fail for preload - will retry on render
		}
	});
	
	await Promise.all(loadPromises);
}

export async function loadSecureImages() {
	const token = getAuthToken();
	if (!token) return;
	const secureImages = document.querySelectorAll('img.secure-image[data-secure-src]');
	
	// Load all images in parallel for better performance
	const loadPromises = Array.from(secureImages).map(async (img) => {
		try {
			const existingBlobUrl = img.getAttribute('data-blob-url');
			// Skip if already loaded and has valid blob URL
			if (img.classList.contains('loaded') && existingBlobUrl && img.src.startsWith('blob:')) {
				return;
			}
			// Clean up existing blob URL if present
			if (existingBlobUrl) {
				URL.revokeObjectURL(existingBlobUrl);
				img.removeAttribute('data-blob-url');
				img.classList.remove('loaded');
			}
			const secureUrl = img.getAttribute('data-secure-src');
			
			// Check cache first for instant loading
			if (imageCache.has(secureUrl)) {
				const cachedBlobUrl = imageCache.get(secureUrl);
				img.src = cachedBlobUrl;
				img.setAttribute('data-blob-url', cachedBlobUrl);
				img.classList.add('loaded');
				return;
			}
			
			// Fetch if not in cache
			const response = await fetch(secureUrl, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!response.ok) {
				img.style.display = 'none';
				return;
			}
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			img.src = blobUrl;
			img.setAttribute('data-blob-url', blobUrl);
			img.classList.add('loaded');
			// Also cache for future use
			imageCache.set(secureUrl, blobUrl);
		} catch (error) {
			console.error('[paperless] loadSecureImages failed for', img.getAttribute('data-secure-src'), error);
			img.style.display = 'none';
		}
	});
	
	await Promise.all(loadPromises);
}

// Clear cache (call when user logs out or warranties change significantly)
export function clearImageCache() {
	imageCache.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
	imageCache.clear();
}

if (typeof window !== 'undefined') {
	window.openPaperlessDocument = openPaperlessDocument;
	window.openPaperlessBrowser = openPaperlessBrowser;
	window.clearPaperlessSelection = clearPaperlessSelection;
	window.autoLinkRecentDocuments = autoLinkRecentDocuments;
	window.loadSecureImages = loadSecureImages;
	window.preloadWarrantyImages = preloadWarrantyImages;
	window.clearImageCache = clearImageCache;
	window.changePage = changePage;
	// Expose via components namespace for modular access
	window.components = window.components || {};
	window.components.paperless = {
		loadSecureImages,
		preloadWarrantyImages,
		clearImageCache,
	};
}

export default {
	initPaperlessIntegration,
	processPaperlessUploads,
	processEditPaperlessUploads,
	openPaperlessDocument,
	autoLinkRecentDocuments,
	openPaperlessBrowser,
	clearPaperlessSelection,
	togglePaperlessBrowseSections,
	showPaperlessUploadLoading,
	updatePaperlessUploadStatus,
	hidePaperlessUploadLoading,
	loadSecureImages,
	preloadWarrantyImages,
	clearImageCache,
};
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function renderLoading(container) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'loading-message');
  wrap.style.textAlign = 'center';
  wrap.style.padding = '40px';
  const spinner = el('i', 'fas fa-spinner fa-spin');
  wrap.appendChild(spinner);
  wrap.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('paperless.loading_documents')) || 'Loading documents...')));
  container.appendChild(wrap);
}

export function renderError(container, message) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'no-documents-message');
  const icon = el('i', 'fas fa-exclamation-triangle');
  const h4 = el('h4', null, (window.i18next && window.i18next.t('errors.error')) || 'Error');
  const p = el('p', null, message || ((window.i18next && window.i18next.t('paperless.failed_to_load')) || 'Failed to load documents'));
  wrap.appendChild(icon);
  wrap.appendChild(h4);
  wrap.appendChild(p);
  container.appendChild(wrap);
}

function createDocItem(doc) {
  const item = el('div', 'paperless-document-item');
  item.dataset.id = String(doc.id);
  item.addEventListener('click', () => {
    if (window.selectPaperlessDocument) window.selectPaperlessDocument(doc.id);
  });

  const title = el('div', 'document-title', doc.title || '');
  const meta = el('div', 'document-meta');
  const createdDate = doc.created ? new Date(doc.created).toLocaleDateString() : '';
  const fileType = doc.mime_type || 'Unknown';
  const tags = Array.isArray(doc.tags) ? doc.tags : [];

  const dateSpan = el('span');
  dateSpan.appendChild(el('i', 'fas fa-calendar'));
  dateSpan.appendChild(document.createTextNode(' ' + createdDate));
  const typeSpan = el('span');
  typeSpan.appendChild(el('i', 'fas fa-file'));
  typeSpan.appendChild(document.createTextNode(' ' + fileType));
  meta.appendChild(dateSpan);
  meta.appendChild(typeSpan);
  if (doc.correspondent) {
    const corr = el('span');
    corr.appendChild(el('i', 'fas fa-user'));
    corr.appendChild(document.createTextNode(' ' + doc.correspondent));
    meta.appendChild(corr);
  }

  item.appendChild(title);
  item.appendChild(meta);

  if (tags.length > 0) {
    const tagsWrap = el('div', 'document-tags');
    tags.forEach(t => {
      const badge = el('span', 'document-tag', String(t));
      tagsWrap.appendChild(badge);
    });
    item.appendChild(tagsWrap);
  }

  return item;
}

export function renderDocumentsList(container, documents = []) {
  if (!container) return;
  container.textContent = '';
  if (!Array.isArray(documents) || documents.length === 0) {
    const wrap = el('div', 'no-documents-message');
    wrap.appendChild(el('i', 'fas fa-file-alt'));
    wrap.appendChild(el('h4', null, (window.i18next && window.i18next.t('paperless.no_documents_found')) || 'No documents found'));
    wrap.appendChild(el('p', null, (window.i18next && window.i18next.t('paperless.try_adjusting_filters')) || 'Try adjusting your search terms or filters.'));
    container.appendChild(wrap);
    return;
  }
  documents.forEach(doc => container.appendChild(createDocItem(doc)));
}

// Global exposure
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.paperless = {
    renderLoading,
    renderError,
    renderDocumentsList,
  };
}


