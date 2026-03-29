import authService from './services/authService.js';
import { initializeTheme, bindThemeToggle } from './lib/theme.js';
import { loadCurrencies } from './lib/currency.js';
import { initPaperlessIntegration } from './components/paperless.js';

let paperlessInitialized = false;
let currenciesLoaded = false;
let bootstrapInitialized = false;

function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) return;
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('./sw.js')
			.then((registration) => {
				console.log('[bootstrap] Service worker registered:', registration.scope);
			})
			.catch((error) => {
				console.error('[bootstrap] Service worker registration failed:', error);
			});
	});
}

function handleAuthState(event) {
	const isAuthenticated = !!(event.detail && event.detail.isAuthenticated);
	if (isAuthenticated) {
		if (!currenciesLoaded) {
			currenciesLoaded = true;
			loadCurrencies().catch((error) => console.error('[bootstrap] Failed to load currencies', error));
		}
		if (!paperlessInitialized) {
			paperlessInitialized = true;
			initPaperlessIntegration().catch((error) => console.error('[bootstrap] Failed to init paperless', error));
		}
	}
}

export function initBootstrap() {
	if (bootstrapInitialized) return;
	bootstrapInitialized = true;
	authService.initAuth();
	document.addEventListener('DOMContentLoaded', () => {
		initializeTheme();
		bindThemeToggle();
		registerServiceWorker();
	});
	window.addEventListener('authStateReady', handleAuthState);
}

export default {
	initBootstrap,
};


