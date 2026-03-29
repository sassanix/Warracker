// Main Application Entry Point
import { initBootstrap } from './bootstrap.js';
import {
	init as initListController,
	loadWarranties,
	loadFilterAndSortPreferences,
	loadViewPreference,
	initViewControls,
} from './controllers/warrantyListController.js';
import { init as initTagManager } from './components/tagManager.js';
import { init as initAddForm } from './components/addWarrantyForm.js';
import { init as initEditModal } from './components/editModal.js';
import { init as initNotes } from './components/notes.js';
import { init as initClaims } from './components/claims.js';
import { initFormTabs } from './components/formTabs.js';
import { addSerialNumberInput } from './components/serialNumbers.js';

function bootstrapModules() {
	initListController();
	initTagManager();
	initAddForm();
	initEditModal();
	initNotes();
	initClaims();
	initViewControls();
	loadFilterAndSortPreferences();
	loadViewPreference();
}

initBootstrap();

document.addEventListener('DOMContentLoaded', () => {
	bootstrapModules();
});

window.addEventListener('authStateReady', (event) => {
	const isAuthenticated = !!(event.detail && event.detail.isAuthenticated);
	loadWarranties(isAuthenticated);
});
