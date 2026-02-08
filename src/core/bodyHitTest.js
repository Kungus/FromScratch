/**
 * FromScratch - Body Hit Testing
 * Pure geometry functions for vertex/edge/face proximity detection.
 * Determines what sub-element (vertex, edge, face) is under the cursor.
 */

import * as THREE from 'three';

// Pixel thresholds for proximity detection
const VERTEX_THRESHOLD_PX = 8;
const EDGE_THRESHOLD_PX = 12;

/**
 * Determine what sub-element is under the cursor
 * Priority: vertex > edge > face
 *
 * If the body has OCCT tessellation data, uses topology maps for precise detection.
 * Otherwise falls back to normal-based grouping (mesh heuristics).
 *
 * @param {Object} hitInfo - From bodyRaycast {point, faceIndex, face, object}
 * @param {Object} screenPoint - {x, y} screen coordinates
 * @param {THREE.Camera} camera - For world-to-screen projection
 * @param {DOMRect} containerRect - Container bounding rect
 * @returns {Object} - {type: 'vertex'|'edge'|'face', index, data}
 */
export function detectSubElement(hitInfo, screenPoint, camera, containerRect) {
    if (!hitInfo || !hitInfo.object || !hitInfo.face) {
        return { type: null, index: null, data: null };
    }

    // Check if this body has OCCT tessellation data
    const bodyGroup = hitInfo.object.parent;
    const tessellation = bodyGroup?.userData?.tessellation;

    if (tessellation) {
        return detectSubElementFromTessellation(hitInfo, screenPoint, camera, containerRect, tessellation);
    }

    // Fallback: original mesh-based detection
    return detectSubElementFromMesh(hitInfo, screenPoint, camera, containerRect);
}

/**
 * OCCT topology-based sub-element detection
 * Uses faceMap/edgeMap/vertexMap from tessellation for precise hit testing.
 */
function detectSubElementFromTessellation(hitInfo, screenPoint, camera, containerRect, tessellation) {
    const { faceMap, edgeMap, vertexMap } = tessellation;

    // --- VERTEX proximity (highest priority) ---
    if (vertexMap && vertexMap.length > 0) {
        let closestVertex = null;
        let closestDist = VERTEX_THRESHOLD_PX;

        for (const v of vertexMap) {
            const pos = new THREE.Vector3(v.position.x, v.position.y, v.position.z);
            const screenPos = worldToScreen(pos, camera, containerRect);
            const dist = distance2D(screenPos, screenPoint);
            if (dist < closestDist) {
                closestDist = dist;
                closestVertex = v;
            }
        }

        if (closestVertex) {
            return {
                type: 'vertex',
                index: closestVertex.vertexIndex,
                data: {
                    position: new THREE.Vector3(
                        closestVertex.position.x,
                        closestVertex.position.y,
                        closestVertex.position.z
                    )
                }
            };
        }
    }

    // --- EDGE proximity (second priority) ---
    if (edgeMap && edgeMap.length > 0) {
        let closestEdge = null;
        let closestDist = EDGE_THRESHOLD_PX;

        for (const edge of edgeMap) {
            if (edge.vertices.length < 2) continue;

            // Check distance to each segment of the polyline
            for (let i = 0; i < edge.vertices.length - 1; i++) {
                const v1 = new THREE.Vector3(edge.vertices[i].x, edge.vertices[i].y, edge.vertices[i].z);
                const v2 = new THREE.Vector3(edge.vertices[i + 1].x, edge.vertices[i + 1].y, edge.vertices[i + 1].z);
                const sv1 = worldToScreen(v1, camera, containerRect);
                const sv2 = worldToScreen(v2, camera, containerRect);
                const dist = pointToLineSegmentDistance(screenPoint, sv1, sv2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestEdge = edge;
                }
            }
        }

        if (closestEdge) {
            const startV = closestEdge.vertices[0];
            const endV = closestEdge.vertices[closestEdge.vertices.length - 1];
            return {
                type: 'edge',
                index: closestEdge.edgeIndex,
                data: {
                    edgeIndex: closestEdge.edgeIndex,
                    startVertex: new THREE.Vector3(startV.x, startV.y, startV.z),
                    endVertex: new THREE.Vector3(endV.x, endV.y, endV.z),
                    polylineVertices: closestEdge.vertices
                }
            };
        }
    }

    // --- FACE detection via faceMap ---
    if (faceMap && faceMap.length > 0) {
        // The hit triangle index tells us which face we're on
        const hitTriIndex = hitInfo.faceIndex;
        let hitFace = null;

        for (const fm of faceMap) {
            if (hitTriIndex >= fm.startTriangle && hitTriIndex < fm.endTriangle) {
                hitFace = fm;
                break;
            }
        }

        if (hitFace) {
            const positions = tessellation.positions;
            const indices = tessellation.indices;

            // Build actual triangle positions for exact highlight rendering
            // (handles non-convex faces and faces with holes correctly)
            const facePositions = [];
            const allVertices = [];
            const seenVerts = new Set();

            for (let t = hitFace.startTriangle; t < hitFace.endTriangle; t++) {
                for (let j = 0; j < 3; j++) {
                    const idx = indices[t * 3 + j];
                    facePositions.push(
                        positions[idx * 3],
                        positions[idx * 3 + 1],
                        positions[idx * 3 + 2]
                    );
                    if (!seenVerts.has(idx)) {
                        seenVerts.add(idx);
                        allVertices.push(new THREE.Vector3(
                            positions[idx * 3],
                            positions[idx * 3 + 1],
                            positions[idx * 3 + 2]
                        ));
                    }
                }
            }

            return {
                type: 'face',
                index: hitFace.faceIndex,
                data: {
                    normal: new THREE.Vector3(hitFace.normal.x, hitFace.normal.y, hitFace.normal.z),
                    faceId: `occt_face_${hitFace.faceIndex}`,
                    faceIndex: hitFace.faceIndex,
                    triangleIndices: Array.from(
                        { length: hitFace.endTriangle - hitFace.startTriangle },
                        (_, i) => hitFace.startTriangle + i
                    ),
                    facePositions: new Float32Array(facePositions),
                    allVertices
                }
            };
        }
    }

    // Final fallback
    return { type: null, index: null, data: null };
}

