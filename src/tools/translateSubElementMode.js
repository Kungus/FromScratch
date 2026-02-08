/**
 * Translate Sub-Element Mode — Interactive drag-to-move for edges and vertices.
 * Self-contained state machine: registers/cleans up its own event listeners.
 *
 * Edge: moves perpendicular to edge direction (constrained).
 * Vertex: free movement on ground plane (XZ), with X/Y/Z axis toggle.
 */

import * as THREE from 'three';
import { getCamera } from '../input/camera.js';
import { getBodyById } from '../core/state.js';
import { getShape } from '../core/occtShapeStore.js';
import { getEdgeEndpoints, getVertexPosition, rebuildShapeWithMovedVertices } from '../core/occtEngine.js';
import { tessellateShape } from '../core/occtTessellate.js';
import { showDimensions, hideDimensions } from '../render/dimensionRender.js';
import { showDimensionInput, hideInput } from '../ui/dimensionInput.js';
import { updateTessellationPreview, clearBodyPreview } from '../render/bodyRender.js';
import { getScene } from '../render/sceneSetup.js';

let _applyTranslateSubElement = null;

const mode = {
    active: false,
    bodyId: null,
    elementType: null,    // 'edge' or 'vertex'
    elementData: null,     // from bodyHitTest
    constraintDir: null,   // for edge: perpendicular direction
    edgeDir: null,         // for edge: edge direction vector
    axisConstraint: null,  // for vertex: null/'x'/'y'/'z'
    startScreenPos: null,
    firstMove: true,
    startWorldX: 0,
    startWorldZ: 0,
    startScreenY: 0,
    delta: { x: 0, y: 0, z: 0 },
    lastPreviewDelta: null,
    lastValidTessellation: null,
    debounceTimer: null,
    axisLine: null,
    cleanup: null
};

// Reusable objects for ground-plane raycasting
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersection = new THREE.Vector3();

/**
 * One-time init: inject the applyTranslateSubElement dependency.
 */
export function initTranslateSubElementMode({ applyTranslateSubElement }) {
    _applyTranslateSubElement = applyTranslateSubElement;
}

/**
 * Raycast from screen coords to the ground plane (Y=0).
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
 * Compute the best perpendicular direction for an edge move.
 * Perpendicular to edge direction, projected into screen space for intuitive drag.
 */
function computeEdgeConstraint(edgeDir, startVertex) {
    const camera = getCamera();
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    const edgeVec = new THREE.Vector3(edgeDir.x, edgeDir.y, edgeDir.z).normalize();

    // Cross edge direction with camera view direction to get a perpendicular in the view plane
    const perp = new THREE.Vector3().crossVectors(edgeVec, camDir).normalize();

    // If the cross product is near zero (edge aligned with view), use world up as fallback
    if (perp.length() < 0.1) {
        perp.crossVectors(edgeVec, new THREE.Vector3(0, 1, 0)).normalize();
    }
    if (perp.length() < 0.1) {
        perp.crossVectors(edgeVec, new THREE.Vector3(1, 0, 0)).normalize();
    }

    return { x: perp.x, y: perp.y, z: perp.z };
}

/**
 * Project a 3D direction to 2D screen-space direction (normalized).
 */
function projectDirToScreen(worldPos, dir, container) {
    const camera = getCamera();
    const rect = container.getBoundingClientRect();

    const origin = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z).project(camera);
    const tip = new THREE.Vector3(
        worldPos.x + dir.x,
        worldPos.y + dir.y,
        worldPos.z + dir.z
    ).project(camera);

    const sx = (tip.x - origin.x) * rect.width / 2;
    const sy = -(tip.y - origin.y) * rect.height / 2;
    const len = Math.sqrt(sx * sx + sy * sy);
    if (len < 0.001) return { x: 1, y: 0 };
    return { x: sx / len, y: sy / len };
}

/**
 * Try to compute a preview of the shape with moved vertices.
 */
