import { setCurrentWarrantyId } from '../store.js';

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

export function openDeleteModal(warrantyId, productName) {
  if (Number.isFinite(warrantyId)) {
    setCurrentWarrantyId(warrantyId);
  }
  setText('#deleteProductName', productName || '');
  showModalById('deleteModal');
}

export function openArchiveModal(warrantyId, productName) {
  if (Number.isFinite(warrantyId)) {
    setCurrentWarrantyId(warrantyId);
  }
  setText('#archiveProductName', productName || '');
  showModalById('archiveModal');
}

export function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.classList.remove('active'));
}

if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.modals = {
    showModalById,
    hideModalById,
    setText,
    openDeleteModal,
    openArchiveModal,
    closeModals,
  };
  window.openDeleteModal = openDeleteModal;
  window.openArchiveModal = openArchiveModal;
  window.closeModals = closeModals;
}
