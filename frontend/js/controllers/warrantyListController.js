import authService from '../services/authService.js';
import { listWarranties, saveUserPreferences, getGlobalViewStatus } from '../services/apiService.js';
import {
	getFilters,
	updateFilter,
	getWarranties as storeGetWarranties,
	setWarranties,
	getIsGlobalView,
	setIsGlobalView,
	getCurrentView,
	setCurrentView,
	getUserPreferencePrefix,
	setUserPreferencePrefix,
	getAllTags,
	wasLastLoadedArchived,
	didLastLoadIncludeArchived,
	StoreEvents,
} from '../store.js';
import {
	showLoading,
	hideLoading,
	showLoadingSpinner,
	hideLoadingSpinner,
	showToast,
	renderEmptyState,
} from '../components/ui.js';
import { loadTags as loadTagsModule, openTagManagementModal } from '../components/tagManager.js';
import { renderWarrantiesList } from '../components/warrantyRenderer.js';
import { processWarrantyData } from '../lib/warrantyProcessing.js';
import { exportWarranties, handleImport as importCsv } from '../components/importExport.js';
import { deleteWarranty as deleteWarrantyAction, toggleArchiveStatus as toggleArchive, confirmArchive as confirmArchiveAction } from '../components/warrantyActions.js';
import { openEditModal, saveWarranty as saveEditedWarranty } from '../components/editModal.js';
import { preloadWarrantyImages } from '../components/paperless.js';

// Warranty List Controller
// Incremental extraction of main list responsibilities with strict backward compatibility.

function callIfExists(fn, ...args) {
	if (typeof fn === 'function') return fn(...args);
}

const DEFAULT_SCOPE = 'personal';
const VIEW_SCOPE_KEY = 'viewScope';

function getPreferenceKeyPrefix() {
	let prefix = getUserPreferencePrefix();
	if (prefix) return prefix;
	const user = authService.getCurrentUser();
	prefix = user && user.is_admin ? 'admin_' : 'user_';
	setUserPreferencePrefix(prefix);
	return prefix;
}

function saveViewScopePreference(scope) {
	localStorage.setItem(`${getPreferenceKeyPrefix()}${VIEW_SCOPE_KEY}`, scope);
}

function loadViewScopePreference() {
	return localStorage.getItem(`${getPreferenceKeyPrefix()}${VIEW_SCOPE_KEY}`) || DEFAULT_SCOPE;
}

function queryViewElements() {
	return {
		warrantiesList: document.getElementById('warrantiesList'),
		gridViewBtn: document.getElementById('gridViewBtn'),
		listViewBtn: document.getElementById('listViewBtn'),
		tableViewBtn: document.getElementById('tableViewBtn'),
		tableViewHeader: document.querySelector('.table-view-header'),
		currentViewIcon: document.getElementById('currentViewIcon'),
	};
}

function updateViewButtons(viewType, { gridViewBtn, listViewBtn, tableViewBtn }) {
	const buttons = [gridViewBtn, listViewBtn, tableViewBtn];
	if (!buttons.every(Boolean)) return;
	buttons.forEach((btn) => btn.classList.remove('active'));
	if (viewType === 'grid' && gridViewBtn) gridViewBtn.classList.add('active');
	if (viewType === 'list' && listViewBtn) listViewBtn.classList.add('active');
	if (viewType === 'table' && tableViewBtn) tableViewBtn.classList.add('active');
}

function updateViewIcon(viewType, icon) {
	if (!icon) return;
	icon.className = 'fas';
	if (viewType === 'list') {
		icon.classList.add('fa-list');
		icon.setAttribute('aria-label', 'List');
	} else if (viewType === 'table') {
		icon.classList.add('fa-table');
		icon.setAttribute('aria-label', 'Table');
	} else {
		icon.classList.add('fa-th-large');
		icon.setAttribute('aria-label', 'Grid');
	}
}

function updateWarrantiesPanelTitle(isGlobal = false) {
	const title = document.getElementById('warrantiesPanelTitle');
	if (!title) return;
	if (window.i18next && window.i18next.t) {
		title.textContent = isGlobal ? window.i18next.t('warranties.title_global') : window.i18next.t('warranties.title');
	} else {
		title.textContent = isGlobal ? "All Users' Warranties" : 'Your Warranties';
	}
}

