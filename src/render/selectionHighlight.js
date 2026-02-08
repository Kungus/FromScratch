/**
 * FromScratch - Selection Highlight Renderer
 * Visual feedback for body/face/edge/vertex selection and hover states.
 */

import * as THREE from 'three';

let scene;
let highlightGroup;

// Shared geometries
const vertexGeometry = new THREE.SphereGeometry(0.05, 16, 16);

// Materials for hover state (green)
const vertexHoverMaterial = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.9,
    depthTest: false
});

const edgeHoverMaterial = new THREE.LineBasicMaterial({
    color: 0x22c55e,
    linewidth: 2
});

const faceHoverMaterial = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthTest: false
});

const bodyHoverMaterial = new THREE.LineBasicMaterial({
    color: 0x22c55e,
    linewidth: 2
});

// Materials for selection state (cyan)
const vertexSelectMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    depthTest: false
});

const edgeSelectMaterial = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    linewidth: 2
});

const faceSelectMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthTest: false
});

const bodySelectMaterial = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    linewidth: 2
});

// Current highlight objects
let hoverHighlight = null;
let selectionHighlight = null;
let multiSelectionHighlights = [];

/**
 * Initialize selection highlight rendering
 * @param {THREE.Scene} sceneRef
 */
export function initSelectionHighlight(sceneRef) {
    scene = sceneRef;

    highlightGroup = new THREE.Group();
    highlightGroup.name = 'selectionHighlights';
    highlightGroup.renderOrder = 1000;
    scene.add(highlightGroup);

    console.log('Selection highlight initialized');
}

/**
 * Update hover highlight
 * @param {Object} hoverState - {type, bodyId, subElementIndex, subElementData}
 * @param {THREE.Group} bodyGroupRef - Reference to body group
 */
export function updateHoverHighlight(hoverState, bodyGroupRef) {
    clearHoverHighlight();

    if (!hoverState || !hoverState.type) return;

    switch (hoverState.type) {
        case 'vertex':
            if (hoverState.subElementData?.position) {
                hoverHighlight = createVertexHighlight(
                    hoverState.subElementData.position,
                    vertexHoverMaterial
                );
            }
            break;
        case 'edge':
            if (hoverState.subElementData?.polylineVertices) {
                // OCCT edge with polyline data
                hoverHighlight = createPolylineEdgeHighlight(
                    hoverState.subElementData.polylineVertices,
                    edgeHoverMaterial
                );
            } else if (hoverState.subElementData?.startVertex && hoverState.subElementData?.endVertex) {
                hoverHighlight = createEdgeHighlight(
                    hoverState.subElementData.startVertex,
                    hoverState.subElementData.endVertex,
                    edgeHoverMaterial
                );
            }
            break;
        case 'face':
            if (hoverState.subElementData?.facePositions) {
                // OCCT face: use exact tessellation triangles
                hoverHighlight = createFaceHighlightFromTriangles(
                    hoverState.subElementData.facePositions,
                    faceHoverMaterial
                );
            } else if (hoverState.subElementData?.allVertices) {
                // Fallback: convex polygon from vertices
                hoverHighlight = createFaceHighlight(
                    hoverState.subElementData.allVertices,
                    faceHoverMaterial
                );
            }
            break;
        case 'body':
            if (hoverState.bodyId && bodyGroupRef) {
                hoverHighlight = createBodyOutline(
                    hoverState.bodyId,
                    bodyGroupRef,
                    bodyHoverMaterial
                );
            }
            break;
    }

    if (hoverHighlight) {
        highlightGroup.add(hoverHighlight);
    }
}

/**
 * Update selection highlight
 * @param {Object} selectionState - {type, bodyId, subElementIndex, subElementData}
 * @param {THREE.Group} bodyGroupRef
 */
