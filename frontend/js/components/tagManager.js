import {
  getAllTags,
  setAllTags,
  getSelectedTags,
  setSelectedTags,
  getEditSelectedTags,
  setEditSelectedTags,
  getWarranties,
  setWarranties,
  areWarrantiesLoaded,
  wasLastLoadedArchived,
  didLastLoadIncludeArchived,
} from '../store.js';
import {
  getTags as fetchTags,
  createTagRequest,
  updateTagRequest,
  deleteTagRequest,
} from '../services/apiService.js';
import { showToast, showLoadingSpinner, hideLoadingSpinner } from './ui.js';
import { renderWarrantiesList } from './warrantyRenderer.js';

// Safe translation helper that works even if i18next isn't fully loaded
function t(key, options = {}) {
  // Try window.i18next first (the actual i18next library)
  if (window.i18next?.t) {
    return window.i18next.t(key, options);
  }
  // Try window.i18n.t (wrapper set by i18n.js)
  if (window.i18n?.t) {
    return window.i18n.t(key, options);
  }
  // Try window.t (global helper)
  if (window.t) {
    return window.t(key, options);
  }
  // Return defaultValue if provided, otherwise the key
  return options.defaultValue || key;
}

const selectors = {
  main: {
    tagSearch: 'tagSearch',
    tagsList: 'tagsList',
    manageBtn: 'manageTagsBtn',
    selectedContainer: 'selectedTags',
  },
  edit: {
    tagsList: 'editTagsList',
    selectedContainer: 'editSelectedTags',
  },
  modal: {
    root: 'tagManagementModal',
    existingTags: 'existingTags',
    newTagForm: 'newTagForm',
    tagNameInput: 'newTagName',
    tagColorInput: 'newTagColor',
  },
};

const state = {
  listenersBound: false,
};

function getElement(id) {
  return document.getElementById(id);
}

function updateWarrantiesInStore(mapper) {
  const current = getWarranties();
  if (!Array.isArray(current) || current.length === 0) return;
  const updated = current.map((warranty) => {
    if (!Array.isArray(warranty.tags)) return warranty;
    const nextTags = mapper(warranty.tags);
    if (nextTags === warranty.tags) return warranty;
    return { ...warranty, tags: nextTags };
  });
  setWarranties(updated, {
    warrantiesLoaded: areWarrantiesLoaded(),
    lastLoadedArchived: wasLastLoadedArchived(),
    lastLoadedIncludesArchived: didLastLoadIncludeArchived(),
  });
  renderWarrantiesList(updated);
}

function dispatchTagsUpdatedEvent() {
  window.dispatchEvent(new CustomEvent('tags:updated', { detail: { tags: getAllTags() } }));
}

export async function loadTags(force = false) {
  if (!force && getAllTags().length) return;
  try {
    const tags = await fetchTags(force);
    setAllTags(Array.isArray(tags) ? tags : []);
    dispatchTagsUpdatedEvent();
  } catch (error) {
    console.error('[tagManager] Failed to load tags', error);
    setAllTags([]);
  }
}

function ensureTagsLoaded() {
  if (!getAllTags().length) {
    loadTags().catch(() => {});
  }
}

