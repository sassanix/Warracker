function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function renderWarrantyInfo(container, warranty, formatDateFn) {
  if (!container || !warranty) return;
  container.textContent = '';
  const card = el('div', 'warranty-info-card');
  const title = el('h4', null, warranty.product_name || 'Unnamed Product');
  const details = el('div', 'warranty-details');

  const vendor = el('span');
  const vendorIcon = el('i', 'fas fa-building');
  vendor.appendChild(vendorIcon);
  vendor.appendChild(document.createTextNode(' ' + (warranty.vendor || 'Unknown Vendor')));

  const exp = el('span');
  const calIcon = el('i', 'fas fa-calendar');
  const expText = (typeof formatDateFn === 'function')
    ? formatDateFn(warranty.expiration_date ? new Date(warranty.expiration_date) : null)
    : (warranty.expiration_date || '');
  exp.appendChild(calIcon);
  exp.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('warranties.expires')) || 'Expires') + ': ' + expText));

  const statusVal = warranty.status || 'unknown';
  const status = el('span', `warranty-status status-${statusVal}`);
  status.textContent = warranty.statusText || 'Unknown Status';

  details.appendChild(vendor);
  details.appendChild(exp);
  details.appendChild(status);

  card.appendChild(title);
  card.appendChild(details);
  container.appendChild(card);
}

function createClaimItem(claim, canEdit, formatDateFn) {
  const item = el('div', 'claim-item');
  item.dataset.claimId = String(claim.id);

  const header = el('div', 'claim-header');
  const info = el('div', 'claim-info');
  const title = el('div', 'claim-title');
  const strong = el('strong', null, claim.claim_number ? String(claim.claim_number) : `Claim #${claim.id}`);
  title.appendChild(strong);

  const statusClass = `claim-status-${String(claim.status || '').toLowerCase().replace(' ', '-')}`;
  const badge = el('span', `claim-status-badge ${statusClass}`, claim.status || '');
  title.appendChild(document.createTextNode(' '));
  title.appendChild(badge);

  const dateRow = el('div', 'claim-date');
  const calIcon = el('i', 'fas fa-calendar');
  dateRow.appendChild(calIcon);
  const dateText = (typeof formatDateFn === 'function') ? formatDateFn(claim.claim_date ? new Date(claim.claim_date) : null) : (claim.claim_date || '');
  dateRow.appendChild(document.createTextNode(' ' + dateText));

  if (claim.resolution_date && String(claim.resolution_date).trim()) {
    const resSpan = el('span');
    resSpan.style.marginLeft = '10px';
    const check = el('i', 'fas fa-check-circle');
    resSpan.appendChild(check);
    const resText = (typeof formatDateFn === 'function') ? formatDateFn(new Date(claim.resolution_date)) : claim.resolution_date;
    resSpan.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('claims.resolved')) || 'Resolved') + ': ' + resText));
    dateRow.appendChild(resSpan);
  }

  info.appendChild(title);
  info.appendChild(dateRow);

  const actions = el('div', 'claim-actions');
  if (canEdit) {
    const editBtn = el('button', 'btn btn-sm btn-secondary edit-claim-btn');
    editBtn.dataset.claimId = String(claim.id);
    const editIcon = el('i', 'fas fa-edit');
    editBtn.appendChild(editIcon);
    editBtn.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('actions.edit')) || 'Edit')));
    const delBtn = el('button', 'btn btn-sm btn-danger delete-claim-btn');
    delBtn.dataset.claimId = String(claim.id);
    const delIcon = el('i', 'fas fa-trash');
    delBtn.appendChild(delIcon);
    delBtn.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('actions.delete')) || 'Delete')));
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
  } else {
    const ro = el('span', 'claim-readonly-indicator');
    ro.style.color = 'var(--medium-gray)';
    ro.style.fontSize = '0.9em';
    const eye = el('i', 'fas fa-eye');
    ro.appendChild(eye);
    ro.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('actions.view_only')) || 'View Only')));
    actions.appendChild(ro);
  }

  header.appendChild(info);
  header.appendChild(actions);
  item.appendChild(header);

  if (claim.description) {
    const desc = el('div', 'claim-description');
    desc.textContent = claim.description;
    item.appendChild(desc);
  }
  if (claim.resolution) {
    const res = el('div', 'claim-resolution');
    const strong = el('strong', null, ((window.i18next && window.i18next.t('claims.resolution')) || 'Resolution') + ': ');
    res.appendChild(strong);
    res.appendChild(document.createTextNode(claim.resolution));
    item.appendChild(res);
  }

  return item;
}

export function renderClaimsList(container, claims = [], canEdit = false, formatDateFn) {
  if (!container) return;
  container.textContent = '';

  if (!Array.isArray(claims) || claims.length === 0) {
    const wrapper = el('div', 'no-claims-message');
    wrapper.style.textAlign = 'center';
    wrapper.style.padding = '40px';
    const icon = el('i', 'fas fa-clipboard-list');
    icon.style.fontSize = '3rem';
    icon.style.color = 'var(--medium-gray)';
    icon.style.marginBottom = '1rem';
    const h4 = el('h4', null, (window.i18next && window.i18next.t('claims.no_claims_yet')) || 'No Claims Yet');
    h4.style.color = 'var(--text-color)';
    h4.style.marginBottom = '0.5rem';
    const msg = canEdit ? ((window.i18next && window.i18next.t('claims.no_claims_message')) || 'Click "Add New Claim" to get started') : 'No claims have been filed for this warranty';
    const p = el('p', null, msg);
    p.style.color = 'var(--dark-gray)';
    p.style.marginBottom = '0';
    wrapper.appendChild(icon);
    wrapper.appendChild(h4);
    wrapper.appendChild(p);
    container.appendChild(wrapper);
    return;
  }

  claims.forEach(claim => {
    container.appendChild(createClaimItem(claim, canEdit, formatDateFn));
  });
}

export function renderClaimsLoading(container) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'loading-message');
  wrap.style.textAlign = 'center';
  wrap.style.padding = '20px';
  const spinner = el('i', 'fas fa-spinner fa-spin');
  wrap.appendChild(spinner);
  wrap.appendChild(document.createTextNode(' ' + ((window.i18next && window.i18next.t('claims.loading')) || 'Loading claims...')));
  container.appendChild(wrap);
}

export function renderClaimsError(container, text) {
  if (!container) return;
  container.textContent = '';
  const wrap = el('div', 'error-message');
  wrap.style.textAlign = 'center';
  wrap.style.padding = '20px';
  wrap.style.color = 'var(--danger-color)';
  const warn = el('i', 'fas fa-exclamation-triangle');
  wrap.appendChild(warn);
  wrap.appendChild(document.createTextNode(' ' + (text || 'Failed to load claims')));
  container.appendChild(wrap);
}

// Global exposure
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.claims = {
    renderWarrantyInfo,
    renderClaimsList,
    renderClaimsLoading,
    renderClaimsError,
  };
}


