import authService from '../services/authService.js';
import { saveUserPreferences } from '../services/apiService.js';

function setTheme(isDark) {
	const theme = isDark ? 'dark' : 'light';
	document.documentElement.setAttribute('data-theme', theme);
	localStorage.setItem('darkMode', String(isDark));
	const headerToggle = document.getElementById('darkModeToggle');
	if (headerToggle) {
		headerToggle.checked = isDark;
	}
}

async function saveThemePreference(isDark, saveToApi = true) {
	try {
		setTheme(isDark);
		if (!saveToApi || !authService.isAuthenticated()) return;
		await saveUserPreferences({ theme: isDark ? 'dark' : 'light' });
	} catch (error) {
		console.warn('[theme] Failed to save theme preference', error);
	}
}

function initializeTheme() {
	const stored = localStorage.getItem('darkMode');
	if (stored !== null) {
		setTheme(stored === 'true');
		return;
	}
	const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
	setTheme(Boolean(prefersDark));
}

function bindThemeToggle() {
	const toggle = document.getElementById('darkModeToggle');
	if (!toggle || toggle._themeBound) return;
	toggle.addEventListener('change', (event) => {
		saveThemePreference(event.target.checked);
	});
	toggle._themeBound = true;
}

export { setTheme, saveThemePreference, initializeTheme, bindThemeToggle };

if (typeof window !== 'undefined') {
	window.theme = {
		setTheme,
		saveThemePreference,
		initializeTheme,
		bindThemeToggle,
	};
	window.setTheme = setTheme;
	window.saveThemePreference = saveThemePreference;
	window.initializeTheme = initializeTheme;
}






