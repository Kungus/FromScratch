/**
 * Context Menu Builder — Constructs context menu items based on hover/selection state.
 * Separated from main.js to keep menu logic in one place.
 */

import { getSelection, getBodyMultiSelection, clearBodySelection, getBodySelection, removeBody, getBodies, removeSketch } from '../core/state.js';
import { removeSketchElement, setSelectedElement } from '../render/sketchRender.js';
import { pushUndoSnapshot } from '../core/undoRedo.js';
import { removeBodyMesh, getBodyGroup } from '../render/bodyRender.js';
import { updateSelectionHighlight } from '../render/selectionHighlight.js';
import { enterSketchOnFace } from '../tools/sketchOnFaceTool.js';

let _startFaceExtrudeMode = null;
let _startFilletMode = null;
let _startChamferMode = null;
let _startBooleanMode = null;
let _showMoveGizmo = null;

/**
 * One-time init: inject mode-starting functions to avoid circular imports.
 */
export function initContextMenuBuilder({ startFaceExtrudeMode, startFilletMode, startChamferMode, startBooleanMode, showMoveGizmo }) {
    _startFaceExtrudeMode = startFaceExtrudeMode;
    _startFilletMode = startFilletMode;
    _startChamferMode = startChamferMode;
    _startBooleanMode = startBooleanMode;
    _showMoveGizmo = showMoveGizmo;
}

/**
 * Build context menu items based on what's under the cursor.
 * @param {Object} target - The hovered/selected element { type, bodyId, subElementIndex, subElementData }
 * @param {HTMLElement} containerEl - The canvas container
 * @returns {Array} Menu items
 */