function updateScopeIcon(scope) {
	const icon = document.getElementById('currentScopeIcon');
	if (!icon) return;
	icon.className = 'fas';
	if (scope === 'global') {
		icon.classList.add('fa-globe');
		icon.setAttribute('aria-label', 'Global');
	} else {
		icon.classList.add('fa-user');
		icon.setAttribute('aria-label', 'Personal');
	}
}

function updateScopeButtons(scope) {
	const personalViewBtn = document.getElementById('personalViewBtn');
	const globalViewBtn = document.getElementById('globalViewBtn');
	if (personalViewBtn) personalViewBtn.classList.toggle('active', scope === 'personal');
	if (globalViewBtn) globalViewBtn.classList.toggle('active', scope === 'global');
	const scopePersonalOption = document.getElementById('scopePersonalOption');
	const scopeGlobalOption = document.getElementById('scopeGlobalOption');
	if (scopePersonalOption) scopePersonalOption.classList.toggle('active', scope === 'personal');
	if (scopeGlobalOption) scopeGlobalOption.classList.toggle('active', scope === 'global');
}

function getWarrantiesListElement() {
	return document.getElementById('warrantiesList');
}

function processWarranty(warranty) {
	return processWarrantyData(warranty);
}

// Public API (delegations kept for now until full extraction of implementations)
export async function loadWarranties(isAuthenticatedOverride) {
	const isAuthenticated =
		typeof isAuthenticatedOverride === 'boolean' ? isAuthenticatedOverride : authService.isAuthenticated();

	showLoading();
	try {
		loadViewPreference();

		const filters = getFilters();

		if (!isAuthenticated) {
			renderEmptyState(
				getWarrantiesListElement(),
				window.i18next ? window.i18next.t('messages.login_to_view_warranties') : 'Please log in to view warranties.',
			);
			setWarranties([], { warrantiesLoaded: false, lastLoadedArchived: false, lastLoadedIncludesArchived: false });
			return;
		}

		const scope = loadViewScopePreference();
		setIsGlobalView(scope === 'global');
		updateScopeButtons(scope);
		updateScopeIcon(scope);
		updateWarrantiesPanelTitle(scope === 'global');

		const primary = await listWarranties({ scope, archived: filters.status === 'archived' });
		let combined = Array.isArray(primary) ? primary : [];

		let lastLoadedArchived = filters.status === 'archived';
		let lastLoadedIncludesArchived = false;

		if (filters.status === 'all') {
			const archived = await listWarranties({ scope, archived: true });
			const archivedMarked = Array.isArray(archived) ? archived.map((warranty) => ({ ...warranty, __isArchived: true })) : [];
			combined = combined.concat(archivedMarked);
			lastLoadedIncludesArchived = true;
		}

		const processed = combined.map(processWarranty);
		setWarranties(processed, {
			warrantiesLoaded: true,
			lastLoadedArchived,
			lastLoadedIncludesArchived,
		});

		// Preload images immediately so they're ready when cards render
		preloadWarrantyImages(processed).catch(() => {});

		if (!processed.length) {
			renderEmptyState(
				getWarrantiesListElement(),
				window.i18next
					? window.i18next.t('messages.no_warranties_found_add_first')
					: 'No warranties yet. Add your first warranty to get started.',
			);
			return;
		}

		populateTagFilter();
		populateVendorFilter();
		populateWarrantyTypeFilter();
		applyFilters();
	} catch (error) {
		console.error('[controller.loadWarranties] Error:', error);
		renderEmptyState(
			getWarrantiesListElement(),
			window.i18next
				? window.i18next.t('messages.error_loading_warranties_try_again')
				: 'Error loading warranties. Please try again.',
		);
		showToast(
			error?.message ||
				(window.i18next ? window.i18next.t('messages.error_loading_warranties_try_again') : 'Failed to load warranties'),
			'error',
		);
	} finally {
		hideLoading();
	}
}
export function applyFilters() {
	const filters = getFilters();
	const warranties = storeGetWarranties();

	const wasArchivedLoaded = wasLastLoadedArchived();
	const includesArchivedLoaded = didLastLoadIncludeArchived();

	if (
		(filters.status === 'archived' && !wasArchivedLoaded) ||
		(filters.status !== 'archived' && wasArchivedLoaded) ||
		(filters.status === 'all' && !includesArchivedLoaded)
	) {
		loadWarranties();
		return;
	}

	const filtered = warranties.filter((warranty) => {
		// Exclude archived in specific status views (only show in 'all' or 'archived')
		if (warranty.is_archived && filters.status !== 'all' && filters.status !== 'archived') return false;
		// Status filter: allow archived items to pass in All view
		if (filters.status !== 'all' && filters.status !== 'archived' && warranty.status !== filters.status) return false;
		// Tag filter
		if (filters.tag !== 'all') {
			const tagId = parseInt(filters.tag, 10);
			const hasTag = warranty.tags && Array.isArray(warranty.tags) && warranty.tags.some(tag => tag.id === tagId);
			if (!hasTag) return false;
		}
		// Vendor filter
		if (filters.vendor !== 'all' && (warranty.vendor || '').toLowerCase() !== (filters.vendor || '').toLowerCase()) return false;
		// Warranty type filter
		if (filters.warranty_type !== 'all' && (warranty.warranty_type || '').toLowerCase() !== (filters.warranty_type || '').toLowerCase()) return false;
		// Search filter
		if (filters.search) {
			const searchTerm = (filters.search || '').toLowerCase();
			const productNameMatch = (warranty.product_name || '').toLowerCase().includes(searchTerm);
			const tagMatch = warranty.tags && Array.isArray(warranty.tags) && warranty.tags.some(tag => (tag.name || '').toLowerCase().includes(searchTerm));
			const notesMatch = (warranty.notes || '').toLowerCase().includes(searchTerm);
			const vendorMatch = (warranty.vendor || '').toLowerCase().includes(searchTerm);
			const modelNumberMatch = (warranty.model_number || '').toLowerCase().includes(searchTerm);
			const serialNumberMatch = warranty.serial_numbers && Array.isArray(warranty.serial_numbers) && warranty.serial_numbers.some(sn => sn && String(sn).toLowerCase().includes(searchTerm));
			if (!productNameMatch && !tagMatch && !notesMatch && !vendorMatch && !modelNumberMatch && !serialNumberMatch) return false;
		}
		return true;
	});

	renderWarrantiesList(filtered);
}
export function renderWarranties() { return callIfExists(window.renderWarranties); }
export function filterWarranties() { return callIfExists(window.filterWarranties); }

