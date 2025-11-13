// Warranty List Controller
// Incremental extraction of main list responsibilities with strict backward compatibility.

function callIfExists(fn, ...args) {
	if (typeof fn === 'function') return fn(...args);
}

// Public API (delegations kept for now until full extraction of implementations)
export async function loadWarranties(isAuthenticated) {
	// Show loading (tolerant to whichever loader exists)
	callIfExists(window.showLoading) || callIfExists(window.showLoadingSpinner);

	try {
		// Ensure view preference is applied BEFORE first render so thumbnails use correct sizes
		callIfExists(window.loadViewPreference);

		const __filters = (window.store && window.store.getFilters && window.store.getFilters()) || {};

		// Check auth state (match legacy behavior)
		if (!isAuthenticated) {
			if (typeof window.i18next !== 'undefined') {
				callIfExists(window.renderEmptyState, window.i18next.t('messages.login_to_view_warranties'));
			} else {
				callIfExists(window.renderEmptyState, 'Please log in to view warranties.');
			}
			return;
		}

		const token = window.auth && window.auth.getToken ? window.auth.getToken() : null;
		if (!token) {
			if (typeof window.i18next !== 'undefined') {
				callIfExists(window.renderEmptyState, window.i18next.t('messages.authentication_error_login_again'));
			} else {
				callIfExists(window.renderEmptyState, 'Authentication error. Please log in again.');
			}
			return;
		}

		// Determine scope and endpoint (mirrors legacy logic)
		const savedScope = callIfExists(window.loadViewScopePreference) || 'personal';
		const shouldUseGlobalView = savedScope === 'global';
		const baseUrl = window.location.origin;
		const isArchivedView = __filters && __filters.status === 'archived';
		const apiUrl = isArchivedView
			? (shouldUseGlobalView ? `${baseUrl}/api/warranties/global/archived` : `${baseUrl}/api/warranties/archived`)
			: (shouldUseGlobalView ? `${baseUrl}/api/warranties/global` : `${baseUrl}/api/warranties`);

		// Fetch warranties
		const response = await fetch(apiUrl, {
			method: 'GET',
			headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
		});
		if (!response.ok) {
			let msg = `HTTP ${response.status}`;
			try {
				const j = await response.json();
				if (j && j.message) msg = j.message;
			} catch {}
			throw new Error(msg);
		}
		let data = await response.json();
		if (!Array.isArray(data)) data = [];

		// Keep isGlobalView in sync with loaded scope
		try { if (typeof window.isGlobalView !== 'undefined') window.isGlobalView = shouldUseGlobalView; } catch {}

		// Merge archived when Status=All (mirrors legacy behavior for both scopes)
		let combinedData = Array.isArray(data) ? data : [];
		try {
			// Reset includesArchived flag
			try { if (typeof window.lastLoadedIncludesArchived !== 'undefined') window.lastLoadedIncludesArchived = false; } catch {}
			if (!isArchivedView && __filters && __filters.status === 'all') {
				const archivedUrl = shouldUseGlobalView ? `${baseUrl}/api/warranties/global/archived` : `${baseUrl}/api/warranties/archived`;
				const archivedResp = await fetch(archivedUrl, { headers: { 'Authorization': `Bearer ${token}` } });
				if (archivedResp.ok) {
					const archivedData = await archivedResp.json();
					const archivedMarked = Array.isArray(archivedData) ? archivedData.map(w => ({ ...w, __isArchived: true })) : [];
					combinedData = combinedData.concat(archivedMarked);
					try { if (typeof window.lastLoadedIncludesArchived !== 'undefined') window.lastLoadedIncludesArchived = true; } catch {}
				}
			}
		} catch {}

		// Process warranties using legacy processor if available
		const processed = Array.isArray(combinedData)
			? combinedData.map(w => {
				const p = callIfExists(window.processWarrantyData, w);
				return p !== undefined ? p : w;
			})
			: [];

		if (window.store && window.store.setWarranties) window.store.setWarranties(processed);

		// Update archived-load flag
		try { if (typeof window.lastLoadedArchived !== 'undefined') window.lastLoadedArchived = !!isArchivedView; } catch {}

		const loaded = (window.store && window.store.getWarranties && window.store.getWarranties()) || [];
		if (loaded.length === 0) {
			if (typeof window.i18next !== 'undefined') {
				callIfExists(window.renderEmptyState, window.i18next.t('messages.no_warranties_found_add_first'));
			} else {
				callIfExists(window.renderEmptyState, 'No warranties yet. Add your first warranty to get started.');
			}
			return;
		}

		// Populate filters and render
		try { populateTagFilter(); } catch {}
		try { populateVendorFilter(); } catch {}
		try { populateWarrantyTypeFilter(); } catch {}

		callIfExists(window.applyFilters) || applyFilters();
	} catch (error) {
		console.error('[controller.loadWarranties] Error:', error);
		if (typeof window.i18next !== 'undefined') {
			callIfExists(window.renderEmptyState, window.i18next.t('messages.error_loading_warranties_try_again'));
		} else {
			callIfExists(window.renderEmptyState, 'Error loading warranties. Please try again.');
		}
	} finally {
		callIfExists(window.hideLoading) || callIfExists(window.hideLoadingSpinner);
	}
}
export function applyFilters() {
	// Mirrors legacy script.js logic to preserve identical behavior
	const __filters = (window.store && window.store.getFilters && window.store.getFilters()) || {};
	const __warranties = (window.store && window.store.getWarranties && window.store.getWarranties()) || [];

	// Ensure data source correctness around archived/all toggles
	const wasArchivedLoaded = !!(window.lastLoadedArchived);
	const includesArchivedLoaded = !!(window.lastLoadedIncludesArchived);
	if (__filters.status === 'archived') {
		if (!wasArchivedLoaded) {
			loadWarranties(true);
			return;
		}
	} else if (wasArchivedLoaded) {
		loadWarranties(true);
		return;
	} else if (__filters.status === 'all' && !includesArchivedLoaded) {
		loadWarranties(true);
		return;
	}

	// Filter warranties based on current filters
	const filtered = __warranties.filter(warranty => {
		// Exclude archived in specific status views (only show in 'all' or 'archived')
		if (warranty.is_archived && __filters.status !== 'all' && __filters.status !== 'archived') return false;
		// Status filter: allow archived items to pass in All view
		if (__filters.status !== 'all' && __filters.status !== 'archived' && warranty.status !== __filters.status) return false;
		// Tag filter
		if (__filters.tag !== 'all') {
			const tagId = parseInt(__filters.tag);
			const hasTag = warranty.tags && Array.isArray(warranty.tags) && warranty.tags.some(tag => tag.id === tagId);
			if (!hasTag) return false;
		}
		// Vendor filter
		if (__filters.vendor !== 'all' && (warranty.vendor || '').toLowerCase() !== (__filters.vendor || '').toLowerCase()) return false;
		// Warranty type filter
		if (__filters.warranty_type !== 'all' && (warranty.warranty_type || '').toLowerCase() !== (__filters.warranty_type || '').toLowerCase()) return false;
		// Search filter
		if (__filters.search) {
			const searchTerm = (__filters.search || '').toLowerCase();
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

	// Preserve legacy behavior: just render (renderWarranties re-applies filters during render)
	renderWarranties();
}
export function renderWarranties() { return callIfExists(window.renderWarranties); }
export function filterWarranties() { return callIfExists(window.filterWarranties); }

// Extracted implementations: dropdown population
export function populateTagFilter() {
	const tagFilter = document.getElementById('tagFilter');
	if (!tagFilter) return;
	while (tagFilter.options.length > 1) tagFilter.remove(1);
	const uniqueTags = new Set();
	const all = ((window.store && window.store.getWarranties && window.store.getWarranties()) || []);
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
	const all = ((window.store && window.store.getWarranties && window.store.getWarranties()) || []);
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
	const all = ((window.store && window.store.getWarranties && window.store.getWarranties()) || []);
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
		const prefix = (typeof window.getPreferenceKeyPrefix === 'function') ? window.getPreferenceKeyPrefix() : '';
		const filters = (window.store && window.store.getFilters && window.store.getFilters()) || {};
		const filtersToSave = {
			status: filters.status || 'all',
			tag: filters.tag || 'all',
			vendor: filters.vendor || 'all',
			warranty_type: filters.warranty_type || 'all',
			search: filters.search || '',
			sortBy: filters.sortBy || 'expiration'
		};
		localStorage.setItem(`${prefix}warrantyFilters`, JSON.stringify(filtersToSave));

		if (saveToApi && window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated()) {
			const token = window.auth.getToken && window.auth.getToken();
			if (token) {
				try {
					await fetch('/api/auth/preferences', {
						method: 'PUT',
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ saved_filters: filtersToSave })
					});
				} catch (e) {
					console.error('[Filters] Error saving filter preferences to API:', e);
				}
			}
		}
	} catch (e) {
		console.warn('Failed to save filter preferences', e);
	}
}

