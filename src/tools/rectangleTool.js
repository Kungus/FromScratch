/**
 * FromScratch - Rectangle Tool
 * Click and drag to draw rectangles on the ground plane.
 * Supports type-to-specify: start typing dimensions while drawing.
 */

import { snap } from '../core/snap.js';
import { getState, setInteracting, getActiveSketchPlane, getSketchPlaneBodyId } from '../core/state.js';
import { onPointer } from '../input/pointer.js';
import { getDrawingCoords } from '../input/planeRaycast.js';

// Tool state
const toolState = {
    isActive: false,           // Is this tool selected?
    isDrawing: false,          // Currently dragging?
    awaitingDimensions: false, // Waiting for dimension input?
    startX: 0,                 // First corner (snapped)
    startZ: 0,
    endX: 0,                   // Second corner (snapped)
    endZ: 0
};

// Callbacks
let onPreviewUpdate = null;  // Called while dragging with preview rect
let onCommit = null;         // Called when rectangle is completed
let onRequestDimensionInput = null;  // Called when user starts typing

// Unsubscribe functions for pointer events
let unsubscribers = [];

// Keydown handler reference (for removal)
let keydownHandler = null;

/**
 * Activate the rectangle tool
 */
export function activateRectangleTool() {
    if (toolState.isActive) return;

    toolState.isActive = true;
    toolState.isDrawing = false;
    toolState.typedInput = '';

    // Subscribe to pointer events
    unsubscribers.push(
        onPointer('down', handlePointerDown),
        onPointer('move', handlePointerMove),
        onPointer('up', handlePointerUp)
    );

    // Add keyboard listener for type-to-specify
    keydownHandler = handleKeyDown;
    document.addEventListener('keydown', keydownHandler);

    console.log('Rectangle tool activated');
}

/**
 * Deactivate the rectangle tool
 */
export function deactivateRectangleTool() {
    if (!toolState.isActive) return;

    toolState.isActive = false;
    toolState.isDrawing = false;
    toolState.typedInput = '';

    // Unsubscribe from pointer events
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    // Remove keyboard listener
    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    // Clear any preview
    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    console.log('Rectangle tool deactivated');
}

/**
 * Set callback for preview updates
 * @param {Function} callback - Called with {x1, z1, x2, z2} or null
 */
export function setPreviewCallback(callback) {
    onPreviewUpdate = callback;
}

/**
 * Set callback for when rectangle is committed
 * @param {Function} callback - Called with {x1, z1, x2, z2, width, height}
 */
export function setCommitCallback(callback) {
    onCommit = callback;
}

/**
 * Set callback for when user starts typing dimensions
 * @param {Function} callback - Called with {startX, startZ, initialInput}
 */
export function setDimensionInputCallback(callback) {
    onRequestDimensionInput = callback;
}

/**
 * Commit rectangle with specific dimensions (called from dimension input)
 * @param {number} width
 * @param {number} height
 */
export function commitWithDimensions(width, height) {
    if (!toolState.awaitingDimensions && !toolState.isDrawing) return;

    // Calculate end position based on start and dimensions
    // Determine direction based on current drag direction
    const dirX = toolState.endX >= toolState.startX ? 1 : -1;
    const dirZ = toolState.endZ >= toolState.startZ ? 1 : -1;

    const x1 = toolState.startX;
    const z1 = toolState.startZ;
    const x2 = x1 + (width * dirX);
    const z2 = z1 + (height * dirZ);

    const rect = {
        x1: Math.min(x1, x2),
        z1: Math.min(z1, z2),
        x2: Math.max(x1, x2),
        z2: Math.max(z1, z2),
        width,
        height
    };

    // Attach sketch plane info if drawing on a face
    const plane = getActiveSketchPlane();
    if (plane) {
        rect.plane = plane;
        rect.parentBodyId = getSketchPlaneBodyId();
    }

    // Clear preview
    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    // Commit
    if (onCommit) {
        onCommit(rect);
    }

    // Reset state
    toolState.isDrawing = false;
    toolState.awaitingDimensions = false;
    setInteracting(false);
}

// =============================================================================
// KEYBOARD HANDLER (D for dimensions)
// =============================================================================

