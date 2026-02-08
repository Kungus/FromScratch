/**
 * FromScratch - Body Renderer
 * Renders 3D bodies (extruded shapes) in the scene.
 */

import * as THREE from 'three';
import { localToWorld } from '../core/sketchPlane.js';

let scene;

// Group for all committed bodies
let bodyGroup = null;

// Preview mesh (shown while extruding)
let previewMesh = null;
let previewEdges = null;

// Materials for bodies
const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    metalness: 0.1,
    roughness: 0.6
});

const previewMaterial = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    metalness: 0.1,
    roughness: 0.6,
    transparent: true,
    opacity: 0.5
});

const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x1e1b4b,
    linewidth: 1
});

const previewEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x1e1b4b,
    linewidth: 1,
    transparent: true,
    opacity: 0.5
});

/**
 * Initialize body rendering
 * @param {THREE.Scene} sceneRef - The main scene
 */
export function initBodyRender(sceneRef) {
    scene = sceneRef;

    // Create group for committed bodies
    bodyGroup = new THREE.Group();
    bodyGroup.name = 'bodies';
    scene.add(bodyGroup);

    console.log('Body renderer initialized');
}

/**
 * Create a box mesh from body data
 * @param {Object} bodyData - {sourceType: 'rectangle', base: {x1, z1, x2, z2}, height}
 */
function createBoxMesh(bodyData, material, edgeMat) {
    const { x1, z1, x2, z2 } = bodyData.base;
    const width = x2 - x1;
    const depth = z2 - z1;
    const height = bodyData.height;
    const baseY = bodyData.baseY || 0;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material.clone());

    // Position at center of box
    const centerX = x1 + width / 2;
    const centerZ = z1 + depth / 2;
    mesh.position.set(centerX, baseY + height / 2, centerZ);

    // Create edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edges = new THREE.LineSegments(edgesGeometry, edgeMat.clone());
    edges.position.copy(mesh.position);

    return { mesh, edges };
}

/**
 * Create a cylinder mesh from body data
 * @param {Object} bodyData - {sourceType: 'circle', base: {centerX, centerZ, radius}, height}
 */
function createCylinderMesh(bodyData, material, edgeMat) {
    const { centerX, centerZ, radius } = bodyData.base;
    const height = bodyData.height;
    const baseY = bodyData.baseY || 0;

    const geometry = new THREE.CylinderGeometry(radius, radius, height, 48);
    const mesh = new THREE.Mesh(geometry, material.clone());

    // Position at center of cylinder
    mesh.position.set(centerX, baseY + height / 2, centerZ);

    // Create edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry, 15); // 15 degree threshold
    const edges = new THREE.LineSegments(edgesGeometry, edgeMat.clone());
    edges.position.copy(mesh.position);

    return { mesh, edges };
}

/**
 * Create a preview mesh for face extrusion, oriented on the face plane.
 * @param {Object} data - {sourceType, base, height, plane}
 * @param {THREE.Material} material
 * @param {THREE.Material} edgeMat
 * @returns {{ mesh, edges }}
 */
function createFaceExtrusionPreviewMesh(data, material, edgeMat) {
    const plane = data.plane;
    const height = data.height;
    const absHeight = Math.abs(height);

    let geometry;
    let centerU, centerV;

    if (data.sourceType === 'rectangle') {
        const { x1, z1, x2, z2 } = data.base;
        const width = x2 - x1;
        const depth = z2 - z1;
        centerU = (x1 + x2) / 2;
        centerV = (z1 + z2) / 2;
        geometry = new THREE.BoxGeometry(width, absHeight, depth);
    } else if (data.sourceType === 'circle') {
        const { centerX, centerZ, radius } = data.base;
        centerU = centerX;
        centerV = centerZ;
        geometry = new THREE.CylinderGeometry(radius, radius, absHeight, 48);
    } else {
        return null;
    }

    const mat = material.clone();
    if (height < 0) {
        // Reddish tint for cut preview
        mat.color.set(0xe05555);
    }
    const mesh = new THREE.Mesh(geometry, mat);

    // Compute base center in world space
    const baseCenter = localToWorld(centerU, centerV, plane);

    // Position at base center + half height along normal
    const n = plane.normal;
    mesh.position.set(
        baseCenter.x + n.x * height / 2,
        baseCenter.y + n.y * height / 2,
        baseCenter.z + n.z * height / 2
    );

    // Orient: THREE.js primitives have Y as their "up" axis.
    // We need to rotate so local Y aligns with face normal,
    // local X aligns with plane uAxis.
    // IMPORTANT: Use cross(uAxis, normal) for the third column to guarantee
    // a right-handed basis (det=+1). The plane's vAxis can form a left-handed
    // system, causing setRotationFromMatrix to extract wrong rotations.
    const rotMatrix = new THREE.Matrix4();
    const uAxis = new THREE.Vector3(plane.uAxis.x, plane.uAxis.y, plane.uAxis.z);
    const normalVec = new THREE.Vector3(n.x, n.y, n.z);
    const rightV = new THREE.Vector3().crossVectors(uAxis, normalVec);
    rotMatrix.makeBasis(uAxis, normalVec, rightV);
    mesh.setRotationFromMatrix(rotMatrix);

    // Create edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry, data.sourceType === 'circle' ? 15 : undefined);
    const edges = new THREE.LineSegments(edgesGeometry, edgeMat.clone());
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);

    return { mesh, edges };
}