function tryRebuildPreview(bodyId, elementType, elementData, delta) {
    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) return;

    const shape = getShape(body.occtShapeRef);
    if (!shape) return;

    try {
        let vertexMoves;

        if (elementType === 'edge') {
            const endpoints = getEdgeEndpoints(shape, elementData.edgeIndex);
            if (!endpoints) return;
            vertexMoves = [
                {
                    from: endpoints.startVertex,
                    to: {
                        x: endpoints.startVertex.x + delta.x,
                        y: endpoints.startVertex.y + delta.y,
                        z: endpoints.startVertex.z + delta.z
                    }
                },
                {
                    from: endpoints.endVertex,
                    to: {
                        x: endpoints.endVertex.x + delta.x,
                        y: endpoints.endVertex.y + delta.y,
                        z: endpoints.endVertex.z + delta.z
                    }
                }
            ];
        } else {
            const pos = getVertexPosition(shape, elementData.vertexIndex);
            if (!pos) return;
            vertexMoves = [
                {
                    from: pos,
                    to: {
                        x: pos.x + delta.x,
                        y: pos.y + delta.y,
                        z: pos.z + delta.z
                    }
                }
            ];
        }

        const newShape = rebuildShapeWithMovedVertices(shape, vertexMoves);
        const tessellation = tessellateShape(newShape);
        newShape.delete();

        mode.lastPreviewDelta = { ...delta };
        mode.lastValidTessellation = tessellation;

        updateTessellationPreview(tessellation);
    } catch (e) {
        console.log('Translate preview error:', e.message || e);
    }
}

/**
 * Start interactive translate sub-element mode.
 * @param {string} bodyId - The body
 * @param {'edge'|'vertex'} elementType
 * @param {Object} elementData - From bodyHitTest
 */