// Extracted implementations: dropdown population
export function populateTagFilter() {
	const tagFilter = document.getElementById('tagFilter');
	if (!tagFilter) return;
	while (tagFilter.options.length > 1) tagFilter.remove(1);
	const uniqueTags = new Set();
	const all = storeGetWarranties();
	all.forEach(warranty => {
		if (warranty.tags && Array.isArray(warranty.tags)) {
			warranty.tags.forEach(tag => uniqueTags.add(JSON.stringify({ id: tag.id, name: tag.name, color: tag.color })));
		}
	});
	const sortedTags = Array.from(uniqueTags).map(j => JSON.parse(j)).sort((a, b) => a.name.localeCompare(b.name));
	sortedTags.forEach(tag => {
		const option = document.createElement('option');
		option.value = tag.id;
		option.textContent = tag.name;
		tagFilter.appendChild(option);
	});
}

export function populateVendorFilter() {
	const vendorFilterElement = document.getElementById('vendorFilter');
	if (!vendorFilterElement) return;
	while (vendorFilterElement.options.length > 1) vendorFilterElement.remove(1);
	const uniqueVendors = new Set();
	const all = storeGetWarranties();
	all.forEach(warranty => {
		if (warranty.vendor && warranty.vendor.trim() !== '') uniqueVendors.add(warranty.vendor.trim().toLowerCase());
	});
	const sortedVendors = Array.from(uniqueVendors).sort((a, b) => a.localeCompare(b));
	sortedVendors.forEach(vendor => {
		const option = document.createElement('option');
		option.value = vendor;
		option.textContent = vendor.charAt(0).toUpperCase() + vendor.slice(1);
		vendorFilterElement.appendChild(option);
	});
}

export function populateWarrantyTypeFilter() {
	const warrantyTypeFilterElement = document.getElementById('warrantyTypeFilter');
	if (!warrantyTypeFilterElement) return;
	while (warrantyTypeFilterElement.options.length > 1) warrantyTypeFilterElement.remove(1);
	const uniqueTypes = new Set();
	const all = storeGetWarranties();
	all.forEach(warranty => {
		if (warranty.warranty_type && warranty.warranty_type.trim() !== '') uniqueTypes.add(warranty.warranty_type.trim().toLowerCase());
	});
	const sorted = Array.from(uniqueTypes).sort((a, b) => a.localeCompare(b));
	sorted.forEach(type => {
		const option = document.createElement('option');
		option.value = type;
		option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
		warrantyTypeFilterElement.appendChild(option);
	});
}

