/**
 * Chamfer Mode — Interactive drag-to-distance chamfer on body edges.
 * Self-contained state machine: registers/cleans up its own event listeners.
 * Mirrors filletMode.js exactly, using chamferEdges instead of filletEdges.
 */

import { getBodyById } from '../core/state.js';
import { getShape } from '../core/occtShapeStore.js';
import { chamferEdges, getEdgeByIndex, getAdjacentFaceNormals } from '../core/occtEngine.js';
import { tessellateShapeForPreview } from '../core/occtTessellate.js';
import { createPreviewScheduler } from '../core/previewScheduler.js';
import { showDimensions, hideDimensions, makeDimensionClickable, makeDimensionNotClickable } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateTessellationPreview, clearBodyPreview, hideBodyMesh, showBodyMesh } from '../render/bodyRender.js';
import { showFilletHandle, hideFilletHandle, getFilletHandleHitMesh, highlightFilletHandle } from '../render/filletHandleRender.js';
import { getCamera } from '../input/camera.js';
import * as THREE from 'three';

let _applyChamfer = null;
const _handleRaycaster = new THREE.Raycaster();

const chamferMode = {
    active: false,
    isDragging: false,
    bodyId: null,
    edgeIndices: null,
    edgeMidpoint: null,
    handleDir: null,
    screenAxisDir: null,
    startScreenX: 0,
    startScreenY: 0,
    distance: 0,
    lastPreviewDistance: -1,
    lastValidTessellation: null,
    lastValidDistance: 0,
    scheduler: null,
    cleanup: null
};

/**
 * One-time init: inject the applyChamfer dependency from bodyOperations.
 */
export function initChamferMode({ applyChamfer }) {
    _applyChamfer = applyChamfer;
}

/**
 * Raycast to the fillet handle's invisible hit mesh (shared with fillet mode).
 * Returns true if the pointer is over the handle.
 */
