/**
 * i18next Configuration and Initialization
 * Handles frontend localization with offline support
 */

// Global i18n object to make translation functions available
window.i18n = {};

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'de', 'it', 'cs', 'nl', 'hi', 'fa', 'ar', 'ru', 'uk', 'zh_CN', 'zh_HK', 'ja', 'pt', 'ko', 'tr', 'pl', 'he'];
const DEFAULT_LANGUAGE = 'en';
const RTL_LANGUAGES = ['ar', 'fa', 'he']; // Arabic, Persian, and Hebrew are RTL languages

/**
 * Initialize i18next with configuration
 */
async function initializeI18n() {
    console.log('Initializing i18next...');
    
    // Debug: Check if required libraries are loaded
    if (typeof i18next === 'undefined') {
        console.error('i18next library not loaded');
        return;
    }
    
    console.log('i18next library loaded successfully');
    
    // Check optional libraries
    const hasHttpBackend = typeof i18nextHttpBackend !== 'undefined';
    const hasLanguageDetector = typeof i18nextBrowserLanguageDetector !== 'undefined';
    
    console.log('Optional libraries:', {
        httpBackend: hasHttpBackend,
        languageDetector: hasLanguageDetector
    });
    
    try {
        // Get current language from various sources
        const savedLanguage = getCurrentLanguage();
        console.log('Initial language detected:', savedLanguage);
        
        // Load translations manually since HttpBackend might not be available
        const translations = await loadTranslations(savedLanguage);
        
        // Configure i18next with or without plugins
        let i18nextInstance = i18next;
        
        if (hasLanguageDetector) {
            i18nextInstance = i18nextInstance.use(i18nextBrowserLanguageDetector);
        }
        
        await i18nextInstance.init({
            fallbackLng: DEFAULT_LANGUAGE,
            supportedLngs: SUPPORTED_LANGUAGES,
            debug: false,
            
            // Set initial language and resources
            lng: savedLanguage,
            resources: translations,
            
            // Language detection configuration (only if detector is available)
            ...(hasLanguageDetector && {
                detection: {
                    order: ['cookie', 'localStorage', 'navigator', 'htmlTag'],
                    lookupCookie: 'lang',
                    lookupLocalStorage: 'preferred_language',
                    caches: ['cookie', 'localStorage'],
                    cookieOptions: {
                        path: '/',
                        maxAge: 365 * 24 * 60 * 60 // 1 year
                    }
                }
            }),
            
            // Interpolation options
            interpolation: {
                escapeValue: false
            }
        });
        
        // Store translation function globally
        window.i18n.t = i18next.t.bind(i18next);
        window.i18n.changeLanguage = changeLanguage;
        window.i18n.getCurrentLanguage = getCurrentLanguage;
        window.i18n.getSupportedLanguages = () => SUPPORTED_LANGUAGES;
        
        // Initialize page translations
        translatePage();
        
        // Set initial page direction
        updatePageDirection(i18next.language);
        
        // Set up language change listener
        i18next.on('languageChanged', (lng) => {
            console.log('Language changed to:', lng);
            translatePage();
            updateLanguageAttribute(lng);
            updatePageDirection(lng);
        });
        
        console.log('i18next initialized successfully with language:', i18next.language);
        
        // Dispatch event to notify other scripts that i18n is ready
        window.dispatchEvent(new CustomEvent('i18nReady', { 
            detail: { 
                language: i18next.language,
                t: window.i18n.t 
            } 
        }));
        
    } catch (error) {
        console.error('Failed to initialize i18next:', error);
        // Fallback to default language without i18next
        window.i18n.t = (key) => key; // Return key as fallback
        window.i18n.changeLanguage = () => {};
        window.i18n.getCurrentLanguage = () => DEFAULT_LANGUAGE;
        window.i18n.getSupportedLanguages = () => SUPPORTED_LANGUAGES;
        
        // Still dispatch event so other scripts know i18n is "ready" (even with fallback)
        window.dispatchEvent(new CustomEvent('i18nReady', { 
            detail: { 
                language: DEFAULT_LANGUAGE,
                t: window.i18n.t,
                fallback: true
            } 
        }));
    }
}

/**
 * Load translations for a specific language
 */
