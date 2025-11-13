// Edit modal helper components (DOM-based, no innerHTML templates)
import { updateWarranty } from '../services/apiService.js';

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

// Expose globally
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.editModal = {
    renderSerialNumbers,
    renderCurrentInvoice,
    renderCurrentManual,
    renderCurrentPhoto,
    renderCurrentOther,
    saveWarranty,
  };
}


// Submit handler for the Edit Warranty modal
export async function saveWarranty() {
  const currentId = typeof window !== 'undefined' ? window.currentWarrantyId : null;
  if (!currentId) {
    if (window && window.showToast) window.showToast(window.t ? window.t('messages.no_warranty_selected_for_update') : 'No warranty selected', 'error');
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
  const editSelectedTags = (typeof window !== 'undefined' && window.editSelectedTags) ? window.editSelectedTags : [];
  formData.append('tag_ids', JSON.stringify(Array.isArray(editSelectedTags) ? editSelectedTags.map(t => t.id) : []));

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

  if (window && window.showLoadingSpinner) window.showLoadingSpinner();
  try {
    // Paperless uploads pipeline (delegated to legacy/global)
    const uploads = (window && typeof window.processEditPaperlessNgxUploads === 'function')
      ? await window.processEditPaperlessNgxUploads(formData)
      : {};
    Object.keys(uploads || {}).forEach(k => formData.append(k, uploads[k]));

    // Submit update via API service (auto-injects Authorization header)
    await updateWarranty(currentId, formData);

    if (window && window.hideLoadingSpinner) window.hideLoadingSpinner();
    if (window && window.showToast) window.showToast('Warranty updated successfully', 'success');
    if (window) window.currentWarrantyId = null; // Clear the warranty ID after successful save
    if (window && typeof window.closeModals === 'function') window.closeModals();

    // Reload warranties to pick up processed assets/paths
    if (window && window.warrantyListController && typeof window.warrantyListController.loadWarranties === 'function') {
      try {
        await window.warrantyListController.loadWarranties(true);
        if (window && typeof window.applyFilters === 'function') window.applyFilters();
        setTimeout(() => {
          if (window && typeof window.loadSecureImages === 'function') {
            window.loadSecureImages();
          }
        }, 200);
        const notesModal = document.getElementById('notesModal');
        if (notesModal && notesModal.style.display === 'block') notesModal.style.display = 'none';
        // Auto-link paperless docs post-update
        if ((invoiceFile || manualFile || otherDocumentFile) && currentId) {
          setTimeout(() => {
            if (typeof window.autoLinkRecentDocuments === 'function') {
              const fileInfo = {};
              if (invoiceFile) fileInfo.invoice = invoiceFile.name;
              if (manualFile) fileInfo.manual = manualFile.name;
              if (otherDocumentFile) fileInfo.other = otherDocumentFile.name;
              window.autoLinkRecentDocuments(currentId, ['invoice', 'manual', 'other'], 10, 10000, fileInfo);
            }
          }, 3000);
        }
      } catch (e) {
        console.error('Error reloading warranties after edit:', e);
      }
    }
  } catch (error) {
    if (window && window.hideLoadingSpinner) window.hideLoadingSpinner();
    console.error('Error updating warranty:', error);
    if (window && window.showToast) window.showToast(error?.message || 'Failed to update warranty', 'error');
  }
}
