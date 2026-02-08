/**
 * Move Body Mode — Interactive drag-to-move on XZ plane with axis constraints.
 * Self-contained state machine: registers/cleans up its own event listeners.
 */

import * as THREE from 'three';
import { getCamera } from '../input/camera.js';
import { getBodyGroup } from '../render/bodyRender.js';
import { showDimensions, hideDimensions } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateSelectionHighlight } from '../render/selectionHighlight.js';
import { getBodySelection, clearBodySelection } from '../core/state.js';
import { getScene } from '../render/sceneSetup.js';
import { snapToGrid } from '../core/snap.js';

let _applyMoveBody = null;

const moveState = {
    active: false,
    bodyId: null,
    startWorldX: 0,
    startWorldZ: 0,
    startScreenY: 0,
    initialGroupPos: { x: 0, y: 0, z: 0 },
    deltaX: 0,
    deltaY: 0,
    deltaZ: 0,
    axisConstraint: null, // null='xz', 'x', 'y', 'z'
    axisLine: null,
    firstMove: true,
    cleanup: null
};

// Reusable objects for ground-plane raycasting
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersection = new THREE.Vector3();

/**
 * One-time init: inject the applyMoveBody dependency from bodyOperations.
 */
export function initMoveBodyMode({ applyMoveBody }) {
    _applyMoveBody = applyMoveBody;
}

/**
 * Raycast from screen coords to the ground plane (Y=0).
 * Returns {x, z} in world space, or null if no intersection.
 */
function groundRaycast(clientX, clientY, container) {
    const rect = container.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const camera = getCamera();
    _raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hit = _raycaster.ray.intersectPlane(_groundPlane, _intersection);
    if (!hit) return null;
    return { x: _intersection.x, z: _intersection.z };
}

/**
 * Start interactive move body mode.
 * @param {string} bodyId - The body to move
 */
export function startMoveBodyMode(bodyId) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (moveState.active) endMoveBodyMode();

    const container = document.getElementById('canvas-container');
    const bodyGroup = getBodyGroup();
    const meshGroup = bodyGroup.getObjectByName(bodyId);
    if (!meshGroup) {
        console.warn('Cannot move: body mesh not found');
        return;
    }

    moveState.active = true;
    moveState.bodyId = bodyId;
    moveState.firstMove = true;
    moveState.axisConstraint = null;
    moveState.deltaX = 0;
    moveState.deltaY = 0;
    moveState.deltaZ = 0;
    moveState.initialGroupPos = {
        x: meshGroup.position.x,
        y: meshGroup.position.y,
        z: meshGroup.position.z
    };

    // Highlight body as selected (cyan)
    clearBodySelection();
    updateSelectionHighlight(
        { type: 'body', bodyId, subElementIndex: null, subElementData: null },
        bodyGroup
    );

    container.style.cursor = 'move';

    // Status banner
    const statusEl = document.createElement('div');
    statusEl.id = 'move-mode-status';
    statusEl.textContent = 'Move: drag to reposition | X/Y/Z constrain axis | D exact | Esc cancel';
    statusEl.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:6px;font-size:14px;z-index:1000;pointer-events:none;';
    document.body.appendChild(statusEl);

    const onMouseMove = (e) => {
        const wp = groundRaycast(e.clientX, e.clientY, container);

        if (moveState.firstMove) {
            // Capture start position on first move
            if (wp) {
                moveState.startWorldX = wp.x;
                moveState.startWorldZ = wp.z;
            }
            moveState.startScreenY = e.clientY;
            moveState.firstMove = false;
            return;
        }

        // Compute raw deltas
        let rawDX = 0, rawDY = 0, rawDZ = 0;
        if (wp) {
            rawDX = wp.x - moveState.startWorldX;
            rawDZ = wp.z - moveState.startWorldZ;
        }

        // Y from screen-space: drag up = positive Y
        const camera = getCamera();
        const ip = moveState.initialGroupPos;
        const camDist = camera.position.distanceTo(
            new THREE.Vector3(ip.x, ip.y, ip.z)
        );
        const rect = container.getBoundingClientRect();
        rawDY = -(e.clientY - moveState.startScreenY) * (camDist / rect.height);

        // Apply axis constraint
        let dx, dy, dz;
        switch (moveState.axisConstraint) {
            case 'x': dx = rawDX; dy = 0; dz = 0; break;
            case 'y': dx = 0; dy = rawDY; dz = 0; break;
            case 'z': dx = 0; dy = 0; dz = rawDZ; break;
            default:  dx = rawDX; dy = 0; dz = rawDZ; break;
        }

        // Grid snap each axis
        const snappedX = snapToGrid(moveState.startWorldX + dx, 0);
        const snappedZ = snapToGrid(0, moveState.startWorldZ + dz);
        const snappedY = snapToGrid(ip.y + dy, 0);
        dx = snappedX.x - moveState.startWorldX;
        dz = snappedZ.z - moveState.startWorldZ;
        dy = snappedY.x - ip.y;

        moveState.deltaX = dx;
        moveState.deltaY = dy;
        moveState.deltaZ = dz;

        // Preview: move mesh group directly (cheap, no OCCT)
        meshGroup.position.set(ip.x + dx, ip.y + dy, ip.z + dz);

        // Show dimension label
        const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (totalDist > 0.001) {
            const labelX = ip.x + dx / 2;
            const labelY = ip.y + dy / 2;
            const labelZ = ip.z + dz / 2;
            showDimensions(parseFloat(totalDist.toFixed(2)), null, labelX, labelZ, labelY);
        } else {
            hideDimensions();
        }

        // Update axis constraint visual
        updateAxisLine();
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        e.stopImmediatePropagation();
        e.preventDefault();

        const { deltaX: dx, deltaY: dy, deltaZ: dz } = moveState;
        const mag = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);

        // Reset mesh position before OCCT commit (OCCT creates new geometry at new position)
        meshGroup.position.set(
            moveState.initialGroupPos.x,
            moveState.initialGroupPos.y,
            moveState.initialGroupPos.z
        );

        if (mag > 0.01) {
            _applyMoveBody(moveState.bodyId, dx, dy, dz);
        }
        endMoveBodyMode();
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        const key = e.key.toLowerCase();

        if (key === 'x' || key === 'y' || key === 'z') {
            e.preventDefault();
            e.stopPropagation();
            // Toggle: same key again → free XZ
            if (moveState.axisConstraint === key) {
                moveState.axisConstraint = null;
            } else {
                moveState.axisConstraint = key;
            }
            // Update status banner text
            const statusEl = document.getElementById('move-mode-status');
            if (statusEl) {
                const axisLabel = moveState.axisConstraint
                    ? `Constrained to ${moveState.axisConstraint.toUpperCase()} axis`
                    : 'Free XZ movement';
                statusEl.textContent = `Move: ${axisLabel} | X/Y/Z constrain | D exact | Esc cancel`;
            }
            updateAxisLine();
        } else if (key === 'd') {
            e.preventDefault();
            e.stopPropagation();
            const { deltaX: dx, deltaY: dy, deltaZ: dz } = moveState;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const initialVal = dist > 0.01 ? dist.toFixed(2).replace(/\.?0+$/, '') : '';

            showDimensionInput(
                (dimensions) => {
                    const val = dimensions.width || dimensions.height || 0;
                    if (Math.abs(val) < 0.001) {
                        endMoveBodyMode();
                        return;
                    }
                    // Apply distance along current constraint axis, or along current delta direction
                    let mx = 0, my = 0, mz = 0;
                    const constraint = moveState.axisConstraint;
                    if (constraint === 'x') {
                        mx = dx >= 0 ? val : -val;
                    } else if (constraint === 'y') {
                        my = dy >= 0 ? val : -val;
                    } else if (constraint === 'z') {
                        mz = dz >= 0 ? val : -val;
                    } else {
                        // Free XZ: use current delta direction, or default to +X
                        const len = Math.sqrt(dx * dx + dz * dz);
                        if (len > 0.001) {
                            mx = (dx / len) * val;
                            mz = (dz / len) * val;
                        } else {
                            mx = val;
                        }
                    }

                    // Reset mesh position before OCCT commit
                    meshGroup.position.set(
                        moveState.initialGroupPos.x,
                        moveState.initialGroupPos.y,
                        moveState.initialGroupPos.z
                    );
                    _applyMoveBody(moveState.bodyId, mx, my, mz);
                    endMoveBodyMode();
                },
                () => { endMoveBodyMode(); },
                initialVal
            );
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endMoveBodyMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);

    moveState.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('keydown', onKeyDown);
    };
}

