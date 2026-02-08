/**
 * Gizmo Mode — Interactive drag-on-axis state machine.
 * Activated when user mousedowns on a gizmo arrow.
 * Handles body, vertex, edge, and face translation along the constrained axis.
 */

import * as THREE from 'three';
import { getCamera } from '../input/camera.js';
import { getBodyById } from '../core/state.js';
import { getShape } from '../core/occtShapeStore.js';
import { getEdgeEndpoints, getVertexPosition, getFaceVertexPositions, rebuildShapeWithMovedVertices } from '../core/occtEngine.js';
import { tessellateShape } from '../core/occtTessellate.js';
import { showDimensions, hideDimensions } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateTessellationPreview, updateFaceExtrudePreview, clearBodyPreview, getBodyGroup } from '../render/bodyRender.js';
import { snapToGrid } from '../core/snap.js';

let _applyMoveBody = null;
let _applyTranslateSubElement = null;
let _applyTranslateFace = null;
let _applyFaceExtrusion = null;

const mode = {
    active: false,
    axis: null,            // 'x', 'y', or 'z'
    selectionType: null,   // 'body', 'face', 'edge', 'vertex'
    bodyId: null,
    elementData: null,
    faceIsNormalAligned: false,
    startScreenPos: null,
    screenAxisDir: null,   // projected axis direction in screen space
    worldOrigin: null,     // gizmo center in world
    delta: 0,              // scalar distance along axis
    lastPreviewDelta: null,
    debounceTimer: null,
    initialGroupPos: null, // for body move preview
    cleanup: null
};

const AXIS_DIRS = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1)
};

/**
 * One-time init: inject dependencies.
 */
export function initGizmoMode({ applyMoveBody, applyTranslateSubElement, applyTranslateFace, applyFaceExtrusion }) {
    _applyMoveBody = applyMoveBody;
    _applyTranslateSubElement = applyTranslateSubElement;
    _applyTranslateFace = applyTranslateFace;
    _applyFaceExtrusion = applyFaceExtrusion;
}

/**
 * Project a 3D axis direction to 2D screen-space direction (normalized).
 */
function projectAxisToScreen(worldPos, axisDir, container) {
    const camera = getCamera();
    const rect = container.getBoundingClientRect();

    const origin = worldPos.clone().project(camera);
    const tip = worldPos.clone().add(axisDir).project(camera);

    const sx = (tip.x - origin.x) * rect.width / 2;
    const sy = -(tip.y - origin.y) * rect.height / 2;
    const len = Math.sqrt(sx * sx + sy * sy);
    if (len < 0.001) return { x: 1, y: 0 };
    return { x: sx / len, y: sy / len };
}

/**
 * Build the delta vector from the scalar distance along the axis.
 */
function getDeltaVec() {
    const d = mode.delta;
    const dir = AXIS_DIRS[mode.axis];
    return { x: dir.x * d, y: dir.y * d, z: dir.z * d };
}

/**
 * Try to rebuild OCCT shape preview for sub-element moves.
 */