export function startTranslateSubElementMode(bodyId, elementType, elementData) {
    window.dispatchEvent(new CustomEvent('fromscratch:modestart'));
    if (mode.active) endTranslateSubElementMode();

    const container = document.getElementById('canvas-container');

    mode.active = true;
    mode.bodyId = bodyId;
    mode.elementType = elementType;
    mode.elementData = elementData;
    mode.firstMove = true;
    mode.axisConstraint = null;
    mode.delta = { x: 0, y: 0, z: 0 };
    mode.lastPreviewDelta = null;
    mode.lastValidTessellation = null;
    mode.debounceTimer = null;
    mode.constraintDir = null;
    mode.edgeDir = null;

    // For edge mode: precompute constraint direction
    if (elementType === 'edge' && elementData.startVertex && elementData.endVertex) {
        const sv = elementData.startVertex;
        const ev = elementData.endVertex;
        const edgeDir = {
            x: ev.x - sv.x,
            y: ev.y - sv.y,
            z: ev.z - sv.z
        };
        const len = Math.sqrt(edgeDir.x ** 2 + edgeDir.y ** 2 + edgeDir.z ** 2);
        if (len > 1e-10) {
            edgeDir.x /= len;
            edgeDir.y /= len;
            edgeDir.z /= len;
        }
        mode.edgeDir = edgeDir;
        const midpoint = {
            x: (sv.x + ev.x) / 2,
            y: (sv.y + ev.y) / 2,
            z: (sv.z + ev.z) / 2
        };
        mode.constraintDir = computeEdgeConstraint(edgeDir, midpoint);
    }

    container.style.cursor = 'move';

    // Status banner
    const statusEl = document.createElement('div');
    statusEl.id = 'translate-subelement-status';
    const typeLabel = elementType === 'edge' ? 'Edge' : 'Vertex';
    const axisHint = elementType === 'vertex' ? ' | X/Y/Z constrain axis' : '';
    statusEl.textContent = `Move ${typeLabel}: drag to reposition${axisHint} | D exact | Esc cancel`;
    statusEl.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:6px;font-size:14px;z-index:1000;pointer-events:none;';
    document.body.appendChild(statusEl);

    const onMouseMove = (e) => {
        if (mode.firstMove) {
            // Capture start position on first move
            const wp = groundRaycast(e.clientX, e.clientY, container);
            if (wp) {
                mode.startWorldX = wp.x;
                mode.startWorldZ = wp.z;
            }
            mode.startScreenPos = { x: e.clientX, y: e.clientY };
            mode.startScreenY = e.clientY;
            mode.firstMove = false;
            return;
        }

        let dx = 0, dy = 0, dz = 0;

        if (elementType === 'edge' && mode.constraintDir) {
            // Edge mode: project screen movement onto constraint direction
            const sv = elementData.startVertex;
            const ev = elementData.endVertex;
            const midpoint = {
                x: (sv.x + ev.x) / 2,
                y: (sv.y + ev.y) / 2,
                z: (sv.z + ev.z) / 2
            };

            const screenDir = projectDirToScreen(midpoint, mode.constraintDir, container);
            const screenDx = e.clientX - mode.startScreenPos.x;
            const screenDy = e.clientY - mode.startScreenPos.y;

            // Dot product of screen movement with projected constraint direction
            const dot = screenDx * screenDir.x + screenDy * screenDir.y;

            // Scale: convert pixels to world units (approximate)
            const camera = getCamera();
            const rect = container.getBoundingClientRect();
            const camDist = camera.position.distanceTo(
                new THREE.Vector3(midpoint.x, midpoint.y, midpoint.z)
            );
            const scale = camDist / rect.height * 2;
            const worldDist = dot * scale;

            dx = mode.constraintDir.x * worldDist;
            dy = mode.constraintDir.y * worldDist;
            dz = mode.constraintDir.z * worldDist;
        } else {
            // Vertex mode: free XZ movement (like moveBodyMode)
            const wp = groundRaycast(e.clientX, e.clientY, container);
            let rawDX = 0, rawDY = 0, rawDZ = 0;
            if (wp) {
                rawDX = wp.x - mode.startWorldX;
                rawDZ = wp.z - mode.startWorldZ;
            }

            // Y from screen-space
            const pos = elementData.position || { x: 0, y: 0, z: 0 };
            const camera = getCamera();
            const camDist = camera.position.distanceTo(
                new THREE.Vector3(pos.x, pos.y, pos.z)
            );
            const rect = container.getBoundingClientRect();
            rawDY = -(e.clientY - mode.startScreenY) * (camDist / rect.height);

            // Apply axis constraint
            switch (mode.axisConstraint) {
                case 'x': dx = rawDX; break;
                case 'y': dy = rawDY; break;
                case 'z': dz = rawDZ; break;
                default: dx = rawDX; dz = rawDZ; break;
            }
        }

        mode.delta = { x: dx, y: dy, z: dz };

        // Show dimension label
        const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (totalDist > 0.001) {
            showDimensions(parseFloat(totalDist.toFixed(2)), null, 0, 0, 0);
        } else {
            hideDimensions();
        }

        // Debounced OCCT preview
        const prevDelta = mode.lastPreviewDelta;
        const deltaDiff = prevDelta
            ? Math.abs(dx - prevDelta.x) + Math.abs(dy - prevDelta.y) + Math.abs(dz - prevDelta.z)
            : totalDist;

        if (deltaDiff > 0.02) {
            if (mode.debounceTimer) clearTimeout(mode.debounceTimer);
            mode.debounceTimer = setTimeout(() => {
                tryRebuildPreview(bodyId, elementType, elementData, mode.delta);
            }, 100);
        }

        // Update axis line (vertex mode only)
        if (elementType === 'vertex') {
            updateAxisLine();
        }
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        e.stopImmediatePropagation();
        e.preventDefault();

        const { x: dx, y: dy, z: dz } = mode.delta;
        const mag = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);

        if (mag > 0.01) {
            _applyTranslateSubElement(bodyId, elementType, elementData, mode.delta);
        }
        endTranslateSubElementMode();
    };

    const onKeyDown = (e) => {
        if (e.target.tagName === 'INPUT') return;

        const key = e.key.toLowerCase();

        // Axis constraints for vertex mode
        if (elementType === 'vertex' && (key === 'x' || key === 'y' || key === 'z')) {
            e.preventDefault();
            e.stopPropagation();
            if (mode.axisConstraint === key) {
                mode.axisConstraint = null;
            } else {
                mode.axisConstraint = key;
            }
            const statusEl = document.getElementById('translate-subelement-status');
            if (statusEl) {
                const axisLabel = mode.axisConstraint
                    ? `Constrained to ${mode.axisConstraint.toUpperCase()} axis`
                    : 'Free XZ movement';
                statusEl.textContent = `Move Vertex: ${axisLabel} | X/Y/Z constrain | D exact | Esc cancel`;
            }
            updateAxisLine();
        } else if (key === 'd') {
            e.preventDefault();
            e.stopPropagation();
            const { x: dx, y: dy, z: dz } = mode.delta;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const initialVal = dist > 0.01 ? dist.toFixed(2).replace(/\.?0+$/, '') : '';

            showDimensionInput(
                (dimensions) => {
                    const val = dimensions.width || dimensions.height || 0;
                    if (Math.abs(val) < 0.001) {
                        endTranslateSubElementMode();
                        return;
                    }

                    // Apply distance along current direction
                    let mx = 0, my = 0, mz = 0;

                    if (elementType === 'edge' && mode.constraintDir) {
                        // Along constraint direction, use sign from current delta
                        const currentDot = dx * mode.constraintDir.x + dy * mode.constraintDir.y + dz * mode.constraintDir.z;
                        const sign = currentDot >= 0 ? 1 : -1;
                        mx = mode.constraintDir.x * val * sign;
                        my = mode.constraintDir.y * val * sign;
                        mz = mode.constraintDir.z * val * sign;
                    } else {
                        // Vertex: along axis constraint or current direction
                        const constraint = mode.axisConstraint;
                        if (constraint === 'x') {
                            mx = dx >= 0 ? val : -val;
                        } else if (constraint === 'y') {
                            my = dy >= 0 ? val : -val;
                        } else if (constraint === 'z') {
                            mz = dz >= 0 ? val : -val;
                        } else {
                            const len = Math.sqrt(dx * dx + dz * dz);
                            if (len > 0.001) {
                                mx = (dx / len) * val;
                                mz = (dz / len) * val;
                            } else {
                                mx = val;
                            }
                        }
                    }

                    _applyTranslateSubElement(bodyId, elementType, elementData, { x: mx, y: my, z: mz });
                    endTranslateSubElementMode();
                },
                () => { endTranslateSubElementMode(); },
                initialVal
            );
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            endTranslateSubElementMode();
        }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);

    mode.cleanup = () => {
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('keydown', onKeyDown);
    };
}