async function loadTranslations(language) {
    console.log(`loadTranslations called for language: ${language}`);
    const translations = {};
    
    try {
        // Load primary language
        const url = `/locales/${language}/translation.json?v=${Date.now()}`;
        console.log(`Fetching translations from: ${url}`);
        const response = await fetch(url);
        console.log(`Fetch response status: ${response.status} for language: ${language}`);
        
        if (response.ok) {
            const data = await response.json();
            translations[language] = { translation: data };
            const keyCount = Object.keys(data).length;
            console.log(`Successfully loaded ${keyCount} translation keys for ${language}:`, Object.keys(data).slice(0, 5));
        } else {
            console.warn(`Failed to load translations for ${language}, status: ${response.status}`);
            console.warn(`Response text:`, await response.text().catch(() => 'Could not read response text'));
        }
    } catch (error) {
        console.error(`Error loading translations for ${language}:`, error);
    }
    
    // Always load fallback language if different
    if (language !== DEFAULT_LANGUAGE) {
        try {
            const fallbackUrl = `/locales/${DEFAULT_LANGUAGE}/translation.json?v=${Date.now()}`;
            console.log(`Loading fallback language from: ${fallbackUrl}`);
            const fallbackResponse = await fetch(fallbackUrl);
            console.log(`Fallback fetch response status: ${fallbackResponse.status}`);
            
            if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json();
                translations[DEFAULT_LANGUAGE] = { translation: fallbackData };
                const fallbackKeyCount = Object.keys(fallbackData).length;
                console.log(`Loaded ${fallbackKeyCount} fallback translation keys for ${DEFAULT_LANGUAGE}`);
            }
        } catch (error) {
            console.error(`Error loading fallback translations:`, error);
        }
    }
    
    console.log(`loadTranslations completed. Languages loaded: ${Object.keys(translations)}`);
    return translations;
}

/**
 * Get current language from storage or user preferences
 */
function getCurrentLanguage() {
    // URL override (e.g., ?lang=tr)
    try {
        const params = new URLSearchParams(window.location.search);
        const urlLang = params.get('lang');
        if (urlLang && SUPPORTED_LANGUAGES.includes(urlLang)) {
            setCookie('lang', urlLang, 365);
            localStorage.setItem('preferred_language', urlLang);
            return urlLang;
        }
    } catch (e) {
        // Ignore URL parsing errors and continue
    }
    // Check cookie first
    const cookieLang = getCookie('lang');
    if (cookieLang && SUPPORTED_LANGUAGES.includes(cookieLang)) {
        return cookieLang;
    }
    
    // Check localStorage
    const storedLang = localStorage.getItem('preferred_language');
    if (storedLang && SUPPORTED_LANGUAGES.includes(storedLang)) {
        return storedLang;
    }
    
    // Check user preferences from API if authenticated
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    if (userInfo.preferred_language && SUPPORTED_LANGUAGES.includes(userInfo.preferred_language)) {
        return userInfo.preferred_language;
    }
    
    // Fallback to browser language or default
    const browserLang = navigator.language?.split('-')[0];
    return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_LANGUAGE;
}

/**
 * Change language and persist preference
 */
async function changeLanguage(language) {
    console.log('changeLanguage called with:', language);
    
    if (!SUPPORTED_LANGUAGES.includes(language)) {
        console.warn('Unsupported language:', language);
        return;
    }
    
    try {
        console.log('Loading translations for language:', language);
        // Load translations for the new language
        const translations = await loadTranslations(language);
        console.log('Translations loaded:', Object.keys(translations));
        
        // Add new language resources to i18next
        for (const [lng, resources] of Object.entries(translations)) {
            console.log('Adding resource bundle for language:', lng);
            i18next.addResourceBundle(lng, 'translation', resources.translation, true, true);
        }
        
        // Change language in i18next
        console.log('Changing i18next language to:', language);
        await i18next.changeLanguage(language);
        console.log('i18next language changed successfully to:', i18next.language);
        
        // Persist to cookie and localStorage
        setCookie('lang', language, 365);
        localStorage.setItem('preferred_language', language);
        console.log('Language preference saved to cookie and localStorage:', language);
        
        // Update user preference in backend if authenticated
        if (localStorage.getItem('auth_token')) {
            try {
                await saveLanguagePreference(language);
                console.log('Language preference saved to backend');
            } catch (error) {
                console.warn('Failed to save language preference to backend:', error);
            }
        }
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
        console.log('languageChanged event dispatched for:', language);
        
    } catch (error) {
        console.error('Failed to change language:', error);
        throw error; // Re-throw to let calling code handle it
    }
}

/**
 * Save language preference to backend
 */
