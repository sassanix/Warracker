const template = document.getElementById('warranty-card-template');

export function createWarrantyCard(warranty, options = {}) {
  const { eventHandlers = {}, actionsHtml = '', contentHtml = '', statusText = '', statusClass = '', rootModifierClass = '' } = options;
  if (!template) {
    const fallback = document.createElement('div');
    fallback.className = 'warranty-card';
    fallback.textContent = warranty?.product_name || 'Warranty';
    return fallback;
  }

  const card = template.content.cloneNode(true).firstElementChild;
  if (rootModifierClass) {
    card.className = `warranty-card ${rootModifierClass}`;
  }

  const title = card.querySelector('.warranty-title');
  if (title) {
    const name = warranty?.product_name || 'Unnamed Product';
    title.textContent = name;
    title.title = name;
  }

  const actions = card.querySelector('.warranty-actions');
  if (actions && actionsHtml) actions.innerHTML = actionsHtml;

  const info = card.querySelector('.warranty-info');
  if (info && contentHtml) info.innerHTML = contentHtml;

  const statusRow = card.querySelector('.warranty-status-row');
  if (statusRow) {
    const span = statusRow.querySelector('span');
    if (span && statusText) span.textContent = statusText;
    if (statusClass) statusRow.className = `warranty-status-row status-${statusClass}`;
  }

  const deleteBtn = card.querySelector('.delete-btn');
  if (deleteBtn && eventHandlers.onDelete) {
    deleteBtn.addEventListener('click', () => eventHandlers.onDelete(warranty.id, warranty.product_name));
  }
  const editBtn = card.querySelector('.edit-btn');
  if (editBtn && eventHandlers.onEdit) {
    editBtn.addEventListener('click', () => eventHandlers.onEdit(warranty));
  }

  return card;
}

// Non-module exposure
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.createWarrantyCard = createWarrantyCard;
}