function tryRebuildPreview() {
    const body = getBodyById(mode.bodyId);
    if (!body || !body.occtShapeRef) return;
    const shape = getShape(body.occtShapeRef);
    if (!shape) return;

    const delta = getDeltaVec();
    console.log(`Gizmo preview: type=${mode.selectionType}, delta=(${delta.x.toFixed(3)},${delta.y.toFixed(3)},${delta.z.toFixed(3)})`);

    try {
        let vertexMoves;

        if (mode.selectionType === 'edge') {
            const endpoints = getEdgeEndpoints(shape, mode.elementData.edgeIndex);
            if (!endpoints) return;
            vertexMoves = [
                { from: endpoints.startVertex, to: { x: endpoints.startVertex.x + delta.x, y: endpoints.startVertex.y + delta.y, z: endpoints.startVertex.z + delta.z } },
                { from: endpoints.endVertex, to: { x: endpoints.endVertex.x + delta.x, y: endpoints.endVertex.y + delta.y, z: endpoints.endVertex.z + delta.z } }
            ];
        } else if (mode.selectionType === 'vertex') {
            const pos = getVertexPosition(shape, mode.elementData.vertexIndex);
            if (!pos) return;
            vertexMoves = [
                { from: pos, to: { x: pos.x + delta.x, y: pos.y + delta.y, z: pos.z + delta.z } }
            ];
        } else if (mode.selectionType === 'face' && !mode.faceIsNormalAligned) {
            const faceVerts = getFaceVertexPositions(shape, mode.elementData.faceIndex);
            if (!faceVerts || faceVerts.length === 0) return;
            vertexMoves = faceVerts.map(v => ({
                from: v,
                to: { x: v.x + delta.x, y: v.y + delta.y, z: v.z + delta.z }
            }));
        } else {
            return;
        }

        const newShape = rebuildShapeWithMovedVertices(shape, vertexMoves);
        const tessellation = tessellateShape(newShape);
        newShape.delete();

        mode.lastPreviewDelta = mode.delta;
        updateTessellationPreview(tessellation);
    } catch (e) {
        console.warn('Gizmo preview error:', e.message || e);
        // Show error in status banner so user knows why preview isn't updating
        const statusEl = document.getElementById('gizmo-mode-status');
        if (statusEl) {
            statusEl.textContent = `Cannot move: ${e.message || 'OCCT error'} | Esc cancel`;
            statusEl.style.background = 'rgba(200,50,50,0.9)';
        }
    }
}

/**
 * Start gizmo drag mode.
 * @param {string} axis - 'x', 'y', or 'z'
 * @param {Object} selectionInfo - { type, bodyId, subElementIndex, subElementData, worldCenter }
 */
