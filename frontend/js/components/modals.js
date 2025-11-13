// Lightweight modal utilities and wrappers

export function showModalById(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

export function hideModalById(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

export function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text || '';
}

export function openDeleteModal(productName) {
  setText('#deleteProductName', productName || '');
  showModalById('deleteModal');
}

export function openArchiveModal(productName) {
  setText('#archiveProductName', productName || '');
  showModalById('archiveModal');
}

// Non-module exposure
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.modals = {
    showModalById,
    hideModalById,
    setText,
    openDeleteModal,
    openArchiveModal,
  };
}