// Extracted implementations: persist and restore filters/sort
export async function saveFilterPreferences(saveToApi = true) {
	try {
		const prefix = getPreferenceKeyPrefix();
		const filters = getFilters();
		const filtersToSave = {
			status: filters.status || 'all',
			tag: filters.tag || 'all',
			vendor: filters.vendor || 'all',
			warranty_type: filters.warranty_type || 'all',
			search: filters.search || '',
			sortBy: filters.sortBy || 'expiration'
		};
		localStorage.setItem(`${prefix}warrantyFilters`, JSON.stringify(filtersToSave));

		if (saveToApi && authService.isAuthenticated()) {
			try {
				await saveUserPreferences({ saved_filters: filtersToSave });
			} catch (e) {
				console.error('[Filters] Error saving filter preferences to API:', e);
			}
		}
	} catch (e) {
		console.warn('Failed to save filter preferences', e);
	}
}

export async function switchView(viewType, saveToApi = true, reapplyFilters = true) {
	if (!viewType || viewType === getCurrentView()) {
		setCurrentView(viewType || getCurrentView() || 'grid');
	}
	setCurrentView(viewType);

	const prefix = getPreferenceKeyPrefix();
	const viewKey = `${prefix}defaultView`;
	const legacyKey = `${prefix}warrantyView`;
	if (localStorage.getItem(viewKey) !== viewType) {
		localStorage.setItem(viewKey, viewType);
		localStorage.setItem(legacyKey, viewType);
		localStorage.setItem('viewPreference', viewType);
	}

	if (saveToApi && authService.isAuthenticated()) {
		try {
			await saveUserPreferences({ default_view: viewType });
		} catch (error) {
			console.error('[switchView] Failed to save preference to API', error);
		}
	}

	const { warrantiesList, gridViewBtn, listViewBtn, tableViewBtn, tableViewHeader, currentViewIcon } = queryViewElements();
	if (warrantiesList) {
		warrantiesList.classList.remove('grid-view', 'list-view', 'table-view');
		warrantiesList.classList.add(`${viewType}-view`);
	}
	updateViewButtons(viewType, { gridViewBtn, listViewBtn, tableViewBtn });
	if (tableViewHeader) {
		tableViewHeader.classList.toggle('visible', viewType === 'table');
	}
	updateViewIcon(viewType, currentViewIcon);

	try {
		await saveFilterPreferences(false);
	} catch (error) {
		console.error('[switchView] Failed to persist filters locally', error);
	}

	if (reapplyFilters && storeGetWarranties().length > 0) {
		applyFilters();
	}
}

export function loadViewPreference() {
	const prefix = getPreferenceKeyPrefix();
	const savedView =
		localStorage.getItem(`${prefix}defaultView`) ||
		localStorage.getItem('viewPreference') ||
		localStorage.getItem(`${prefix}warrantyView`) ||
		'grid';
	switchView(savedView, false, false);
}

async function ensureGlobalScopeEnabled() {
	try {
		const result = await getGlobalViewStatus();
		return !!result?.enabled;
	} catch (error) {
		console.error('[warrantyListController] Failed to check global view status', error);
		return true;
	}
}

async function switchScope(scope) {
	const isGlobal = scope === 'global';
	setIsGlobalView(isGlobal);
	saveViewScopePreference(scope);
	updateScopeButtons(scope);
	updateScopeIcon(scope);
	updateWarrantiesPanelTitle(isGlobal);
	try {
		await loadWarranties(authService.isAuthenticated());
		applyFilters();
	} catch (error) {
		console.error('[warrantyListController] Error switching scope', error);
		showToast(
			window.t
				? window.t(isGlobal ? 'messages.error_loading_global_warranties' : 'messages.error_loading_personal_warranties')
				: 'Failed to load warranties',
			'error',
		);
	}
}

export const switchToPersonalView = () => switchScope('personal');

export async function switchToGlobalView() {
	const enabled = await ensureGlobalScopeEnabled();
	if (!enabled) {
		showToast(window.t ? window.t('messages.global_view_disabled') : 'Global view is disabled', 'error');
		return;
	}
	switchScope('global');
}