/**
 * Update the extrusion preview
 * @param {Object|null} data - {sourceType, base, height, baseY, plane?, isFaceExtrusion?} or null to hide
 */
export function updateBodyPreview(data) {
    // Remove existing preview
    clearBodyPreview();

    if (!data || Math.abs(data.height) < 0.01) return;

    let result;
    if (data.plane && data.isFaceExtrusion) {
        result = createFaceExtrusionPreviewMesh(data, previewMaterial, previewEdgeMaterial);
    } else if (data.sourceType === 'rectangle') {
        result = createBoxMesh(data, previewMaterial, previewEdgeMaterial);
    } else if (data.sourceType === 'circle') {
        result = createCylinderMesh(data, previewMaterial, previewEdgeMaterial);
    } else {
        return;
    }

    if (!result) return;

    previewMesh = result.mesh;
    previewEdges = result.edges;

    scene.add(previewMesh);
    scene.add(previewEdges);
}

/**
 * Update face extrude preview: shows the face triangles offset along the normal.
 * @param {Object} data - {facePositions: Float32Array, normal: {x,y,z}, height: number}
 */
export function updateFaceExtrudePreview(data) {
    clearBodyPreview();

    if (!data || Math.abs(data.height) < 0.01) return;

    const { facePositions, normal, height } = data;
    const vertCount = facePositions.length / 3;

    // Build base + offset cap geometry (two copies of the face triangles)
    const positions = new Float32Array(vertCount * 3 * 2);
    const normals = new Float32Array(vertCount * 3 * 2);

    for (let i = 0; i < vertCount; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
        // Base cap
        positions[ix] = facePositions[ix];
        positions[iy] = facePositions[iy];
        positions[iz] = facePositions[iz];
        normals[ix] = -normal.x;
        normals[iy] = -normal.y;
        normals[iz] = -normal.z;

        // Offset cap
        const oi = vertCount * 3 + ix;
        positions[oi] = facePositions[ix] + normal.x * height;
        positions[oi + 1] = facePositions[iy] + normal.y * height;
        positions[oi + 2] = facePositions[iz] + normal.z * height;
        normals[oi] = normal.x;
        normals[oi + 1] = normal.y;
        normals[oi + 2] = normal.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    const faceMat = previewMaterial.clone();
    if (height < 0) {
        faceMat.color.set(0xe05555);
    }
    previewMesh = new THREE.Mesh(geometry, faceMat);
    scene.add(previewMesh);

    // Edge outline for the offset cap
    const offsetEdgePoints = [];
    const triCount = vertCount / 3;
    for (let t = 0; t < triCount; t++) {
        for (let j = 0; j < 3; j++) {
            const a = (t * 3 + j) * 3;
            const b = (t * 3 + (j + 1) % 3) * 3;
            const oi = vertCount * 3;
            offsetEdgePoints.push(
                new THREE.Vector3(positions[oi + a], positions[oi + a + 1], positions[oi + a + 2]),
                new THREE.Vector3(positions[oi + b], positions[oi + b + 1], positions[oi + b + 2])
            );
        }
    }
    if (offsetEdgePoints.length >= 2) {
        const edgeGeom = new THREE.BufferGeometry().setFromPoints(offsetEdgePoints);
        previewEdges = new THREE.LineSegments(edgeGeom, previewEdgeMaterial.clone());
        scene.add(previewEdges);
    }
}

/**
 * Update tessellation preview: renders OCCT tessellation data as transparent preview.
 * Used for fillet preview.
 * @param {Object} tessellation - { positions, indices, normals, edgeMap }
 */
export function updateTessellationPreview(tessellation) {
    clearBodyPreview();

    if (!tessellation) return;

    const result = createTessellatedMesh(tessellation, previewMaterial, previewEdgeMaterial);
    previewMesh = result.mesh;
    previewEdges = result.edges;

    scene.add(previewMesh);
    scene.add(previewEdges);
}

/**
 * Clear the preview
 */
export function clearBodyPreview() {
    if (previewMesh) {
        scene.remove(previewMesh);
        previewMesh.geometry.dispose();
        previewMesh.material.dispose();
        previewMesh = null;
    }
    if (previewEdges) {
        scene.remove(previewEdges);
        if (previewEdges.geometry) {
            previewEdges.geometry.dispose();
            previewEdges.material.dispose();
        } else {
            // Group (from tessellation preview) — dispose children
            previewEdges.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
        }
        previewEdges = null;
    }
}

/**
 * Create mesh from OCCT tessellation data
 * @param {Object} tessellation - { positions, indices, normals, edgeMap }
 * @param {THREE.Material} material
 * @param {THREE.Material} edgeMat
 * @returns {{ mesh, edges }}
 */
function createTessellatedMesh(tessellation, material, edgeMat) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(tessellation.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(tessellation.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(tessellation.indices, 1));

    const mesh = new THREE.Mesh(geometry, material.clone());

    // Build edge lines from edgeMap polylines
    const edgeGroup = new THREE.Group();
    if (tessellation.edgeMap) {
        for (const edge of tessellation.edgeMap) {
            if (edge.vertices.length < 2) continue;
            const points = edge.vertices.map(v => new THREE.Vector3(v.x, v.y, v.z));
            const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(lineGeom, edgeMat.clone());
            edgeGroup.add(line);
        }
    }

    return { mesh, edges: edgeGroup };
}

/**
 * Add a committed body mesh
 * If bodyData has tessellation, renders from OCCT data.
 * Otherwise falls back to THREE.js primitives.
 * @param {Object} bodyData - Full body data with id
 * @returns {string} - Body ID
 */
export function addBodyMesh(bodyData) {
    let result;

    if (bodyData.tessellation) {
        // OCCT tessellated body
        result = createTessellatedMesh(bodyData.tessellation, bodyMaterial, edgeMaterial);
    } else if (bodyData.sourceType === 'rectangle') {
        result = createBoxMesh(bodyData, bodyMaterial, edgeMaterial);
    } else if (bodyData.sourceType === 'circle') {
        result = createCylinderMesh(bodyData, bodyMaterial, edgeMaterial);
    } else {
        return null;
    }

    // Create group for body
    const bodyGroupItem = new THREE.Group();
    bodyGroupItem.name = bodyData.id;
    bodyGroupItem.userData = { ...bodyData };
    bodyGroupItem.add(result.mesh);
    bodyGroupItem.add(result.edges);

    bodyGroup.add(bodyGroupItem);

    console.log(`Added body: ${bodyData.sourceType}, height ${bodyData.height.toFixed(2)}`);

    return bodyData.id;
}

/**
 * Replace a body's mesh (e.g. after boolean op retessellation)
 * @param {string} bodyId
 * @param {Object} tessellation - New tessellation data
 * @param {Object} bodyData - Updated body data
 */
export function replaceBodyMesh(bodyId, tessellation, bodyData) {
    removeBodyMesh(bodyId);

    const result = createTessellatedMesh(tessellation, bodyMaterial, edgeMaterial);

    const bodyGroupItem = new THREE.Group();
    bodyGroupItem.name = bodyId;
    bodyGroupItem.userData = { ...bodyData };
    bodyGroupItem.add(result.mesh);
    bodyGroupItem.add(result.edges);

    bodyGroup.add(bodyGroupItem);
}

/**
 * Remove a body mesh by ID
 * @param {string} id - Body ID
 */
export function removeBodyMesh(id) {
    const body = bodyGroup.getObjectByName(id);
    if (body) {
        bodyGroup.remove(body);
        body.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        console.log(`Removed body: ${id}`);
    }
}

/**
 * Get all body meshes data
 */
export function getBodyMeshes() {
    return bodyGroup.children.map(child => ({
        id: child.name,
        ...child.userData
    }));
}

/**
 * Get the body group for raycasting
 * @returns {THREE.Group}
 */
export function getBodyGroup() {
    return bodyGroup;
}

export default {
    initBodyRender,
    updateBodyPreview,
    updateFaceExtrudePreview,
    updateTessellationPreview,
    clearBodyPreview,
    addBodyMesh,
    removeBodyMesh,
    replaceBodyMesh,
    getBodyMeshes
};
