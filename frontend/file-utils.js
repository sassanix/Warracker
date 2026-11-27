/**
 * Utility functions for secure file handling
 */

/**
 * Converts a file path to a secure API endpoint path
 * @param {string} path - The file path to convert
 * @returns {string} The secure API endpoint path
 */
function secureFilePath(path) {
    if (!path) return '';
    
    if (path.startsWith('uploads/')) {
        return '/api/secure-file/' + path.substring(8);
    }
    
    if (path.startsWith('/uploads/')) {
        return '/api/secure-file/' + path.substring(9);
    }
    
    return path;
}

function tFile(key, fallback) {
    try {
        if (window.i18n && typeof window.i18n.t === 'function') {
            const translated = window.i18n.t(key);
            if (translated && translated !== key) return translated;
        }
        if (window.i18next && typeof window.i18next.t === 'function' && window.i18next.isInitialized) {
            const translated = window.i18next.t(key);
            if (translated && translated !== key) return translated;
        }
    } catch (_) {}
    return fallback;
}

/**
 * Opens a file in a new tab with proper authentication
 * @param {string} path - The file path to open
 */
function openSecureFile(path) {
    if (!path) return;
    
    const securePath = secureFilePath(path);
    console.log('Opening file:', securePath);
    
    // Try to get the token from different sources
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
        console.error('No authentication token available');
        alert(tFile('messages.login_required_access_files', 'You must be logged in to access files'));
        return;
    }
    
    // Create a link with target="_blank" and click it programmatically
    const link = document.createElement('a');
    link.href = securePath;
    link.target = '_blank';
    
    // Add a click event listener to inject the token
    link.addEventListener('click', function(e) {
        // Prevent the default navigation
        e.preventDefault();
        
        // Make a fetch request with the Authorization header
        fetch(securePath, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            const safeInlineTypes = new Set([
                'application/pdf',
                'image/png',
                'image/jpeg',
                'image/webp',
                'image/gif',
                'text/plain'
            ]);
            const mimeType = (blob.type || '').split(';')[0].trim().toLowerCase();
            if (safeInlineTypes.has(mimeType)) {
                // Create a URL for the blob and open it in a new window
                const url = URL.createObjectURL(blob);
                const win = window.open(url, '_blank');
                if (win) {
                    try { win.opener = null; } catch (_) {}
                }
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            } else {
                const downloadBlob = new Blob([blob], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(downloadBlob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = path.split('/').pop() || 'document';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
        })
        .catch(error => {
            console.error('Error opening file:', error);
            alert(tFile('messages.error_opening_file', 'Error opening file. Please try again or check if you are logged in.'));
        });
    });
    
    // Trigger the click event
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Downloads a file using the secure file endpoint
 * @param {string} path - The file path to download
 * @param {string} filename - The name to save the file as
 */
function downloadSecureFile(path, filename) {
    if (!path) return;
    
    const securePath = secureFilePath(path);
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
        console.error('No authentication token available');
        alert(tFile('messages.login_required_download_files', 'You must be logged in to download files'));
        return;
    }
    
    fetch(securePath, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename || path.split('/').pop();
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('Error downloading file:', error);
        alert(tFile('messages.error_downloading_file', 'Error downloading file. Please try again or check if you are logged in.'));
    });
} 