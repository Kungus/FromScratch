/**
 * FromScratch - Circle Tool
 * Click to set center, drag to set radius.
 */

import { snap } from '../core/snap.js';
import { setInteracting, getActiveSketchPlane, getSketchPlaneBodyId } from '../core/state.js';
import { onPointer } from '../input/pointer.js';
import { getDrawingCoords } from '../input/planeRaycast.js';

// Tool state
const toolState = {
    isActive: false,
    isDrawing: false,
    awaitingDimensions: false,
    centerX: 0,
    centerZ: 0,
    radius: 0
};

// Callbacks
let onPreviewUpdate = null;
let onCommit = null;
let onRequestDimensionInput = null;

// Unsubscribe functions
let unsubscribers = [];
let keydownHandler = null;

/**
 * Activate the circle tool
 */
export function activateCircleTool() {
    if (toolState.isActive) return;

    toolState.isActive = true;
    toolState.isDrawing = false;

    unsubscribers.push(
        onPointer('down', handlePointerDown),
        onPointer('move', handlePointerMove),
        onPointer('up', handlePointerUp)
    );

    keydownHandler = handleKeyDown;
    document.addEventListener('keydown', keydownHandler);

    console.log('Circle tool activated');
}

/**
 * Deactivate the circle tool
 */
export function deactivateCircleTool() {
    if (!toolState.isActive) return;

    toolState.isActive = false;
    toolState.isDrawing = false;
    toolState.awaitingDimensions = false;

    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    console.log('Circle tool deactivated');
}

/**
 * Set callback for preview updates
 */
export function setCirclePreviewCallback(callback) {
    onPreviewUpdate = callback;
}

/**
 * Set callback for when circle is committed
 */
export function setCircleCommitCallback(callback) {
    onCommit = callback;
}

/**
 * Set callback for dimension input
 */
export function setCircleDimensionCallback(callback) {
    onRequestDimensionInput = callback;
}

/**
 * Commit circle with specific radius
 */
export function commitCircleWithRadius(radius) {
    if (!toolState.awaitingDimensions && !toolState.isDrawing) return;

    const circle = {
        centerX: toolState.centerX,
        centerZ: toolState.centerZ,
        radius: radius
    };

    // Attach sketch plane info if drawing on a face
    const plane = getActiveSketchPlane();
    if (plane) {
        circle.plane = plane;
        circle.parentBodyId = getSketchPlaneBodyId();
    }

    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    if (onCommit) {
        onCommit(circle);
    }

    toolState.isDrawing = false;
    toolState.awaitingDimensions = false;
    setInteracting(false);
}

/**
 * Cancel drawing
 */
export function cancelCircleDrawing() {
    if (toolState.isDrawing || toolState.awaitingDimensions) {
        toolState.isDrawing = false;
        toolState.awaitingDimensions = false;
        setInteracting(false);
        if (onPreviewUpdate) {
            onPreviewUpdate(null);
        }
    }
}

// =============================================================================
// KEYBOARD HANDLER
// =============================================================================

function handleKeyDown(e) {
    if (!toolState.isDrawing && !toolState.awaitingDimensions) return;
    if (e.target.tagName === 'INPUT') return;

    if (e.key.toLowerCase() === 'd' && !toolState.awaitingDimensions) {
        e.preventDefault();
        e.stopPropagation();

        toolState.awaitingDimensions = true;

        if (onRequestDimensionInput) {
            onRequestDimensionInput({
                centerX: toolState.centerX,
                centerZ: toolState.centerZ,
                currentRadius: toolState.radius
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

    toolState.centerX = snapped.x;
    toolState.centerZ = snapped.z;
    toolState.radius = 0;
}

function handlePointerMove(state) {
    if (!toolState.isActive || !toolState.isDrawing) return;

    const coords = getDrawingCoords(state);
    if (!coords) return;
    const snapped = snap(coords.u, coords.v);

    // Calculate radius from center to current point
    const dx = snapped.x - toolState.centerX;
    const dz = snapped.z - toolState.centerZ;
    toolState.radius = Math.sqrt(dx * dx + dz * dz);

    if (onPreviewUpdate) {
        onPreviewUpdate(getCircle());
    }
}

function handlePointerUp(state) {
    if (!toolState.isActive || !toolState.isDrawing) return;

    const coords = getDrawingCoords(state);
    if (coords) {
        const snapped = snap(coords.u, coords.v);
        const dx = snapped.x - toolState.centerX;
        const dz = snapped.z - toolState.centerZ;
        toolState.radius = Math.sqrt(dx * dx + dz * dz);
    }

    if (toolState.awaitingDimensions) {
        toolState.isDrawing = false;
        if (onPreviewUpdate) {
            onPreviewUpdate(getCircle());
        }
        return;
    }

    toolState.isDrawing = false;
    setInteracting(false);

    const circle = getCircle();

    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    if (circle.radius > 0.01) {
        if (onCommit) {
            onCommit(circle);
        }
    }
}

// =============================================================================
// HELPERS
// =============================================================================

function getCircle() {
    const circle = {
        centerX: toolState.centerX,
        centerZ: toolState.centerZ,
        radius: toolState.radius
    };

    const plane = getActiveSketchPlane();
    if (plane) {
        circle.plane = plane;
        circle.parentBodyId = getSketchPlaneBodyId();
    }

    return circle;
}

export function isCircleToolActive() {
    return toolState.isActive;
}

export default {
    activateCircleTool,
    deactivateCircleTool,
    setCirclePreviewCallback,
    setCircleCommitCallback,
    setCircleDimensionCallback,
    commitCircleWithRadius,
    cancelCircleDrawing,
    isCircleToolActive
};
