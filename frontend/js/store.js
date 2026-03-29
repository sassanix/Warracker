const initialFilters = {
  status: 'all',
  tag: 'all',
  search: '',
  sortBy: 'expiration',
  vendor: 'all',
  warranty_type: 'all',
};

const state = {
  warranties: [],
  warrantiesLoaded: false,
  lastLoadedArchived: false,
  lastLoadedIncludesArchived: false,
  filters: { ...initialFilters },
  allTags: [],
  selectedTags: [],
  editSelectedTags: [],
  isGlobalView: false,
  currentView: 'grid',
  expiringSoonDays: 30,
  userPreferencePrefix: null,
  currentWarrantyId: null,
  currentTabIndex: 0,
  tabContents: [],
  editMode: false,
  claims: {
    warrantyId: null,
    items: [],
    canEdit: false,
  },
  notes: {
    warrantyId: null,
    entity: null,
  },
  paperless: {
    enabled: false,
    documents: [],
    selectedDocument: null,
    currentPage: 1,
    totalPages: 1,
    currentDocumentType: '',
    searchQuery: '',
  },
  isLoading: false,
};

export const StoreEvents = Object.freeze({
  WARRANTIES_CHANGED: 'state:warrantiesChanged',
  FILTERS_CHANGED: 'state:filtersChanged',
  TAGS_CHANGED: 'state:tagsChanged',
  SELECTED_TAGS_CHANGED: 'state:selectedTagsChanged',
  EDIT_SELECTED_TAGS_CHANGED: 'state:editSelectedTagsChanged',
  VIEW_CHANGED: 'state:viewChanged',
  GLOBAL_VIEW_CHANGED: 'state:globalViewChanged',
  LOADING_CHANGED: 'state:loadingChanged',
  CLAIMS_CHANGED: 'state:claimsChanged',
  NOTES_CHANGED: 'state:notesChanged',
  PAPERLESS_CHANGED: 'state:paperlessChanged',
});

const listeners = new Map();

export function subscribe(eventName, callback) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  listeners.get(eventName).add(callback);
  return () => unsubscribe(eventName, callback);
}

export function unsubscribe(eventName, callback) {
  const set = listeners.get(eventName);
  if (!set) return;
  set.delete(callback);
  if (set.size === 0) listeners.delete(eventName);
}

export function dispatch(eventName, detail) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
  const set = listeners.get(eventName);
  if (!set) return;
  set.forEach((callback) => {
    try {
      callback(detail);
    } catch (error) {
      console.error('[store] listener error', error);
    }
  });
}

export const getState = () => ({ ...state });

// Warranties
export const getWarranties = () => state.warranties.slice();
export function setWarranties(newWarranties = [], metadata = {}) {
  state.warranties = Array.isArray(newWarranties) ? [...newWarranties] : [];
  if (typeof metadata.warrantiesLoaded === 'boolean') {
    state.warrantiesLoaded = metadata.warrantiesLoaded;
  }
  if (typeof metadata.lastLoadedArchived === 'boolean') {
    state.lastLoadedArchived = metadata.lastLoadedArchived;
  }
  if (typeof metadata.lastLoadedIncludesArchived === 'boolean') {
    state.lastLoadedIncludesArchived = metadata.lastLoadedIncludesArchived;
  }
  dispatch(StoreEvents.WARRANTIES_CHANGED, {
    warranties: getWarranties(),
    meta: {
      warrantiesLoaded: state.warrantiesLoaded,
      lastLoadedArchived: state.lastLoadedArchived,
      lastLoadedIncludesArchived: state.lastLoadedIncludesArchived,
    },
  });
}

export const areWarrantiesLoaded = () => state.warrantiesLoaded;
export const wasLastLoadedArchived = () => state.lastLoadedArchived;
export const didLastLoadIncludeArchived = () => state.lastLoadedIncludesArchived;

// Filters
export const getFilters = () => ({ ...state.filters });
export function updateFilter(key, value) {
  if (!(key in state.filters)) return;
  state.filters[key] = value;
  dispatch(StoreEvents.FILTERS_CHANGED, { filters: getFilters() });
}
export function setFilters(nextFilters = {}) {
  state.filters = { ...state.filters, ...nextFilters };
  dispatch(StoreEvents.FILTERS_CHANGED, { filters: getFilters() });
}
export function resetFilters() {
  state.filters = { ...initialFilters };
  dispatch(StoreEvents.FILTERS_CHANGED, { filters: getFilters() });
}

// Loading
export function setLoading(isLoading) {
  state.isLoading = !!isLoading;
  dispatch(StoreEvents.LOADING_CHANGED, { isLoading: state.isLoading });
}
export const getIsLoading = () => state.isLoading;