/**
 * Original mesh-based sub-element detection (fallback when no OCCT tessellation)
 */
function detectSubElementFromMesh(hitInfo, screenPoint, camera, containerRect) {
    const geometry = hitInfo.object.geometry;
    const positionAttr = geometry.getAttribute('position');
    const face = hitInfo.face;
    const worldMatrix = hitInfo.object.matrixWorld;

    // Get the three vertices of the hit face in world space
    const vertices = [
        getWorldVertex(positionAttr, face.a, worldMatrix),
        getWorldVertex(positionAttr, face.b, worldMatrix),
        getWorldVertex(positionAttr, face.c, worldMatrix)
    ];

    // Project vertices to screen space
    const screenVertices = vertices.map(v => worldToScreen(v, camera, containerRect));

    // Check vertex proximity (highest priority)
    const vertexResult = checkVertexProximity(
        screenVertices,
        screenPoint,
        [face.a, face.b, face.c]
    );
    if (vertexResult) {
        return {
            type: 'vertex',
            index: vertexResult.vertexIndex,
            data: { position: vertices[vertexResult.localIndex].clone() }
        };
    }

    // Check edge proximity (second priority)
    const edges = [
        { start: 0, end: 1, indices: [face.a, face.b] },
        { start: 1, end: 2, indices: [face.b, face.c] },
        { start: 2, end: 0, indices: [face.c, face.a] }
    ];

    const edgeResult = checkEdgeProximity(screenVertices, screenPoint, edges);
    if (edgeResult) {
        return {
            type: 'edge',
            index: `${edgeResult.edge.indices[0]}_${edgeResult.edge.indices[1]}`,
            data: {
                startVertex: vertices[edgeResult.edge.start].clone(),
                endVertex: vertices[edgeResult.edge.end].clone(),
                vertexIndices: edgeResult.edge.indices
            }
        };
    }

    // Default to face - use normal-based grouping to get the logical face
    const faceData = getFaceByNormal(hitInfo.object, face.normal, worldMatrix);
    const worldNormal = face.normal.clone().transformDirection(worldMatrix).normalize();

    return {
        type: 'face',
        index: faceData.faceId,
        data: {
            normal: worldNormal,
            faceId: faceData.faceId,
            triangleIndices: faceData.triangleIndices,
            allVertices: faceData.vertices
        }
    };
}

/**
 * Get all triangles that share the same normal (logical face)
 * This solves the "selecting individual triangles" problem
 */
