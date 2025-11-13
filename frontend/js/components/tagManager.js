// Tag Manager (compat layer)
// Encapsulates tag management by delegating to existing global implementations to keep behavior identical.

function callIfExists(fn, ...args) {
	if (typeof fn === 'function') {
		return fn(...args);
	}
}

export function loadTags(force = false) {
	return callIfExists(window.loadTags, force);
}

export function initTagFunctionality() {
	return callIfExists(window.initTagFunctionality);
}

export function renderTagsList(searchTerm = '') {
	return callIfExists(window.renderTagsList, searchTerm);
}

export function renderEditTagsList(searchTerm = '') {
	return callIfExists(window.renderEditTagsList, searchTerm);
}

export function renderSelectedTags() {
	return callIfExists(window.renderSelectedTags);
}

export function renderEditSelectedTags() {
	return callIfExists(window.renderEditSelectedTags);
}

export function createTag(name) {
	return callIfExists(window.createTag, name);
}

export function updateTag(id, name, color) {
	return callIfExists(window.updateTag, id, name, color);
}

export function deleteTag(id) {
	return callIfExists(window.deleteTag, id);
}

export function openTagManagementModal() {
	return callIfExists(window.openTagManagementModal);
}

export function renderExistingTags() {
	return callIfExists(window.renderExistingTags);
}

export function addTagManagementEventListeners() {
	return callIfExists(window.addTagManagementEventListeners);
}

export function init() {
	// Ensure tag functionality on main form if present
	initTagFunctionality();
	// Attach global Manage Tags button if present
	const btn = document.getElementById('globalManageTagsBtn');
	if (btn && !btn._tmBound) {
		btn.addEventListener('click', async (e) => {
			e.preventDefault();
			try {
				await loadTags();
			} finally {
				openTagManagementModal();
			}
		});
		btn._tmBound = true;
	}
}

// Backward compatibility on window
if (typeof window !== 'undefined') {
	window.tagManager = {
		init,
		loadTags,
		initTagFunctionality,
		renderTagsList,
		renderEditTagsList,
		renderSelectedTags,
		renderEditSelectedTags,
		createTag,
		updateTag,
		deleteTag,
		openTagManagementModal,
		renderExistingTags,
		addTagManagementEventListeners
	};
}