// Tags
export const getAllTags = () => state.allTags.slice();
export function setAllTags(tags = []) {
  state.allTags = Array.isArray(tags) ? [...tags] : [];
  // Sync with legacy global for script.js compatibility
  if (typeof window !== 'undefined') {
    window.allTags = state.allTags.slice();
  }
  dispatch(StoreEvents.TAGS_CHANGED, { allTags: getAllTags() });
}
export const getSelectedTags = () => state.selectedTags.slice();
export function setSelectedTags(tags = []) {
  state.selectedTags = Array.isArray(tags) ? [...tags] : [];
  // Sync with legacy global for script.js compatibility
  if (typeof window !== 'undefined') {
    window.selectedTags = state.selectedTags.slice();
  }
  dispatch(StoreEvents.SELECTED_TAGS_CHANGED, { selectedTags: getSelectedTags() });
}
export const getEditSelectedTags = () => state.editSelectedTags.slice();
export function setEditSelectedTags(tags = []) {
  state.editSelectedTags = Array.isArray(tags) ? [...tags] : [];
  dispatch(StoreEvents.EDIT_SELECTED_TAGS_CHANGED, { editSelectedTags: getEditSelectedTags() });
}

// View preferences
export const getCurrentView = () => state.currentView;
export function setCurrentView(view) {
  if (!view) return;
  state.currentView = view;
  dispatch(StoreEvents.VIEW_CHANGED, { currentView: state.currentView });
}
export const getExpiringSoonDays = () => state.expiringSoonDays;
export function setExpiringSoonDays(days) {
  if (Number.isFinite(days)) state.expiringSoonDays = days;
}
export const getIsGlobalView = () => state.isGlobalView;
export function setIsGlobalView(isGlobal = false) {
  state.isGlobalView = !!isGlobal;
  dispatch(StoreEvents.GLOBAL_VIEW_CHANGED, { isGlobalView: state.isGlobalView });
}
export const getUserPreferencePrefix = () => state.userPreferencePrefix;
export function setUserPreferencePrefix(prefix) {
  state.userPreferencePrefix = prefix;
}

// Selection / tab state
export const getCurrentWarrantyId = () => state.currentWarrantyId;
export function setCurrentWarrantyId(id) {
  state.currentWarrantyId = id;
}
export const getTabState = () => ({
  currentTabIndex: state.currentTabIndex,
  tabContents: [...state.tabContents],
  editMode: state.editMode,
});
export function setTabState({ currentTabIndex, tabContents, editMode }) {
  if (Number.isInteger(currentTabIndex)) state.currentTabIndex = currentTabIndex;
  if (Array.isArray(tabContents)) state.tabContents = [...tabContents];
  if (typeof editMode === 'boolean') state.editMode = editMode;
}

// Claims
export const getClaimsState = () => ({ ...state.claims, items: state.claims.items.slice() });
export function setClaimsState(partial = {}) {
  state.claims = {
    ...state.claims,
    ...partial,
    items: Array.isArray(partial.items) ? [...partial.items] : state.claims.items,
  };
  dispatch(StoreEvents.CLAIMS_CHANGED, { claims: getClaimsState() });
}

// Notes
export const getNotesState = () => ({ ...state.notes });
export function setNotesState(partial = {}) {
  state.notes = { ...state.notes, ...partial };
  dispatch(StoreEvents.NOTES_CHANGED, { notes: getNotesState() });
}

// Paperless
export const getPaperlessState = () => ({
  ...state.paperless,
  documents: state.paperless.documents.slice(),
});
export function setPaperlessState(partial = {}) {
  state.paperless = {
    ...state.paperless,
    ...partial,
    documents: Array.isArray(partial.documents) ? [...partial.documents] : state.paperless.documents,
  };
  dispatch(StoreEvents.PAPERLESS_CHANGED, { paperless: getPaperlessState() });
}

// Non-module compatibility
if (typeof window !== 'undefined') {
  window.store = {
    getState,
    subscribe,
    dispatch,
    getWarranties,
    setWarranties,
    getFilters,
    updateFilter,
    setFilters,
    resetFilters,
    setLoading,
    getIsLoading,
    getAllTags,
    setAllTags,
    getSelectedTags,
    setSelectedTags,
    getEditSelectedTags,
    setEditSelectedTags,
    getCurrentView,
    setCurrentView,
    getIsGlobalView,
    setIsGlobalView,
    getExpiringSoonDays,
    setExpiringSoonDays,
    getUserPreferencePrefix,
    setUserPreferencePrefix,
    getCurrentWarrantyId,
    setCurrentWarrantyId,
    getTabState,
    setTabState,
    getClaimsState,
    setClaimsState,
    getNotesState,
    setNotesState,
    getPaperlessState,
    setPaperlessState,
  };
}