async function saveLanguagePreference(language) {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    
    const response = await fetch('/api/auth/user/language-preference', {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferred_language: language })
    });
    
    if (!response.ok) {
        throw new Error('Failed to save language preference');
    }
}

/**
 * Translate all elements on the current page
 */
function translatePage() {
    if (!window.i18n.t) {
        console.warn('Translation function not available, skipping translation');
        return;
    }
    
    console.log('Starting page translation...');
    let translatedCount = 0;
    
    // Update dynamic titles that are set by JavaScript
    updateDynamicTitles();
    
    // Translate elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const raw = element.getAttribute('data-i18n');
        let handled = false;
        
        // Support syntax like [placeholder]warranties.search_placeholder
        const attrMatch = raw && raw.match(/^\s*\[(\w+)\]\s*(.+)$/);
        if (attrMatch) {
            const attrName = attrMatch[1];
            const key = attrMatch[2];
            const translation = window.i18n.t(key);
            if (translation && translation !== key) {
                element.setAttribute(attrName, translation);
                translatedCount++;
                handled = true;
            }
        }
        
        if (!handled) {
            const key = raw;
            const translation = window.i18n.t(key);
            if (translation && translation !== key) {
                if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'email' || element.type === 'password')) {
                    element.placeholder = translation;
                } else if (element.hasAttribute('title')) {
                    element.title = translation;
                } else {
                    element.textContent = translation;
                }
                translatedCount++;
            } else {
                console.warn(`No translation found for key: ${key}`);
            }
        }
    });
    
    // Translate elements with data-i18n-html attribute (allows HTML content)
    document.querySelectorAll('[data-i18n-html]').forEach(element => {
        const key = element.getAttribute('data-i18n-html');
        const translation = window.i18n.t(key);
        element.innerHTML = translation;
    });
    
    // Translate elements with data-i18n-title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        const translation = window.i18n.t(key);
        element.title = translation;
    });
    
    // Translate elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = window.i18n.t(key);
        if (translation && translation !== key) {
            element.placeholder = translation;
            translatedCount++;
        }
    });
    
    console.log(`Page translation completed. Translated ${translatedCount} elements.`);
    
    // Re-process warranties to update status text and labels if warranties exist
    if (typeof warranties !== 'undefined' && warranties && warranties.length > 0) {
        console.log(`[i18n.js] Re-processing ${warranties.length} warranties after language change`);
        // Re-process each warranty to update status text with new language
        warranties = warranties.map(warranty => {
            if (typeof processWarrantyData === 'function') {
                return processWarrantyData(warranty);
            }
            return warranty;
        });
        // Re-render warranties with new translations
        if (typeof applyFilters === 'function') {
            applyFilters();
        }
    }
}

/**
 * Update dynamic titles that are set by JavaScript
 */
function updateDynamicTitles() {
    // Update warranties panel title on index.html
    if (typeof updateWarrantiesPanelTitle === 'function' && typeof isGlobalView !== 'undefined') {
        updateWarrantiesPanelTitle(isGlobalView);
    }
    
    // Update dashboard title on status.html
    if (typeof updateDashboardTitle === 'function') {
        updateDashboardTitle();
    }
    
    // Re-process warranty cards if they exist (for dynamic status text)
    if (typeof processAllWarranties === 'function') {
        processAllWarranties();
    }
}

/**
 * Update HTML lang attribute
 */
function updateLanguageAttribute(language) {
    document.documentElement.lang = language;
}

/**
 * Update page direction for RTL languages
 */
function updatePageDirection(language) {
    const isRTL = RTL_LANGUAGES.includes(language);
    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    
    if (isRTL) {
        htmlElement.dir = 'rtl';
        htmlElement.setAttribute('data-rtl', 'true');
        bodyElement.classList.add('rtl');
        console.log(`Applied RTL direction for language: ${language}`);
    } else {
        htmlElement.dir = 'ltr';
        htmlElement.removeAttribute('data-rtl');
        bodyElement.classList.remove('rtl');
        console.log(`Applied LTR direction for language: ${language}`);
    }
}

/**
 * Utility function to get cookie value
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

/**
 * Utility function to set cookie
 */
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

/**
 * Add translation helper for dynamic content
 */
function t(key, options = {}) {
    return window.i18n.t ? window.i18n.t(key, options) : key;
}

// Expose translation function globally
window.t = t;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeI18n);
} else {
    initializeI18n();
}
