/**
 * FromScratch - Sketch Plane Module
 * Pure geometry: defines planes and coordinate transforms.
 * No THREE.js, no DOM, no side effects.
 *
 * A SketchPlane has:
 *   origin  — a point on the plane (face centroid)
 *   normal  — outward-facing perpendicular direction
 *   uAxis   — local X direction (tangent to plane)
 *   vAxis   — local Y direction (tangent to plane, perpendicular to uAxis)
 */

/**
 * Create a sketch plane from face geometry data.
 * Computes the normal from the world-space vertices directly
 * (more reliable than using the local-space normal from the raycast).
 * @param {Array<{x,y,z}>} faceVertices - 3D vertices of the face (world space)
 * @param {{x,y,z}} faceNormalHint - approximate face normal (used to orient the computed normal outward)
 * @returns {SketchPlane}
 */
export function createSketchPlaneFromFace(faceVertices, faceNormalHint) {
    if (faceVertices.length < 3) {
        console.warn('Need at least 3 vertices to create a sketch plane');
        return createGroundPlane();
    }

    // Origin = centroid of all face vertices
    const origin = { x: 0, y: 0, z: 0 };
    for (const v of faceVertices) {
        origin.x += v.x;
        origin.y += v.y;
        origin.z += v.z;
    }
    origin.x /= faceVertices.length;
    origin.y /= faceVertices.length;
    origin.z /= faceVertices.length;

    // Compute normal from world-space vertices (cross product of two edges)
    const v0 = faceVertices[0];
    const v1 = faceVertices[1];
    const v2 = faceVertices[2];

    const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
    let normal = normalize(cross(edge1, edge2));

    // Make sure normal points in roughly the same direction as the hint
    // (cross product could point inward or outward depending on vertex order)
    const dot = normal.x * faceNormalHint.x + normal.y * faceNormalHint.y + normal.z * faceNormalHint.z;
    if (dot < 0) {
        normal = { x: -normal.x, y: -normal.y, z: -normal.z };
    }

    // Derive uAxis and vAxis from the normal
    const { uAxis, vAxis } = deriveAxes(normal);

    return { origin, normal, uAxis, vAxis };
}

/**
 * Create the default ground plane (Y=0, drawing in X-Z).
 * @returns {SketchPlane}
 */
export function createGroundPlane() {
    return {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        uAxis:  { x: 1, y: 0, z: 0 },
        vAxis:  { x: 0, y: 0, z: 1 }
    };
}

/**
 * Project a 3D world point onto a plane's local 2D coordinates.
 * @param {{x,y,z}} worldPoint
 * @param {SketchPlane} plane
 * @returns {{u: number, v: number}}
 */
export function worldToLocal2D(worldPoint, plane) {
    // Vector from origin to worldPoint
    const dx = worldPoint.x - plane.origin.x;
    const dy = worldPoint.y - plane.origin.y;
    const dz = worldPoint.z - plane.origin.z;

    // Project onto uAxis and vAxis (dot products)
    const u = dx * plane.uAxis.x + dy * plane.uAxis.y + dz * plane.uAxis.z;
    const v = dx * plane.vAxis.x + dy * plane.vAxis.y + dz * plane.vAxis.z;

    return { u, v };
}

/**
 * Convert local 2D coordinates back to a 3D world point on the plane.
 * @param {number} u - local X coordinate
 * @param {number} v - local Y coordinate
 * @param {SketchPlane} plane
 * @returns {{x: number, y: number, z: number}}
 */
export function localToWorld(u, v, plane) {
    return {
        x: plane.origin.x + u * plane.uAxis.x + v * plane.vAxis.x,
        y: plane.origin.y + u * plane.uAxis.y + v * plane.vAxis.y,
        z: plane.origin.z + u * plane.uAxis.z + v * plane.vAxis.z
    };
}

/**
 * Check if a plane is the default ground plane.
 * @param {SketchPlane|null} plane
 * @returns {boolean}
 */
export function isGroundPlane(plane) {
    if (!plane) return true;
    return plane.normal.x === 0 && plane.normal.y === 1 && plane.normal.z === 0
        && plane.origin.x === 0 && plane.origin.y === 0 && plane.origin.z === 0;
}


// === Internal helpers ===

/**
 * Derive uAxis and vAxis perpendicular to a given normal.
 * Uses world Y as reference unless normal is near-vertical, then uses world Z.
 */
function deriveAxes(normal) {
    // Pick a reference vector that isn't parallel to the normal
    // If normal is near Y-axis (top/bottom face), use world Z as reference
    // Otherwise use world Y
    const absY = Math.abs(normal.y);
    let ref;
    if (absY > 0.9) {
        // Normal is nearly vertical — use world Z as reference
        ref = { x: 0, y: 0, z: 1 };
    } else {
        // Normal is mostly horizontal — use world Y as reference
        ref = { x: 0, y: 1, z: 0 };
    }

    // uAxis = cross(ref, normal), normalized
    const uAxis = normalize(cross(ref, normal));

    // vAxis = cross(normal, uAxis), normalized
    const vAxis = normalize(cross(normal, uAxis));

    return { uAxis, vAxis };
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
