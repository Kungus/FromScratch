/**
 * Chamfer Mode — Interactive drag-to-distance chamfer on body edges.
 * Self-contained state machine: registers/cleans up its own event listeners.
 * Mirrors filletMode.js exactly, using chamferEdges instead of filletEdges.
 */

import { getBodyById } from '../core/state.js';
import { getShape } from '../core/occtShapeStore.js';
import { chamferEdges, getEdgeByIndex } from '../core/occtEngine.js';
import { tessellateShape } from '../core/occtTessellate.js';
import { showDimensions, hideDimensions } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateTessellationPreview, clearBodyPreview } from '../render/bodyRender.js';

let _applyChamfer = null;

const chamferMode = {
    active: false,
    bodyId: null,
    edgeIndices: null,
    startScreenY: 0,
    distance: 0,
    lastPreviewDistance: -1,
    lastValidTessellation: null,
    lastValidDistance: 0,
    debounceTimer: null,
    cleanup: null
};

/**
 * One-time init: inject the applyChamfer dependency from bodyOperations.
 */
export function initChamferMode({ applyChamfer }) {
    _applyChamfer = applyChamfer;
}

/**
 * Try to compute chamfer preview; errors are silently caught (distance too large).
 */
function tryChamferPreview(bodyId, edgeIndices, distance) {
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
        const chamferedShape = chamferEdges(shape, edges, distance);
        const tessellation = tessellateShape(chamferedShape);
        chamferedShape.delete();

        chamferMode.lastPreviewDistance = distance;
        chamferMode.lastValidTessellation = tessellation;
        chamferMode.lastValidDistance = distance;

        updateTessellationPreview(tessellation);
    } catch (e) {
        // Distance too large or other error — keep last valid preview
        console.log('Chamfer preview error (distance may be too large):', e.message || e);
    } finally {
        edges.forEach(e => e.delete());
    }
}

/**
 * Start interactive chamfer mode: drag up to increase distance, click to commit.
 */
export function startChamferMode(bodyId, edgeIndices) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (chamferMode.active) endChamferMode();

    const container = document.getElementById('canvas-container');

    chamferMode.active = true;
    chamferMode.bodyId = bodyId;
    chamferMode.edgeIndices = edgeIndices;
    chamferMode.startScreenY = -1; // Will be set on first mouse move
    chamferMode.distance = 0;
    chamferMode.lastPreviewDistance = -1;
    chamferMode.lastValidTessellation = null;
    chamferMode.lastValidDistance = 0;
    chamferMode.debounceTimer = null;

    const onMouseMove = (e) => {
        if (chamferMode.startScreenY === -1) {
            chamferMode.startScreenY = e.clientY;
            return;
        }

        const deltaY = chamferMode.startScreenY - e.clientY;
        const distance = Math.max(0.02, deltaY * 0.005);
        chamferMode.distance = distance;

        // Show dimension label at screen center
        showDimensions(distance, null, 0, 0, 0);

        // Debounced OCCT chamfer preview
        if (Math.abs(distance - chamferMode.lastPreviewDistance) > 0.02) {
            if (chamferMode.debounceTimer) clearTimeout(chamferMode.debounceTimer);
            chamferMode.debounceTimer = setTimeout(() => {
                tryChamferPreview(bodyId, edgeIndices, distance);
            }, 100);
        }
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const d = chamferMode.lastValidDistance;
        if (d > 0.01) {
            _applyChamfer(bodyId, edgeIndices, d);
        }
        endChamferMode();
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.key.toLowerCase() === 'd') {
            e.preventDefault();
            e.stopPropagation();
            const dStr = chamferMode.distance > 0.01 ? chamferMode.distance.toFixed(2).replace(/\.?0+$/, '') : '0.2';
            showDimensionInput(
                (dimensions) => {
                    const d = dimensions.width || dimensions.height || 0.2;
                    _applyChamfer(bodyId, edgeIndices, d);
                    endChamferMode();
                },
                () => { endChamferMode(); },
                dStr
            );
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endChamferMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);

    chamferMode.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('keydown', onKeyDown);
    };
}

export function endChamferMode() {
    if (!chamferMode.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));
    if (chamferMode.cleanup) chamferMode.cleanup();
    if (chamferMode.debounceTimer) clearTimeout(chamferMode.debounceTimer);
    chamferMode.active = false;
    chamferMode.cleanup = null;
    chamferMode.lastValidTessellation = null;
    clearBodyPreview();
    hideDimensions();
    hideInput();
}

export function isChamferModeActive() {
    return chamferMode.active;
}
