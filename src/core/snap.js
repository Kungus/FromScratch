/**
 * FromScratch - Snap System
 * Pure functions for snapping points to grid, endpoints, etc.
 * No rendering, no side effects - just math.
 */

import { getState } from './state.js';

/**
 * Snap types for visualization
 */
export const SnapType = {
    NONE: 'none',
    GRID: 'grid',
    ENDPOINT: 'endpoint',
    MIDPOINT: 'midpoint',
    CENTER: 'center',
    INTERSECTION: 'intersection'
};

/**
 * Snap result object
 * @typedef {Object} SnapResult
 * @property {number} x - Snapped X coordinate
 * @property {number} z - Snapped Z coordinate
 * @property {string} type - What it snapped to (SnapType)
 * @property {boolean} snapped - Whether snapping occurred
 */

/**
 * Snap a point to the grid
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {number} [gridSize] - Grid size (uses state if not provided)
 * @returns {SnapResult}
 */
export function snapToGrid(x, z, gridSize = null) {
    const state = getState();
    const size = gridSize ?? state.viewport.snapSize;

    // If snap is disabled, return original position
    if (!state.viewport.snapEnabled) {
        return {
            x,
            z,
            type: SnapType.NONE,
            snapped: false
        };
    }

    // Round to nearest grid point
    const snappedX = Math.round(x / size) * size;
    const snappedZ = Math.round(z / size) * size;

    // Check if we actually moved (within small epsilon)
    const epsilon = 0.0001;
    const didSnap = Math.abs(snappedX - x) > epsilon || Math.abs(snappedZ - z) > epsilon;

    return {
        x: snappedX,
        z: snappedZ,
        type: SnapType.GRID,
        snapped: didSnap
    };
}

/**
 * Snap to the nearest point from a list of candidates
 * Used for snapping to endpoints, midpoints, etc.
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {Array<{x: number, z: number, type: string}>} candidates - Points to consider
 * @param {number} threshold - Max distance to snap (in world units)
 * @returns {SnapResult}
 */
export function snapToPoints(x, z, candidates, threshold = 0.5) {
    const state = getState();

    if (!state.viewport.snapEnabled || candidates.length === 0) {
        return {
            x,
            z,
            type: SnapType.NONE,
            snapped: false
        };
    }

    let closest = null;
    let closestDist = threshold;

    for (const candidate of candidates) {
        const dx = candidate.x - x;
        const dz = candidate.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < closestDist) {
            closestDist = dist;
            closest = candidate;
        }
    }

    if (closest) {
        return {
            x: closest.x,
            z: closest.z,
            type: closest.type || SnapType.ENDPOINT,
            snapped: true
        };
    }

    return {
        x,
        z,
        type: SnapType.NONE,
        snapped: false
    };
}

/**
 * Full snap - tries special points first, then falls back to grid
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {Array<{x: number, z: number, type: string}>} [candidates] - Special points
 * @param {number} [threshold] - Threshold for point snapping
 * @returns {SnapResult}
 */
export function snap(x, z, candidates = [], threshold = 0.3) {
    // First try to snap to special points (higher priority)
    if (candidates.length > 0) {
        const pointSnap = snapToPoints(x, z, candidates, threshold);
        if (pointSnap.snapped) {
            return pointSnap;
        }
    }

    // Fall back to grid snap
    return snapToGrid(x, z);
}

/**
 * Get grid points near a position (for visualization)
 * @param {number} x - Center X
 * @param {number} z - Center Z
 * @param {number} [radius] - How far to look
 * @returns {Array<{x: number, z: number}>}
 */
export function getNearbyGridPoints(x, z, radius = 2) {
    const state = getState();
    const size = state.viewport.snapSize;
    const points = [];

    // Find the grid-aligned bounds
    const minX = Math.floor((x - radius) / size) * size;
    const maxX = Math.ceil((x + radius) / size) * size;
    const minZ = Math.floor((z - radius) / size) * size;
    const maxZ = Math.ceil((z + radius) / size) * size;

    for (let gx = minX; gx <= maxX; gx += size) {
        for (let gz = minZ; gz <= maxZ; gz += size) {
            const dx = gx - x;
            const dz = gz - z;
            if (dx * dx + dz * dz <= radius * radius) {
                points.push({ x: gx, z: gz });
            }
        }
    }

    return points;
}

export default {
    SnapType,
    snap,
    snapToGrid,
    snapToPoints,
    getNearbyGridPoints
};
