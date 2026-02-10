/**
 * Context Widget — Floating action panel that appears near selected sub-elements.
 * Shows the most relevant actions for the selected element type (face, edge, vertex, body).
 * Complements the right-click context menu as a fast-access path.
 */

import * as THREE from 'three';
import { subscribe, getBodySelection, getBodyById, getBodies, getBodyMultiSelection, removeBody, clearBodySelection, getSketches } from '../core/state.js';
import { getCamera } from '../input/camera.js';
import { pushUndoSnapshot } from '../core/undoRedo.js';
import { removeBodyMesh, getBodyGroup } from '../render/bodyRender.js';
import { updateSelectionHighlight } from '../render/selectionHighlight.js';
import { enterSketchOnFace } from '../tools/sketchOnFaceTool.js';

let _el = null;           // The widget DOM element
let _container = null;     // The canvas container
let _deps = {};            // Injected mode-starting functions
let _gizmoVisible = false; // Suppress widget while gizmo is shown

/**
 * One-time init: create DOM, subscribe to state, listen for mode start events.
 * @param {HTMLElement} container - The app container (parent for the widget)
 * @param {Object} deps - Injected mode-starting functions
 */
export function initContextWidget(container, deps) {
    _container = document.getElementById('canvas-container');
    _deps = deps;

    // Create widget element
    _el = document.createElement('div');
    _el.className = 'context-widget';
    container.appendChild(_el);

    // Subscribe to body selection changes
    subscribe((state, changedPath) => {
        if (changedPath === 'interaction.bodySelection') {
            rebuildWidget(state.interaction.bodySelection);
        }
    });

    // Hide when any interactive mode starts
    window.addEventListener('fromscratch:modestart', hideWidget);

    // Hide and suppress while gizmo is visible
    window.addEventListener('fromscratch:gizmoshow', () => {
        _gizmoVisible = true;
        hideWidget();
    });
    window.addEventListener('fromscratch:gizmohide', () => {
        _gizmoVisible = false;
    });

    // Hide when tool changes (user switches to rect/circle/extrude tool)
    window.addEventListener('fromscratch:settool', hideWidget);
}

/**
 * Hide the widget and clear its contents.
 */
export function hideWidget() {
    if (!_el) return;
    _el.classList.remove('visible');
}

/**
 * Check if the widget is currently visible.
 */
export function isWidgetVisible() {
    return _el ? _el.classList.contains('visible') : false;
}

/**
 * Rebuild widget contents and position based on the current selection.
 */
function rebuildWidget(selection) {
    if (!_el || !selection || !selection.type) {
        hideWidget();
        return;
    }

    // Don't show widget while gizmo is visible (gizmo owns the interaction)
    if (_gizmoVisible) return;

    const items = buildWidgetItems(selection);
    if (items.length === 0) {
        hideWidget();
        return;
    }

    // Build DOM
    const typeLabel = selection.type.charAt(0).toUpperCase() + selection.type.slice(1);
    _el.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'context-widget-header';
    const label = document.createElement('span');
    label.textContent = typeLabel;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'context-widget-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideWidget();
    });
    header.appendChild(label);
    header.appendChild(closeBtn);
    _el.appendChild(header);

    // Action buttons
    for (const item of items) {
        const btn = document.createElement('div');
        btn.className = 'context-widget-action';

        const icon = document.createElement('span');
        icon.className = 'cw-icon';
        icon.textContent = item.icon || '';

        const lbl = document.createElement('span');
        lbl.className = 'cw-label';
        lbl.textContent = item.label;

        btn.appendChild(icon);
        btn.appendChild(lbl);

        if (item.shortcut) {
            const sc = document.createElement('span');
            sc.className = 'cw-shortcut';
            sc.textContent = item.shortcut;
            btn.appendChild(sc);
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideWidget();
            item.action();
        });

        _el.appendChild(btn);
    }

    // Calculate screen position and show
    const screenPos = calculateScreenPosition(selection);
    if (!screenPos) {
        hideWidget();
        return;
    }
    positionWidget(screenPos);
    _el.classList.add('visible');
}

/**
 * Build the list of action items based on the selection type.
 */