export function buildContextMenuItems(target, containerEl) {
    const items = [];

    // Check if a sketch is selected (for Extrude option)
    const selectedSketches = getSelection();
    const hasSelectedSketch = selectedSketches.length > 0;

    if (hasSelectedSketch) {
        items.push({
            label: 'Extrude',
            icon: '\u2B06',
            shortcut: 'E',
            action: () => {
                window.dispatchEvent(new CustomEvent('fromscratch:settool', { detail: { tool: 'extrude' } }));
            }
        });
        items.push({
            label: 'Delete Sketch',
            icon: '\u2717',
            shortcut: 'Del',
            action: () => {
                pushUndoSnapshot();
                for (const id of selectedSketches) {
                    removeSketch(id);
                    removeSketchElement(id);
                }
                setSelectedElement(null);
            }
        });
        items.push({ separator: true });
    }

    if (target.type === 'face' && target.subElementData) {
        items.push({
            label: 'Extrude Face',
            icon: '\u2B06',
            action: () => {
                const bodyId = target.bodyId;
                const faceIndex = target.subElementData?.faceIndex;
                const normal = target.subElementData?.normal;
                const facePositions = target.subElementData?.facePositions;
                if (faceIndex == null || !normal || !facePositions) {
                    console.warn('No face data for extrusion');
                    return;
                }
                _startFaceExtrudeMode(bodyId, faceIndex, normal, facePositions);
            }
        });
        items.push({
            label: 'Sketch on Face',
            icon: '\u270F',
            action: () => {
                enterSketchOnFace({
                    bodyId: target.bodyId,
                    faceIndex: target.subElementIndex,
                    faceData: target.subElementData
                });
            }
        });
        items.push({ separator: true });
    }

    if (target.type === 'vertex' && target.bodyId) {
        items.push({
            label: 'Move Vertex',
            icon: '\u2726',
            action: () => {
                _showMoveGizmo(target.bodyId, 'vertex', target.subElementIndex, target.subElementData);
            }
        });
        items.push({ separator: true });
    }

    if (target.type === 'edge' && target.bodyId) {
        const multiSel = getBodyMultiSelection();
        const edgeCount = multiSel.length > 0 ? multiSel.length : 1;
        items.push({
            label: edgeCount > 1 ? `Fillet ${edgeCount} Edges` : 'Fillet Edge',
            icon: '\u25EF',
            shortcut: 'F',
            action: () => {
                const bodyId = target.bodyId;
                // Collect edge indices: multi-selection if present, otherwise just the clicked edge
                let edgeIndices;
                if (multiSel.length > 0) {
                    edgeIndices = multiSel
                        .filter(s => s.type === 'edge' && s.bodyId === bodyId && s.subElementData?.edgeIndex != null)
                        .map(s => s.subElementData.edgeIndex);
                } else {
                    const edgeIndex = target.subElementData?.edgeIndex;
                    if (edgeIndex == null) {
                        console.warn('No edge index for fillet');
                        return;
                    }
                    edgeIndices = [edgeIndex];
                }
                if (edgeIndices.length === 0) {
                    console.warn('No valid edge indices for fillet');
                    return;
                }
                _startFilletMode(bodyId, edgeIndices);
            }
        });
        items.push({
            label: edgeCount > 1 ? `Chamfer ${edgeCount} Edges` : 'Chamfer Edge',
            icon: '\u25B3',
            shortcut: 'K',
            action: () => {
                const bodyId = target.bodyId;
                let edgeIndices;
                if (multiSel.length > 0) {
                    edgeIndices = multiSel
                        .filter(s => s.type === 'edge' && s.bodyId === bodyId && s.subElementData?.edgeIndex != null)
                        .map(s => s.subElementData.edgeIndex);
                } else {
                    const edgeIndex = target.subElementData?.edgeIndex;
                    if (edgeIndex == null) {
                        console.warn('No edge index for chamfer');
                        return;
                    }
                    edgeIndices = [edgeIndex];
                }
                if (edgeIndices.length === 0) {
                    console.warn('No valid edge indices for chamfer');
                    return;
                }
                _startChamferMode(bodyId, edgeIndices);
            }
        });
        items.push({
            label: 'Move Edge',
            icon: '\u2725',
            action: () => {
                _showMoveGizmo(target.bodyId, 'edge', target.subElementIndex, target.subElementData);
            }
        });
        items.push({ separator: true });
    }

    if (target.bodyId && getBodies().length >= 2) {
        items.push({
            label: 'Subtract...',
            icon: '\u2296',
            action: () => {
                _startBooleanMode(target.bodyId, 'subtract');
            }
        });
        items.push({
            label: 'Union with...',
            icon: '\u2295',
            action: () => {
                _startBooleanMode(target.bodyId, 'union');
            }
        });
        items.push({ separator: true });
    }

    if (target.bodyId) {
        items.push({
            label: 'Move',
            icon: '\u2725',
            action: () => {
                _showMoveGizmo(target.bodyId, 'body', null, null);
            }
        });
        items.push({
            label: 'Delete Body',
            icon: '\u2717',
            shortcut: 'Del',
            action: () => {
                pushUndoSnapshot();
                const bodyId = target.bodyId;
                clearBodySelection();
                removeBodyMesh(bodyId);
                removeBody(bodyId);
                updateSelectionHighlight(getBodySelection(), getBodyGroup());
            }
        });
    }

    // Always-available tool items
    if (items.length > 0) {
        items.push({ separator: true });
    }
    items.push({
        label: 'Select',
        icon: '\u25E2',
        shortcut: 'V',
        action: () => {
            window.dispatchEvent(new CustomEvent('fromscratch:settool', { detail: { tool: 'select' } }));
        }
    });
    items.push({
        label: 'Draw Rectangle',
        icon: '\u25AD',
        shortcut: 'R',
        action: () => {
            window.dispatchEvent(new CustomEvent('fromscratch:settool', { detail: { tool: 'rectangle' } }));
        }
    });
    items.push({
        label: 'Draw Circle',
        icon: '\u25CB',
        shortcut: 'C',
        action: () => {
            window.dispatchEvent(new CustomEvent('fromscratch:settool', { detail: { tool: 'circle' } }));
        }
    });

    return items;
}
