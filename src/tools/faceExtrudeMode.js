/**
 * Face Extrude Mode — Interactive drag-to-extrude on a body face.
 * Self-contained state machine: registers/cleans up its own event listeners.
 */

import * as THREE from 'three';
import { getCamera } from '../input/camera.js';
import { showDimensions, hideDimensions } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateFaceExtrudePreview, clearBodyPreview } from '../render/bodyRender.js';

let _applyFaceExtrusion = null;

const faceExtrudeMode = {
    active: false,
    bodyId: null,
    faceIndex: null,
    normal: null,
    facePositions: null,
    faceCenterWorld: null,
    faceCenterScreen: null,
    normalScreenDir: null,
    height: 0,
    cleanup: null
};

/**
 * One-time init: inject the applyFaceExtrusion dependency from bodyOperations.
 */
export function initFaceExtrudeMode({ applyFaceExtrusion }) {
    _applyFaceExtrusion = applyFaceExtrusion;
}

/**
 * Start interactive face extrude mode: drag to set height, click to commit.
 */
export function startFaceExtrudeMode(bodyId, faceIndex, normal, facePositions) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (faceExtrudeMode.active) endFaceExtrudeMode();

    const camera = getCamera();
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();

    // Compute face center in world space
    const vertCount = facePositions.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < vertCount; i++) {
        cx += facePositions[i * 3];
        cy += facePositions[i * 3 + 1];
        cz += facePositions[i * 3 + 2];
    }
    cx /= vertCount; cy /= vertCount; cz /= vertCount;

    // Project normal to screen direction (same algorithm as extrudeTool.js)
    const p0 = new THREE.Vector3(cx, cy, cz);
    const p1 = new THREE.Vector3(cx + normal.x, cy + normal.y, cz + normal.z);
    const p0s = p0.clone().project(camera);
    const p1s = p1.clone().project(camera);
    let dx = p1s.x - p0s.x;
    let dy = p1s.y - p0s.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) { dx = 0; dy = 1; } else { dx /= len; dy /= len; }

    // Project face center to screen for reference
    const centerScreen = p0.clone().project(camera);
    const screenRefX = (centerScreen.x + 1) / 2 * rect.width;
    const screenRefY = (-centerScreen.y + 1) / 2 * rect.height;

    faceExtrudeMode.active = true;
    faceExtrudeMode.bodyId = bodyId;
    faceExtrudeMode.faceIndex = faceIndex;
    faceExtrudeMode.normal = normal;
    faceExtrudeMode.facePositions = facePositions;
    faceExtrudeMode.faceCenterWorld = { x: cx, y: cy, z: cz };
    faceExtrudeMode.faceCenterScreen = { x: screenRefX, y: screenRefY };
    faceExtrudeMode.normalScreenDir = { dx, dy };
    faceExtrudeMode.height = 0;

    // Event listeners
    const onMouseMove = (e) => {
        const halfWidth = rect.width / 2;
        const halfHeight = rect.height / 2;

        // NDC delta from screen reference
        const ndcDX = (e.clientX - rect.left - faceExtrudeMode.faceCenterScreen.x) / halfWidth;
        const ndcDY = -(e.clientY - rect.top - faceExtrudeMode.faceCenterScreen.y) / halfHeight;

        const dir = faceExtrudeMode.normalScreenDir;
        const projectedDist = ndcDX * dir.dx + ndcDY * dir.dy;

        // Scale by camera distance for perspective-correct feel
        const camPos = camera.position;
        const fc = faceExtrudeMode.faceCenterWorld;
        const cameraDist = Math.sqrt(
            (camPos.x - fc.x) ** 2 + (camPos.y - fc.y) ** 2 + (camPos.z - fc.z) ** 2
        );

        const height = projectedDist * cameraDist * 0.5;
        faceExtrudeMode.height = height;

        updateFaceExtrudePreview({
            facePositions: faceExtrudeMode.facePositions,
            normal: faceExtrudeMode.normal,
            height
        });

        // Show dimension label at face center offset half height along normal
        const n = faceExtrudeMode.normal;
        const labelX = fc.x + n.x * height / 2;
        const labelY = fc.y + n.y * height / 2;
        const labelZ = fc.z + n.z * height / 2;
        showDimensions(Math.abs(height), null, labelX, labelZ, labelY);
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return; // Left click only
        e.preventDefault();
        e.stopPropagation();
        const h = faceExtrudeMode.height;
        if (Math.abs(h) > 0.05) {
            _applyFaceExtrusion(
                faceExtrudeMode.bodyId,
                faceExtrudeMode.faceIndex,
                faceExtrudeMode.normal,
                h
            );
        }
        endFaceExtrudeMode();
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.key.toLowerCase() === 'd') {
            e.preventDefault();
            e.stopPropagation();
            const currentH = faceExtrudeMode.height;
            const hStr = currentH > 0.01 ? currentH.toFixed(2).replace(/\.?0+$/, '') : '1';
            showDimensionInput(
                (dimensions) => {
                    const h = dimensions.width || dimensions.height || 1;
                    _applyFaceExtrusion(
                        faceExtrudeMode.bodyId,
                        faceExtrudeMode.faceIndex,
                        faceExtrudeMode.normal,
                        h
                    );
                    endFaceExtrudeMode();
                },
                () => { endFaceExtrudeMode(); },
                hStr
            );
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endFaceExtrudeMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);

    faceExtrudeMode.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('keydown', onKeyDown);
    };
}

export function endFaceExtrudeMode() {
    if (!faceExtrudeMode.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));
    if (faceExtrudeMode.cleanup) faceExtrudeMode.cleanup();
    faceExtrudeMode.active = false;
    faceExtrudeMode.cleanup = null;
    clearBodyPreview();
    hideDimensions();
    hideInput();
}

export function isFaceExtrudeModeActive() {
    return faceExtrudeMode.active;
}
