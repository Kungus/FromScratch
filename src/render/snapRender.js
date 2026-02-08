/**
 * FromScratch - Snap Visualization
 * Renders a visual indicator at the current snap point.
 * Uses sprites so the indicator looks correct from any camera angle.
 */

import * as THREE from 'three';
import { snap, SnapType } from '../core/snap.js';

let scene;
let snapSprite;
let currentSnapType = null;

// Colors for different snap types
const SNAP_COLORS = {
    [SnapType.GRID]: '#4ade80',        // Green
    [SnapType.ENDPOINT]: '#fbbf24',    // Yellow
    [SnapType.MIDPOINT]: '#60a5fa',    // Blue
    [SnapType.CENTER]: '#f472b6',      // Pink
    [SnapType.INTERSECTION]: '#fbbf24' // Yellow
};

// Cache textures to avoid recreating them
const textureCache = {};

/**
 * Create a circular sprite texture (cached)
 */
function getSnapTexture(snapType) {
    if (textureCache[snapType]) {
        return textureCache[snapType];
    }

    const color = SNAP_COLORS[snapType] || SNAP_COLORS[SnapType.GRID];
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Outer ring
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    textureCache[snapType] = texture;
    return texture;
}

/**
 * Initialize snap rendering
 * @param {THREE.Scene} sceneRef - The main scene
 */
export function initSnapRender(sceneRef) {
    scene = sceneRef;

    // Create sprite material with initial texture
    const texture = getSnapTexture(SnapType.GRID);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        sizeAttenuation: false  // Constant screen size
    });

    snapSprite = new THREE.Sprite(material);
    snapSprite.scale.set(0.05, 0.05, 1);  // Adjust size
    snapSprite.visible = false;
    snapSprite.renderOrder = 999;
    scene.add(snapSprite);

    console.log('Snap visualization initialized');
}

/**
 * Update snap indicator position and visibility
 * @param {number} worldX - Raw world X coordinate
 * @param {number} worldZ - Raw world Z coordinate
 * @param {boolean} show - Whether to show the indicator
 * @param {Array} [candidates] - Special snap points
 */
export function updateSnapIndicator(worldX, worldZ, show = true, candidates = []) {
    if (!snapSprite) return;

    if (!show) {
        snapSprite.visible = false;
        return;
    }

    // Get snapped position
    const result = snap(worldX, worldZ, candidates);

    // Update position (slightly above ground)
    snapSprite.position.set(result.x, 0.01, result.z);

    // Update texture if snap type changed
    if (result.type !== currentSnapType) {
        currentSnapType = result.type;
        snapSprite.material.map = getSnapTexture(result.type);
        snapSprite.material.needsUpdate = true;
    }

    // Show indicator
    snapSprite.visible = true;
}

/**
 * Update snap indicator at an arbitrary 3D world position.
 * Used when drawing on a non-ground sketch plane.
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} worldZ
 * @param {boolean} show
 */
export function updateSnapIndicator3D(worldX, worldY, worldZ, show = true) {
    if (!snapSprite) return;

    if (!show) {
        snapSprite.visible = false;
        return;
    }

    snapSprite.position.set(worldX, worldY, worldZ);

    // Use grid snap texture
    if (currentSnapType !== SnapType.GRID) {
        currentSnapType = SnapType.GRID;
        snapSprite.material.map = getSnapTexture(SnapType.GRID);
        snapSprite.material.needsUpdate = true;
    }

    snapSprite.visible = true;
}

/**
 * Hide the snap indicator
 */
export function hideSnapIndicator() {
    if (snapSprite) snapSprite.visible = false;
}

/**
 * Set snap indicator visibility
 * @param {boolean} visible
 */
export function setSnapIndicatorVisible(visible) {
    if (snapSprite) snapSprite.visible = visible;
}

export default {
    initSnapRender,
    updateSnapIndicator,
    updateSnapIndicator3D,
    hideSnapIndicator,
    setSnapIndicatorVisible
};