function renderDropdownList(container, tags, selected, onSelect, searchTerm = '') {
  if (!container) return;
  container.innerHTML = '';
  const normalized = searchTerm.trim().toLowerCase();

  const filtered = tags.filter((tag) => !normalized || tag.name.toLowerCase().includes(normalized));
  if (normalized && !filtered.some((tag) => tag.name.toLowerCase() === normalized)) {
    const createOption = document.createElement('div');
    createOption.className = 'tag-option create-tag';
    // Use i18next directly with fallback
    const createText = window.i18next?.t('tags.create_with_name', { name: searchTerm, defaultValue: `Create "${searchTerm}"` }) || `Create "${searchTerm}"`;
    createOption.innerHTML = `<i class="fas fa-plus"></i> ${createText}`;
    createOption.addEventListener('click', async () => {
      try {
        const created = await createTag(searchTerm);
        setSelectedTags([...getSelectedTags(), created]);
        renderSelectedTags();
        if (typeof window.updateSummary === 'function') window.updateSummary();
        // Re-render the dropdown to show the new tag as selected
        renderDropdownList(container, [...getAllTags()], getSelectedTags(), onSelect, '');
      } finally {
        container.classList.remove('show');
      }
    });
    container.appendChild(createOption);
  }

  filtered.forEach((tag) => {
    const option = document.createElement('div');
    option.className = 'tag-option';
    const isSelected = selected.some((selectedTag) => selectedTag.id === tag.id);
    option.innerHTML = `
      <span class="tag-color" style="background-color: ${tag.color}"></span>
      ${tag.name}
      <span class="tag-status">${isSelected ? '<i class="fas fa-check"></i>' : ''}</span>
    `;
    option.addEventListener('click', () => onSelect(tag, isSelected));
    container.appendChild(option);
  });

  container.classList.add('show');
}

export function renderTagsList(searchTerm = '') {
  const input = getElement(selectors.main.tagSearch);
  const list = getElement(selectors.main.tagsList);
  if (!input || !list) return;
  ensureTagsLoaded();
  renderDropdownList(
    list,
    getAllTags(),
    getSelectedTags(),
    (tag, isSelected) => {
      const current = getSelectedTags();
      const next = isSelected ? current.filter((t) => t.id !== tag.id) : [...current, tag];
      setSelectedTags(next);
      renderSelectedTags();
      if (typeof window.updateSummary === 'function') window.updateSummary();
      renderTagsList(searchTerm);
    },
    searchTerm || input.value,
  );
}

export function renderEditTagsList(searchTerm = '') {
  const list = getElement(selectors.edit.tagsList);
  if (!list) return;
  ensureTagsLoaded();
  renderDropdownList(
    list,
    getAllTags(),
    getEditSelectedTags(),
    (tag, isSelected) => {
      const current = getEditSelectedTags();
      const next = isSelected ? current.filter((t) => t.id !== tag.id) : [...current, tag];
      setEditSelectedTags(next);
      renderEditSelectedTags();
      renderEditTagsList(searchTerm);
    },
    searchTerm,
  );
}

export function renderSelectedTags() {
  const container = getElement(selectors.main.selectedContainer);
  if (!container) return;
  container.innerHTML = '';
  const tags = getSelectedTags();
  if (!tags.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'no-tags-selected';
    placeholder.textContent = t('tags.no_selected', { defaultValue: 'No tags selected' });
    container.appendChild(placeholder);
    return;
  }
  tags.forEach((tag) => {
    const tagElement = document.createElement('span');
    tagElement.className = 'tag';
    tagElement.style.backgroundColor = tag.color;
    tagElement.style.color = getContrastColor(tag.color);
    tagElement.innerHTML = `
      ${tag.name}
      <span class="remove-tag" data-id="${tag.id}">&times;</span>
    `;
    tagElement.querySelector('.remove-tag').addEventListener('click', (event) => {
      event.stopPropagation();
      setSelectedTags(getSelectedTags().filter((t) => t.id !== tag.id));
      renderSelectedTags();
      if (typeof window.updateSummary === 'function') window.updateSummary();
    });
    container.appendChild(tagElement);
  });
}