export function startGizmoMode(axis, selectionInfo) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (mode.active) endGizmoMode();

    const container = document.getElementById('canvas-container');
    const camera = getCamera();

    mode.active = true;
    mode.axis = axis;
    mode.selectionType = selectionInfo.type;
    mode.bodyId = selectionInfo.bodyId;
    // Merge subElementData with subElementIndex.
    // Vertex selection stores vertexIndex in subElementIndex (not in subElementData),
    // so we must carry it into elementData for getVertexPosition() calls.
    mode.elementData = { ...selectionInfo.subElementData };
    if (selectionInfo.type === 'vertex' && selectionInfo.subElementIndex != null) {
        mode.elementData.vertexIndex = selectionInfo.subElementIndex;
    }
    mode.worldOrigin = selectionInfo.worldCenter.clone();
    mode.delta = 0;
    mode.lastPreviewDelta = null;
    mode.debounceTimer = null;
    mode.initialGroupPos = null;

    // Check if face normal aligns with the drag axis (for face extrusion delegation)
    mode.faceIsNormalAligned = false;
    if (mode.selectionType === 'face' && mode.elementData.normal) {
        const n = mode.elementData.normal;
        const axisDir = AXIS_DIRS[axis];
        const dot = Math.abs(n.x * axisDir.x + n.y * axisDir.y + n.z * axisDir.z);
        mode.faceIsNormalAligned = dot > 0.9;
    }

    // For body move: cache initial mesh position for cheap preview
    if (mode.selectionType === 'body') {
        const bodyGroup = getBodyGroup();
        const meshGroup = bodyGroup.getObjectByName(mode.bodyId);
        if (meshGroup) {
            mode.initialGroupPos = {
                x: meshGroup.position.x,
                y: meshGroup.position.y,
                z: meshGroup.position.z
            };
        }
    }

    // Project axis to screen for dot-product drag
    const axisDir = AXIS_DIRS[axis];
    mode.screenAxisDir = projectAxisToScreen(mode.worldOrigin, axisDir, container);

    container.style.cursor = 'pointer';

    // Status banner
    const statusEl = document.createElement('div');
    statusEl.id = 'gizmo-mode-status';
    const axisLabel = axis.toUpperCase();
    statusEl.textContent = `Drag ${axisLabel}: move along axis | D exact | Esc cancel`;
    statusEl.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:6px;font-size:14px;z-index:1000;pointer-events:none;';
    document.body.appendChild(statusEl);

    // Capture start screen position on first mousemove
    let firstMove = true;
    let startClientX = 0;
    let startClientY = 0;

    const onMouseMove = (e) => {
        if (firstMove) {
            startClientX = e.clientX;
            startClientY = e.clientY;
            firstMove = false;
            return;
        }

        const rect = container.getBoundingClientRect();
        const screenDx = e.clientX - startClientX;
        const screenDy = e.clientY - startClientY;

        // Dot product of screen movement with projected axis direction
        const dot = screenDx * mode.screenAxisDir.x + screenDy * mode.screenAxisDir.y;

        // Scale: convert pixels to world units
        const camDist = camera.position.distanceTo(mode.worldOrigin);
        const scale = camDist / rect.height * 2;
        let worldDist = dot * scale;

        // Grid snap
        const axisDir = AXIS_DIRS[mode.axis];
        const startVal = mode.worldOrigin.x * axisDir.x + mode.worldOrigin.y * axisDir.y + mode.worldOrigin.z * axisDir.z;
        const snapped = snapToGrid(startVal + worldDist, 0);
        worldDist = snapped.x - startVal;

        mode.delta = worldDist;

        // Preview by selection type
        const absDelta = Math.abs(worldDist);

        if (mode.selectionType === 'body' && mode.initialGroupPos) {
            // Cheap mesh move
            const bodyGroup = getBodyGroup();
            const meshGroup = bodyGroup.getObjectByName(mode.bodyId);
            if (meshGroup) {
                const dv = getDeltaVec();
                meshGroup.position.set(
                    mode.initialGroupPos.x + dv.x,
                    mode.initialGroupPos.y + dv.y,
                    mode.initialGroupPos.z + dv.z
                );
            }
        } else if (mode.selectionType === 'face' && mode.faceIsNormalAligned) {
            // Face extrusion preview
            if (absDelta > 0.01 && mode.elementData.facePositions) {
                const sign = Math.sign(
                    mode.elementData.normal.x * AXIS_DIRS[mode.axis].x +
                    mode.elementData.normal.y * AXIS_DIRS[mode.axis].y +
                    mode.elementData.normal.z * AXIS_DIRS[mode.axis].z
                );
                updateFaceExtrudePreview({
                    facePositions: mode.elementData.facePositions,
                    normal: mode.elementData.normal,
                    height: worldDist * sign
                });
            }
        } else {
            // Debounced OCCT rebuild for vertex/edge/face-tangent
            const prevDelta = mode.lastPreviewDelta;
            const deltaDiff = prevDelta != null ? Math.abs(worldDist - prevDelta) : absDelta;
            if (deltaDiff > 0.02) {
                if (mode.debounceTimer) clearTimeout(mode.debounceTimer);
                mode.debounceTimer = setTimeout(() => tryRebuildPreview(), 100);
            }
        }

        // Show dimension label
        if (absDelta > 0.001) {
            const dv = getDeltaVec();
            const labelX = mode.worldOrigin.x + dv.x / 2;
            const labelY = mode.worldOrigin.y + dv.y / 2;
            const labelZ = mode.worldOrigin.z + dv.z / 2;
            showDimensions(parseFloat(absDelta.toFixed(2)), null, labelX, labelZ, labelY);
        } else {
            hideDimensions();
        }
    };

    // Commit on mouseup (user press-holds gizmo arrow, drags, releases to commit).
    // Use document-level listener so release outside the container still commits.
    const onMouseUp = (e) => {
        if (e.button !== 0) return;
        console.log(`Gizmo mouseup: delta=${mode.delta.toFixed(3)}, active=${mode.active}`);
        e.stopImmediatePropagation();
        e.preventDefault();
        commitAndEnd();
    };

    // Also intercept mousedown during gizmo mode to prevent bodySelectTool
    // from processing clicks (e.g. if user clicks without prior drag).
    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        e.stopImmediatePropagation();
        e.preventDefault();
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.key.toLowerCase() === 'd') {
            e.preventDefault();
            e.stopPropagation();
            const absDelta = Math.abs(mode.delta);
            const initialVal = absDelta > 0.01 ? absDelta.toFixed(2).replace(/\.?0+$/, '') : '';

            showDimensionInput(
                (dimensions) => {
                    const val = dimensions.width || dimensions.height || 0;
                    if (Math.abs(val) < 0.001) {
                        endGizmoMode();
                        return;
                    }
                    // Apply along current axis with current direction sign
                    const sign = mode.delta >= 0 ? 1 : -1;
                    mode.delta = val * sign;
                    commitAndEnd();
                },
                () => { endGizmoMode(); },
                initialVal
            );
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endGizmoMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', onKeyDown);

    mode.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('mouseup', onMouseUp, true);
        document.removeEventListener('keydown', onKeyDown);
    };
}

