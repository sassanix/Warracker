// Edit modal helper components (DOM-based, no innerHTML templates)
import { updateWarranty } from '../services/apiService.js';
import { showToast, showLoadingSpinner, hideLoadingSpinner } from './ui.js';
import { autoLinkRecentDocuments, processEditPaperlessUploads, loadSecureImages, clearPaperlessSelection } from './paperless.js';
import { loadWarranties, applyFilters } from '../controllers/warrantyListController.js';
import { getCurrentWarrantyId, setCurrentWarrantyId, getEditSelectedTags, setEditSelectedTags } from '../store.js';
import { renderEditTagsList, renderEditSelectedTags, loadTags, openTagManagementModal } from './tagManager.js';
import { loadCurrencies } from '../lib/currency.js';

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

export function renderSerialNumbers(container, serialNumbers = [], i18n = window.i18next) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  const makeRow = (value = '', isFirst = false) => {
    const row = createElement('div', 'serial-number-input');

    const input = createElement('input', 'form-control');
    input.type = 'text';
    input.name = 'serial_numbers[]';
    input.placeholder = i18n ? i18n.t('warranties.enter_serial_number') : 'Enter serial number';
    input.value = value;
    row.appendChild(input);

    if (isFirst) {
      const addBtn = createElement('button', 'btn btn-sm btn-primary add-serial-number');
      addBtn.type = 'button';
      // Use icon element for consistency
      const icon = createElement('i', 'fas fa-plus');
      addBtn.appendChild(icon);
      addBtn.appendChild(document.createTextNode(' ' + (i18n ? i18n.t('warranties.add_serial_number') : 'Add Serial Number')));
      row.appendChild(addBtn);
    } else {
      const removeBtn = createElement('button', 'btn btn-sm btn-danger remove-serial-number');
      removeBtn.type = 'button';
      const icon = createElement('i', 'fas fa-minus');
      removeBtn.appendChild(icon);
      removeBtn.appendChild(document.createTextNode(' ' + (i18n ? i18n.t('actions.delete') : 'Delete')));
      removeBtn.addEventListener('click', () => {
        row.remove();
      });
      row.appendChild(removeBtn);
    }

    return row;
  };

  if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
    container.appendChild(makeRow('', true));
  } else {
    container.appendChild(makeRow(serialNumbers[0] || '', true));
    for (let i = 1; i < serialNumbers.length; i++) {
      container.appendChild(makeRow(serialNumbers[i] || '', false));
    }
  }
}

function createCloudIcon() {
  const cloud = createElement('i', 'fas fa-cloud');
  cloud.style.color = '#4dabf7';
  cloud.style.marginLeft = '4px';
  cloud.style.fontSize = '0.8em';
  cloud.title = 'Stored in Paperless-ngx';
  return cloud;
}

function setElementChildren(el, children) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
  children.forEach(child => el.appendChild(child));
}

