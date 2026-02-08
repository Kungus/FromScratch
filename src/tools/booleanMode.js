/**
 * Boolean Mode — Interactive pick-second-body mode for subtract/union.
 * Self-contained state machine: registers/cleans up its own event listeners.
 */

import { raycastToBodies } from '../input/bodyRaycast.js';
import { updateHoverHighlight, updateSelectionHighlight } from '../render/selectionHighlight.js';
import { getBodyGroup } from '../render/bodyRender.js';
import { getBodySelection, clearBodySelection } from '../core/state.js';

let _applyBoolean = null;

const booleanState = {
    active: false,
    bodyIdA: null,
    operation: null, // 'subtract' | 'union'
    hoveredBodyId: null,
    cleanup: null
};

/**
 * One-time init: inject the applyBoolean dependency from bodyOperations.
 */
export function initBooleanMode({ applyBoolean }) {
    _applyBoolean = applyBoolean;
}

/**
 * Start boolean pick mode: user must click a second body.
 * @param {string} bodyIdA - The first body (target)
 * @param {'subtract'|'union'} operation - Boolean operation type
 */
export function startBooleanMode(bodyIdA, operation) {
    if (booleanState.active) endBooleanMode();

    const container = document.getElementById('canvas-container');

    booleanState.active = true;
    booleanState.bodyIdA = bodyIdA;
    booleanState.operation = operation;
    booleanState.hoveredBodyId = null;

    // Highlight Body A as selected (cyan)
    clearBodySelection();
    updateSelectionHighlight(
        { type: 'body', bodyId: bodyIdA, subElementIndex: null, subElementData: null },
        getBodyGroup()
    );

    // Crosshair cursor
    container.style.cursor = 'crosshair';

    // Status text
    const statusEl = document.createElement('div');
    statusEl.id = 'boolean-mode-status';
    const opLabel = operation === 'subtract' ? 'subtract from' : 'unite with';
    statusEl.textContent = `Click a body to ${opLabel}... (Esc to cancel)`;
    statusEl.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:6px;font-size:14px;z-index:1000;pointer-events:none;';
    document.body.appendChild(statusEl);

    const onMouseMove = (e) => {
        const rect = container.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const hit = raycastToBodies(ndcX, ndcY);

        if (hit && hit.bodyId !== bodyIdA) {
            booleanState.hoveredBodyId = hit.bodyId;
            updateHoverHighlight(
                { type: 'body', bodyId: hit.bodyId, subElementIndex: null, subElementData: null },
                getBodyGroup()
            );
        } else {
            booleanState.hoveredBodyId = null;
            updateHoverHighlight(null, getBodyGroup());
        }
    };

    // Capture-phase mousedown: fires before pointer.js's bubble-phase handler,
    // so stopImmediatePropagation prevents bodySelectTool from seeing the click.
    const onMouseDown = (e) => {
        if (e.button !== 0) return;

        // Always intercept left clicks during boolean mode to prevent
        // pointer.js / bodySelectTool from processing them
        e.stopImmediatePropagation();
        e.preventDefault();

        if (booleanState.hoveredBodyId) {
            const idA = booleanState.bodyIdA;
            const idB = booleanState.hoveredBodyId;
            const op = booleanState.operation;
            endBooleanMode();
            _applyBoolean(idA, idB, op);
        }
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endBooleanMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);

    booleanState.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('keydown', onKeyDown);
    };
}

export function endBooleanMode() {
    if (!booleanState.active) return;

    if (booleanState.cleanup) booleanState.cleanup();

    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';

    const statusEl = document.getElementById('boolean-mode-status');
    if (statusEl) statusEl.remove();

    updateHoverHighlight(null, getBodyGroup());
    clearBodySelection();
    updateSelectionHighlight(getBodySelection(), getBodyGroup());

    booleanState.active = false;
    booleanState.bodyIdA = null;
    booleanState.operation = null;
    booleanState.hoveredBodyId = null;
    booleanState.cleanup = null;
}

export function isBooleanModeActive() {
    return booleanState.active;
}