/**
 * Commit the current delta and end mode.
 */
function commitAndEnd() {
    const absDelta = Math.abs(mode.delta);
    if (absDelta < 0.01) {
        endGizmoMode();
        return;
    }

    const dv = getDeltaVec();
    console.log(`Gizmo commit: type=${mode.selectionType}, axis=${mode.axis}, delta=${mode.delta.toFixed(3)}, dv=(${dv.x.toFixed(3)},${dv.y.toFixed(3)},${dv.z.toFixed(3)}), bodyId=${mode.bodyId}, edgeIndex=${mode.elementData?.edgeIndex}, vertexIndex=${mode.elementData?.vertexIndex}`);

    try {
        if (mode.selectionType === 'body') {
            // Reset mesh position before OCCT commit
            if (mode.initialGroupPos) {
                const bodyGroup = getBodyGroup();
                const meshGroup = bodyGroup.getObjectByName(mode.bodyId);
                if (meshGroup) {
                    meshGroup.position.set(
                        mode.initialGroupPos.x,
                        mode.initialGroupPos.y,
                        mode.initialGroupPos.z
                    );
                }
            }
            _applyMoveBody(mode.bodyId, dv.x, dv.y, dv.z);
        } else if (mode.selectionType === 'face' && mode.faceIsNormalAligned) {
            // Face extrusion: compute height along normal
            const n = mode.elementData.normal;
            const height = dv.x * n.x + dv.y * n.y + dv.z * n.z;
            _applyFaceExtrusion(mode.bodyId, mode.elementData.faceIndex, n, height);
        } else if (mode.selectionType === 'face') {
            _applyTranslateFace(mode.bodyId, mode.elementData.faceIndex, dv);
        } else if (mode.selectionType === 'edge') {
            _applyTranslateSubElement(mode.bodyId, 'edge', mode.elementData, dv);
        } else if (mode.selectionType === 'vertex') {
            _applyTranslateSubElement(mode.bodyId, 'vertex', mode.elementData, dv);
        }
        console.log('Gizmo commit succeeded');
    } catch (e) {
        console.error('Gizmo commit failed:', e.message || e);
    }

    endGizmoMode();
}

/**
 * End gizmo mode and clean up.
 */
export function endGizmoMode() {
    if (!mode.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));

    if (mode.cleanup) mode.cleanup();
    if (mode.debounceTimer) clearTimeout(mode.debounceTimer);

    // Reset body mesh position if needed
    if (mode.selectionType === 'body' && mode.initialGroupPos) {
        const bodyGroup = getBodyGroup();
        const meshGroup = bodyGroup.getObjectByName(mode.bodyId);
        if (meshGroup) {
            meshGroup.position.set(
                mode.initialGroupPos.x,
                mode.initialGroupPos.y,
                mode.initialGroupPos.z
            );
        }
    }

    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';

    const statusEl = document.getElementById('gizmo-mode-status');
    if (statusEl) statusEl.remove();

    clearBodyPreview();
    hideDimensions();
    hideInput();

    mode.active = false;
    mode.axis = null;
    mode.selectionType = null;
    mode.bodyId = null;
    mode.elementData = null;
    mode.faceIsNormalAligned = false;
    mode.startScreenPos = null;
    mode.screenAxisDir = null;
    mode.worldOrigin = null;
    mode.delta = 0;
    mode.lastPreviewDelta = null;
    mode.initialGroupPos = null;
    mode.cleanup = null;
}

export function isGizmoModeActive() {
    return mode.active;
}
