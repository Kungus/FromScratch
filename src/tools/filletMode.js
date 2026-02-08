/**
 * Fillet Mode — Interactive drag-to-radius fillet on body edges.
 * Self-contained state machine: registers/cleans up its own event listeners.
 */

import { getBodyById } from '../core/state.js';
import { getShape } from '../core/occtShapeStore.js';
import { filletEdges, getEdgeByIndex } from '../core/occtEngine.js';
import { tessellateShape } from '../core/occtTessellate.js';
import { showDimensions, hideDimensions } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateTessellationPreview, clearBodyPreview } from '../render/bodyRender.js';

let _applyFillet = null;

const filletMode = {
    active: false,
    bodyId: null,
    edgeIndices: null,
    startScreenY: 0,
    radius: 0,
    lastPreviewRadius: -1,
    lastValidTessellation: null,
    lastValidRadius: 0,
    debounceTimer: null,
    cleanup: null
};

/**
 * One-time init: inject the applyFillet dependency from bodyOperations.
 */
export function initFilletMode({ applyFillet }) {
    _applyFillet = applyFillet;
}

/**
 * Try to compute fillet preview; errors are silently caught (radius too large).
 */
function tryFilletPreview(bodyId, edgeIndices, radius) {
    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) return;

    const shape = getShape(body.occtShapeRef);
    if (!shape) return;

    const edges = [];
    for (const idx of edgeIndices) {
        const edge = getEdgeByIndex(shape, idx);
        if (edge) edges.push(edge);
    }
    if (edges.length === 0) return;

    try {
        const filletedShape = filletEdges(shape, edges, radius);
        const tessellation = tessellateShape(filletedShape);
        filletedShape.delete();

        filletMode.lastPreviewRadius = radius;
        filletMode.lastValidTessellation = tessellation;
        filletMode.lastValidRadius = radius;

        updateTessellationPreview(tessellation);
    } catch (e) {
        // Radius too large or other error — keep last valid preview
        console.log('Fillet preview error (radius may be too large):', e.message || e);
    } finally {
        edges.forEach(e => e.delete());
    }
}

/**
 * Start interactive fillet mode: drag up to increase radius, click to commit.
 */
export function startFilletMode(bodyId, edgeIndices) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (filletMode.active) endFilletMode();

    const container = document.getElementById('canvas-container');

    filletMode.active = true;
    filletMode.bodyId = bodyId;
    filletMode.edgeIndices = edgeIndices;
    filletMode.startScreenY = -1; // Will be set on first mouse move
    filletMode.radius = 0;
    filletMode.lastPreviewRadius = -1;
    filletMode.lastValidTessellation = null;
    filletMode.lastValidRadius = 0;
    filletMode.debounceTimer = null;

    const onMouseMove = (e) => {
        if (filletMode.startScreenY === -1) {
            filletMode.startScreenY = e.clientY;
            return;
        }

        const deltaY = filletMode.startScreenY - e.clientY;
        const radius = Math.max(0.02, deltaY * 0.005);
        filletMode.radius = radius;

        // Show dimension label at screen center
        showDimensions(radius, null, 0, 0, 0);

        // Debounced OCCT fillet preview
        if (Math.abs(radius - filletMode.lastPreviewRadius) > 0.02) {
            if (filletMode.debounceTimer) clearTimeout(filletMode.debounceTimer);
            filletMode.debounceTimer = setTimeout(() => {
                tryFilletPreview(bodyId, edgeIndices, radius);
            }, 100);
        }
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const r = filletMode.lastValidRadius;
        if (r > 0.01) {
            _applyFillet(bodyId, edgeIndices, r);
        }
        endFilletMode();
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.key.toLowerCase() === 'd') {
            e.preventDefault();
            e.stopPropagation();
            const rStr = filletMode.radius > 0.01 ? filletMode.radius.toFixed(2).replace(/\.?0+$/, '') : '0.2';
            showDimensionInput(
                (dimensions) => {
                    const r = dimensions.width || dimensions.height || 0.2;
                    _applyFillet(bodyId, edgeIndices, r);
                    endFilletMode();
                },
                () => { endFilletMode(); },
                rStr
            );
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endFilletMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);

    filletMode.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('keydown', onKeyDown);
    };
}

export function endFilletMode() {
    if (!filletMode.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));
    if (filletMode.cleanup) filletMode.cleanup();
    if (filletMode.debounceTimer) clearTimeout(filletMode.debounceTimer);
    filletMode.active = false;
    filletMode.cleanup = null;
    filletMode.lastValidTessellation = null;
    clearBodyPreview();
    hideDimensions();
    hideInput();
}

export function isFilletModeActive() {
    return filletMode.active;
}