function getFaceByNormal(object, hitNormal, worldMatrix) {
    const geometry = object.geometry;
    const positionAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    const indexAttr = geometry.index;

    // Create a face ID from the normal direction
    // Round to handle floating point precision
    const faceId = normalToFaceId(hitNormal);

    const triangleIndices = [];
    const vertices = [];
    const seenVertices = new Set();

    // Iterate through all triangles
    const triangleCount = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;

    for (let i = 0; i < triangleCount; i++) {
        // Get vertex indices for this triangle
        let a, b, c;
        if (indexAttr) {
            a = indexAttr.getX(i * 3);
            b = indexAttr.getX(i * 3 + 1);
            c = indexAttr.getX(i * 3 + 2);
        } else {
            a = i * 3;
            b = i * 3 + 1;
            c = i * 3 + 2;
        }

        // Get normal of first vertex (they should all be the same for flat faces)
        const triNormal = new THREE.Vector3();
        triNormal.fromBufferAttribute(normalAttr, a);

        // Check if this triangle has the same normal (same logical face)
        if (normalsMatch(hitNormal, triNormal)) {
            triangleIndices.push(i);

            // Collect unique vertices
            for (const idx of [a, b, c]) {
                if (!seenVertices.has(idx)) {
                    seenVertices.add(idx);
                    vertices.push(getWorldVertex(positionAttr, idx, worldMatrix));
                }
            }
        }
    }

    return { faceId, triangleIndices, vertices };
}

/**
 * Convert normal to a face ID string
 */
function normalToFaceId(normal) {
    // Round components to handle floating point
    const x = Math.round(normal.x * 100) / 100;
    const y = Math.round(normal.y * 100) / 100;
    const z = Math.round(normal.z * 100) / 100;
    return `face_${x}_${y}_${z}`;
}

/**
 * Check if two normals match (within tolerance)
 */
function normalsMatch(n1, n2, tolerance = 0.01) {
    return (
        Math.abs(n1.x - n2.x) < tolerance &&
        Math.abs(n1.y - n2.y) < tolerance &&
        Math.abs(n1.z - n2.z) < tolerance
    );
}

/**
 * Get a vertex in world space from buffer geometry
 */
function getWorldVertex(positionAttr, index, worldMatrix) {
    const v = new THREE.Vector3();
    v.fromBufferAttribute(positionAttr, index);
    v.applyMatrix4(worldMatrix);
    return v;
}

/**
 * Project world position to screen coordinates
 */
function worldToScreen(worldPos, camera, containerRect) {
    const v = worldPos.clone().project(camera);
    return {
        x: (v.x + 1) / 2 * containerRect.width,
        y: (-v.y + 1) / 2 * containerRect.height
    };
}

/**
 * Check if cursor is near any vertex
 */
function checkVertexProximity(screenVertices, screenPoint, vertexIndices) {
    let closest = null;
    let closestDist = VERTEX_THRESHOLD_PX;

    for (let i = 0; i < screenVertices.length; i++) {
        const dist = distance2D(screenVertices[i], screenPoint);
        if (dist < closestDist) {
            closestDist = dist;
            closest = { localIndex: i, vertexIndex: vertexIndices[i] };
        }
    }

    return closest;
}

/**
 * Check if cursor is near any edge
 */
function checkEdgeProximity(screenVertices, screenPoint, edges) {
    let closest = null;
    let closestDist = EDGE_THRESHOLD_PX;

    for (const edge of edges) {
        const dist = pointToLineSegmentDistance(
            screenPoint,
            screenVertices[edge.start],
            screenVertices[edge.end]
        );

        if (dist < closestDist) {
            closestDist = dist;
            closest = { edge };
        }
    }

    return closest;
}

/**
 * 2D distance between two points
 */
function distance2D(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance from point to line segment
 */
function pointToLineSegmentDistance(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;

    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
        xx = lineStart.x;
        yy = lineStart.y;
    } else if (param > 1) {
        xx = lineEnd.x;
        yy = lineEnd.y;
    } else {
        xx = lineStart.x + param * C;
        yy = lineStart.y + param * D;
    }

    return distance2D(point, { x: xx, y: yy });
}

export default {
    detectSubElement,
    VERTEX_THRESHOLD_PX,
    EDGE_THRESHOLD_PX
};