export function loadFilterAndSortPreferences() {
	try {
		const prefix = (typeof window.getPreferenceKeyPrefix === 'function') ? window.getPreferenceKeyPrefix() : '';
		const savedFiltersRaw = localStorage.getItem(`${prefix}warrantyFilters`);
		if (!savedFiltersRaw) return;
		const savedFilters = JSON.parse(savedFiltersRaw);
		if (!savedFilters || typeof savedFilters !== 'object') return;

		const existing = (window.store && window.store.getFilters && window.store.getFilters()) || {};
		if (window.store && window.store.updateFilter) {
			if (savedFilters.status !== undefined) window.store.updateFilter('status', savedFilters.status || existing.status);
			if (savedFilters.tag !== undefined) window.store.updateFilter('tag', savedFilters.tag || existing.tag);
			if (savedFilters.vendor !== undefined) window.store.updateFilter('vendor', savedFilters.vendor || existing.vendor);
			if (savedFilters.warranty_type !== undefined) window.store.updateFilter('warranty_type', savedFilters.warranty_type || existing.warranty_type);
			if (savedFilters.search !== undefined) window.store.updateFilter('search', savedFilters.search || '');
			if (savedFilters.sortBy !== undefined) window.store.updateFilter('sortBy', savedFilters.sortBy || existing.sortBy);
		}

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
			const __tags = (window.store && window.store.getAllTags && window.store.getAllTags()) || [];
			if (!__tags || __tags.length === 0) {
				callIfExists(window.showLoadingSpinner);
				try {
					await callIfExists(window.loadTags);
				} catch (error) {
					console.error('Failed to load tags before opening modal:', error);
					callIfExists(window.showToast, window.t ? window.t('messages.could_not_load_tags') : 'Could not load tags', 'error');
					callIfExists(window.hideLoadingSpinner);
					return;
				}
				callIfExists(window.hideLoadingSpinner);
			}
			callIfExists(window.openTagManagementModal);
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
			if (window.store && window.store.updateFilter) window.store.updateFilter('search', searchInput.value.toLowerCase());
			if (clearSearchBtn) clearSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
			if (searchInput.value) {
				searchInput.parentElement.classList.add('active-search');
			} else {
				searchInput.parentElement.classList.remove('active-search');
			}
			if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
			searchDebounceTimeout = setTimeout(() => {
				callIfExists(window.applyFilters);
				callIfExists(window.saveFilterPreferences);
			}, 300);
		});
		searchInput._wlcBound = true;
	}

	if (clearSearchBtn && !clearSearchBtn._wlcBound) {
		clearSearchBtn.addEventListener('click', () => {
			if (searchInput) {
				searchInput.value = '';
				if (window.store && window.store.updateFilter) window.store.updateFilter('search', '');
				clearSearchBtn.style.display = 'none';
				searchInput.parentElement.classList.remove('active-search');
				searchInput.focus();
				callIfExists(window.applyFilters);
				callIfExists(window.saveFilterPreferences);
			}
		});
		clearSearchBtn._wlcBound = true;
	}

	if (statusFilter && !statusFilter._wlcBound) {
		statusFilter.addEventListener('change', () => {
			if (window.store && window.store.updateFilter) window.store.updateFilter('status', statusFilter.value);
			callIfExists(window.applyFilters);
			callIfExists(window.saveFilterPreferences);
		});
		statusFilter._wlcBound = true;
	}

	if (tagFilter && !tagFilter._wlcBound) {
		tagFilter.addEventListener('change', () => {
			if (window.store && window.store.updateFilter) window.store.updateFilter('tag', tagFilter.value);
			callIfExists(window.applyFilters);
			callIfExists(window.saveFilterPreferences);
		});
		tagFilter._wlcBound = true;
	}

	if (vendorFilter && !vendorFilter._wlcBound) {
		vendorFilter.addEventListener('change', () => {
			if (window.store && window.store.updateFilter) window.store.updateFilter('vendor', vendorFilter.value);
			callIfExists(window.applyFilters);
			callIfExists(window.saveFilterPreferences);
		});
		vendorFilter._wlcBound = true;
	}

	if (warrantyTypeFilter && !warrantyTypeFilter._wlcBound) {
		warrantyTypeFilter.addEventListener('change', () => {
			if (window.store && window.store.updateFilter) window.store.updateFilter('warranty_type', warrantyTypeFilter.value);
			callIfExists(window.applyFilters);
			callIfExists(window.saveFilterPreferences);
		});
		warrantyTypeFilter._wlcBound = true;
	}

	if (sortBySelect && !sortBySelect._wlcBound) {
		sortBySelect.addEventListener('change', () => {
			if (window.store && window.store.updateFilter) window.store.updateFilter('sortBy', sortBySelect.value);
			callIfExists(window.applyFilters);
			callIfExists(window.saveFilterPreferences);
		});
		sortBySelect._wlcBound = true;
	}

	// View switchers
	const gridViewBtn = document.getElementById('gridViewBtn');
	const listViewBtn = document.getElementById('listViewBtn');
	const tableViewBtn = document.getElementById('tableViewBtn');
	if (gridViewBtn && !gridViewBtn._wlcBound) { gridViewBtn.addEventListener('click', () => callIfExists(window.switchView, 'grid')); gridViewBtn._wlcBound = true; }
	if (listViewBtn && !listViewBtn._wlcBound) { listViewBtn.addEventListener('click', () => callIfExists(window.switchView, 'list')); listViewBtn._wlcBound = true; }
	if (tableViewBtn && !tableViewBtn._wlcBound) { tableViewBtn.addEventListener('click', () => callIfExists(window.switchView, 'table')); tableViewBtn._wlcBound = true; }

	// Export / Import
	const exportBtn = document.getElementById('exportBtn');
	if (exportBtn && !exportBtn._wlcBound) { exportBtn.addEventListener('click', () => callIfExists(window.exportWarranties)); exportBtn._wlcBound = true; }
	const importBtn = document.getElementById('importBtn');
	const csvFileInput = document.getElementById('csvFileInput');
	if (importBtn && csvFileInput && !importBtn._wlcBound) {
		importBtn.addEventListener('click', () => csvFileInput.click());
		csvFileInput.addEventListener('change', (event) => {
			if (event.target.files && event.target.files.length > 0) {
				callIfExists(window.handleImport, event.target.files[0]);
			}
		});
		importBtn._wlcBound = true;
	}

	// Refresh
	const refreshBtn = document.getElementById('refreshBtn');
	if (refreshBtn && !refreshBtn._wlcBound) {
		refreshBtn.addEventListener('click', () => loadWarranties(true));
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
		let baseSave =
			(window.components && window.components.editModal && window.components.editModal.saveWarranty)
				? window.components.editModal.saveWarranty
				: window.saveWarranty;
		let functionToAttachOnClick = baseSave;
		if (typeof window.setupSaveWarrantyObserver === 'function') {
			try {
				functionToAttachOnClick = window.setupSaveWarrantyObserver(baseSave);
				window.saveWarrantyObserverAttachedByScriptJS = true;
			} catch (e) {
				console.error('[warrantyListController] Failed to wrap saveWarranty:', e);
			}
		}
		saveWarrantyBtn.addEventListener('click', () => {
			if (typeof functionToAttachOnClick === 'function') functionToAttachOnClick();
		});
		saveWarrantyBtn._wlcBound = true;
	}

	// Confirm delete/archive
	const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
	if (confirmDeleteBtn && !confirmDeleteBtn._wlcBound) { confirmDeleteBtn.addEventListener('click', () => callIfExists(window.deleteWarranty)); confirmDeleteBtn._wlcBound = true; }
	const confirmArchiveBtn = document.getElementById('confirmArchiveBtn');
	if (confirmArchiveBtn && !confirmArchiveBtn._wlcBound) { confirmArchiveBtn.addEventListener('click', () => callIfExists(window.confirmArchive)); confirmArchiveBtn._wlcBound = true; }

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
				const warranty = ((window.store && window.store.getWarranties && window.store.getWarranties()) || []).find(w => w.id === id);
				if (warranty && typeof window.openEditModal === 'function') window.openEditModal(warranty);
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
				const warranty = ((window.store && window.store.getWarranties && window.store.getWarranties()) || []).find(w => w.id === id);
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
				if (typeof window.toggleArchiveStatus === 'function' && id) window.toggleArchiveStatus(id, false);
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
		initEventListeners
	};
	// Legacy globals to avoid breaking existing references during staged extraction
	window.populateTagFilter = populateTagFilter;
	window.populateVendorFilter = populateVendorFilter;
	window.populateWarrantyTypeFilter = populateWarrantyTypeFilter;
	window.saveFilterPreferences = saveFilterPreferences;
	window.loadFilterAndSortPreferences = loadFilterAndSortPreferences;
}

export const init = initEventListeners;


