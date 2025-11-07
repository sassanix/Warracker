// Temporary toast notification enhancement for debugging
// Add this to browser console to make success messages more visible

(function() {
    console.log('🍞 Toast Debug Enhancement Loaded');
    
    // Override showToast to make it more visible
    const originalShowToast = window.showToast;
    
    window.showToast = function(message, type = 'info', duration = 5000) {
        console.log(`🍞 TOAST NOTIFICATION: ${message} (Type: ${type})`);
        
        // Call original function
        if (originalShowToast) {
            originalShowToast.call(this, message, type, duration);
        }
        
        // Also show an alert for debugging (remove this in production)
        if (type === 'success') {
            alert(`SUCCESS: ${message}`);
        }
        
        // Add a visible console message
        console.log(`%c${message}`, `color: ${type === 'success' ? 'green' : type === 'error' ? 'red' : 'blue'}; font-weight: bold; font-size: 16px;`);
    };
    
    console.log('Toast notifications will now be more visible with alerts');
})(); 