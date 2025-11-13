// Main Application Entry Point
import authService from './services/authService.js';
import { init as initListController, loadWarranties } from './controllers/warrantyListController.js';
import { init as initTagManager } from './components/tagManager.js';
import { init as initAddForm } from './components/addWarrantyForm.js';

// Initialize auth first (idempotent; authService also auto-inits on DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
	authService.initAuth();
});

// Wait for authentication to be confirmed before loading protected data and initializing auth-dependent modules
window.addEventListener('authStateReady', (event) => {
	if (event.detail && event.detail.isAuthenticated) {
		// Initialize all feature modules
		initListController();
		initTagManager();
		initAddForm();

		// Trigger the initial data load for the application
		loadWarranties(true);
	}
});


