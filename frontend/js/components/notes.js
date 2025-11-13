function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function ensureNotesModal() {
  if (document.getElementById('notesModal')) return;
  const backdrop = el('div', 'modal-backdrop');
  backdrop.id = 'notesModal';

  const modal = el('div', 'modal');
  modal.style.maxWidth = '500px';

  const header = el('div', 'modal-header');
  const title = el('h3', 'modal-title', (window.i18next && window.i18next.t('warranties.notes')) || 'Warranty Notes');
  const closeBtn = el('button', 'close-btn');
  closeBtn.id = 'closeNotesModal';
  closeBtn.textContent = '×';
  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = el('div', 'modal-body');
  const content = el('div'); content.id = 'notesModalContent'; content.style.whiteSpace = 'pre-line';
  const textarea = el('textarea'); textarea.id = 'notesModalTextarea'; textarea.style.display = 'none'; textarea.style.width = '100%'; textarea.style.minHeight = '100px';
  body.appendChild(content);
  body.appendChild(textarea);

  const footer = el('div', 'modal-footer'); footer.id = 'notesModalFooter';
  const editBtn = el('button', 'btn btn-secondary', (window.i18next && window.i18next.t('actions.edit')) || 'Edit Notes'); editBtn.id = 'editNotesBtn';
  const editWarrantyBtn = el('button', 'btn btn-info', (window.i18next && window.i18next.t('warranties.edit_warranty')) || 'Edit Warranty'); editWarrantyBtn.id = 'editWarrantyBtn';
  const saveBtn = el('button', 'btn btn-primary', (window.i18next && window.i18next.t('actions.save')) || 'Save'); saveBtn.id = 'saveNotesBtn'; saveBtn.style.display = 'none';
  const cancelBtn = el('button', 'btn btn-danger', (window.i18next && window.i18next.t('actions.cancel')) || 'Cancel'); cancelBtn.id = 'cancelEditNotesBtn'; cancelBtn.style.display = 'none';
  footer.appendChild(editBtn);
  footer.appendChild(editWarrantyBtn);
  footer.appendChild(saveBtn);
  footer.appendChild(cancelBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  closeBtn.addEventListener('click', () => backdrop.classList.remove('active'));
}

// Global exposure
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.notes = { ensureNotesModal };
}