export async function initViewControls() {
	const scopeDropdown = document.getElementById('scopeDropdown');
	const adminViewSwitcher = document.getElementById('adminViewSwitcher');
	try {
		const status = await getGlobalViewStatus();
		if (adminViewSwitcher) adminViewSwitcher.style.display = 'none';
		const enabled = !!status?.enabled;
		if (scopeDropdown) scopeDropdown.style.display = enabled ? 'block' : 'none';
		if (!enabled) {
			if (getIsGlobalView()) {
				await switchScope('personal');
			}
		} else {
			const savedScope = loadViewScopePreference();
			updateScopeButtons(savedScope);
			updateScopeIcon(savedScope);
			updateWarrantiesPanelTitle(savedScope === 'global');
		}
	} catch (error) {
		console.error('[warrantyListController] initViewControls failed', error);
		if (scopeDropdown) scopeDropdown.style.display = 'block';
	}
}

export function loadFilterAndSortPreferences() {
	try {
		const prefix = getPreferenceKeyPrefix();
		const savedFiltersRaw = localStorage.getItem(`${prefix}warrantyFilters`);
		if (!savedFiltersRaw) return;
		const savedFilters = JSON.parse(savedFiltersRaw);
		if (!savedFilters || typeof savedFilters !== 'object') return;

		const existing = getFilters();
		if (savedFilters.status !== undefined) updateFilter('status', savedFilters.status || existing.status);
		if (savedFilters.tag !== undefined) updateFilter('tag', savedFilters.tag || existing.tag);
		if (savedFilters.vendor !== undefined) updateFilter('vendor', savedFilters.vendor || existing.vendor);
		if (savedFilters.warranty_type !== undefined) updateFilter('warranty_type', savedFilters.warranty_type || existing.warranty_type);
		if (savedFilters.search !== undefined) updateFilter('search', savedFilters.search || '');
		if (savedFilters.sortBy !== undefined) updateFilter('sortBy', savedFilters.sortBy || existing.sortBy);

		const searchInput = document.getElementById('searchWarranties');
		const clearSearchBtn = document.getElementById('clearSearch');
		if (searchInput && savedFilters.search) {
			searchInput.value = savedFilters.search;
			if (clearSearchBtn) clearSearchBtn.style.display = 'flex';
			if (searchInput.parentElement) searchInput.parentElement.classList.add('active-search');
		}
	} catch (e) {
		console.warn('Failed to load filter/sort preferences', e);
	}
}