export function renderEditSelectedTags() {
  const container = getElement(selectors.edit.selectedContainer);
  if (!container) return;
  container.innerHTML = '';
  const tags = getEditSelectedTags();
  if (!tags.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'no-tags-selected';
    placeholder.textContent = t('tags.no_selected', { defaultValue: 'No tags selected' });
    container.appendChild(placeholder);
    return;
  }
  tags.forEach((tag) => {
    const tagElement = document.createElement('span');
    tagElement.className = 'tag';
    tagElement.style.backgroundColor = tag.color;
    tagElement.style.color = getContrastColor(tag.color);
    tagElement.innerHTML = `
      ${tag.name}
      <span class="remove-tag" data-id="${tag.id}">&times;</span>
    `;
    tagElement.querySelector('.remove-tag').addEventListener('click', (event) => {
      event.preventDefault();
      setEditSelectedTags(getEditSelectedTags().filter((t) => t.id !== tag.id));
      renderEditSelectedTags();
    });
    container.appendChild(tagElement);
  });
}

function getContrastColor(hexColor) {
  if (!hexColor || !hexColor.startsWith('#') || hexColor.length < 7) return '#000000';
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

export async function createTag(name, color) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    showToast(t('messages.tag_name_required', { defaultValue: 'Tag name is required' }), 'error');
    throw new Error('Tag name required');
  }
  const chosenColor = color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
  const payload = { name: trimmed, color: chosenColor };
  try {
    const tag = await createTagRequest(payload);
    setAllTags([...getAllTags(), tag]);
    showToast(t('messages.tag_created_successfully', { defaultValue: 'Tag created' }), 'success');
    dispatchTagsUpdatedEvent();
    return tag;
  } catch (error) {
    showToast(error.message || t('messages.failed_to_create_tag', { defaultValue: 'Failed to create tag' }), 'error');
    throw error;
  }
}

export async function updateTag(id, name, color) {
  try {
    const currentTag = getAllTags().find((tag) => tag.id === id);
    const resolvedColor = color || currentTag?.color || '#808080';
    const payload = { name, color: resolvedColor };
    const updated = await updateTagRequest(id, payload);
    await loadTags(true);
    syncSelectionsWithTag(updated);
    updateWarrantiesInStore((tags) => tags.map((tag) => (tag.id === updated.id ? { ...tag, name: updated.name, color: updated.color } : tag)));
    renderExistingTags();
    renderSelectedTags();
    renderEditSelectedTags();
    dispatchTagsUpdatedEvent();
    showToast(t('messages.tag_updated_successfully', { defaultValue: 'Tag updated' }), 'success');
  } catch (error) {
    showToast(error.message || t('messages.failed_to_update_tag', { defaultValue: 'Failed to update tag' }), 'error');
  }
}

function syncSelectionsWithTag(tag) {
  const updateList = (list) => list.map((item) => (item.id === tag.id ? { ...item, name: tag.name, color: tag.color } : item));
  setSelectedTags(updateList(getSelectedTags()));
  setEditSelectedTags(updateList(getEditSelectedTags()));
}

export async function deleteTag(id) {
  if (!window.confirm(t('tags.confirm_delete', { defaultValue: 'Delete this tag?' }))) return;
  try {
    showLoadingSpinner();
    await deleteTagRequest(id);
    setAllTags(getAllTags().filter((tag) => tag.id !== id));
    setSelectedTags(getSelectedTags().filter((tag) => tag.id !== id));
    setEditSelectedTags(getEditSelectedTags().filter((tag) => tag.id !== id));
    updateWarrantiesInStore((tags) => tags.filter((tag) => tag.id !== id));
    renderExistingTags();
    renderSelectedTags();
    renderEditSelectedTags();
    dispatchTagsUpdatedEvent();
    showToast(t('messages.tag_deleted_successfully', { defaultValue: 'Tag deleted' }), 'success');
  } catch (error) {
    showToast(error.message || t('messages.failed_to_delete_tag', { defaultValue: 'Failed to delete tag' }), 'error');
  } finally {
    hideLoadingSpinner();
  }
}

export function openTagManagementModal() {
  const modal = getElement(selectors.modal.root);
  if (!modal) return;
  ensureTagsLoaded();
  renderExistingTags();
  modal.classList.add('active');
}