function buildWidgetItems(selection) {
    const items = [];
    const bodyId = selection.bodyId;
    const data = selection.subElementData;

    switch (selection.type) {
        case 'face':
            if (data) {
                // Check if there are sketches drawn on this body
                const faceSketches = getSketches().filter(s => s.parentBodyId === bodyId);
                if (faceSketches.length > 0) {
                    items.push({
                        icon: '\u2B06', label: 'Extrude Sketch',
                        shortcut: 'E',
                        action: () => {
                            // Switch to extrude tool — user clicks on sketch to extrude it
                            window.dispatchEvent(new CustomEvent('fromscratch:settool', { detail: { tool: 'extrude' } }));
                        }
                    });
                }
                items.push({
                    icon: '\u2195', label: 'Push/Pull Face',
                    action: () => {
                        const faceIndex = data.faceIndex;
                        const normal = data.normal;
                        const facePositions = data.facePositions;
                        if (faceIndex == null || !normal || !facePositions) return;
                        _deps.startFaceExtrudeMode(bodyId, faceIndex, normal, facePositions);
                    }
                });
                items.push({
                    icon: '\u270F', label: 'Sketch on Face',
                    action: () => {
                        enterSketchOnFace({
                            bodyId,
                            faceIndex: selection.subElementIndex,
                            faceData: data
                        });
                    }
                });
            }
            break;

        case 'edge':
            if (data) {
                const multiSel = getBodyMultiSelection();
                const edgeCount = multiSel.length > 0 ? multiSel.length : 1;
                let edgeIndices;
                if (multiSel.length > 0) {
                    edgeIndices = multiSel
                        .filter(s => s.type === 'edge' && s.bodyId === bodyId && s.subElementData?.edgeIndex != null)
                        .map(s => s.subElementData.edgeIndex);
                } else {
                    edgeIndices = data.edgeIndex != null ? [data.edgeIndex] : [];
                }
                if (edgeIndices.length > 0) {
                    items.push({
                        icon: '\u2725', label: 'Move Edge',
                        action: () => {
                            _deps.showMoveGizmo(bodyId, 'edge', selection.subElementIndex, data);
                        }
                    });
                    // Compute edge midpoint for spatial label positioning
                    const sv = data.startVertex, ev = data.endVertex;
                    const edgeMidpoint = (sv && ev) ? {
                        x: (sv.x + ev.x) / 2,
                        y: (sv.y + ev.y) / 2,
                        z: (sv.z + ev.z) / 2
                    } : null;
                    items.push({
                        icon: '\u25EF',
                        label: edgeCount > 1 ? `Fillet ${edgeCount}` : 'Fillet',
                        shortcut: 'F',
                        action: () => _deps.startFilletMode(bodyId, edgeIndices, edgeMidpoint)
                    });
                    items.push({
                        icon: '\u25B3',
                        label: edgeCount > 1 ? `Chamfer ${edgeCount}` : 'Chamfer',
                        shortcut: 'K',
                        action: () => _deps.startChamferMode(bodyId, edgeIndices, edgeMidpoint)
                    });
                }
                // Face operations (from the face under this edge)
                if (selection.faceResult?.data) {
                    const fd = selection.faceResult.data;
                    items.push({
                        icon: '\u2195', label: 'Push/Pull Face',
                        action: () => {
                            _deps.startFaceExtrudeMode(bodyId, fd.faceIndex, fd.normal, fd.facePositions);
                        }
                    });
                    items.push({
                        icon: '\u270F', label: 'Sketch on Face',
                        action: () => {
                            enterSketchOnFace({
                                bodyId,
                                faceIndex: selection.faceResult.index,
                                faceData: fd
                            });
                        }
                    });
                }
            }
            break;

        case 'vertex':
            if (data) {
                items.push({
                    icon: '\u2726', label: 'Move Vertex',
                    action: () => {
                        _deps.showMoveGizmo(bodyId, 'vertex', selection.subElementIndex, data);
                    }
                });
                // Face operations (from the face under this vertex)
                if (selection.faceResult?.data) {
                    const fd = selection.faceResult.data;
                    items.push({
                        icon: '\u2195', label: 'Push/Pull Face',
                        action: () => {
                            _deps.startFaceExtrudeMode(bodyId, fd.faceIndex, fd.normal, fd.facePositions);
                        }
                    });
                    items.push({
                        icon: '\u270F', label: 'Sketch on Face',
                        action: () => {
                            enterSketchOnFace({
                                bodyId,
                                faceIndex: selection.faceResult.index,
                                faceData: fd
                            });
                        }
                    });
                }
            }
            break;

        case 'body':
            if (bodyId) {
                items.push({
                    icon: '\u2725', label: 'Move',
                    action: () => _deps.showMoveGizmo(bodyId, 'body', null, null)
                });
                if (getBodies().length >= 2) {
                    items.push({
                        icon: '\u2296', label: 'Subtract...',
                        action: () => _deps.startBooleanMode(bodyId, 'subtract')
                    });
                    items.push({
                        icon: '\u2295', label: 'Union...',
                        action: () => _deps.startBooleanMode(bodyId, 'union')
                    });
                }
                items.push({
                    icon: '\u2717', label: 'Delete', shortcut: 'Del',
                    action: () => {
                        pushUndoSnapshot();
                        clearBodySelection();
                        removeBodyMesh(bodyId);
                        removeBody(bodyId);
                        updateSelectionHighlight(getBodySelection(), getBodyGroup());
                    }
                });
            }
            break;
    }

    return items;
}

