/**
 * FromScratch - Body Select Tool
 * Contextual selection: body first, then precise sub-elements when body is selected.
 */

import {
    setBodySelection,
    setBodyHover,
    getBodySelection,
    clearBodySelection,
    clearBodyHover,
    clearBodyMultiSelection,
    toggleBodyMultiSelection,
    setInteracting
} from '../core/state.js';
import { onPointer } from '../input/pointer.js';
import { detectSubElement } from '../core/bodyHitTest.js';
import { getCamera } from '../input/camera.js';

const toolState = {
    isActive: false,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastClickTime: 0,
    lastClickBodyId: null,
    modeSuppressed: false,
    gizmoSuppressed: false
};

// Suppress hover/click while an interactive mode is active
window.addEventListener('fromscratch:modestart', () => {
    toolState.modeSuppressed = true;
    clearBodyHover();
});
window.addEventListener('fromscratch:modeend', () => {
    toolState.modeSuppressed = false;
});
window.addEventListener('fromscratch:gizmoshow', () => {
    toolState.gizmoSuppressed = true;
    clearBodyHover();
});
window.addEventListener('fromscratch:gizmohide', () => {
    toolState.gizmoSuppressed = false;
});

// Double-click timing (ms) — 500ms matches typical OS default
const DOUBLE_CLICK_THRESHOLD = 500;

let unsubscribers = [];
let keydownHandler = null;
let container = null;

// Callbacks
let onSelectionChange = null;
let onHoverChange = null;
let getBodyGroup = null;

/**
 * Activate the body select tool
 * @param {HTMLElement} containerEl - The canvas container
 */
export function activateBodySelectTool(containerEl) {
    if (toolState.isActive) return;

    container = containerEl;
    toolState.isActive = true;

    unsubscribers.push(
        onPointer('down', handlePointerDown),
        onPointer('move', handlePointerMove),
        onPointer('up', handlePointerUp)
    );

    keydownHandler = handleKeyDown;
    document.addEventListener('keydown', keydownHandler);

    console.log('Body select tool activated');
}

/**
 * Deactivate the body select tool
 */
export function deactivateBodySelectTool() {
    if (!toolState.isActive) return;

    toolState.isActive = false;
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    clearBodyHover();
    console.log('Body select tool deactivated');
}

/**
 * Set callbacks for selection events
 */
export function setBodySelectCallbacks(callbacks) {
    onSelectionChange = callbacks.onSelectionChange || null;
    onHoverChange = callbacks.onHoverChange || null;
    getBodyGroup = callbacks.getBodyGroup || null;
}

// =============================================================================
// POINTER HANDLERS
// =============================================================================

