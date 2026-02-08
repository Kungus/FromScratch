/**
 * meshTopology.js - Mesh topology utilities for the 3D editor
 * Provides vertex welding and indexed geometry creation
 */

import * as THREE from 'three';

/**
 * Creates an indexed BufferGeometry from an array of triangles
 * Welds vertices that are at the same position within tolerance
 *
 * @param {Array} triangles - Array of triangles, each triangle is [Vector3, Vector3, Vector3]
 * @param {number} tolerance - Distance threshold for vertex welding (default: 1e-5)
 * @param {Object} threeLib - Optional THREE library reference (for compatibility)
 * @returns {THREE.BufferGeometry}
 */
export function createIndexedGeometryFromTriangles(triangles, tolerance = 1e-5, threeLib = null) {
    // Use passed THREE lib or fall back to imported one
    const T = threeLib || THREE;

    // Collect all unique vertices with welding
    const uniqueVertices = [];
    const indices = [];

    // Helper to find or add a vertex
    function getVertexIndex(pos) {
        // Search for existing vertex within tolerance
        for (let i = 0; i < uniqueVertices.length; i++) {
            const v = uniqueVertices[i];
            const dx = Math.abs(v.x - pos.x);
            const dy = Math.abs(v.y - pos.y);
            const dz = Math.abs(v.z - pos.z);

            if (dx < tolerance && dy < tolerance && dz < tolerance) {
                return i;
            }
        }

        // Not found, add new vertex
        uniqueVertices.push({ x: pos.x, y: pos.y, z: pos.z });
        return uniqueVertices.length - 1;
    }

    // Process all triangles
    for (const tri of triangles) {
        if (!tri || tri.length < 3) continue;

        const i0 = getVertexIndex(tri[0]);
        const i1 = getVertexIndex(tri[1]);
        const i2 = getVertexIndex(tri[2]);

        // Skip degenerate triangles
        if (i0 === i1 || i1 === i2 || i2 === i0) continue;

        indices.push(i0, i1, i2);
    }

    // Build BufferGeometry
    const positions = new Float32Array(uniqueVertices.length * 3);
    for (let i = 0; i < uniqueVertices.length; i++) {
        positions[i * 3] = uniqueVertices[i].x;
        positions[i * 3 + 1] = uniqueVertices[i].y;
        positions[i * 3 + 2] = uniqueVertices[i].z;
    }

    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * MeshEditSession - Placeholder class for mesh editing operations
 * The bevel feature is currently disabled in the editor
 */
export class MeshEditSession {
    constructor(object) {
        this.object = object;
        this.geometry = object?.geometry;
    }

    // Placeholder methods
    commit() {
        console.log('MeshEditSession.commit() - placeholder');
    }

    rollback() {
        console.log('MeshEditSession.rollback() - placeholder');
    }
}

/**
 * Apply edge bevel by vertex indices
 * Note: Bevel feature is currently disabled in the editor ("not working properly")
 * This is a stub that returns null to indicate no operation
 *
 * @param {THREE.Mesh} object - The mesh object
 * @param {number} index1 - First vertex index of the edge
 * @param {number} index2 - Second vertex index of the edge
 * @param {number} width - Bevel width
 * @param {number} segments - Number of bevel segments
 * @returns {null}
 */
export function applyEdgeBevelByVertices(object, index1, index2, width, segments) {
    console.warn('applyEdgeBevelByVertices is a stub - bevel feature not implemented');
    return null;
}