/**
 * Update or remove the axis constraint line visual (vertex mode only).
 */
function updateAxisLine() {
    const scene = getScene();

    // Remove old line
    if (mode.axisLine) {
        scene.remove(mode.axisLine);
        mode.axisLine.geometry.dispose();
        mode.axisLine.material.dispose();
        mode.axisLine = null;
    }

    if (!mode.axisConstraint || !mode.active || mode.elementType !== 'vertex') return;

    const pos = mode.elementData.position || { x: 0, y: 0, z: 0 };
    const colors = { x: 0xff4444, y: 0x44ff44, z: 0x4444ff };
    const directions = {
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1)
    };

    const color = colors[mode.axisConstraint];
    const dir = directions[mode.axisConstraint];
    const extent = 20;
    const center = new THREE.Vector3(pos.x, pos.y, pos.z);

    const points = [
        center.clone().addScaledVector(dir, -extent),
        center.clone().addScaledVector(dir, extent)
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false, transparent: true, opacity: 0.6 });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 999;

    scene.add(line);
    mode.axisLine = line;
}

export function endTranslateSubElementMode() {
    if (!mode.active) return;
    window.dispatchEvent(new CustomEvent('fromscratch:modeend'));

    if (mode.cleanup) mode.cleanup();
    if (mode.debounceTimer) clearTimeout(mode.debounceTimer);

    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';

    const statusEl = document.getElementById('translate-subelement-status');
    if (statusEl) statusEl.remove();

    // Remove axis line
    if (mode.axisLine) {
        const scene = getScene();
        scene.remove(mode.axisLine);
        mode.axisLine.geometry.dispose();
        mode.axisLine.material.dispose();
        mode.axisLine = null;
    }

    clearBodyPreview();
    hideDimensions();
    hideInput();

    mode.active = false;
    mode.bodyId = null;
    mode.elementType = null;
    mode.elementData = null;
    mode.constraintDir = null;
    mode.edgeDir = null;
    mode.axisConstraint = null;
    mode.delta = { x: 0, y: 0, z: 0 };
    mode.lastPreviewDelta = null;
    mode.lastValidTessellation = null;
    mode.cleanup = null;
}

export function isTranslateSubElementModeActive() {
    return mode.active;
}
