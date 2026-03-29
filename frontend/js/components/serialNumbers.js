/**
 * Serial Numbers Management Component
 * Handles adding/removing serial number inputs in warranty forms
 */

function addSerialNumberInput(container) {
    // If no container provided, try to find it
    if (!container) {
        container = document.getElementById('serialNumbersContainer');
    }
    
    // Check if the container exists before proceeding
    if (!container) {
        console.warn('Serial numbers container not found, cannot add input.');
        return;
    }

    const div = document.createElement('div');
    div.className = 'serial-number-input d-flex mb-2';
    
    // Create an input element
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.name = 'serial_numbers[]';
    input.placeholder = window.i18next ? window.i18next.t('warranties.enter_serial_number') : 'Enter serial number';
    
    // Check if this is the first serial number input
    const isFirstInput = container.querySelectorAll('.serial-number-input').length === 0;
    
    // Append input to the input group
    div.appendChild(input);
    
    // Only add remove button if this is not the first input
    if (!isFirstInput) {
        // Create a remove button
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-sm btn-danger remove-serial';
        removeButton.innerHTML = '<i class="fas fa-times"></i>';
        
        // Add event listener to remove button
        removeButton.addEventListener('click', function() {
            container.removeChild(div);
        });
        
        // Append remove button to the input group
        div.appendChild(removeButton);
    }
    
    // Insert the new input group before the add button
    const addButton = container.querySelector('.add-serial');
    if (addButton) {
        container.insertBefore(div, addButton);
    } else {
        container.appendChild(div);
        
        // Create and append an add button if it doesn't exist
        const newAddButton = document.createElement('button');
        newAddButton.type = 'button';
        newAddButton.className = 'btn btn-sm btn-secondary add-serial';
        newAddButton.innerHTML = '<i class="fas fa-plus"></i> ' + (window.i18next ? window.i18next.t('warranties.add_serial_number') : 'Add Serial Number');
        
        newAddButton.addEventListener('click', function() {
            addSerialNumberInput(container);
        });
        
        container.appendChild(newAddButton);
    }
}

function removeSerialNumberInput(inputElement) {
    if (inputElement && inputElement.parentNode) {
        inputElement.parentNode.remove();
    }
}

function clearSerialNumbers(container) {
    if (!container) {
        container = document.getElementById('serialNumbersContainer');
    }
    
    if (container) {
        container.innerHTML = '';
    }
}

function getSerialNumbers(container) {
    if (!container) {
        container = document.getElementById('serialNumbersContainer');
    }
    
    if (!container) {
        return [];
    }
    
    const serialNumbers = [];
    const inputs = container.querySelectorAll('input[name="serial_numbers[]"]');
    inputs.forEach(input => {
        if (input.value && input.value.trim()) {
            serialNumbers.push(input.value.trim());
        }
    });
    
    return serialNumbers;
}

function setSerialNumbers(serialNumbers, container) {
    if (!container) {
        container = document.getElementById('serialNumbersContainer');
    }
    
    if (!container) {
        console.warn('Serial numbers container not found');
        return;
    }
    
    // Clear existing inputs
    clearSerialNumbers(container);
    
    // Add serial number inputs
    if (serialNumbers && serialNumbers.length > 0) {
        serialNumbers.forEach((serialNumber) => {
            addSerialNumberInput(container);
            const inputs = container.querySelectorAll('input[name="serial_numbers[]"]');
            const lastInput = inputs[inputs.length - 1];
            if (lastInput) {
                lastInput.value = serialNumber;
            }
        });
    } else {
        // Add at least one empty input
        addSerialNumberInput(container);
    }
}

// Export functions
export {
    addSerialNumberInput,
    removeSerialNumberInput,
    clearSerialNumbers,
    getSerialNumbers,
    setSerialNumbers
};

// Expose to window for backward compatibility
if (typeof window !== 'undefined') {
    window.serialNumbers = {
        add: addSerialNumberInput,
        remove: removeSerialNumberInput,
        clear: clearSerialNumbers,
        get: getSerialNumbers,
        set: setSerialNumbers
    };
    
    // Also expose individual functions
    window.addSerialNumberInput = addSerialNumberInput;
    window.removeSerialNumberInput = removeSerialNumberInput;
    window.clearSerialNumbers = clearSerialNumbers;
    window.getSerialNumbers = getSerialNumbers;
    window.setSerialNumbers = setSerialNumbers;
}
