/**
 * FromScratch - Face Grid Renderer
 * Renders a grid overlay on the active sketch plane (a body face).
 * Shows the snappable grid so users know where they can draw.
 */

import * as THREE from 'three';
import { localToWorld } from '../core/sketchPlane.js';

let scene;
let gridGroup;

/**
 * Initialize the face grid renderer.
 * @param {THREE.Scene} sceneRef
 */
export function initFaceGrid(sceneRef) {
    scene = sceneRef;
    gridGroup = new THREE.Group();
    gridGroup.name = 'faceGrid';
    gridGroup.visible = false;
    scene.add(gridGroup);
}

/**
 * Show a grid overlay on a sketch plane.
 * @param {SketchPlane} plane - The sketch plane to overlay the grid on
 * @param {number} gridSize - Grid cell size
 * @param {number} [extent=5] - How far the grid extends from the origin in each direction
 */
export function showFaceGrid(plane, gridSize, extent = 5) {
    // Clear any existing grid lines
    clearGridLines();

    const material = new THREE.LineBasicMaterial({
        color: 0x4a4a6a,
        transparent: true,
        opacity: 0.4,
        depthTest: true
    });

    const boldMaterial = new THREE.LineBasicMaterial({
        color: 0x5a5a8a,
        transparent: true,
        opacity: 0.6,
        depthTest: true
    });

    // Small offset along normal to prevent z-fighting with the body face
    const offset = 0.005;
    const offsetOrigin = {
        x: plane.origin.x + plane.normal.x * offset,
        y: plane.origin.y + plane.normal.y * offset,
        z: plane.origin.z + plane.normal.z * offset
    };

    const offsetPlane = { ...plane, origin: offsetOrigin };

    // Generate grid lines along U axis
    const steps = Math.ceil(extent / gridSize);
    for (let i = -steps; i <= steps; i++) {
        const u = i * gridSize;
        const isBold = i === 0;
        const start = localToWorld(u, -extent, offsetPlane);
        const end = localToWorld(u, extent, offsetPlane);
        addGridLine(start, end, isBold ? boldMaterial : material);
    }

    // Generate grid lines along V axis
    for (let j = -steps; j <= steps; j++) {
        const v = j * gridSize;
        const isBold = j === 0;
        const start = localToWorld(-extent, v, offsetPlane);
        const end = localToWorld(extent, v, offsetPlane);
        addGridLine(start, end, isBold ? boldMaterial : material);
    }

    gridGroup.visible = true;
}

/**
 * Hide and clear the face grid overlay.
 */
export function hideFaceGrid() {
    clearGridLines();
    gridGroup.visible = false;
}

// === Internal helpers ===

function addGridLine(start, end, material) {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        start.x, start.y, start.z,
        end.x, end.y, end.z
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const line = new THREE.Line(geometry, material);
    gridGroup.add(line);
}

function clearGridLines() {
    while (gridGroup.children.length > 0) {
        const child = gridGroup.children[0];
        child.geometry.dispose();
        gridGroup.remove(child);
    }
}