// Extracted: setupUIEventListeners -> initEventListeners
export function initEventListeners() {
	// --- Global Manage Tags Button ---
	const globalManageTagsBtn = document.getElementById('globalManageTagsBtn');
	if (globalManageTagsBtn && !globalManageTagsBtn._wlcBound) {
		globalManageTagsBtn.addEventListener('click', async () => {
			const tags = getAllTags();
			if (!tags || tags.length === 0) {
				showLoadingSpinner();
				try {
					await loadTagsModule();
				} catch (error) {
					console.error('Failed to load tags before opening modal:', error);
					showToast(window.t ? window.t('messages.could_not_load_tags') : 'Could not load tags', 'error');
					hideLoadingSpinner();
					return;
				}
				hideLoadingSpinner();
			}
			openTagManagementModal();
		});
		globalManageTagsBtn._wlcBound = true;
	}

	// Initialize edit tabs if available
	callIfExists(window.initEditTabs);

	// Close modals on backdrop or dismiss buttons
	document.querySelectorAll('.modal-backdrop, [data-dismiss="modal"]').forEach(element => {
		if (element._wlcBound) return;
		element.addEventListener('click', (e) => {
			if (e.target === element || e.target.matches('[data-dismiss="modal"]')) {
				const modalToClose = e.target.closest('.modal-backdrop');
				if (modalToClose) {
					if ((modalToClose.id === 'addWarrantyModal' || modalToClose.id === 'editModal' || modalToClose.id === 'claimsModal' || modalToClose.id === 'claimFormModal') && e.target === modalToClose) {
						return;
					}
					modalToClose.classList.remove('active');
					if (modalToClose.id === 'editModal') {
						// optional reset area
					} else if (modalToClose.id === 'addWarrantyModal') {
						callIfExists(window.resetAddWarrantyWizard);
					}
				}
			}
		});
		element._wlcBound = true;
	});

	// Prevent modal content clicks from closing the modal
	document.querySelectorAll('.modal').forEach(modal => {
		if (modal._wlcBound) return;
		modal.addEventListener('click', (e) => e.stopPropagation());
		modal._wlcBound = true;
	});

	// Filter controls
	const searchInput = document.getElementById('searchWarranties');
	const clearSearchBtn = document.getElementById('clearSearch');
	const statusFilter = document.getElementById('statusFilter');
	const tagFilter = document.getElementById('tagFilter');
	const sortBySelect = document.getElementById('sortBy');
	const vendorFilter = document.getElementById('vendorFilter');
	const warrantyTypeFilter = document.getElementById('warrantyTypeFilter');

	if (searchInput && !searchInput._wlcBound) {
		let searchDebounceTimeout;
		searchInput.addEventListener('input', () => {
			updateFilter('search', searchInput.value.toLowerCase());
			if (clearSearchBtn) clearSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
			if (searchInput.value) {
				searchInput.parentElement.classList.add('active-search');
			} else {
				searchInput.parentElement.classList.remove('active-search');
			}
			if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
			searchDebounceTimeout = setTimeout(() => {
				applyFilters();
				saveFilterPreferences();
			}, 300);
		});
		searchInput._wlcBound = true;
	}

	if (clearSearchBtn && !clearSearchBtn._wlcBound) {
		clearSearchBtn.addEventListener('click', () => {
			if (searchInput) {
				searchInput.value = '';
				updateFilter('search', '');
				clearSearchBtn.style.display = 'none';
				searchInput.parentElement.classList.remove('active-search');
				searchInput.focus();
				applyFilters();
				saveFilterPreferences();
			}
		});
		clearSearchBtn._wlcBound = true;
	}

	if (statusFilter && !statusFilter._wlcBound) {
		statusFilter.addEventListener('change', () => {
			updateFilter('status', statusFilter.value);
			applyFilters();
			saveFilterPreferences();
		});
		statusFilter._wlcBound = true;
	}

	if (tagFilter && !tagFilter._wlcBound) {
		tagFilter.addEventListener('change', () => {
			updateFilter('tag', tagFilter.value);
			applyFilters();
			saveFilterPreferences();
		});
		tagFilter._wlcBound = true;
	}

	if (vendorFilter && !vendorFilter._wlcBound) {
		vendorFilter.addEventListener('change', () => {
			updateFilter('vendor', vendorFilter.value);
			applyFilters();
			saveFilterPreferences();
		});
		vendorFilter._wlcBound = true;
	}

	if (warrantyTypeFilter && !warrantyTypeFilter._wlcBound) {
		warrantyTypeFilter.addEventListener('change', () => {
			updateFilter('warranty_type', warrantyTypeFilter.value);
			applyFilters();
			saveFilterPreferences();
		});
		warrantyTypeFilter._wlcBound = true;
	}

	if (sortBySelect && !sortBySelect._wlcBound) {
		sortBySelect.addEventListener('change', () => {
			updateFilter('sortBy', sortBySelect.value);
			applyFilters();
			saveFilterPreferences();
		});
		sortBySelect._wlcBound = true;
	}

	// View switchers
	const gridViewBtn = document.getElementById('gridViewBtn');
	const listViewBtn = document.getElementById('listViewBtn');
	const tableViewBtn = document.getElementById('tableViewBtn');
	if (gridViewBtn && !gridViewBtn._wlcBound) { gridViewBtn.addEventListener('click', () => switchView('grid')); gridViewBtn._wlcBound = true; }
	if (listViewBtn && !listViewBtn._wlcBound) { listViewBtn.addEventListener('click', () => switchView('list')); listViewBtn._wlcBound = true; }
	if (tableViewBtn && !tableViewBtn._wlcBound) { tableViewBtn.addEventListener('click', () => switchView('table')); tableViewBtn._wlcBound = true; }

	const personalViewBtn = document.getElementById('personalViewBtn');
	if (personalViewBtn && !personalViewBtn._scopeBound) {
		personalViewBtn.addEventListener('click', () => switchToPersonalView());
		personalViewBtn._scopeBound = true;
	}
	const globalViewBtn = document.getElementById('globalViewBtn');
	if (globalViewBtn && !globalViewBtn._scopeBound) {
		globalViewBtn.addEventListener('click', () => switchToGlobalView());
		globalViewBtn._scopeBound = true;
	}
	const scopePersonalOption = document.getElementById('scopePersonalOption');
	if (scopePersonalOption && !scopePersonalOption._scopeBound) {
		scopePersonalOption.addEventListener('click', () => {
			switchToPersonalView();
			const scopeMenu = document.getElementById('scopeMenu');
			if (scopeMenu) scopeMenu.classList.remove('active');
		});
		scopePersonalOption._scopeBound = true;
	}
	const scopeGlobalOption = document.getElementById('scopeGlobalOption');
	if (scopeGlobalOption && !scopeGlobalOption._scopeBound) {
		scopeGlobalOption.addEventListener('click', () => {
			switchToGlobalView();
			const scopeMenu = document.getElementById('scopeMenu');
			if (scopeMenu) scopeMenu.classList.remove('active');
		});
		scopeGlobalOption._scopeBound = true;
	}

	if (!window._wlcStoreEventsBound) {
		const handleWarrantiesChanged = () => {
			populateTagFilter();
			populateVendorFilter();
			populateWarrantyTypeFilter();
			renderWarrantiesList(storeGetWarranties());
		};
		const handleFiltersChanged = () => applyFilters();
		window.addEventListener(StoreEvents.WARRANTIES_CHANGED, handleWarrantiesChanged);
		window.addEventListener(StoreEvents.FILTERS_CHANGED, handleFiltersChanged);
		window._wlcStoreEventsBound = true;
	}

	// Export / Import
	const exportBtn = document.getElementById('exportBtn');
	if (exportBtn && !exportBtn._wlcBound) { exportBtn.addEventListener('click', exportWarranties); exportBtn._wlcBound = true; }
	const importBtn = document.getElementById('importBtn');
	const csvFileInput = document.getElementById('csvFileInput');
	if (importBtn && csvFileInput && !importBtn._wlcBound) {
		importBtn.addEventListener('click', () => csvFileInput.click());
		csvFileInput.addEventListener('change', (event) => {
			if (event.target.files && event.target.files.length > 0) {
				importCsv(event.target.files[0]);
			}
		});
		importBtn._wlcBound = true;
	}

	// Refresh
	const refreshBtn = document.getElementById('refreshBtn');
	if (refreshBtn && !refreshBtn._wlcBound) {
		refreshBtn.addEventListener('click', () => loadWarranties());
		refreshBtn._wlcBound = true;
	}

	// Warranty Type custom input handling
	const warrantyTypeInput = document.getElementById('warrantyType');
	const warrantyTypeCustomInput = document.getElementById('warrantyTypeCustom');
	if (warrantyTypeInput && warrantyTypeCustomInput && !warrantyTypeInput._wlcBound) {
		warrantyTypeInput.addEventListener('change', () => {
			if (warrantyTypeInput.value === 'other') {
				warrantyTypeCustomInput.style.display = 'block';
				warrantyTypeCustomInput.focus();
			} else {
				warrantyTypeCustomInput.style.display = 'none';
				warrantyTypeCustomInput.value = '';
			}
			callIfExists(window.updateSummary);
		});
		warrantyTypeCustomInput.addEventListener('input', () => callIfExists(window.updateSummary));
		warrantyTypeInput._wlcBound = true;
	}

	const editWarrantyTypeInput = document.getElementById('editWarrantyType');
	const editWarrantyTypeCustomInput = document.getElementById('editWarrantyTypeCustom');
	if (editWarrantyTypeInput && editWarrantyTypeCustomInput && !editWarrantyTypeInput._wlcBound) {
		editWarrantyTypeInput.addEventListener('change', () => {
			if (editWarrantyTypeInput.value === 'other') {
				editWarrantyTypeCustomInput.style.display = 'block';
				editWarrantyTypeCustomInput.focus();
			} else {
				editWarrantyTypeCustomInput.style.display = 'none';
				editWarrantyTypeCustomInput.value = '';
			}
		});
		editWarrantyTypeInput._wlcBound = true;
	}

	// Save warranty changes
	const saveWarrantyBtn = document.getElementById('saveWarrantyBtn');
	if (saveWarrantyBtn && !saveWarrantyBtn._wlcBound) {
	let handler = saveEditedWarranty;
	if (typeof window.setupSaveWarrantyObserver === 'function') {
		try {
			handler = window.setupSaveWarrantyObserver(saveEditedWarranty);
			window.saveWarrantyObserverAttachedByScriptJS = true;
		} catch (e) {
			console.error('[warrantyListController] Failed to wrap saveWarranty:', e);
		}
	}
	saveWarrantyBtn.addEventListener('click', () => {
		if (typeof handler === 'function') handler();
	});
		saveWarrantyBtn._wlcBound = true;
	}

	// Confirm delete/archive
	const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
	if (confirmDeleteBtn && !confirmDeleteBtn._wlcBound) { confirmDeleteBtn.addEventListener('click', deleteWarrantyAction); confirmDeleteBtn._wlcBound = true; }
	const confirmArchiveBtn = document.getElementById('confirmArchiveBtn');
	if (confirmArchiveBtn && !confirmArchiveBtn._wlcBound) { confirmArchiveBtn.addEventListener('click', confirmArchiveAction); confirmArchiveBtn._wlcBound = true; }

	// List delegated events (claims/edit/delete/notes/archive/unarchive) - controller owns this exclusively
	const list = document.getElementById('warrantiesList');
	if (list && !list._wlcDelegated) {
		list.addEventListener('click', (e) => {
			if (e.target.closest('.claims-link')) {
				e.preventDefault();
				const id = parseInt(e.target.closest('.claims-link')?.dataset?.id);
				if (typeof window.openClaimsModal === 'function' && id) window.openClaimsModal(id);
				return;
			}
			if (e.target.closest('.edit-btn')) {
				e.preventDefault();
				const el = e.target.closest('.edit-btn');
				if (el?.disabled) return;
				const id = parseInt(el?.dataset?.id);
				const warranty = storeGetWarranties().find(w => w.id === id);
				if (warranty) {
					if (typeof openEditModal === 'function') {
						openEditModal(warranty);
					} else if (typeof window.openEditModal === 'function') {
						window.openEditModal(warranty);
					}
				}
				return;
			}
			if (e.target.closest('.delete-btn')) {
				e.preventDefault();
				const el = e.target.closest('.delete-btn');
				const id = parseInt(el?.dataset?.id);
				const card = el?.closest('.warranty-card');
				const titleEl = card ? card.querySelector('.product-name-header .warranty-title') : null;
				const productName = titleEl ? titleEl.textContent.trim() : '';
				if (typeof window.openDeleteModal === 'function') window.openDeleteModal(id, productName);
				return;
			}
			if (e.target.closest('.notes-link')) {
				e.preventDefault();
				const el = e.target.closest('.notes-link');
				const id = parseInt(el?.dataset?.id);
				const warranty = storeGetWarranties().find(w => w.id === id);
				if (warranty && typeof window.showNotesModal === 'function') window.showNotesModal(warranty.notes, warranty);
				return;
			}
			if (e.target.closest('.archive-btn')) {
				e.preventDefault();
				const el = e.target.closest('.archive-btn');
				const id = parseInt(el?.dataset?.id);
				const card = el?.closest('.warranty-card');
				const titleEl = card ? card.querySelector('.product-name-header .warranty-title') : null;
				const productName = titleEl ? titleEl.textContent.trim() : '';
				if (typeof window.openArchiveModal === 'function') window.openArchiveModal(id, productName);
				return;
			}
			if (e.target.closest('.unarchive-btn')) {
				e.preventDefault();
				const id = parseInt(e.target.closest('.unarchive-btn')?.dataset?.id);
				if (Number.isFinite(id)) toggleArchive(id, false);
				return;
			}
		});
		list._wlcDelegated = true;
	}
}

// Backward compatibility for legacy callers
if (typeof window !== 'undefined') {
	window.warrantyListController = {
		loadWarranties,
		applyFilters,
		renderWarranties,
		filterWarranties,
		populateTagFilter,
		populateVendorFilter,
		populateWarrantyTypeFilter,
		saveFilterPreferences,
		loadFilterAndSortPreferences,
		switchView,
		loadViewPreference,
		switchToPersonalView,
		switchToGlobalView,
		initViewControls,
		initEventListeners
	};
	// Legacy globals to avoid breaking existing references during staged extraction
	window.populateTagFilter = populateTagFilter;
	window.populateVendorFilter = populateVendorFilter;
	window.populateWarrantyTypeFilter = populateWarrantyTypeFilter;
	window.saveFilterPreferences = saveFilterPreferences;
	window.loadFilterAndSortPreferences = loadFilterAndSortPreferences;
	window.switchView = switchView;
	window.loadViewPreference = loadViewPreference;
	window.switchToPersonalView = switchToPersonalView;
	window.switchToGlobalView = switchToGlobalView;
	window.initViewControls = initViewControls;
	window.saveViewScopePreference = saveViewScopePreference;
	window.loadViewScopePreference = loadViewScopePreference;
}

export const init = initEventListeners;