export function renderCurrentInvoice(element, deleteBtn, warranty, i18n = window.i18next) {
  if (!element) return;
  const hasLocal = warranty.invoice_path && warranty.invoice_path !== 'null';
  const hasPaperless = warranty.paperless_invoice_id && warranty.paperless_invoice_id !== null;

  if (hasLocal) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_invoice') : 'Current invoice') + ': ';
    const label = document.createTextNode(labelText);
    const a = createElement('a', 'view-document-link', (i18n ? i18n.t('actions.view') : 'View'));
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openSecureFile) window.openSecureFile(warranty.invoice_path);
    });
    const suffix = createElement('span', null, ` (${i18n ? i18n.t('warranties.upload_new_file_replace') : 'Upload a new file to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), a, suffix]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else if (hasPaperless) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_invoice') : 'Current invoice') + ': ';
    const a = createElement('a', 'view-document-link', (i18n ? i18n.t('actions.view') : 'View'));
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openPaperlessDocument) window.openPaperlessDocument(warranty.paperless_invoice_id, { user_id: warranty.user_id, id: warranty.id });
    });
    const cloud = createCloudIcon();
    const suffix = createElement('span', null, ` (${i18n ? i18n.t('warranties.upload_new_file_replace') : 'Upload a new file to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), a, cloud, suffix]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else {
    setElementChildren(element, [createElement('span', null, i18n ? i18n.t('warranties.no_invoice_uploaded') : 'No invoice uploaded')]);
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
}

export function renderCurrentManual(element, deleteBtn, warranty, i18n = window.i18next) {
  if (!element) return;
  const hasLocal = warranty.manual_path && warranty.manual_path !== 'null';
  const hasPaperless = warranty.paperless_manual_id && warranty.paperless_manual_id !== null;

  if (hasLocal) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_manual') : 'Current manual') + ': ';
    const a = createElement('a', 'view-document-link', (i18n ? i18n.t('actions.view') : 'View'));
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openSecureFile) window.openSecureFile(warranty.manual_path);
    });
    const suffix = createElement('span', null, ` (${i18n ? i18n.t('warranties.upload_new_file_replace') : 'Upload a new file to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), a, suffix]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else if (hasPaperless) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_manual') : 'Current manual') + ': ';
    const a = createElement('a', 'view-document-link', (i18n ? i18n.t('actions.view') : 'View'));
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openPaperlessDocument) window.openPaperlessDocument(warranty.paperless_manual_id, { user_id: warranty.user_id, id: warranty.id });
    });
    const cloud = createCloudIcon();
    const suffix = createElement('span', null, ` (${i18n ? i18n.t('warranties.upload_new_file_replace') : 'Upload a new file to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), a, cloud, suffix]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else {
    setElementChildren(element, [createElement('span', null, i18n ? i18n.t('warranties.no_manual_uploaded') : 'No manual uploaded')]);
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
}

export function renderCurrentPhoto(element, deleteBtn, warranty, i18n = window.i18next) {
  if (!element) return;
  const hasLocal = warranty.product_photo_path && warranty.product_photo_path !== 'null';
  const hasPaperless = warranty.paperless_photo_id && warranty.paperless_photo_id !== null;

  if (hasLocal) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_photo') : 'Current photo') + ': ';
    const img = createElement('img', 'secure-image');
    img.setAttribute('data-secure-src', `/api/secure-file/${warranty.product_photo_path.replace('uploads/', '')}`);
    img.alt = 'Current Photo';
    img.style.maxWidth = '100px';
    img.style.maxHeight = '100px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '8px';
    img.style.marginLeft = '10px';
    img.style.border = '2px solid var(--border-color)';
    img.onerror = () => { img.style.display = 'none'; };
    const br = document.createElement('br');
    const small = createElement('small', null, `(${i18n ? i18n.t('warranties.upload_new_photo_replace') : 'Upload a new photo to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), img, br, small]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else if (hasPaperless) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_photo') : 'Current photo') + ': ';
    const a = createElement('a', 'view-document-link', (i18n ? i18n.t('actions.view') : 'View'));
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openPaperlessDocument) window.openPaperlessDocument(warranty.paperless_photo_id, { user_id: warranty.user_id, id: warranty.id });
    });
    const cloud = createCloudIcon();
    const br = document.createElement('br');
    const small = createElement('small', null, `(${i18n ? i18n.t('warranties.upload_new_photo_replace') : 'Upload a new photo to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), a, cloud, br, small]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else {
    setElementChildren(element, [createElement('span', null, i18n ? i18n.t('warranties.no_photo_uploaded') : 'No photo uploaded')]);
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
}

export function renderCurrentOther(element, deleteBtn, warranty, i18n = window.i18next) {
  if (!element) return;
  const hasLocal = warranty.other_document_path && warranty.other_document_path !== 'null';
  const hasPaperless = warranty.paperless_other_id && warranty.paperless_other_id !== null;

  if (hasLocal) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_other_document') : 'Current files') + ': ';
    const a = createElement('a', 'view-document-link', (i18n ? i18n.t('actions.view') : 'View'));
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openSecureFile) window.openSecureFile(warranty.other_document_path);
    });
    const suffix = createElement('span', null, ` (${i18n ? i18n.t('warranties.upload_new_file_replace') : 'Upload a new file to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), a, suffix]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else if (hasPaperless) {
    const span = createElement('span', 'text-success');
    const icon = createElement('i', 'fas fa-check-circle');
    const labelText = (i18n ? i18n.t('warranties.current_other_document') : 'Current files') + ': ';
    const a = createElement('a', 'view-document-link', (i18n ? i18n.t('actions.view') : 'View'));
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.openPaperlessDocument) window.openPaperlessDocument(warranty.paperless_other_id, { user_id: warranty.user_id, id: warranty.id });
    });
    const cloud = createCloudIcon();
    const suffix = createElement('span', null, ` (${i18n ? i18n.t('warranties.upload_new_file_replace') : 'Upload a new file to replace'})`);
    setElementChildren(span, [icon, document.createTextNode(' '), document.createTextNode(labelText), a, cloud, suffix]);
    setElementChildren(element, [span]);
    if (deleteBtn) deleteBtn.style.display = '';
  } else {
    setElementChildren(element, [createElement('span', null, i18n ? i18n.t('warranties.no_other_document_uploaded') : 'No files uploaded')]);
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
}

const editState = {
  initialized: false,
  modal: null,
  form: null,
  tabs: [],
  contents: [],
  tagSearch: null,
  tagList: null,
};

function ensureInitialized() {
  if (editState.initialized) return;
  editState.modal = document.getElementById('editModal');
  editState.form = document.getElementById('editWarrantyForm');
  if (!editState.modal || !editState.form) return;
  editState.tabs = Array.from(editState.modal.querySelectorAll('.edit-tab-btn'));
  editState.contents = Array.from(editState.modal.querySelectorAll('.edit-tab-content'));
  editState.tabs.forEach((btn) => {
    if (btn._editBound) return;
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    btn._editBound = true;
  });
  editState.tagSearch = document.getElementById('editTagSearch');
  editState.tagList = document.getElementById('editTagsList');
  if (editState.tagSearch && !editState.tagSearch._editBound) {
    editState.tagSearch.addEventListener('focus', () => renderEditTagsList(editState.tagSearch.value));
    editState.tagSearch.addEventListener('input', () => renderEditTagsList(editState.tagSearch.value));
    document.addEventListener('click', (event) => {
      if (!editState.tagSearch.contains(event.target) && !editState.tagList?.contains(event.target)) {
        if (editState.tagList) editState.tagList.classList.remove('show');
      }
    });
    editState.tagSearch._editBound = true;
  }
  const manageBtn = document.getElementById('editManageTagsBtn');
  if (manageBtn && !manageBtn._editBound) {
    manageBtn.addEventListener('click', (event) => {
      event.preventDefault();
      openTagManagementModal();
    });
    manageBtn._editBound = true;
  }
  bindFileInput('editProductPhoto', 'editProductPhotoFileName', 'editProductPhotoPreview', 'editProductPhotoImg');
  bindFileInput('editInvoice', 'editFileName');
  bindFileInput('editManual', 'editManualFileName');
  bindFileInput('editOtherDocument', 'editOtherDocumentFileName');
  const lifetimeToggle = document.getElementById('editIsLifetime');
  if (lifetimeToggle && !lifetimeToggle._editBound) {
    lifetimeToggle.addEventListener('change', applyLifetimeState);
    lifetimeToggle._editBound = true;
  }
  ['editDurationMethod', 'editExactDateMethod'].forEach((id) => {
    const radio = document.getElementById(id);
    if (radio && !radio._editBound) {
      radio.addEventListener('change', applyWarrantyMethodState);
      radio._editBound = true;
    }
  });
  const closeButtons = editState.modal.querySelectorAll('[data-dismiss="modal"], .close-btn');
  closeButtons.forEach((btn) => {
    if (btn._editBound) return;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      closeEditModal();
    });
    btn._editBound = true;
  });
  editState.initialized = true;
}

function activateTab(tabId) {
  if (!tabId) return;
  editState.tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  editState.contents.forEach((content) => content.classList.toggle('active', content.id === tabId));
}

function bindFileInput(inputId, labelId, previewWrapperId, previewImgId) {
  const input = document.getElementById(inputId);
  if (!input || input._editBound) return;
  const label = labelId ? document.getElementById(labelId) : null;
  const previewWrapper = previewWrapperId ? document.getElementById(previewWrapperId) : null;
  const previewImg = previewImgId ? document.getElementById(previewImgId) : null;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (label) label.textContent = file ? file.name : '';
    if (previewWrapper && previewImg) {
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          previewWrapper.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        previewWrapper.style.display = 'none';
      }
    }
  });
  input._editBound = true;
}

function applyLifetimeState() {
  const checkbox = document.getElementById('editIsLifetime');
  const methodWrapper = document.getElementById('editWarrantyEntryMethod');
  const durationFields = document.getElementById('editWarrantyDurationFields');
  const exactField = document.getElementById('editExactExpirationField');
  if (!checkbox) return;
  if (checkbox.checked) {
    if (methodWrapper) methodWrapper.style.display = 'none';
    if (durationFields) durationFields.style.display = 'none';
    if (exactField) exactField.style.display = 'none';
  } else {
    if (methodWrapper) methodWrapper.style.display = 'block';
    applyWarrantyMethodState();
  }
}

function applyWarrantyMethodState() {
  const durationFields = document.getElementById('editWarrantyDurationFields');
  const exactField = document.getElementById('editExactExpirationField');
  const useDuration = document.getElementById('editDurationMethod')?.checked;
  if (useDuration) {
    if (durationFields) durationFields.style.display = 'block';
    if (exactField) exactField.style.display = 'none';
  } else {
    if (durationFields) durationFields.style.display = 'none';
    if (exactField) exactField.style.display = 'block';
  }
}

function setDeleteHandler(buttonId, targetElement, message) {
  const button = document.getElementById(buttonId);
  if (!button || button._editBound) return;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    button.dataset.delete = 'true';
    if (targetElement) {
      targetElement.innerHTML = `<span class="text-danger">${message}</span>`;
    }
    button.style.display = 'none';
  });
  button._editBound = true;
}

function resetFileInputs(ids) {
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  const labels = ['editProductPhotoFileName', 'editFileName', 'editManualFileName', 'editOtherDocumentFileName'];
  labels.forEach((labelId) => {
    const label = document.getElementById(labelId);
    if (label) label.textContent = '';
  });
  const preview = document.getElementById('editProductPhotoPreview');
  if (preview) preview.style.display = 'none';
}

function setStorageSelection(name, isPaperless) {
  const radios = document.getElementsByName(name);
  if (!radios || !radios.length) return;
  radios.forEach((radio) => {
    radio.checked = isPaperless ? radio.value === 'paperless' : radio.value === 'local';
  });
}

function normalizeSerials(serials) {
  if (!Array.isArray(serials)) return [];
  return serials
    .map((sn) => {
      if (!sn) return '';
      if (typeof sn === 'object' && sn.serial_number) return sn.serial_number;
      return String(sn);
    })
    .filter((value) => value && value.trim());
}

function formatDateInput(value) {
  if (!value) return '';
  if (value.includes('T')) return value.split('T')[0];
  return value;
}

function isExactMethodByDuration(warranty) {
  const years = warranty.warranty_duration_years || 0;
  const months = warranty.warranty_duration_months || 0;
  const days = warranty.warranty_duration_days || 0;
  return years === 0 && months === 0 && days === 0 && warranty.expiration_date;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

export async function openEditModal(warranty) {
  if (!warranty) return;
  ensureInitialized();
  await Promise.all([loadTags().catch(() => {}), loadCurrencies().catch(() => {})]);
  setCurrentWarrantyId(warranty.id);
  if (typeof window !== 'undefined') {
    window.currentWarrantyId = warranty.id;
  }
  fillWarrantyFields(warranty);
  populateDocuments(warranty);
  activateTab('edit-product-info');
  if (editState.modal) editState.modal.classList.add('active');
  setTimeout(() => loadSecureImages(), 100);
}

function fillWarrantyFields(warranty) {
  const serialContainer = document.getElementById('editSerialNumbersContainer');
  renderSerialNumbers(serialContainer, normalizeSerials(warranty.serial_numbers), window.i18next);
  setValue('editProductName', warranty.product_name || '');
  setValue('editProductUrl', warranty.product_url || '');
  setValue('editModelNumber', warranty.model_number || '');
  setValue('editVendor', warranty.vendor || '');
  setValue('editPurchasePrice', warranty.purchase_price || '');
  setValue('editCurrency', warranty.currency || '');
  setValue('editPurchaseDate', formatDateInput(warranty.purchase_date));
  const expirationDate = formatDateInput(warranty.expiration_date);
  const lifetimeCheckbox = document.getElementById('editIsLifetime');
  if (lifetimeCheckbox) lifetimeCheckbox.checked = Boolean(warranty.is_lifetime);
  const useExact = !warranty.is_lifetime && (warranty.original_input_method === 'exact_date' || isExactMethodByDuration(warranty));
  const durationRadio = document.getElementById('editDurationMethod');
  const exactRadio = document.getElementById('editExactDateMethod');
  if (durationRadio) durationRadio.checked = !useExact;
  if (exactRadio) exactRadio.checked = useExact;
  setValue('editExactExpirationDate', useExact ? expirationDate : '');
  if (!useExact) {
    setValue('editWarrantyDurationYears', warranty.warranty_duration_years || 0);
    setValue('editWarrantyDurationMonths', warranty.warranty_duration_months || 0);
    setValue('editWarrantyDurationDays', warranty.warranty_duration_days || 0);
  } else {
    setValue('editWarrantyDurationYears', '');
    setValue('editWarrantyDurationMonths', '');
    setValue('editWarrantyDurationDays', '');
  }
  applyLifetimeState();
  applyWarrantyMethodState();
  const typeSelect = document.getElementById('editWarrantyType');
  const customInput = document.getElementById('editWarrantyTypeCustom');
  if (typeSelect) {
    const optionExists = Array.from(typeSelect.options).some((option) => option.value === (warranty.warranty_type || ''));
    if (optionExists) {
      typeSelect.value = warranty.warranty_type || '';
      if (customInput) {
        customInput.style.display = 'none';
        customInput.value = '';
      }
    } else {
      typeSelect.value = 'other';
      if (customInput) {
        customInput.style.display = 'block';
        customInput.value = warranty.warranty_type || '';
      }
    }
  }
  setValue('editNotes', warranty.notes || '');
  const tags = Array.isArray(warranty.tags)
    ? warranty.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }))
    : [];
  setEditSelectedTags(tags);
  if (typeof window !== 'undefined') {
    window.editSelectedTags = tags;
  }
  renderEditSelectedTags();
  renderEditTagsList();
}

function populateDocuments(warranty) {
  setStorageSelection('editInvoiceStorage', Boolean(warranty.paperless_invoice_id));
  setStorageSelection('editManualStorage', Boolean(warranty.paperless_manual_id));
  const invoiceContainer = document.getElementById('currentInvoice');
  const manualContainer = document.getElementById('currentManual');
  const photoContainer = document.getElementById('currentProductPhoto');
  const otherContainer = document.getElementById('currentOtherDocument');
  const deleteInvoiceBtn = document.getElementById('deleteInvoiceBtn');
  const deleteManualBtn = document.getElementById('deleteManualBtn');
  const deletePhotoBtn = document.getElementById('deleteProductPhotoBtn');
  const deleteOtherBtn = document.getElementById('deleteOtherDocumentBtn');
  if (deleteInvoiceBtn) deleteInvoiceBtn.dataset.delete = 'false';
  if (deleteManualBtn) deleteManualBtn.dataset.delete = 'false';
  if (deletePhotoBtn) deletePhotoBtn.dataset.delete = 'false';
  if (deleteOtherBtn) deleteOtherBtn.dataset.delete = 'false';
  renderCurrentInvoice(invoiceContainer, deleteInvoiceBtn, warranty, window.i18next);
  renderCurrentManual(manualContainer, deleteManualBtn, warranty, window.i18next);
  renderCurrentPhoto(photoContainer, deletePhotoBtn, warranty, window.i18next);
  renderCurrentOther(otherContainer, deleteOtherBtn, warranty, window.i18next);
  setDeleteHandler('deleteInvoiceBtn', invoiceContainer, window.i18next ? window.i18next.t('warranties.invoice_will_be_deleted') : 'Invoice will be deleted');
  setDeleteHandler('deleteManualBtn', manualContainer, window.i18next ? window.i18next.t('warranties.manual_will_be_deleted') : 'Manual will be deleted');
  setDeleteHandler('deleteProductPhotoBtn', photoContainer, window.i18next ? window.i18next.t('warranties.photo_will_be_deleted') : 'Photo will be deleted');
  setDeleteHandler('deleteOtherDocumentBtn', otherContainer, window.i18next ? window.i18next.t('warranties.other_document_will_be_deleted') : 'Files will be deleted');
  clearPaperlessSelection('edit_invoice');
  clearPaperlessSelection('edit_manual');
  clearPaperlessSelection('edit_productPhoto');
  clearPaperlessSelection('edit_otherDocument');
  resetFileInputs(['editProductPhoto', 'editInvoice', 'editManual', 'editOtherDocument']);
}

export async function saveWarranty() {
  let currentId = getCurrentWarrantyId();
  if (!currentId && typeof window !== 'undefined' && window.currentWarrantyId) {
    currentId = window.currentWarrantyId;
    setCurrentWarrantyId(currentId);
  }
  if (!currentId) {
    showToast(window.i18next ? window.i18next.t('messages.no_warranty_selected_for_update') : 'No warranty selected', 'error');
    return;
  }

  // Gather inputs
  const productName = (document.getElementById('editProductName') || {}).value?.trim() || '';
  const purchaseDate = (document.getElementById('editPurchaseDate') || {}).value || '';
  const isLifetime = !!(document.getElementById('editIsLifetime') || {}).checked;
  const editDurationMethodRadioLocal = document.getElementById('editDurationMethod');
  const isDurationMethod = !!(editDurationMethodRadioLocal && editDurationMethodRadioLocal.checked);
  const years = parseInt((document.getElementById('editWarrantyDurationYears') || {}).value || 0);
  const months = parseInt((document.getElementById('editWarrantyDurationMonths') || {}).value || 0);
  const days = parseInt((document.getElementById('editWarrantyDurationDays') || {}).value || 0);
  const editExactExpirationDateInputLocal = document.getElementById('editExactExpirationDate');
  const exactDate = editExactExpirationDateInputLocal ? editExactExpirationDateInputLocal.value : '';
  const editWarrantyDurationFieldsLocal = document.getElementById('editWarrantyDurationFields');

  // Basic validation
  if (!productName) {
    if (window && window.showToast) window.showToast(window.t ? window.t('messages.product_name_required') : 'Product name is required', 'error');
    return;
  }
  if (!purchaseDate) {
    if (window && window.showToast) window.showToast(window.t ? window.t('messages.purchase_date_required') : 'Purchase date is required', 'error');
    return;
  }

  // Validation for lifetime/duration/exact date
  if (!isLifetime) {
    if (isDurationMethod) {
      if (years === 0 && months === 0 && days === 0) {
        if (window && window.showToast) window.showToast(window.t ? window.t('messages.warranty_duration_required') : 'Warranty duration is required', 'error');
        const yearsInput = document.getElementById('editWarrantyDurationYears');
        if (yearsInput) {
          yearsInput.focus();
          if (editWarrantyDurationFieldsLocal) editWarrantyDurationFieldsLocal.classList.add('invalid-duration');
        }
        return;
      }
    } else {
      if (!exactDate) {
        if (window && window.showToast) window.showToast(window.t ? window.t('messages.exact_expiration_date_required') : 'Exact expiration date is required', 'error');
        if (editExactExpirationDateInputLocal) editExactExpirationDateInputLocal.focus();
        return;
      }
      if (purchaseDate && exactDate <= purchaseDate) {
        if (window && window.showToast) window.showToast(window.t ? window.t('messages.expiration_date_after_purchase_date') : 'Expiration date must be after purchase date', 'error');
        if (editExactExpirationDateInputLocal) editExactExpirationDateInputLocal.focus();
        return;
      }
    }
  }
  if (editWarrantyDurationFieldsLocal) editWarrantyDurationFieldsLocal.classList.remove('invalid-duration');

  // Build FormData
  const formData = new FormData();
  formData.append('product_name', productName);
  formData.append('purchase_date', purchaseDate);

  let productUrl = (document.getElementById('editProductUrl') || {}).value?.trim() || '';
  if (productUrl) {
    if (!productUrl.startsWith('http://') && !productUrl.startsWith('https://')) {
      productUrl = 'https://' + productUrl;
    }
    formData.append('product_url', productUrl);
  }
  const purchasePrice = (document.getElementById('editPurchasePrice') || {}).value;
  const currency = (document.getElementById('editCurrency') || {}).value;
  if (purchasePrice) formData.append('purchase_price', purchasePrice);
  if (currency) formData.append('currency', currency);

  // Serial numbers
  const serialInputs = document.querySelectorAll('#editSerialNumbersContainer input[name="serial_numbers[]"]');
  formData.delete('serial_numbers[]');
  serialInputs.forEach(input => {
    if (input.value && input.value.trim()) formData.append('serial_numbers[]', input.value.trim());
  });

  // Tags
  const tags = getEditSelectedTags() || [];
  formData.append('tag_ids', JSON.stringify(tags.map((t) => t.id)));

  // Document URLs
  formData.append('invoice_url', (document.getElementById('editInvoiceUrl') || {}).value || '');
  formData.append('manual_url', (document.getElementById('editManualUrl') || {}).value || '');
  formData.append('other_document_url', (document.getElementById('editOtherDocumentUrl') || {}).value || '');

  // Files
  const invoiceFile = (document.getElementById('editInvoice') || {}).files ? document.getElementById('editInvoice').files[0] : null;
  const manualFile = (document.getElementById('editManual') || {}).files ? document.getElementById('editManual').files[0] : null;
  const otherDocumentFile = (document.getElementById('editOtherDocument') || {}).files ? document.getElementById('editOtherDocument').files[0] : null;
  const productPhotoFile = (document.getElementById('editProductPhoto') || {}).files ? document.getElementById('editProductPhoto').files[0] : null;
  if (invoiceFile) formData.append('invoice', invoiceFile);
  if (manualFile) formData.append('manual', manualFile);
  if (otherDocumentFile) formData.append('other_document', otherDocumentFile);
  if (productPhotoFile) formData.append('product_photo', productPhotoFile);

  // Deletion flags
  const deleteInvoiceBtn = document.getElementById('deleteInvoiceBtn');
  if (deleteInvoiceBtn && deleteInvoiceBtn.dataset.delete === 'true') formData.append('delete_invoice', 'true');
  const deleteManualBtn = document.getElementById('deleteManualBtn');
  if (deleteManualBtn && deleteManualBtn.dataset.delete === 'true') formData.append('delete_manual', 'true');
  const deleteOtherDocumentBtn = document.getElementById('deleteOtherDocumentBtn');
  if (deleteOtherDocumentBtn && deleteOtherDocumentBtn.dataset.delete === 'true') formData.append('delete_other_document', 'true');
  const deleteProductPhotoBtn = document.getElementById('deleteProductPhotoBtn');
  if (deleteProductPhotoBtn && deleteProductPhotoBtn.dataset.delete === 'true') formData.append('delete_product_photo', 'true');

  // Lifetime/duration
  formData.append('is_lifetime', String(isLifetime));
  if (!isLifetime) {
    if (isDurationMethod) {
      formData.append('warranty_duration_years', years);
      formData.append('warranty_duration_months', months);
      formData.append('warranty_duration_days', days);
    } else {
      formData.append('exact_expiration_date', exactDate);
      formData.append('warranty_duration_years', 0);
      formData.append('warranty_duration_months', 0);
      formData.append('warranty_duration_days', 0);
    }
  } else {
    formData.append('warranty_duration_years', 0);
    formData.append('warranty_duration_months', 0);
    formData.append('warranty_duration_days', 0);
  }

  // Notes and misc fields
  const notes = (document.getElementById('editNotes') || {}).value || '';
  formData.append('notes', notes.trim() !== '' ? notes : '');
  const editModelNumber = document.getElementById('editModelNumber');
  formData.append('model_number', editModelNumber && editModelNumber.value.trim() ? editModelNumber.value.trim() : '');
  const editVendorInput = document.getElementById('editVendor');
  formData.append('vendor', editVendorInput ? (editVendorInput.value || '').trim() : '');
  const editWarrantyTypeInput = document.getElementById('editWarrantyType');
  const editWarrantyTypeCustomInput = document.getElementById('editWarrantyTypeCustom');
  let warrantyTypeValue = '';
  if (editWarrantyTypeInput) {
    warrantyTypeValue = (editWarrantyTypeInput.value === 'other' && editWarrantyTypeCustomInput && editWarrantyTypeCustomInput.value.trim())
      ? editWarrantyTypeCustomInput.value.trim()
      : editWarrantyTypeInput.value.trim();
  }
  formData.append('warranty_type', warrantyTypeValue);

  // Debug logs preserved
  console.log('[DEBUG saveWarranty] isLifetime:', isLifetime);
  console.log('[DEBUG saveWarranty] isDurationMethod:', isDurationMethod);
  console.log('[DEBUG saveWarranty] exactDate:', exactDate);
  console.log('[DEBUG saveWarranty] years/months/days:', years, months, days);
  for (let [key, value] of formData.entries()) {
    console.log(`[DEBUG saveWarranty] FormData: ${key} = ${value}`);
  }

  showLoadingSpinner();
  try {
    // Paperless uploads pipeline (delegated to legacy/global)
    const uploads = await processEditPaperlessUploads(formData);
    Object.keys(uploads || {}).forEach(k => formData.append(k, uploads[k]));

    // Submit update via API service (auto-injects Authorization header)
    await updateWarranty(currentId, formData);

    hideLoadingSpinner();
    showToast(window.i18next ? window.i18next.t('messages.warranty_updated_successfully') : 'Warranty updated successfully', 'success');
    setCurrentWarrantyId(null);
    if (typeof window !== 'undefined') {
      window.currentWarrantyId = null;
    }
    closeEditModal();

    // Reload warranties to pick up processed assets/paths
    try {
      await loadWarranties(true);
      applyFilters();
      setTimeout(() => loadSecureImages(), 200);
      const notesModal = document.getElementById('notesModal');
      if (notesModal && notesModal.style.display === 'block') notesModal.style.display = 'none';
      if ((invoiceFile || manualFile || otherDocumentFile) && currentId) {
        setTimeout(() => {
          const fileInfo = {};
          if (invoiceFile) fileInfo.invoice = invoiceFile.name;
          if (manualFile) fileInfo.manual = manualFile.name;
          if (otherDocumentFile) fileInfo.other = otherDocumentFile.name;
          autoLinkRecentDocuments(currentId, ['invoice', 'manual', 'other'], 10, 10000, fileInfo);
        }, 3000);
      }
    } catch (e) {
      console.error('Error reloading warranties after edit:', e);
    }
  } catch (error) {
    hideLoadingSpinner();
    console.error('Error updating warranty:', error);
    showToast(error?.message || (window.i18next ? window.i18next.t('messages.failed_to_update_warranty') : 'Failed to update warranty'), 'error');
  }
}

export function closeEditModal() {
  const modal = document.getElementById('editModal');
  if (modal) modal.classList.remove('active');
}

export function init() {
  ensureInitialized();
}

if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.editModal = {
    renderSerialNumbers,
    renderCurrentInvoice,
    renderCurrentManual,
    renderCurrentPhoto,
    renderCurrentOther,
    openEditModal,
    saveWarranty,
    closeEditModal,
    init,
  };
  window.openEditModal = openEditModal;
  window.saveWarranty = saveWarranty;
  window.closeEditModal = closeEditModal;
  window.editSelectedTags = window.editSelectedTags || [];
}
