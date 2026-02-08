/**
 * FromScratch - Plane Raycast Module
 * Raycasts from screen coordinates to an arbitrary sketch plane.
 * Returns both 3D world intersection and 2D local coordinates.
 */

import * as THREE from 'three';
import { worldToLocal2D } from '../core/sketchPlane.js';
import { getActiveSketchPlane } from '../core/state.js';
import { getCamera } from './camera.js';

// Reusable objects (avoid per-frame allocations)
const raycaster = new THREE.Raycaster();
const ndcVec = new THREE.Vector2();
const threeNormal = new THREE.Vector3();
const threePlane = new THREE.Plane();
const intersectionPoint = new THREE.Vector3();

/**
 * Raycast from screen coordinates through a sketch plane.
 * @param {number} ndcX - Normalized device coordinate X (-1 to 1)
 * @param {number} ndcY - Normalized device coordinate Y (-1 to 1)
 * @param {SketchPlane} sketchPlane - The plane to intersect
 * @param {THREE.Camera} camera - The camera
 * @returns {{worldPoint: {x,y,z}, localPoint: {u,v}} | null} - Intersection or null if ray is parallel to plane
 */
export function raycastToPlane(ndcX, ndcY, sketchPlane, camera) {
    // Set up ray from camera through screen point
    ndcVec.set(ndcX, ndcY);
    raycaster.setFromCamera(ndcVec, camera);

    // Build THREE.Plane from our sketch plane
    // THREE.Plane equation: normal . point + constant = 0
    // constant = -(normal . origin)
    threeNormal.set(sketchPlane.normal.x, sketchPlane.normal.y, sketchPlane.normal.z);
    const constant = -(
        sketchPlane.normal.x * sketchPlane.origin.x +
        sketchPlane.normal.y * sketchPlane.origin.y +
        sketchPlane.normal.z * sketchPlane.origin.z
    );
    threePlane.set(threeNormal, constant);

    // Intersect ray with plane
    const hit = raycaster.ray.intersectPlane(threePlane, intersectionPoint);
    if (!hit) return null;  // Ray parallel to plane

    // Convert to plain object
    const worldPoint = { x: hit.x, y: hit.y, z: hit.z };

    // Project to local 2D coordinates
    const localPoint = worldToLocal2D(worldPoint, sketchPlane);

    return { worldPoint, localPoint };
}

/**
 * Get drawing coordinates from pointer state.
 * If a sketch plane is active, raycasts to that plane and returns local 2D coords.
 * Otherwise, falls back to ground-plane coords (worldX, worldZ).
 * @param {Object} pointerState - From pointer.js: {worldX, worldZ, ndcX, ndcY}
 * @returns {{u: number, v: number, worldPoint: {x,y,z}} | null}
 */
export function getDrawingCoords(pointerState) {
    const plane = getActiveSketchPlane();
    if (!plane) {
        // Ground plane: u=X, v=Z, Y=0
        return {
            u: pointerState.worldX,
            v: pointerState.worldZ,
            worldPoint: { x: pointerState.worldX, y: 0, z: pointerState.worldZ }
        };
    }
    const result = raycastToPlane(pointerState.ndcX, pointerState.ndcY, plane, getCamera());
    if (!result) return null;
    return {
        u: result.localPoint.u,
        v: result.localPoint.v,
        worldPoint: result.worldPoint
    };
}