export function updateSelectionHighlight(selectionState, bodyGroupRef) {
    clearSelectionHighlight();

    if (!selectionState || !selectionState.type) return;

    switch (selectionState.type) {
        case 'vertex':
            if (selectionState.subElementData?.position) {
                selectionHighlight = createVertexHighlight(
                    selectionState.subElementData.position,
                    vertexSelectMaterial
                );
            }
            break;
        case 'edge':
            if (selectionState.subElementData?.polylineVertices) {
                // OCCT edge with polyline data
                selectionHighlight = createPolylineEdgeHighlight(
                    selectionState.subElementData.polylineVertices,
                    edgeSelectMaterial
                );
            } else if (selectionState.subElementData?.startVertex && selectionState.subElementData?.endVertex) {
                selectionHighlight = createEdgeHighlight(
                    selectionState.subElementData.startVertex,
                    selectionState.subElementData.endVertex,
                    edgeSelectMaterial
                );
            }
            break;
        case 'face':
            if (selectionState.subElementData?.facePositions) {
                // OCCT face: use exact tessellation triangles
                selectionHighlight = createFaceHighlightFromTriangles(
                    selectionState.subElementData.facePositions,
                    faceSelectMaterial
                );
            } else if (selectionState.subElementData?.allVertices) {
                // Fallback: convex polygon from vertices
                selectionHighlight = createFaceHighlight(
                    selectionState.subElementData.allVertices,
                    faceSelectMaterial
                );
            }
            break;
        case 'body':
            if (selectionState.bodyId && bodyGroupRef) {
                selectionHighlight = createBodyOutline(
                    selectionState.bodyId,
                    bodyGroupRef,
                    bodySelectMaterial
                );
            }
            break;
    }

    if (selectionHighlight) {
        highlightGroup.add(selectionHighlight);
    }
}

/**
 * Create vertex highlight (sphere)
 */
function createVertexHighlight(position, material) {
    const mesh = new THREE.Mesh(vertexGeometry, material.clone());
    mesh.position.copy(position);
    mesh.renderOrder = 1001;
    return mesh;
}

/**
 * Create edge highlight (thick line)
 */
function createEdgeHighlight(startVertex, endVertex, material) {
    const geometry = new THREE.BufferGeometry().setFromPoints([startVertex, endVertex]);
    const line = new THREE.Line(geometry, material.clone());
    line.renderOrder = 1001;
    return line;
}

/**
 * Create edge highlight from polyline vertices (OCCT edge data)
 * @param {Array} vertices - Array of {x, y, z} points along the edge
 * @param {THREE.Material} material
 */
