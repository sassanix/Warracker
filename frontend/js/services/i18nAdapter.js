// Small adapter to provide a stable i18n interface for modules.
// It prefers a global `window.i18next` (loaded via non-module scripts),
// but keeps a safe fallback API so callers can import this module.
const i18nAdapter = {
  t: (...args) => {
    if (typeof window !== 'undefined' && window.i18next && typeof window.i18next.t === 'function') return window.i18next.t(...args);
    // fallback: return default or key
    return args[1] || args[0] || '';
  },
  changeLanguage: (lang) => {
    if (typeof window !== 'undefined' && window.i18next && typeof window.i18next.changeLanguage === 'function') return window.i18next.changeLanguage(lang);
    return Promise.resolve();
  },
  getCurrentLanguage: () => {
    if (typeof window !== 'undefined' && window.i18next && window.i18next.language) return window.i18next.language;
    return 'en';
  }
};

export default i18nAdapter;
