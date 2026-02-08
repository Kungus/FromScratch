/**
 * FromScratch - Body Raycast Module
 * Extends raycasting to hit 3D body meshes in addition to the ground plane.
 */

import * as THREE from 'three';
import { getCamera } from './camera.js';

let raycaster;
let bodyGroup = null;

/**
 * Initialize body raycasting
 */
export function initBodyRaycast() {
    raycaster = new THREE.Raycaster();
    console.log('Body raycast initialized');
}

/**
 * Set reference to the body group for raycasting
 * @param {THREE.Group} group - The bodyGroup from bodyRender
 */
export function setBodyGroup(group) {
    bodyGroup = group;
}

/**
 * Raycast to bodies from normalized device coordinates
 * @param {number} ndcX - Normalized device coordinate X (-1 to 1)
 * @param {number} ndcY - Normalized device coordinate Y (-1 to 1)
 * @returns {Object|null} - Hit info or null
 */
export function raycastToBodies(ndcX, ndcY) {
    if (!bodyGroup || bodyGroup.children.length === 0) return null;

    const camera = getCamera();
    if (!camera) return null;

    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

    // Collect all meshes from body groups (not edge lines)
    const meshes = [];
    bodyGroup.children.forEach(bodyGroupItem => {
        bodyGroupItem.traverse(obj => {
            if (obj.isMesh) {
                meshes.push(obj);
            }
        });
    });

    if (meshes.length === 0) return null;

    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
        const hit = intersects[0];

        // Find the parent body group to get bodyId
        let bodyGroupItem = hit.object;
        while (bodyGroupItem.parent && bodyGroupItem.parent !== bodyGroup) {
            bodyGroupItem = bodyGroupItem.parent;
        }

        return {
            bodyId: bodyGroupItem.name,
            point: hit.point.clone(),
            faceIndex: hit.faceIndex,
            face: hit.face,  // Contains normal, a/b/c vertex indices
            distance: hit.distance,
            object: hit.object
        };
    }

    return null;
}

/**
 * Get the current ray for external use
 * @param {number} ndcX
 * @param {number} ndcY
 * @returns {THREE.Ray}
 */
export function getRay(ndcX, ndcY) {
    const camera = getCamera();
    if (!camera) return null;

    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    return raycaster.ray;
}

export default {
    initBodyRaycast,
    setBodyGroup,
    raycastToBodies,
    getRay
};
