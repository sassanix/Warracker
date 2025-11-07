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
        alert('You must be logged in to access files');
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
            // Create a URL for the blob and open it in a new window
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        })
        .catch(error => {
            console.error('Error opening file:', error);
            alert('Error opening file. Please try again or check if you are logged in.');
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
        alert('You must be logged in to download files');
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
        alert('Error downloading file. Please try again or check if you are logged in.');
    });
} 