/**
 * Calculate the screen position for the widget based on the selected element's 3D position.
 */
function calculateScreenPosition(selection) {
    const camera = getCamera();
    const rect = _container.getBoundingClientRect();
    let worldPos = null;

    if (selection.type === 'face' && selection.subElementData?.allVertices) {
        // Face centroid
        const verts = selection.subElementData.allVertices;
        let cx = 0, cy = 0, cz = 0;
        for (const v of verts) {
            cx += v.x; cy += v.y; cz += v.z;
        }
        worldPos = new THREE.Vector3(cx / verts.length, cy / verts.length, cz / verts.length);
    } else if (selection.type === 'edge' && selection.subElementData) {
        // Edge midpoint
        const sv = selection.subElementData.startVertex;
        const ev = selection.subElementData.endVertex;
        if (sv && ev) {
            worldPos = new THREE.Vector3(
                (sv.x + ev.x) / 2,
                (sv.y + ev.y) / 2,
                (sv.z + ev.z) / 2
            );
        }
    } else if (selection.type === 'vertex' && selection.subElementData?.position) {
        const p = selection.subElementData.position;
        worldPos = new THREE.Vector3(p.x, p.y, p.z);
    } else if (selection.type === 'body' && selection.bodyId) {
        // Body center from tessellation
        const body = getBodyById(selection.bodyId);
        if (body?.tessellation?.positions) {
            const pos = body.tessellation.positions;
            let cx = 0, cy = 0, cz = 0;
            const count = pos.length / 3;
            for (let i = 0; i < count; i++) {
                cx += pos[i * 3];
                cy += pos[i * 3 + 1];
                cz += pos[i * 3 + 2];
            }
            worldPos = new THREE.Vector3(cx / count, cy / count, cz / count);
        }
    }

    if (!worldPos) return null;

    const vec = worldPos.project(camera);
    return {
        x: (vec.x + 1) / 2 * rect.width,
        y: (1 - vec.y) / 2 * rect.height   // flip Y: NDC +1=top, screen 0=top
    };
}

/**
 * Position the widget on screen, clamped to viewport edges.
 */
function positionWidget(screenPos) {
    const rect = _container.getBoundingClientRect();
    const widgetWidth = 160;  // approximate max widget width
    const widgetHeight = _el.children.length * 38 + 24; // rough estimate

    // Offset above the element
    let x = screenPos.x + rect.left - widgetWidth / 2;
    let y = screenPos.y + rect.top - widgetHeight - 20;

    // Clamp to viewport
    const margin = 8;
    x = Math.max(margin, Math.min(x, window.innerWidth - widgetWidth - margin));
    y = Math.max(margin, Math.min(y, window.innerHeight - widgetHeight - margin));

    // If clamped above puts it off-screen, show below instead
    if (y < margin) {
        y = screenPos.y + rect.top + 20;
    }

    _el.style.left = x + 'px';
    _el.style.top = y + 'px';
}
