/**
 * Fillet Mode — Interactive drag-to-radius fillet on body edges.
 * Self-contained state machine: registers/cleans up its own event listeners.
 */

import { getBodyById } from '../core/state.js';
import { getShape } from '../core/occtShapeStore.js';
import { filletEdges, getEdgeByIndex, getAdjacentFaceNormals } from '../core/occtEngine.js';
import { tessellateShape } from '../core/occtTessellate.js';
import { showDimensions, hideDimensions, makeDimensionClickable, makeDimensionNotClickable } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateTessellationPreview, clearBodyPreview, hideBodyMesh, showBodyMesh } from '../render/bodyRender.js';
import { showFilletHandle, hideFilletHandle, getFilletHandleHitMesh, highlightFilletHandle } from '../render/filletHandleRender.js';
import { getCamera } from '../input/camera.js';
import * as THREE from 'three';

let _applyFillet = null;
const _handleRaycaster = new THREE.Raycaster();

const filletMode = {
    active: false,
    isDragging: false,
    bodyId: null,
    edgeIndices: null,
    edgeMidpoint: null,
    handleDir: null,         // outward direction vector {x,y,z}
    screenAxisDir: null,     // projected handle direction in screen space
    startScreenX: 0,
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
 * Raycast to the fillet handle's invisible hit mesh.
 * Returns true if the pointer is over the handle.
 */
function raycastFilletHandle(clientX, clientY) {
    const hitMesh = getFilletHandleHitMesh();
    if (!hitMesh || !hitMesh.parent?.visible) return false;
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    _handleRaycaster.setFromCamera({ x: ndcX, y: ndcY }, getCamera());
    const hits = _handleRaycaster.intersectObject(hitMesh);
    return hits.length > 0;
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

        hideBodyMesh(bodyId);
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
 * @param {string} bodyId
 * @param {number[]} edgeIndices
 * @param {{x:number, y:number, z:number}} [edgeMidpoint] - 3D midpoint of the edge for label positioning
 */
export function startFilletMode(bodyId, edgeIndices, edgeMidpoint) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (filletMode.active) endFilletMode();

    const container = document.getElementById('canvas-container');

    filletMode.active = true;
    filletMode.bodyId = bodyId;
    filletMode.edgeIndices = edgeIndices;
    filletMode.edgeMidpoint = edgeMidpoint || null;
    filletMode.radius = 0;
    filletMode.lastPreviewRadius = -1;
    filletMode.lastValidTessellation = null;
    filletMode.lastValidRadius = 0;
    filletMode.debounceTimer = null;
    filletMode.handleDir = null;
    filletMode.screenAxisDir = null;

    // Compute handle direction from adjacent face normals
    const body = getBodyById(bodyId);
    if (body && body.occtShapeRef) {
        const shape = getShape(body.occtShapeRef);
        if (shape && edgeIndices.length > 0) {
            const normals = getAdjacentFaceNormals(shape, edgeIndices[0]);
            if (normals.length >= 2) {
                // Average of the two face normals = outward bisector
                let dx = normals[0].x + normals[1].x;
                let dy = normals[0].y + normals[1].y;
                let dz = normals[0].z + normals[1].z;
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (len > 1e-6) {
                    filletMode.handleDir = { x: dx / len, y: dy / len, z: dz / len };
                }
            } else if (normals.length === 1) {
                filletMode.handleDir = normals[0];
            }
        }
    }

    // Fallback direction: up
    if (!filletMode.handleDir) {
        filletMode.handleDir = { x: 0, y: 1, z: 0 };
    }

    // Show handle arrow at edge midpoint
    if (edgeMidpoint) {
        showFilletHandle(edgeMidpoint, filletMode.handleDir);
    }

    // Project handle direction to screen space for drag computation
    if (edgeMidpoint) {
        const camera = getCamera();
        const rect = container.getBoundingClientRect();
        const origin3 = new THREE.Vector3(edgeMidpoint.x, edgeMidpoint.y, edgeMidpoint.z);
        const tip3 = origin3.clone().add(new THREE.Vector3(filletMode.handleDir.x, filletMode.handleDir.y, filletMode.handleDir.z));

        const originNDC = origin3.clone().project(camera);
        const tipNDC = tip3.project(camera);

        const sx = (tipNDC.x - originNDC.x) * rect.width / 2;
        const sy = -(tipNDC.y - originNDC.y) * rect.height / 2;
        const sLen = Math.sqrt(sx * sx + sy * sy);
        filletMode.screenAxisDir = sLen > 0.001 ? { x: sx / sLen, y: sy / sLen } : { x: 0, y: -1 };

        // Set start screen position from projected edge midpoint
        filletMode.startScreenX = (originNDC.x * 0.5 + 0.5) * rect.width + rect.left;
        filletMode.startScreenY = (-originNDC.y * 0.5 + 0.5) * rect.height + rect.top;
    } else {
        filletMode.screenAxisDir = { x: 0, y: -1 };
        filletMode.startScreenX = -1;
        filletMode.startScreenY = -1;
    }

    /** Open dimension input dialog pre-filled with current radius */
    const openDimensionInput = () => {
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
    };

    const onMouseMove = (e) => {
        if (!filletMode.isDragging) {
            // Hover highlight on handle
            const isOver = raycastFilletHandle(e.clientX, e.clientY);
            highlightFilletHandle(isOver);
            container.style.cursor = isOver ? 'pointer' : '';
            return;
        }

        // Dragging: compute radius from mouse position relative to handle base
        const dx = e.clientX - filletMode.startScreenX;
        const dy = e.clientY - filletMode.startScreenY;
        const dot = dx * filletMode.screenAxisDir.x + dy * filletMode.screenAxisDir.y;
        const radius = Math.max(0.02, dot * 0.005);
        filletMode.radius = radius;

        // Position dimension label at handle tip (midpoint + direction * radius)
        const mp = filletMode.edgeMidpoint;
        const hd = filletMode.handleDir;
        if (mp && hd) {
            const labelX = mp.x + hd.x * radius;
            const labelY = mp.y + hd.y * radius;
            const labelZ = mp.z + hd.z * radius;
            showDimensions(radius, null, labelX, labelZ, labelY);
        } else {
            showDimensions(radius, null, 0, 0, 0);
        }

        // Make label clickable (once visible)
        makeDimensionClickable(openDimensionInput);

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
        e.stopImmediatePropagation();
        e.preventDefault();

        const isOnHandle = raycastFilletHandle(e.clientX, e.clientY);
        if (isOnHandle) {
            // Start drag on handle
            filletMode.isDragging = true;
            container.style.cursor = 'grabbing';
        } else {
            // Click off handle: commit if valid radius, else cancel
            const r = filletMode.lastValidRadius;
            if (r > 0.01) {
                _applyFillet(bodyId, edgeIndices, r);
            }
            endFilletMode();
        }
    };

    const onMouseUp = (e) => {
        if (e.button !== 0) return;
        if (!filletMode.isDragging) return;
        filletMode.isDragging = false;
        container.style.cursor = '';
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.key.toLowerCase() === 'd') {
            e.preventDefault();
            e.stopPropagation();
            openDimensionInput();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endFilletMode();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const r = filletMode.lastValidRadius;
            if (r > 0.01) {
                _applyFillet(bodyId, edgeIndices, r);
            }
            endFilletMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);

    filletMode.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('keydown', onKeyDown);
    };
}

export function endFilletMode() {
    if (!filletMode.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));
    if (filletMode.cleanup) filletMode.cleanup();
    if (filletMode.debounceTimer) clearTimeout(filletMode.debounceTimer);
    if (filletMode.bodyId) showBodyMesh(filletMode.bodyId);
    hideFilletHandle();
    filletMode.active = false;
    filletMode.isDragging = false;
    filletMode.cleanup = null;
    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';
    filletMode.lastValidTessellation = null;
    filletMode.handleDir = null;
    filletMode.screenAxisDir = null;
    clearBodyPreview();
    makeDimensionNotClickable();
    hideDimensions();
    hideInput();
}

export function isFilletModeActive() {
    return filletMode.active;
}
