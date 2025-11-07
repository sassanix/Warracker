// Debug script to test i18next CDN loading
console.log('=== i18next Debug Script ===');

// Check if CDN scripts are loaded
setTimeout(() => {
    console.log('Checking i18next libraries:');
    console.log('- i18next:', typeof i18next !== 'undefined' ? 'LOADED' : 'NOT LOADED');
    console.log('- i18nextHttpBackend:', typeof i18nextHttpBackend !== 'undefined' ? 'LOADED' : 'NOT LOADED');
    console.log('- i18nextBrowserLanguageDetector:', typeof i18nextBrowserLanguageDetector !== 'undefined' ? 'LOADED' : 'NOT LOADED');
    
    // Test basic fetch to translation file
    fetch('/locales/en/translation.json')
        .then(response => {
            console.log('Translation file fetch status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Translation file loaded successfully, keys:', Object.keys(data).slice(0, 5));
        })
        .catch(error => {
            console.error('Failed to load translation file:', error);
        });
        
    // Test API endpoint
    fetch('/api/locales')
        .then(response => {
            console.log('Locales API status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Locales API response:', data);
        })
        .catch(error => {
            console.error('Failed to load locales API:', error);
        });
}, 2000); // Wait 2 seconds for CDN scripts to load 