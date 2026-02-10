/**
 * FromScratch - Dimension Renderer
 * Shows live dimensions (width × height) while drawing shapes.
 * Uses HTML overlay positioned in screen space.
 */

import { getCamera } from '../input/camera.js';
import * as THREE from 'three';
import { localToWorld } from '../core/sketchPlane.js';

let dimensionLabel = null;
let container = null;

/**
 * Initialize dimension rendering
 * @param {HTMLElement} containerElement - The app container
 */
export function initDimensionRender(containerElement) {
    container = containerElement;

    // Create dimension label element
    dimensionLabel = document.createElement('div');
    dimensionLabel.id = 'dimension-label';
    dimensionLabel.style.cssText = `
        position: absolute;
        background: rgba(26, 26, 46, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.1s ease;
        white-space: nowrap;
        z-index: 200;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    `;
    container.appendChild(dimensionLabel);

    console.log('Dimension renderer initialized');
}

/**
 * Convert world position to screen position
 * @param {number} x - World X
 * @param {number} y - World Y
 * @param {number} z - World Z
 * @returns {{x: number, y: number}} Screen coordinates
 */
function worldToScreen(x, y, z) {
    const camera = getCamera();
    if (!camera) return { x: 0, y: 0 };

    const vector = new THREE.Vector3(x, y, z);
    vector.project(camera);

    const rect = container.getBoundingClientRect();
    return {
        x: (vector.x * 0.5 + 0.5) * rect.width,
        y: (-vector.y * 0.5 + 0.5) * rect.height
    };
}

/**
 * Show dimension label for a rectangle
 * @param {Object} rect - {x1, z1, x2, z2, width, height, plane?}
 */
export function showRectDimensions(rect) {
    if (!dimensionLabel || !rect) {
        hideDimensions();
        return;
    }

    const { x1, z1, x2, z2, width, height, plane } = rect;

    // Format dimensions (show 2 decimal places, strip trailing zeros)
    const w = formatDimension(width);
    const h = formatDimension(height);
    dimensionLabel.textContent = `${w} × ${h}`;

    let screenPos;
    if (plane) {
        // Compute label position in world space via the sketch plane
        const centerU = (x1 + x2) / 2;
        const edgeV = Math.max(z1, z2);
        const wp = localToWorld(centerU, edgeV + 0.3, plane);
        screenPos = worldToScreen(wp.x, wp.y, wp.z);
    } else {
        const centerX = (x1 + x2) / 2;
        const centerZ = Math.max(z1, z2) + 0.3;
        screenPos = worldToScreen(centerX, 0, centerZ);
    }

    // Offset to center the label
    const labelRect = dimensionLabel.getBoundingClientRect();
    dimensionLabel.style.left = `${screenPos.x - labelRect.width / 2}px`;
    dimensionLabel.style.top = `${screenPos.y}px`;

    // Show
    dimensionLabel.style.opacity = '1';
}

/**
 * Show dimensions for arbitrary values (can be used by other tools)
 * @param {number} value1 - First dimension
 * @param {number} value2 - Second dimension (optional)
 * @param {number} worldX - World X position for label
 * @param {number} worldZ - World Z position for label
 * @param {number} [worldY=0] - World Y position for label (for non-ground planes)
 */
export function showDimensions(value1, value2, worldX, worldZ, worldY = 0) {
    if (!dimensionLabel) return;

    const v1 = formatDimension(value1);
    if (value2 !== undefined && value2 !== null) {
        const v2 = formatDimension(value2);
        dimensionLabel.textContent = `${v1} × ${v2}`;
    } else {
        dimensionLabel.textContent = v1;
    }

    const screenPos = worldToScreen(worldX, worldY, worldZ);
    const labelRect = dimensionLabel.getBoundingClientRect();
    dimensionLabel.style.left = `${screenPos.x - labelRect.width / 2}px`;
    dimensionLabel.style.top = `${screenPos.y + 10}px`;

    dimensionLabel.style.opacity = '1';
}

/**
 * Make the dimension label clickable (opens dimension input on click).
 * @param {Function} onClick - Callback when label is clicked
 */
let _clickHandler = null;
export function makeDimensionClickable(onClick) {
    if (!dimensionLabel) return;
    makeDimensionNotClickable(); // clean up previous
    dimensionLabel.style.pointerEvents = 'auto';
    dimensionLabel.style.cursor = 'pointer';
    dimensionLabel.style.borderColor = 'rgba(99, 102, 241, 0.6)';
    _clickHandler = (e) => {
        e.stopPropagation();
        onClick();
    };
    dimensionLabel.addEventListener('click', _clickHandler);
}

/**
 * Remove clickability from the dimension label.
 */
export function makeDimensionNotClickable() {
    if (!dimensionLabel) return;
    dimensionLabel.style.pointerEvents = 'none';
    dimensionLabel.style.cursor = '';
    dimensionLabel.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    if (_clickHandler) {
        dimensionLabel.removeEventListener('click', _clickHandler);
        _clickHandler = null;
    }
}

/**
 * Hide dimension label
 */
export function hideDimensions() {
    if (dimensionLabel) {
        dimensionLabel.style.opacity = '0';
    }
}

/**
 * Format a dimension value nicely
 * @param {number} value
 * @returns {string}
 */
function formatDimension(value) {
    // Show up to 2 decimal places, but strip unnecessary zeros
    const formatted = value.toFixed(2);
    // Remove trailing zeros after decimal
    return formatted.replace(/\.?0+$/, '') || '0';
}

export default {
    initDimensionRender,
    showRectDimensions,
    showDimensions,
    hideDimensions,
    makeDimensionClickable,
    makeDimensionNotClickable
};
