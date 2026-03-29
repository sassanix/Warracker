function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

const getLoadingContainer = () => window.loadingContainer || document.getElementById('loadingContainer');
const getToastContainer = () => document.getElementById('toastContainer');

export function showLoading() {
  const container = getLoadingContainer();
  if (container) {
    container.classList.add('active');
    window.loadingContainer = container;
  } else {
    console.error('showLoading: #loadingContainer not found');
  }
}

export function hideLoading() {
  const container = getLoadingContainer();
  if (container) {
    container.classList.remove('active');
    window.loadingContainer = container;
  } else {
    console.error('hideLoading: #loadingContainer not found');
  }
}

export function showLoadingSpinner() {
  const container = getLoadingContainer();
  if (container) {
    container.style.display = 'flex';
    window.loadingContainer = container;
  }
}

export function hideLoadingSpinner() {
  const container = getLoadingContainer();
  if (container) {
    container.style.display = 'none';
    window.loadingContainer = container;
  }
}

export function showToast(message, type = 'info', duration = 5000) {
  const toastContainer = getToastContainer();
  if (!toastContainer) return null;

  const existingToasts = toastContainer.querySelectorAll(`.toast.toast-${type}`);
  for (let i = 0; i < existingToasts.length; i += 1) {
    const span = existingToasts[i].querySelector('span');
    if (span && span.textContent === message) {
      return existingToasts[i];
    }
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = document.createElement('i');
  switch (type) {
    case 'success':
      icon.className = 'fas fa-check-circle';
      break;
    case 'error':
      icon.className = 'fas fa-exclamation-circle';
      break;
    case 'warning':
      icon.className = 'fas fa-exclamation-triangle';
      break;
    default:
      icon.className = 'fas fa-info-circle';
  }

  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(messageSpan);
  toastContainer.appendChild(toast);

  toast.remove = function removeToast() {
    toast.classList.add('toast-fade-out');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  };

  if (duration > 0) {
    setTimeout(() => toast.remove(), duration);
  }

  return toast;
}

export function renderEmptyState(container, message) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'empty-state');
  const icon = el('i', 'fas fa-box-open');
  const h3 = el('h3', null, (window.t ? window.t('messages.no_warranties_found') : 'No warranties found'));
  const p = el('p', null, message || (window.t ? window.t('messages.no_warranties_found_add_first') : 'No warranties yet. Add your first warranty to get started.'));
  wrap.appendChild(icon);
  wrap.appendChild(h3);
  wrap.appendChild(p);
  container.appendChild(wrap);
}

// Global expose
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.ui = {
    renderEmptyState,
    showLoading,
    hideLoading,
    showLoadingSpinner,
    hideLoadingSpinner,
    showToast,
  };
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;
  window.showLoadingSpinner = showLoadingSpinner;
  window.hideLoadingSpinner = hideLoadingSpinner;
  window.showToast = showToast;
}


