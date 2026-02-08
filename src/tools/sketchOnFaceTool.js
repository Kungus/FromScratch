/**
 * FromScratch - Sketch on Face Tool (Mode Controller)
 * Orchestrates entering/exiting sketch-on-face mode.
 * NOT a drawing tool — it sets up the sketch plane, orients the camera,
 * shows the face grid, and delegates drawing to rectangle/circle tools.
 */

import {
    setActiveSketchPlane,
    getActiveSketchPlane,
    clearActiveSketchPlane,
    getBodySelection
} from '../core/state.js';
import { createSketchPlaneFromFace } from '../core/sketchPlane.js';
import { orientToFace } from '../input/camera.js';
import { showFaceGrid, hideFaceGrid } from '../render/faceGridRender.js';

// Callbacks set by main.js
let onEnterSketchMode = null;
let onExitSketchMode = null;

/**
 * Set callbacks for sketch-on-face mode transitions.
 * @param {Object} callbacks
 * @param {Function} callbacks.onEnter - Called when entering sketch mode
 * @param {Function} callbacks.onExit - Called when exiting sketch mode
 */
export function setSketchOnFaceCallbacks(callbacks) {
    onEnterSketchMode = callbacks.onEnter || null;
    onExitSketchMode = callbacks.onExit || null;
}

/**
 * Enter sketch-on-face mode.
 * Called when user double-clicks a face in bodySelectTool.
 * @param {Object} faceInfo - { bodyId, faceIndex, faceData: { normal, allVertices, ... } }
 */
export function enterSketchOnFace(faceInfo) {
    const { bodyId, faceData } = faceInfo;

    if (!faceData || !faceData.normal || !faceData.allVertices) {
        console.warn('Cannot enter sketch-on-face: missing face data');
        return;
    }

    // Convert THREE.Vector3 vertices to plain objects if needed
    const vertices = faceData.allVertices.map(v => ({
        x: v.x !== undefined ? v.x : 0,
        y: v.y !== undefined ? v.y : 0,
        z: v.z !== undefined ? v.z : 0
    }));

    const normal = {
        x: faceData.normal.x,
        y: faceData.normal.y,
        z: faceData.normal.z
    };

    // Create the sketch plane from face geometry
    const plane = createSketchPlaneFromFace(vertices, normal);

    // Set the active sketch plane in state
    setActiveSketchPlane(plane, bodyId);

    // Orient camera to look at the face head-on, zoomed to fit
    orientToFace(plane.normal, plane.origin, vertices);

    // Calculate face extent from vertices to size the grid appropriately
    let maxDist = 0;
    for (const v of vertices) {
        const dx = v.x - plane.origin.x;
        const dy = v.y - plane.origin.y;
        const dz = v.z - plane.origin.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > maxDist) maxDist = dist;
    }
    const faceExtent = Math.max(maxDist * 1.5, 1);  // At least 1 unit, with margin

    // Show grid overlay on the face
    const gridSize = 0.5;  // Match global grid size
    showFaceGrid(plane, gridSize, faceExtent);

    console.log('Entered sketch-on-face mode', { bodyId, plane });

    if (onEnterSketchMode) {
        onEnterSketchMode({ bodyId, plane });
    }
}

/**
 * Exit sketch-on-face mode.
 * Called when user presses Escape while in sketch mode.
 */
export function exitSketchOnFace() {
    if (!getActiveSketchPlane()) return;  // Not in sketch mode

    clearActiveSketchPlane();
    hideFaceGrid();

    console.log('Exited sketch-on-face mode');

    if (onExitSketchMode) {
        onExitSketchMode();
    }
}

/**
 * Check if currently in sketch-on-face mode.
 * @returns {boolean}
 */
export function isInSketchOnFaceMode() {
    return getActiveSketchPlane() !== null;
}