function createPolylineEdgeHighlight(vertices, material) {
    if (!vertices || vertices.length < 2) return null;
    const points = vertices.map(v => new THREE.Vector3(v.x, v.y, v.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material.clone());
    line.renderOrder = 1001;
    return line;
}

/**
 * Create face highlight from exact tessellation triangles (OCCT faces).
 * Correctly handles non-convex faces and faces with holes.
 * @param {Float32Array} positions - Triangle vertex positions (3 floats per vertex, 3 vertices per tri)
 * @param {THREE.Material} material
 */
function createFaceHighlightFromTriangles(positions, material) {
    if (!positions || positions.length < 9) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.renderOrder = 1000;
    return mesh;
}

/**
 * Create face highlight (handles full logical face, not just one triangle)
 */
function createFaceHighlight(vertices, material) {
    if (!vertices || vertices.length < 3) return null;

    // For 3 vertices, it's a single triangle
    if (vertices.length === 3) {
        return createTriangleHighlight(vertices, material);
    }

    // For 4+ vertices, create a polygon using triangle fan from centroid
    // First, calculate centroid
    const centroid = new THREE.Vector3();
    for (const v of vertices) {
        centroid.add(v);
    }
    centroid.divideScalar(vertices.length);

    // Sort vertices by angle around centroid (for proper polygon winding)
    // Use the face normal to determine the sorting plane
    const sortedVertices = sortVerticesByAngle(vertices, centroid);

    // Create triangle fan from centroid
    const positions = [];
    for (let i = 0; i < sortedVertices.length; i++) {
        const v1 = sortedVertices[i];
        const v2 = sortedVertices[(i + 1) % sortedVertices.length];

        // Triangle: centroid, v1, v2
        positions.push(
            centroid.x, centroid.y, centroid.z,
            v1.x, v1.y, v1.z,
            v2.x, v2.y, v2.z
        );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.renderOrder = 1000;
    return mesh;
}

/**
 * Create a single triangle highlight
 */
function createTriangleHighlight(vertices, material) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
        vertices[0].x, vertices[0].y, vertices[0].z,
        vertices[1].x, vertices[1].y, vertices[1].z,
        vertices[2].x, vertices[2].y, vertices[2].z
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.renderOrder = 1000;
    return mesh;
}

/**
 * Sort vertices by angle around centroid for proper polygon winding
 */
function sortVerticesByAngle(vertices, centroid) {
    // Determine the primary plane (use the dominant axis of the face)
    // Calculate a rough normal from first 3 vertices
    const v0 = vertices[0].clone().sub(centroid);
    const v1 = vertices[1].clone().sub(centroid);
    const normal = new THREE.Vector3().crossVectors(v0, v1).normalize();

    // Determine which axes to use for angle calculation
    const absNormal = new THREE.Vector3(
        Math.abs(normal.x),
        Math.abs(normal.y),
        Math.abs(normal.z)
    );

    let getAngle;
    if (absNormal.y >= absNormal.x && absNormal.y >= absNormal.z) {
        // Horizontal face (top/bottom) - use X and Z
        getAngle = (v) => Math.atan2(v.z - centroid.z, v.x - centroid.x);
    } else if (absNormal.x >= absNormal.z) {
        // Vertical face facing X - use Y and Z
        getAngle = (v) => Math.atan2(v.z - centroid.z, v.y - centroid.y);
    } else {
        // Vertical face facing Z - use X and Y
        getAngle = (v) => Math.atan2(v.y - centroid.y, v.x - centroid.x);
    }

    return [...vertices].sort((a, b) => getAngle(a) - getAngle(b));
}

/**
 * Create body outline highlight (clone edge lines)
 */
function createBodyOutline(bodyId, bodyGroupRef, material) {
    const bodyGroup = bodyGroupRef.getObjectByName(bodyId);
    if (!bodyGroup) return null;

    const outlineGroup = new THREE.Group();

    bodyGroup.traverse(obj => {
        if (obj.isLineSegments || obj.isLine) {
            const HighlightClass = obj.isLineSegments ? THREE.LineSegments : THREE.Line;
            const highlightEdges = new HighlightClass(
                obj.geometry,
                material.clone()
            );
            // Copy world transform
            highlightEdges.position.copy(obj.position);
            highlightEdges.rotation.copy(obj.rotation);
            highlightEdges.scale.copy(obj.scale);
            highlightEdges.renderOrder = 1001;
            outlineGroup.add(highlightEdges);
        }
    });

    return outlineGroup;
}

/**
 * Clear hover highlight
 */
function clearHoverHighlight() {
    if (hoverHighlight) {
        highlightGroup.remove(hoverHighlight);
        disposeHighlight(hoverHighlight);
        hoverHighlight = null;
    }
}

/**
 * Clear selection highlight
 */
function clearSelectionHighlight() {
    if (selectionHighlight) {
        highlightGroup.remove(selectionHighlight);
        disposeHighlight(selectionHighlight);
        selectionHighlight = null;
    }
}

/**
 * Dispose highlight object
 */
function disposeHighlight(obj) {
    if (obj.isGroup) {
        obj.traverse(child => {
            if (child.geometry && child.geometry !== vertexGeometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                child.material.dispose();
            }
        });
    } else {
        if (obj.geometry && obj.geometry !== vertexGeometry) {
            obj.geometry.dispose();
        }
        if (obj.material) {
            obj.material.dispose();
        }
    }
}

/**
 * Update multi-selection highlights (e.g. multiple Shift+clicked edges)
 * @param {Array} items - Array of {type, bodyId, subElementIndex, subElementData}
 */
export function updateMultiSelectionHighlight(items) {
    clearMultiSelectionHighlights();

    if (!items || items.length === 0) return;

    for (const item of items) {
        let highlight = null;

        if (item.type === 'edge') {
            if (item.subElementData?.polylineVertices) {
                highlight = createPolylineEdgeHighlight(
                    item.subElementData.polylineVertices,
                    edgeSelectMaterial
                );
            } else if (item.subElementData?.startVertex && item.subElementData?.endVertex) {
                highlight = createEdgeHighlight(
                    item.subElementData.startVertex,
                    item.subElementData.endVertex,
                    edgeSelectMaterial
                );
            }
        }

        if (highlight) {
            multiSelectionHighlights.push(highlight);
            highlightGroup.add(highlight);
        }
    }
}

/**
 * Clear multi-selection highlights
 */
function clearMultiSelectionHighlights() {
    for (const h of multiSelectionHighlights) {
        highlightGroup.remove(h);
        disposeHighlight(h);
    }
    multiSelectionHighlights = [];
}

/**
 * Clear all highlights
 */
export function clearAllHighlights() {
    clearHoverHighlight();
    clearSelectionHighlight();
    clearMultiSelectionHighlights();
}

export default {
    initSelectionHighlight,
    updateHoverHighlight,
    updateSelectionHighlight,
    updateMultiSelectionHighlight,
    clearAllHighlights
};
