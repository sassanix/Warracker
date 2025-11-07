function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function renderLoading(container) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'loading-message');
  wrap.style.textAlign = 'center';
  wrap.style.padding = '40px';
  const spinner = el('i', 'fas fa-spinner fa-spin');
  wrap.appendChild(spinner);
  wrap.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('paperless.loading_documents')) || 'Loading documents...')));
  container.appendChild(wrap);
}

export function renderError(container, message) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'no-documents-message');
  const icon = el('i', 'fas fa-exclamation-triangle');
  const h4 = el('h4', null, (window.i18next && window.i18next.t('errors.error')) || 'Error');
  const p = el('p', null, message || ((window.i18next && window.i18next.t('paperless.failed_to_load')) || 'Failed to load documents'));
  wrap.appendChild(icon);
  wrap.appendChild(h4);
  wrap.appendChild(p);
  container.appendChild(wrap);
}

function createDocItem(doc) {
  const item = el('div', 'paperless-document-item');
  item.dataset.id = String(doc.id);
  item.addEventListener('click', () => {
    if (window.selectPaperlessDocument) window.selectPaperlessDocument(doc.id);
  });

  const title = el('div', 'document-title', doc.title || '');
  const meta = el('div', 'document-meta');
  const createdDate = doc.created ? new Date(doc.created).toLocaleDateString() : '';
  const fileType = doc.mime_type || 'Unknown';
  const tags = Array.isArray(doc.tags) ? doc.tags : [];

  const dateSpan = el('span');
  dateSpan.appendChild(el('i', 'fas fa-calendar'));
  dateSpan.appendChild(document.createTextNode(' ' + createdDate));
  const typeSpan = el('span');
  typeSpan.appendChild(el('i', 'fas fa-file'));
  typeSpan.appendChild(document.createTextNode(' ' + fileType));
  meta.appendChild(dateSpan);
  meta.appendChild(typeSpan);
  if (doc.correspondent) {
    const corr = el('span');
    corr.appendChild(el('i', 'fas fa-user'));
    corr.appendChild(document.createTextNode(' ' + doc.correspondent));
    meta.appendChild(corr);
  }

  item.appendChild(title);
  item.appendChild(meta);

  if (tags.length > 0) {
    const tagsWrap = el('div', 'document-tags');
    tags.forEach(t => {
      const badge = el('span', 'document-tag', String(t));
      tagsWrap.appendChild(badge);
    });
    item.appendChild(tagsWrap);
  }

  return item;
}

export function renderDocumentsList(container, documents = []) {
  if (!container) return;
  container.textContent = '';
  if (!Array.isArray(documents) || documents.length === 0) {
    const wrap = el('div', 'no-documents-message');
    wrap.appendChild(el('i', 'fas fa-file-alt'));
    wrap.appendChild(el('h4', null, (window.i18next && window.i18next.t('paperless.no_documents_found')) || 'No documents found'));
    wrap.appendChild(el('p', null, (window.i18next && window.i18next.t('paperless.try_adjusting_filters')) || 'Try adjusting your search terms or filters.'));
    container.appendChild(wrap);
    return;
  }
  documents.forEach(doc => container.appendChild(createDocItem(doc)));
}

// Global exposure
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.paperless = {
    renderLoading,
    renderError,
    renderDocumentsList,
  };
}