export function renderExistingTags() {
  const container = getElement(selectors.modal.existingTags);
  if (!container) return;
  container.innerHTML = '';
  const tags = getAllTags();
  const wrapper = document.createElement('div');
  wrapper.className = 'table-responsive';
  const table = document.createElement('table');
  table.className = 'tag-management-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>${t('tags.color', { defaultValue: 'Color' })}</th>
      <th>${t('tags.name', { defaultValue: 'Name' })}</th>
      <th>${t('tags.actions', { defaultValue: 'Actions' })}</th>
    </tr>
  `;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  if (!tags.length) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="3"><div class="no-tags">${t('messages.no_tags_created_yet', { defaultValue: 'No tags created yet' })}</div></td>`;
    tbody.appendChild(row);
  } else {
    tags.forEach((tag) => {
      const row = document.createElement('tr');
      row.className = 'existing-tag-row';
      row.dataset.id = String(tag.id);
      row.innerHTML = `
        <td>
          <div class="tag-color-swatch-container">
            <div class="tag-color-swatch" style="background-color: ${tag.color}" aria-label="${tag.name}"></div>
            <input type="color" class="tag-color-input-hidden" value="${tag.color}" aria-label="${t('tags.pick_color', { defaultValue: 'Pick color' })}" />
          </div>
        </td>
        <td>
          <span class="tag-name-display">${tag.name}</span>
          <input type="text" class="form-control tag-name-input" value="${tag.name}" />
        </td>
        <td class="tag-actions">
          <div class="view-actions">
            <button class="btn btn-sm btn-secondary edit-tag"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger delete-tag"><i class="fas fa-trash"></i></button>
          </div>
          <div class="edit-actions">
            <button class="btn btn-sm btn-primary save-tag"><i class="fas fa-check"></i></button>
            <button class="btn btn-sm btn-secondary cancel-edit"><i class="fas fa-times"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
  bindTagManagementDelegates();
}

function bindTagManagementDelegates() {
  if (state.listenersBound) return;
  const container = getElement(selectors.modal.existingTags);
  if (!container) return;
  state.listenersBound = true;
  container.addEventListener('click', (event) => {
    const row = event.target.closest('tr.existing-tag-row');
    if (!row) return;
    const id = parseInt(row.dataset.id, 10);
    if (Number.isNaN(id)) return;
    if (event.target.closest('.edit-tag')) {
      enterEditMode(row);
      return;
    }
    if (event.target.closest('.cancel-edit')) {
      exitEditMode(row);
      return;
    }
    if (event.target.closest('.save-tag')) {
      const nameInput = row.querySelector('.tag-name-input');
      const colorInput = row.querySelector('.tag-color-input-hidden');
      const newName = nameInput ? nameInput.value.trim() : '';
      const newColor = colorInput ? colorInput.value : undefined;
      if (!newName) {
        showToast(t('messages.tag_name_required', { defaultValue: 'Tag name is required' }), 'error');
        return;
      }
      updateTag(id, newName, newColor);
      exitEditMode(row);
      return;
    }
    if (event.target.closest('.delete-tag')) {
      deleteTag(id);
    }
  });

  container.addEventListener('input', (event) => {
    if (!event.target.matches('.tag-color-input-hidden')) return;
    const row = event.target.closest('tr.existing-tag-row');
    const swatch = row ? row.querySelector('.tag-color-swatch') : null;
    if (swatch) swatch.style.backgroundColor = event.target.value;
  });

  container.addEventListener('change', (event) => {
    if (!event.target.matches('.tag-color-input-hidden')) return;
    const row = event.target.closest('tr.existing-tag-row');
    if (!row) return;
    const id = parseInt(row.dataset.id, 10);
    if (Number.isNaN(id)) return;
    const nameInput = row.querySelector('.tag-name-input');
    const nameDisplay = row.querySelector('.tag-name-display');
    const name = nameInput && nameInput.style.display !== 'none'
      ? nameInput.value.trim()
      : (nameDisplay ? nameDisplay.textContent.trim() : '');
    if (!name) {
      showToast(window.t ? window.t('messages.tag_name_required') : 'Tag name is required', 'error');
      return;
    }
    updateTag(id, name, event.target.value);
  });
}

function enterEditMode(row) {
  const nameDisplay = row.querySelector('.tag-name-display');
  const nameInput = row.querySelector('.tag-name-input');
  const viewActions = row.querySelector('.view-actions');
  const editActions = row.querySelector('.edit-actions');
  if (!nameDisplay || !nameInput || !viewActions || !editActions) return;
  nameDisplay.style.display = 'none';
  nameInput.style.display = 'block';
  viewActions.style.display = 'none';
  editActions.style.display = 'flex';
  row.classList.add('editing');
}

function exitEditMode(row) {
  const nameDisplay = row.querySelector('.tag-name-display');
  const nameInput = row.querySelector('.tag-name-input');
  const viewActions = row.querySelector('.view-actions');
  const editActions = row.querySelector('.edit-actions');
  if (nameDisplay) nameDisplay.style.display = '';
  if (nameInput) nameInput.style.display = 'none';
  if (viewActions) viewActions.style.display = '';
  if (editActions) editActions.style.display = 'none';
  row.classList.remove('editing');
}

export function addTagManagementEventListeners() {
  const modal = getElement(selectors.modal.root);
  if (!modal || modal.dataset.listenersBound === 'true') return;
  modal.dataset.listenersBound = 'true';
  const form = getElement(selectors.modal.newTagForm);
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nameInput = getElement(selectors.modal.tagNameInput);
      const colorInput = getElement(selectors.modal.tagColorInput);
      const name = nameInput ? nameInput.value.trim() : '';
      const color = colorInput ? colorInput.value : '#808080';
      if (!name) {
        showToast(window.t ? window.t('messages.tag_name_required') : 'Tag name is required', 'error');
        return;
      }
      try {
        await createTag(name, color);
        renderExistingTags();
        renderSelectedTags();
        renderEditSelectedTags();
        if (nameInput) nameInput.value = '';
        if (colorInput) colorInput.value = '#808080';
      } catch (error) {
        showToast(error.message || t('messages.failed_to_create_tag', { defaultValue: 'Failed to create tag' }), 'error');
      }
    });
  }
}

function bindMainFormEvents() {
  const searchInput = getElement(selectors.main.tagSearch);
  const list = getElement(selectors.main.tagsList);
  const manageBtn = getElement(selectors.main.manageBtn);
  if (!searchInput || !list || !manageBtn) return;
  searchInput.addEventListener('focus', () => renderTagsList(searchInput.value));
  searchInput.addEventListener('input', () => renderTagsList(searchInput.value));
  document.addEventListener('click', (event) => {
    if (!searchInput.contains(event.target) && !list.contains(event.target)) {
      list.classList.remove('show');
    }
  });
  manageBtn.addEventListener('click', (event) => {
    event.preventDefault();
    openTagManagementModal();
  });
}

export function init() {
  ensureTagsLoaded();
  bindMainFormEvents();
  renderSelectedTags();
  addTagManagementEventListeners();
  const globalBtn = document.getElementById('globalManageTagsBtn');
  if (globalBtn && !globalBtn._tagBound) {
    globalBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await loadTags(true);
      openTagManagementModal();
    });
    globalBtn._tagBound = true;
  }
}

// Legacy exposure during transition
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.tagManager = {
    init,
    loadTags,
    renderTagsList,
    renderEditTagsList,
    renderSelectedTags,
    renderEditSelectedTags,
    createTag,
    updateTag,
    deleteTag,
    openTagManagementModal,
    renderExistingTags,
    addTagManagementEventListeners,
  };
  // Also expose at root for backwards compatibility
  window.tagManager = window.components.tagManager;
}
