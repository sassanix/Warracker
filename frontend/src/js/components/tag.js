export function createTag(name, color) {
  const tagEl = document.createElement('span');
  tagEl.className = 'tag';
  if (color) {
    tagEl.style.backgroundColor = color;
    try {
      const contrast = (window.getContrastColor ? window.getContrastColor(color) : null);
      if (contrast) tagEl.style.color = contrast;
    } catch (e) {
      // fallback silently
    }
  }
  tagEl.textContent = name || '';
  return tagEl;
}

export function appendTags(cardElement, tags = []) {
  if (!cardElement || !Array.isArray(tags) || tags.length === 0) return;
  const tagsRow = document.createElement('div');
  tagsRow.className = 'tags-row';
  tags.forEach(tag => {
    const el = createTag(tag?.name, tag?.color);
    tagsRow.appendChild(el);
  });

  // Prefer to insert after document links row if present, else append at end of card
  const docRow = cardElement.querySelector('.document-links-row');
  if (docRow) {
    docRow.insertAdjacentElement('afterend', tagsRow);
  } else {
    cardElement.appendChild(tagsRow);
  }
}

// Expose globally for non-module consumers
if (typeof window !== 'undefined') {
  window.components = window.components || {};
  window.components.createTag = createTag;
  window.components.appendTags = appendTags;
}