/**
 * Update or remove the axis constraint line visual.
 */
function updateAxisLine() {
    const scene = getScene();

    // Remove old line
    if (moveState.axisLine) {
        scene.remove(moveState.axisLine);
        moveState.axisLine.geometry.dispose();
        moveState.axisLine.material.dispose();
        moveState.axisLine = null;
    }

    if (!moveState.axisConstraint || !moveState.active) return;

    const ip = moveState.initialGroupPos;
    const colors = { x: 0xff4444, y: 0x44ff44, z: 0x4444ff };
    const directions = {
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1)
    };

    const color = colors[moveState.axisConstraint];
    const dir = directions[moveState.axisConstraint];
    const extent = 20;
    const center = new THREE.Vector3(ip.x, ip.y, ip.z);

    const points = [
        center.clone().addScaledVector(dir, -extent),
        center.clone().addScaledVector(dir, extent)
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false, transparent: true, opacity: 0.6 });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 999;

    scene.add(line);
    moveState.axisLine = line;
}

export function endMoveBodyMode() {
    if (!moveState.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));

    if (moveState.cleanup) moveState.cleanup();

    // Reset mesh position to initial (undo preview if cancelled)
    const bodyGroup = getBodyGroup();
    const meshGroup = bodyGroup.getObjectByName(moveState.bodyId);
    if (meshGroup) {
        meshGroup.position.set(
            moveState.initialGroupPos.x,
            moveState.initialGroupPos.y,
            moveState.initialGroupPos.z
        );
    }

    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';

    const statusEl = document.getElementById('move-mode-status');
    if (statusEl) statusEl.remove();

    // Remove axis line
    if (moveState.axisLine) {
        const scene = getScene();
        scene.remove(moveState.axisLine);
        moveState.axisLine.geometry.dispose();
        moveState.axisLine.material.dispose();
        moveState.axisLine = null;
    }

    clearBodySelection();
    updateSelectionHighlight(getBodySelection(), getBodyGroup());

    hideDimensions();
    hideInput();

    moveState.active = false;
    moveState.bodyId = null;
    moveState.firstMove = true;
    moveState.axisConstraint = null;
    moveState.deltaX = 0;
    moveState.deltaY = 0;
    moveState.deltaZ = 0;
    moveState.cleanup = null;
}

export function isMoveBodyModeActive() {
    return moveState.active;
}
