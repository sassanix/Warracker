// Edit modal helper components (DOM-based, no innerHTML templates)

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
  };
}