function handleKeyDown(e) {
    // Only capture while drawing or awaiting dimensions
    if (!toolState.isDrawing && !toolState.awaitingDimensions) return;

    // Ignore if typing in an input field
    if (e.target.tagName === 'INPUT') return;

    // D key opens dimension input
    if (e.key.toLowerCase() === 'd' && !toolState.awaitingDimensions) {
        e.preventDefault();
        e.stopPropagation();

        // Enter "awaiting dimensions" mode - keeps preview visible
        toolState.awaitingDimensions = true;

        if (onRequestDimensionInput) {
            const currentRect = getRectangle();
            onRequestDimensionInput({
                startX: toolState.startX,
                startZ: toolState.startZ,
                currentWidth: currentRect.width,
                currentHeight: currentRect.height
            });
        }
    }
}

// =============================================================================
// POINTER HANDLERS
// =============================================================================

function handlePointerDown(state) {
    if (!toolState.isActive) return;

    const coords = getDrawingCoords(state);
    if (!coords) return;
    const snapped = snap(coords.u, coords.v);

    toolState.isDrawing = true;
    setInteracting(true);

    toolState.startX = snapped.x;
    toolState.startZ = snapped.z;
    toolState.endX = snapped.x;
    toolState.endZ = snapped.z;
}

function handlePointerMove(state) {
    if (!toolState.isActive || !toolState.isDrawing) return;

    const coords = getDrawingCoords(state);
    if (!coords) return;
    const snapped = snap(coords.u, coords.v);

    toolState.endX = snapped.x;
    toolState.endZ = snapped.z;

    // Notify preview callback
    if (onPreviewUpdate) {
        onPreviewUpdate(getRectangle());
    }
}

function handlePointerUp(state) {
    if (!toolState.isActive || !toolState.isDrawing) return;

    const coords = getDrawingCoords(state);
    if (coords) {
        const snapped = snap(coords.u, coords.v);
        toolState.endX = snapped.x;
        toolState.endZ = snapped.z;
    }

    // If awaiting dimensions, keep the preview visible and don't commit yet
    if (toolState.awaitingDimensions) {
        toolState.isDrawing = false;
        // Keep interacting true until dimension input is resolved
        // Update preview one last time with final position
        if (onPreviewUpdate) {
            onPreviewUpdate(getRectangle());
        }
        return;
    }

    toolState.isDrawing = false;
    setInteracting(false);

    // Get the rectangle
    const rect = getRectangle();

    // Clear preview
    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    // Only commit if rectangle has area
    if (rect.width > 0.001 && rect.height > 0.001) {
        if (onCommit) {
            onCommit(rect);
        }
    }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the current rectangle (normalized so x1 < x2, z1 < z2)
 */
function getRectangle() {
    const x1 = Math.min(toolState.startX, toolState.endX);
    const x2 = Math.max(toolState.startX, toolState.endX);
    const z1 = Math.min(toolState.startZ, toolState.endZ);
    const z2 = Math.max(toolState.startZ, toolState.endZ);

    const rect = {
        x1, z1,  // Min corner
        x2, z2,  // Max corner
        width: x2 - x1,
        height: z2 - z1
    };

    // Attach sketch plane info if drawing on a face
    const plane = getActiveSketchPlane();
    if (plane) {
        rect.plane = plane;
        rect.parentBodyId = getSketchPlaneBodyId();
    }

    return rect;
}

/**
 * Check if tool is currently active
 */
export function isRectangleToolActive() {
    return toolState.isActive;
}

/**
 * Check if currently drawing
 */
export function isDrawing() {
    return toolState.isDrawing;
}

/**
 * Cancel current drawing operation
 */
export function cancelDrawing() {
    if (toolState.isDrawing || toolState.awaitingDimensions) {
        toolState.isDrawing = false;
        toolState.awaitingDimensions = false;
        setInteracting(false);
        if (onPreviewUpdate) {
            onPreviewUpdate(null);
        }
    }
}

export default {
    activateRectangleTool,
    deactivateRectangleTool,
    setPreviewCallback,
    setCommitCallback,
    setDimensionInputCallback,
    commitWithDimensions,
    cancelDrawing,
    isRectangleToolActive,
    isDrawing
};