function handlePointerDown(state) {
    if (!toolState.isActive || toolState.modeSuppressed || toolState.gizmoSuppressed) return;

    const currentSelection = getBodySelection();
    const bodyHit = state.bodyHit;
    const now = Date.now();

    if (!bodyHit) {
        // Clicked empty space - deselect
        clearBodyMultiSelection();
        if (currentSelection.bodyId) {
            clearBodySelection();
            notifySelectionChange({ action: 'deselect' });
        }
        toolState.lastClickTime = 0;
        toolState.lastClickBodyId = null;
        return;
    }

    // Check for double-click on same body
    const isDoubleClick = (
        now - toolState.lastClickTime < DOUBLE_CLICK_THRESHOLD &&
        toolState.lastClickBodyId === bodyHit.bodyId
    );

    if (isDoubleClick) {
        // Double-click: select whole body
        clearBodyMultiSelection();
        setBodySelection('body', bodyHit.bodyId, null, null);
        notifySelectionChange({
            action: 'selectBody',
            bodyId: bodyHit.bodyId
        });
        toolState.lastClickTime = 0;
        toolState.lastClickBodyId = null;
    } else {
        // Single-click: select the hovered sub-element (face/edge/vertex)
        const subElement = detectSubElement(
            bodyHit,
            { x: state.screenX, y: state.screenY },
            getCamera(),
            container.getBoundingClientRect()
        );

        if (subElement.type) {
            if (state.shiftKey && subElement.type === 'edge') {
                // Shift+click edge: toggle in multi-selection
                toggleBodyMultiSelection(
                    subElement.type,
                    bodyHit.bodyId,
                    subElement.index,
                    subElement.data
                );
                // Also set as primary selection for visual feedback
                setBodySelection(
                    subElement.type,
                    bodyHit.bodyId,
                    subElement.index,
                    subElement.data,
                    subElement.faceResult || null
                );
                notifySelectionChange({
                    action: 'multiSelect',
                    bodyId: bodyHit.bodyId,
                    type: subElement.type,
                    index: subElement.index,
                    data: subElement.data
                });
            } else {
                // Normal click: clear multi-selection, set single selection
                clearBodyMultiSelection();
                setBodySelection(
                    subElement.type,
                    bodyHit.bodyId,
                    subElement.index,
                    subElement.data,
                    subElement.faceResult || null
                );
                notifySelectionChange({
                    action: 'selectSubElement',
                    bodyId: bodyHit.bodyId,
                    type: subElement.type,
                    index: subElement.index,
                    data: subElement.data
                });
            }
        }

        toolState.lastClickTime = now;
        toolState.lastClickBodyId = bodyHit.bodyId;
    }

    toolState.isDragging = true;
    toolState.dragStartX = state.screenX;
    toolState.dragStartY = state.screenY;
    setInteracting(true);
}

function handlePointerMove(state) {
    if (!toolState.isActive || toolState.modeSuppressed || toolState.gizmoSuppressed) return;

    // Don't update hover while dragging
    if (toolState.isDragging) return;

    const bodyHit = state.bodyHit;

    if (!bodyHit) {
        // Not over any body
        clearBodyHover();
        notifyHoverChange(null);
        return;
    }

    // Always show precise sub-element hover (single-click selects what's hovered)
    const subElement = detectSubElement(
        bodyHit,
        { x: state.screenX, y: state.screenY },
        getCamera(),
        container.getBoundingClientRect()
    );

    setBodyHover(
        subElement.type,
        bodyHit.bodyId,
        subElement.index,
        subElement.data,
        subElement.faceResult || null
    );
    notifyHoverChange({
        type: subElement.type,
        bodyId: bodyHit.bodyId,
        index: subElement.index,
        data: subElement.data
    });
}

function handlePointerUp(state) {
    if (!toolState.isActive) return;

    toolState.isDragging = false;
    setInteracting(false);
}

// =============================================================================
// KEYBOARD HANDLER
// =============================================================================

function handleKeyDown(e) {
    if (!toolState.isActive) return;
    if (e.target.tagName === 'INPUT') return;

    const currentSelection = getBodySelection();

    // Escape - go up hierarchy or deselect
    if (e.key === 'Escape') {
        e.preventDefault();
        if (currentSelection.type && currentSelection.type !== 'body') {
            // Sub-element selected - go back to body selection
            setBodySelection('body', currentSelection.bodyId, null, null);
            notifySelectionChange({
                action: 'selectBody',
                bodyId: currentSelection.bodyId
            });
        } else if (currentSelection.bodyId) {
            // Body selected - deselect
            clearBodySelection();
            notifySelectionChange({ action: 'deselect' });
        }
    }

    // Delete - remove selected body
    if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelection.bodyId) {
        e.preventDefault();
        const bodyId = currentSelection.bodyId;
        clearBodySelection();
        notifySelectionChange({ action: 'delete', bodyId });
    }
}

// =============================================================================
// HELPERS
// =============================================================================

function notifySelectionChange(event) {
    if (onSelectionChange) onSelectionChange(event);
}

function notifyHoverChange(event) {
    if (onHoverChange) onHoverChange(event);
}

/**
 * Check if tool is active
 */
export function isBodySelectToolActive() {
    return toolState.isActive;
}

export default {
    activateBodySelectTool,
    deactivateBodySelectTool,
    setBodySelectCallbacks,
    isBodySelectToolActive
};