function raycastHandle(clientX, clientY) {
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
        const tessellation = tessellateShapeForPreview(chamferedShape);
        chamferedShape.delete();

        chamferMode.lastPreviewDistance = distance;
        chamferMode.lastValidTessellation = tessellation;
        chamferMode.lastValidDistance = distance;

        hideBodyMesh(bodyId);
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
 * @param {string} bodyId
 * @param {number[]} edgeIndices
 * @param {{x:number, y:number, z:number}} [edgeMidpoint] - 3D midpoint of the edge for label positioning
 */
export function startChamferMode(bodyId, edgeIndices, edgeMidpoint) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (chamferMode.active) endChamferMode();

    const container = document.getElementById('canvas-container');

    chamferMode.active = true;
    chamferMode.bodyId = bodyId;
    chamferMode.edgeIndices = edgeIndices;
    chamferMode.edgeMidpoint = edgeMidpoint || null;
    chamferMode.distance = 0;
    chamferMode.lastPreviewDistance = -1;
    chamferMode.lastValidTessellation = null;
    chamferMode.lastValidDistance = 0;
    chamferMode.scheduler = createPreviewScheduler((distance) => {
        tryChamferPreview(bodyId, edgeIndices, distance);
    });
    chamferMode.handleDir = null;
    chamferMode.screenAxisDir = null;

    // Compute handle direction from adjacent face normals
    const body = getBodyById(bodyId);
    if (body && body.occtShapeRef) {
        const shape = getShape(body.occtShapeRef);
        if (shape && edgeIndices.length > 0) {
            const normals = getAdjacentFaceNormals(shape, edgeIndices[0]);
            if (normals.length >= 2) {
                let dx = normals[0].x + normals[1].x;
                let dy = normals[0].y + normals[1].y;
                let dz = normals[0].z + normals[1].z;
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (len > 1e-6) {
                    chamferMode.handleDir = { x: dx / len, y: dy / len, z: dz / len };
                }
            } else if (normals.length === 1) {
                chamferMode.handleDir = normals[0];
            }
        }
    }

    if (!chamferMode.handleDir) {
        chamferMode.handleDir = { x: 0, y: 1, z: 0 };
    }

    // Show handle arrow at edge midpoint
    if (edgeMidpoint) {
        showFilletHandle(edgeMidpoint, chamferMode.handleDir);
    }

    // Project handle direction to screen space for drag computation
    if (edgeMidpoint) {
        const camera = getCamera();
        const rect = container.getBoundingClientRect();
        const origin3 = new THREE.Vector3(edgeMidpoint.x, edgeMidpoint.y, edgeMidpoint.z);
        const tip3 = origin3.clone().add(new THREE.Vector3(chamferMode.handleDir.x, chamferMode.handleDir.y, chamferMode.handleDir.z));

        const originNDC = origin3.clone().project(camera);
        const tipNDC = tip3.project(camera);

        const sx = (tipNDC.x - originNDC.x) * rect.width / 2;
        const sy = -(tipNDC.y - originNDC.y) * rect.height / 2;
        const sLen = Math.sqrt(sx * sx + sy * sy);
        chamferMode.screenAxisDir = sLen > 0.001 ? { x: sx / sLen, y: sy / sLen } : { x: 0, y: -1 };

        chamferMode.startScreenX = (originNDC.x * 0.5 + 0.5) * rect.width + rect.left;
        chamferMode.startScreenY = (-originNDC.y * 0.5 + 0.5) * rect.height + rect.top;
    } else {
        chamferMode.screenAxisDir = { x: 0, y: -1 };
        chamferMode.startScreenX = -1;
        chamferMode.startScreenY = -1;
    }

    /** Open dimension input dialog pre-filled with current distance */
    const openDimensionInput = () => {
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
    };

    const onMouseMove = (e) => {
        if (!chamferMode.isDragging) {
            // Hover highlight on handle
            const isOver = raycastHandle(e.clientX, e.clientY);
            highlightFilletHandle(isOver);
            container.style.cursor = isOver ? 'pointer' : '';
            return;
        }

        // Dragging: compute distance from mouse position relative to handle base
        const dx = e.clientX - chamferMode.startScreenX;
        const dy = e.clientY - chamferMode.startScreenY;
        const dot = dx * chamferMode.screenAxisDir.x + dy * chamferMode.screenAxisDir.y;
        const distance = Math.max(0.02, dot * 0.005);
        chamferMode.distance = distance;

        // Position dimension label at handle tip
        const mp = chamferMode.edgeMidpoint;
        const hd = chamferMode.handleDir;
        if (mp && hd) {
            const labelX = mp.x + hd.x * distance;
            const labelY = mp.y + hd.y * distance;
            const labelZ = mp.z + hd.z * distance;
            showDimensions(distance, null, labelX, labelZ, labelY);
        } else {
            showDimensions(distance, null, 0, 0, 0);
        }

        // Make label clickable (once visible)
        makeDimensionClickable(openDimensionInput);

        // RAF-coalesced OCCT chamfer preview
        if (Math.abs(distance - chamferMode.lastPreviewDistance) > 0.02) {
            chamferMode.scheduler.schedule(distance);
        }
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        e.stopImmediatePropagation();
        e.preventDefault();

        const isOnHandle = raycastHandle(e.clientX, e.clientY);
        if (isOnHandle) {
            // Start drag on handle
            chamferMode.isDragging = true;
            container.style.cursor = 'grabbing';
        } else {
            // Click off handle: commit if valid distance, else cancel
            const d = chamferMode.lastValidDistance;
            if (d > 0.01) {
                _applyChamfer(bodyId, edgeIndices, d);
            }
            endChamferMode();
        }
    };

    const onMouseUp = (e) => {
        if (e.button !== 0) return;
        if (!chamferMode.isDragging) return;
        chamferMode.isDragging = false;
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
            endChamferMode();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const d = chamferMode.lastValidDistance;
            if (d > 0.01) {
                _applyChamfer(bodyId, edgeIndices, d);
            }
            endChamferMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);

    chamferMode.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('keydown', onKeyDown);
    };
}

export function endChamferMode() {
    if (!chamferMode.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));
    if (chamferMode.cleanup) chamferMode.cleanup();
    if (chamferMode.scheduler) chamferMode.scheduler.cancel();
    if (chamferMode.bodyId) showBodyMesh(chamferMode.bodyId);
    hideFilletHandle();
    chamferMode.active = false;
    chamferMode.isDragging = false;
    chamferMode.cleanup = null;
    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';
    chamferMode.lastValidTessellation = null;
    chamferMode.handleDir = null;
    chamferMode.screenAxisDir = null;
    clearBodyPreview();
    makeDimensionNotClickable();
    hideDimensions();
    hideInput();
}

export function isChamferModeActive() {
    return chamferMode.active;
}
