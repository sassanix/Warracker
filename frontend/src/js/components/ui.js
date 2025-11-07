function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
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
  window.components.ui = { renderEmptyState };
}


