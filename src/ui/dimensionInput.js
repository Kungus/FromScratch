/**
 * FromScratch - Dimension Input
 * Type-to-specify: start typing while drawing to enter exact dimensions.
 * Supports formats: "3x2", "3 x 2", "3,2", "3 2", or just "3" for square.
 */

let inputOverlay = null;
let inputField = null;
let isActive = false;
let onSubmitCallback = null;
let onCancelCallback = null;

/**
 * Initialize dimension input
 * @param {HTMLElement} container - The app container
 */
export function initDimensionInput(container) {
    // Create overlay container
    inputOverlay = document.createElement('div');
    inputOverlay.id = 'dimension-input-overlay';
    inputOverlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(26, 26, 46, 0.98);
        border: 2px solid #4f46e5;
        border-radius: 8px;
        padding: 16px 20px;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        z-index: 500;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    // Label
    const label = document.createElement('div');
    label.style.cssText = `
        font-size: 12px;
        color: #aaa;
        font-weight: 500;
    `;
    label.textContent = 'Width × Height';
    inputOverlay.appendChild(label);

    // Input field
    inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.placeholder = '3 x 2';
    inputField.style.cssText = `
        width: 150px;
        padding: 8px 12px;
        font-size: 18px;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        font-weight: 600;
        text-align: center;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        color: #fff;
        outline: none;
    `;
    inputField.addEventListener('focus', () => {
        inputField.style.borderColor = '#4f46e5';
    });
    inputField.addEventListener('blur', () => {
        inputField.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });
    inputOverlay.appendChild(inputField);

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = `
        font-size: 10px;
        color: #666;
    `;
    hint.textContent = 'Enter to confirm • Esc to cancel';
    inputOverlay.appendChild(hint);

    container.appendChild(inputOverlay);

    // Handle input events
    inputField.addEventListener('keydown', handleKeyDown);

    console.log('Dimension input initialized');
}

/**
 * Handle keydown in input field
 */
function handleKeyDown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitInput();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelInput();
    }
}

/**
 * Parse dimension string into width and height
 * Supports: "3x2", "3 x 2", "3,2", "3 2", "3" (square)
 * @param {string} input
 * @returns {{width: number, height: number} | null}
 */
function parseDimensions(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Try different separators: x, ×, ,, space
    const patterns = [
        /^([\d.]+)\s*[x×]\s*([\d.]+)$/i,  // 3x2, 3 x 2, 3×2
        /^([\d.]+)\s*,\s*([\d.]+)$/,       // 3,2
        /^([\d.]+)\s+([\d.]+)$/,           // 3 2
        /^([\d.]+)$/                        // 3 (square)
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
            const width = parseFloat(match[1]);
            const height = match[2] ? parseFloat(match[2]) : width; // Square if only one number

            if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
                return { width, height };
            }
        }
    }

    return null;
}

/**
 * Submit the input
 */
function submitInput() {
    const dimensions = parseDimensions(inputField.value);

    if (dimensions && onSubmitCallback) {
        onSubmitCallback(dimensions);
    }

    hideInput();
}

/**
 * Cancel input
 */
function cancelInput() {
    if (onCancelCallback) {
        onCancelCallback();
    }
    hideInput();
}

/**
 * Show the dimension input
 * @param {Function} onSubmit - Called with {width, height} on Enter
 * @param {Function} onCancel - Called on Escape
 * @param {string} [initialValue] - Pre-fill value
 */
export function showDimensionInput(onSubmit, onCancel, initialValue = '') {
    if (!inputOverlay) return;

    onSubmitCallback = onSubmit;
    onCancelCallback = onCancel;

    inputField.value = initialValue;
    inputOverlay.style.display = 'flex';
    isActive = true;

    // Focus after a tiny delay (ensures display is updated)
    setTimeout(() => {
        inputField.focus();
        inputField.select();
    }, 10);
}

/**
 * Hide the dimension input
 */
export function hideInput() {
    if (!inputOverlay) return;

    inputOverlay.style.display = 'none';
    inputField.value = '';
    isActive = false;
    onSubmitCallback = null;
    onCancelCallback = null;
}

/**
 * Check if input is currently active
 */
export function isInputActive() {
    return isActive;
}

/**
 * Append a character to the input (for capturing keystrokes while drawing)
 * @param {string} char
 */
export function appendToInput(char) {
    if (!inputField) return;
    inputField.value += char;
}

/**
 * Get current input value
 */
export function getInputValue() {
    return inputField ? inputField.value : '';
}

export default {
    initDimensionInput,
    showDimensionInput,
    hideInput,
    isInputActive,
    appendToInput,
    getInputValue
};
