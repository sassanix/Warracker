// Private state object
let state = {
  warranties: [],
  filters: { status: 'all', tag: 'all', search: '', sortBy: 'expiration', vendor: 'all', warranty_type: 'all' },
  isLoading: false,
  allTags: []
};

// Simple event dispatcher
const dispatch = (eventName, detail) => window.dispatchEvent(new CustomEvent(eventName, { detail }));

// Exported functions to interact with the state
export const getWarranties = () => state.warranties;
export const setWarranties = (newWarranties) => {
  state.warranties = Array.isArray(newWarranties) ? newWarranties : [];
  dispatch('state:warrantiesChanged', { warranties: state.warranties });
};

export const getFilters = () => state.filters;
export const updateFilter = (key, value) => {
  state.filters[key] = value;
  dispatch('state:filtersChanged', { filters: state.filters });
};

export const setLoading = (isLoading) => {
  state.isLoading = !!isLoading;
  dispatch('state:loadingChanged', { isLoading: state.isLoading });
};

export const getAllTags = () => state.allTags;
export const setAllTags = (tags) => {
  state.allTags = Array.isArray(tags) ? tags : [];
  dispatch('state:tagsChanged', { allTags: state.allTags });
};

// Non-module compatibility for existing scripts
if (typeof window !== 'undefined') {
  window.store = {
    getWarranties,
    setWarranties,
    getFilters,
    updateFilter,
    setLoading,
    getAllTags,
    setAllTags,
  };
}
