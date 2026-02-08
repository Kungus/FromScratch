/**
 * FromScratch - Select Tool
 * Click to select sketch elements, drag to move them.
 */

import * as THREE from 'three';
import { snap } from '../core/snap.js';
import { getState, setSelection, clearSelection, setInteracting } from '../core/state.js';
import { onPointer, getWorldPosition } from '../input/pointer.js';
import { getCamera } from '../input/camera.js';
import { raycastToPlane } from '../input/planeRaycast.js';

// Tool state
const toolState = {
    isActive: false,
    isDragging: false,
    dragStartX: 0,
    dragStartZ: 0,
    dragOffsetX: 0,  // Offset from click point to element origin
    dragOffsetZ: 0,
    selectedId: null
};

// Callbacks
let onSelectionChange = null;  // Called when selection changes
let onMoveElement = null;      // Called when element is moved
let onDuplicateElement = null; // Called when duplicating an element
let onHoverChange = null;      // Called when hover changes
let onDragStart = null;        // Called when drag begins (for undo snapshot)
let getSketchElements = null;  // Function to get sketch elements for hit testing

// Unsubscribe functions
let unsubscribers = [];
let keydownHandler = null;

/**
 * Activate the select tool
 */
export function activateSelectTool() {
    if (toolState.isActive) return;

    toolState.isActive = true;
    toolState.isDragging = false;

    // Subscribe to pointer events
    unsubscribers.push(
        onPointer('down', handlePointerDown),
        onPointer('move', handlePointerMove),
        onPointer('up', handlePointerUp)
    );

    // Add keyboard listener for delete
    keydownHandler = handleKeyDown;
    document.addEventListener('keydown', keydownHandler);

    console.log('Select tool activated');
}

/**
 * Deactivate the select tool
 */
export function deactivateSelectTool() {
    if (!toolState.isActive) return;

    toolState.isActive = false;
    toolState.isDragging = false;

    // Unsubscribe from pointer events
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    // Remove keyboard listener
    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    console.log('Select tool deactivated');
}

/**
 * Set callback for selection changes
 */
export function setSelectionChangeCallback(callback) {
    onSelectionChange = callback;
}

/**
 * Set callback for moving elements
 */
export function setMoveCallback(callback) {
    onMoveElement = callback;
}

/**
 * Set function to get sketch elements for hit testing
 */
export function setGetElementsFunction(fn) {
    getSketchElements = fn;
}

/**
 * Set callback for duplicating elements
 */
export function setDuplicateCallback(callback) {
    onDuplicateElement = callback;
}

/**
 * Set callback for hover changes
 */
export function setHoverCallback(callback) {
    onHoverChange = callback;
}

/**
 * Set callback for drag start (used for undo snapshot before move)
 */
export function setDragStartCallback(callback) {
    onDragStart = callback;
}

// =============================================================================
// HIT TESTING
// =============================================================================

/**
 * Find sketch element at a pointer position.
 * For ground-plane sketches, compares against worldX/worldZ.
 * For face-plane sketches, raycasts to the sketch's plane and compares in local coords.
 * @param {number} worldX - Ground-plane world X
 * @param {number} worldZ - Ground-plane world Z
 * @param {number} ndcX - Normalized device coordinate X
 * @param {number} ndcY - Normalized device coordinate Y
 * @returns {Object|null} - Element data or null
 */
function hitTest(worldX, worldZ, ndcX, ndcY) {
    if (!getSketchElements) return null;

    const elements = getSketchElements();
    const hitPadding = 0.2; // Allow clicks slightly outside

    for (const elem of elements) {
        let u, v;
        if (elem.plane) {
            // Face-plane sketch: raycast to the sketch's plane for local coords
            const result = raycastToPlane(ndcX, ndcY, elem.plane, getCamera());
            if (!result) continue;
            u = result.localPoint.u;
            v = result.localPoint.v;
        } else {
            // Ground-plane sketch: u=worldX, v=worldZ
            u = worldX;
            v = worldZ;
        }

        if (elem.type === 'rectangle') {
            if (u >= elem.x1 - hitPadding && u <= elem.x2 + hitPadding &&
                v >= elem.z1 - hitPadding && v <= elem.z2 + hitPadding) {
                return elem;
            }
        } else if (elem.type === 'circle') {
            const du = u - elem.centerX;
            const dv = v - elem.centerZ;
            const dist = Math.sqrt(du * du + dv * dv);
            if (dist <= elem.radius + hitPadding) {
                return elem;
            }
        }
    }

    return null;
}

