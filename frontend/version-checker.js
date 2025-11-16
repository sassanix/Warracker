// Version checker for Warracker
document.addEventListener('DOMContentLoaded', () => {
    const currentVersion = '1.0.2'; // Current version of the application
    const updateStatus = document.getElementById('updateStatus');
    const updateLink = document.getElementById('updateLink');
    const versionDisplay = document.getElementById('versionDisplay');

    // Function to compare versions
    function compareVersions(v1, v2) {
        const v1Parts = v1.split('.').map(Number);
        const v2Parts = v2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;
            
            if (v1Part > v2Part) return 1;
            if (v1Part < v2Part) return -1;
        }
        return 0;
    }

    // Function to check for updates
    async function checkForUpdates() {
        try {
            const response = await fetch('https://api.github.com/repos/sassanix/Warracker/releases/latest');
            if (!response.ok) throw new Error('Failed to fetch release information');
            
            const data = await response.json();
            const latestVersion = data.tag_name.replace('v', ''); // Remove 'v' prefix if present
            
            const comparison = compareVersions(latestVersion, currentVersion);
            
            if (comparison > 0) {
                // New version available
                if (window.i18next && window.i18next.t) {
                    updateStatus.textContent = window.i18next.t('about.new_version_available', { version: data.tag_name });
                } else {
                    updateStatus.textContent = `New version ${data.tag_name} available!`;
                }
                updateStatus.style.color = 'var(--success-color)';
                updateLink.href = data.html_url;
                updateLink.style.display = 'inline-block';
            } else {
                // Up to date
                if (window.i18next && window.i18next.t) {
                    updateStatus.textContent = window.i18next.t('about.latest_version');
                } else {
                    updateStatus.textContent = 'You are using the latest version';
                }
                updateStatus.style.color = 'var(--success-color)';
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            if (window.i18next && window.i18next.t) {
                updateStatus.textContent = window.i18next.t('about.update_check_failed');
            } else {
                updateStatus.textContent = 'Failed to check for updates';
            }
            updateStatus.style.color = 'var(--error-color)';
        }
    }

    // Update version display if element exists
    if (versionDisplay) {
        // Wait for i18next to be ready
        const updateVersionDisplay = () => {
            if (window.i18next && window.i18next.t) {
                versionDisplay.textContent = window.i18next.t('about.version') + ' v' + currentVersion;
            } else {
                versionDisplay.textContent = 'Version v' + currentVersion;
            }
        };
        
        // Try immediately and also after a delay for i18next
        updateVersionDisplay();
        setTimeout(updateVersionDisplay, 500);
    }

    // Check for updates when the page loads
    checkForUpdates();
}); 