// =============================================================================
// KEYBOARD HANDLER
// =============================================================================

function handleKeyDown(e) {
    if (!toolState.isActive) return;
    if (e.target.tagName === 'INPUT') return;

    // Delete or Backspace to remove selected
    if ((e.key === 'Delete' || e.key === 'Backspace') && toolState.selectedId) {
        e.preventDefault();
        if (onSelectionChange) {
            onSelectionChange({ action: 'delete', id: toolState.selectedId });
        }
        toolState.selectedId = null;
        clearSelection();
    }

    // Escape to deselect
    if (e.key === 'Escape' && toolState.selectedId) {
        e.preventDefault();
        toolState.selectedId = null;
        clearSelection();
        if (onSelectionChange) {
            onSelectionChange({ action: 'deselect' });
        }
    }

    // Shift+D to duplicate selected
    if (e.key === 'D' && e.shiftKey && toolState.selectedId) {
        e.preventDefault();
        const elements = getSketchElements ? getSketchElements() : [];
        const elem = elements.find(el => el.id === toolState.selectedId);
        if (elem && onDuplicateElement) {
            onDuplicateElement({
                ...elem,
                offsetX: 0.5,
                offsetZ: 0.5
            });
            console.log('Duplicated:', elem.type);
        }
    }
}

// =============================================================================
// POINTER HANDLERS
// =============================================================================

function handlePointerDown(state) {
    if (!toolState.isActive) return;

    const snapped = snap(state.worldX, state.worldZ);
    const hit = hitTest(state.worldX, state.worldZ, state.ndcX, state.ndcY);

    if (hit) {
        // Clicked on an element - select it
        toolState.selectedId = hit.id;
        setSelection([hit.id]);

        // Start drag - mark as interacting to block camera orbit
        toolState.isDragging = true;
        setInteracting(true);
        if (onDragStart) onDragStart({ id: hit.id });

        toolState.dragStartX = snapped.x;
        toolState.dragStartZ = snapped.z;

        // Calculate offset from click to element origin
        if (hit.type === 'rectangle') {
            toolState.dragOffsetX = snapped.x - hit.x1;
            toolState.dragOffsetZ = snapped.z - hit.z1;
        } else if (hit.type === 'circle') {
            toolState.dragOffsetX = snapped.x - hit.centerX;
            toolState.dragOffsetZ = snapped.z - hit.centerZ;
        }

        if (onSelectionChange) {
            onSelectionChange({ action: 'select', id: hit.id, element: hit });
        }
    } else {
        // Clicked empty space - deselect
        if (toolState.selectedId) {
            toolState.selectedId = null;
            clearSelection();
            if (onSelectionChange) {
                onSelectionChange({ action: 'deselect' });
            }
        }
    }
}

function handlePointerMove(state) {
    if (!toolState.isActive) return;

    // If dragging, move the element
    if (toolState.isDragging && toolState.selectedId) {
        const snapped = snap(state.worldX, state.worldZ);
        const newX1 = snapped.x - toolState.dragOffsetX;
        const newZ1 = snapped.z - toolState.dragOffsetZ;

        if (onMoveElement) {
            onMoveElement({
                id: toolState.selectedId,
                x1: newX1,
                z1: newZ1
            });
        }
    } else {
        // Not dragging - check for hover
        const hit = hitTest(state.worldX, state.worldZ, state.ndcX, state.ndcY);
        const hoveredId = hit ? hit.id : null;

        if (onHoverChange) {
            onHoverChange(hoveredId);
        }
    }
}

function handlePointerUp(state) {
    if (!toolState.isActive) return;

    if (toolState.isDragging) {
        toolState.isDragging = false;
        setInteracting(false);
    }
}

// =============================================================================
// GETTERS
// =============================================================================

export function isSelectToolActive() {
    return toolState.isActive;
}

export function getSelectedId() {
    return toolState.selectedId;
}

export default {
    activateSelectTool,
    deactivateSelectTool,
    setSelectionChangeCallback,
    setMoveCallback,
    setGetElementsFunction,
    isSelectToolActive,
    getSelectedId
};
