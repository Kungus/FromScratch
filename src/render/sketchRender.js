/**
 * FromScratch - Sketch Renderer
 * Renders sketch elements (rectangles, lines, circles) on the ground plane.
 */

import * as THREE from 'three';
import { localToWorld } from '../core/sketchPlane.js';

let scene;

// Preview shapes (shown while drawing)
let previewMesh = null;
let previewOutline = null;

// Circle segments for rendering
const CIRCLE_SEGMENTS = 48;

// Committed sketches group
let sketchGroup = null;

// Material for preview (gray, semi-transparent)
const previewMaterial = new THREE.MeshBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthTest: false
});

const previewLineMaterial = new THREE.LineBasicMaterial({
    color: 0xaaaaaa,
    linewidth: 2
});

// Material for committed sketches
const sketchFillMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide
});

const sketchLineMaterial = new THREE.LineBasicMaterial({
    color: 0x3b82f6,
    linewidth: 2
});

// Material for selected sketches
const selectedFillMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
});

const selectedLineMaterial = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    linewidth: 2
});

// Currently selected element ID
let selectedElementId = null;

// Currently hovered element ID
let hoveredElementId = null;

// Material for hovered sketches
const hoveredFillMaterial = new THREE.MeshBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide
});

const hoveredLineMaterial = new THREE.LineBasicMaterial({
    color: 0x60a5fa,
    linewidth: 2
});

/**
 * Initialize sketch rendering
 * @param {THREE.Scene} sceneRef - The main scene
 */
export function initSketchRender(sceneRef) {
    scene = sceneRef;

    // Create group for committed sketches
    sketchGroup = new THREE.Group();
    sketchGroup.name = 'sketches';
    scene.add(sketchGroup);

    console.log('Sketch renderer initialized');
}

/**
 * Offset a world point slightly along a plane's normal (or Y-up for ground).
 */
function offsetPoint(wp, plane, amount) {
    if (plane) {
        return {
            x: wp.x + plane.normal.x * amount,
            y: wp.y + plane.normal.y * amount,
            z: wp.z + plane.normal.z * amount
        };
    }
    return { x: wp.x, y: wp.y + amount, z: wp.z };
}

/**
 * Build 4 world-space corners for a rect on a plane (or ground).
 */
function rectCorners(x1, z1, x2, z2, plane, offset) {
    if (plane) {
        const corners = [
            localToWorld(x1, z1, plane),
            localToWorld(x2, z1, plane),
            localToWorld(x2, z2, plane),
            localToWorld(x1, z2, plane)
        ];
        return corners.map(c => offsetPoint(c, plane, offset));
    }
    return [
        { x: x1, y: offset, z: z1 },
        { x: x2, y: offset, z: z1 },
        { x: x2, y: offset, z: z2 },
        { x: x1, y: offset, z: z2 }
    ];
}

/**
 * Build a filled quad from 4 world-space corners.
 */
function buildQuadGeometry(corners) {
    const positions = new Float32Array(18); // 2 triangles, 3 verts each, 3 components
    // Triangle 1: 0,1,2
    positions[0] = corners[0].x; positions[1] = corners[0].y; positions[2] = corners[0].z;
    positions[3] = corners[1].x; positions[4] = corners[1].y; positions[5] = corners[1].z;
    positions[6] = corners[2].x; positions[7] = corners[2].y; positions[8] = corners[2].z;
    // Triangle 2: 0,2,3
    positions[9]  = corners[0].x; positions[10] = corners[0].y; positions[11] = corners[0].z;
    positions[12] = corners[2].x; positions[13] = corners[2].y; positions[14] = corners[2].z;
    positions[15] = corners[3].x; positions[16] = corners[3].y; positions[17] = corners[3].z;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Update the preview rectangle
 * @param {Object|null} rect - {x1, z1, x2, z2, plane?} or null to hide
 */
export function updatePreviewRect(rect) {
    // Remove existing preview
    if (previewMesh) {
        scene.remove(previewMesh);
        previewMesh.geometry.dispose();
        previewMesh = null;
    }
    if (previewOutline) {
        scene.remove(previewOutline);
        previewOutline.geometry.dispose();
        previewOutline = null;
    }

    if (!rect) return;

    const { x1, z1, x2, z2, plane } = rect;
    const width = x2 - x1;
    const height = z2 - z1;

    if (width < 0.001 || height < 0.001) return;

    const corners = rectCorners(x1, z1, x2, z2, plane, 0.02);

    // Create filled rectangle from corners
    const geometry = buildQuadGeometry(corners);
    previewMesh = new THREE.Mesh(geometry, previewMaterial);
    previewMesh.renderOrder = 100;
    scene.add(previewMesh);

    // Create outline
    const outlinePoints = corners.map(c => new THREE.Vector3(c.x, c.y, c.z));
    outlinePoints.push(outlinePoints[0].clone()); // close loop
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
    previewOutline = new THREE.Line(outlineGeometry, previewLineMaterial);
    previewOutline.renderOrder = 101;
    scene.add(previewOutline);
}

/**
 * Build circle outline points in world space.
 */
function circleWorldPoints(centerU, centerV, radius, plane, offset) {
    const points = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
        const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        const u = centerU + Math.cos(angle) * radius;
        const v = centerV + Math.sin(angle) * radius;
        const wp = plane ? localToWorld(u, v, plane) : { x: u, y: 0, z: v };
        points.push(offsetPoint(wp, plane, offset));
    }
    return points;
}

/**
 * Build a filled circle (triangle fan) from world-space rim points + center.
 */
function buildCircleFillGeometry(centerWP, rimPoints) {
    // Triangle fan: N triangles, each (center, rim[i], rim[i+1])
    const n = rimPoints.length - 1; // last point = first (closed)
    const positions = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
        const base = i * 9;
        positions[base]     = centerWP.x; positions[base + 1] = centerWP.y; positions[base + 2] = centerWP.z;
        positions[base + 3] = rimPoints[i].x; positions[base + 4] = rimPoints[i].y; positions[base + 5] = rimPoints[i].z;
        positions[base + 6] = rimPoints[i + 1].x; positions[base + 7] = rimPoints[i + 1].y; positions[base + 8] = rimPoints[i + 1].z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Update the preview circle
 * @param {Object|null} circle - {centerX, centerZ, radius, plane?} or null to hide
 */
export function updatePreviewCircle(circle) {
    // Remove existing preview
    if (previewMesh) {
        scene.remove(previewMesh);
        previewMesh.geometry.dispose();
        previewMesh = null;
    }
    if (previewOutline) {
        scene.remove(previewOutline);
        previewOutline.geometry.dispose();
        previewOutline = null;
    }

    if (!circle || circle.radius < 0.01) return;

    const { centerX, centerZ, radius, plane } = circle;

    const rimPoints = circleWorldPoints(centerX, centerZ, radius, plane, 0.02);
    const centerWP = plane
        ? offsetPoint(localToWorld(centerX, centerZ, plane), plane, 0.02)
        : { x: centerX, y: 0.02, z: centerZ };

    // Create filled circle
    const geometry = buildCircleFillGeometry(centerWP, rimPoints);
    previewMesh = new THREE.Mesh(geometry, previewMaterial);
    previewMesh.renderOrder = 100;
    scene.add(previewMesh);

    // Create outline
    const outlineVecs = rimPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlineVecs);
    previewOutline = new THREE.Line(outlineGeometry, previewLineMaterial);
    previewOutline.renderOrder = 101;
    scene.add(previewOutline);
}

/**
 * Add a committed circle to the sketch
 * @param {Object} circle - {centerX, centerZ, radius, plane?, parentBodyId?}
 * @returns {string} - ID of the created element
 */
export function addCircle(circle) {
    const { centerX, centerZ, radius, plane, parentBodyId } = circle;
    const id = circle.id || ('circle_' + Date.now());

    const circleGroup = new THREE.Group();
    circleGroup.name = id;
    circleGroup.userData = { type: 'circle', centerX, centerZ, radius, plane, parentBodyId };

    const rimPoints = circleWorldPoints(centerX, centerZ, radius, plane, 0.01);
    const centerWP = plane
        ? offsetPoint(localToWorld(centerX, centerZ, plane), plane, 0.01)
        : { x: centerX, y: 0.01, z: centerZ };

    // Filled area
    const fillGeometry = buildCircleFillGeometry(centerWP, rimPoints);
    const fillMesh = new THREE.Mesh(fillGeometry, sketchFillMaterial.clone());
    circleGroup.add(fillMesh);

    // Outline
    const outlineVecs = circleWorldPoints(centerX, centerZ, radius, plane, 0.015);
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(
        outlineVecs.map(p => new THREE.Vector3(p.x, p.y, p.z))
    );
    const outline = new THREE.Line(outlineGeometry, sketchLineMaterial.clone());
    circleGroup.add(outline);

    sketchGroup.add(circleGroup);

    console.log(`Added circle: radius ${radius.toFixed(2)} at (${centerX.toFixed(2)}, ${centerZ.toFixed(2)})`);

    return id;
}

/**
 * Add a committed rectangle to the sketch
 * @param {Object} rect - {x1, z1, x2, z2, width, height, plane?, parentBodyId?}
 * @returns {string} - ID of the created sketch element
 */
export function addRectangle(rect) {
    const { x1, z1, x2, z2, plane, parentBodyId } = rect;
    const width = x2 - x1;
    const height = z2 - z1;

    const id = rect.id || ('rect_' + Date.now());

    // Create group for this rectangle
    const rectGroup = new THREE.Group();
    rectGroup.name = id;
    rectGroup.userData = { type: 'rectangle', ...rect };

    // Filled area
    const fillCorners = rectCorners(x1, z1, x2, z2, plane, 0.01);
    const fillGeometry = buildQuadGeometry(fillCorners);
    const fillMesh = new THREE.Mesh(fillGeometry, sketchFillMaterial.clone());
    rectGroup.add(fillMesh);

    // Outline
    const outlineCorners = rectCorners(x1, z1, x2, z2, plane, 0.015);
    const outlinePoints = outlineCorners.map(c => new THREE.Vector3(c.x, c.y, c.z));
    outlinePoints.push(outlinePoints[0].clone()); // close loop
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
    const outline = new THREE.Line(outlineGeometry, sketchLineMaterial.clone());
    rectGroup.add(outline);

    sketchGroup.add(rectGroup);

    console.log(`Added rectangle: ${width.toFixed(2)} x ${height.toFixed(2)}`);

    return id;
}

/**
 * Remove a sketch element by ID
 * @param {string} id
 */
export function removeSketchElement(id) {
    const element = sketchGroup.getObjectByName(id);
    if (element) {
        sketchGroup.remove(element);
        // Dispose geometries
        element.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        // Clear selection if this was selected
        if (selectedElementId === id) {
            selectedElementId = null;
        }
        console.log(`Removed element: ${id}`);
    }
}

/**
 * Set the selected element (updates visual appearance)
 * @param {string|null} id - Element ID or null to deselect
 */
export function setSelectedElement(id) {
    // Deselect previous
    if (selectedElementId && selectedElementId !== id) {
        const prev = sketchGroup.getObjectByName(selectedElementId);
        if (prev) {
            applyMaterials(prev, sketchFillMaterial, sketchLineMaterial);
        }
    }

    selectedElementId = id;

    // Select new
    if (id) {
        const elem = sketchGroup.getObjectByName(id);
        if (elem) {
            applyMaterials(elem, selectedFillMaterial, selectedLineMaterial);
        }
    }
}

/**
 * Apply materials to an element group
 */
function applyMaterials(group, fillMat, lineMat) {
    group.traverse(obj => {
        if (obj.isMesh) {
            obj.material = fillMat.clone();
        } else if (obj.isLine) {
            obj.material = lineMat.clone();
        }
    });
}

/**
 * Set the hovered element (updates visual appearance)
 * @param {string|null} id - Element ID or null to clear hover
 */
export function setHoveredElement(id) {
    // Clear previous hover (if not selected)
    if (hoveredElementId && hoveredElementId !== id && hoveredElementId !== selectedElementId) {
        const prev = sketchGroup.getObjectByName(hoveredElementId);
        if (prev) {
            applyMaterials(prev, sketchFillMaterial, sketchLineMaterial);
        }
    }

    hoveredElementId = id;

    // Apply hover style (if not selected)
    if (id && id !== selectedElementId) {
        const elem = sketchGroup.getObjectByName(id);
        if (elem) {
            applyMaterials(elem, hoveredFillMaterial, hoveredLineMaterial);
        }
    }
}

/**
 * Move an element to a new position
 * @param {string} id - Element ID
 * @param {number} newX1 - New X1 position (or centerX for circles)
 * @param {number} newZ1 - New Z1 position (or centerZ for circles)
 */
export function moveElement(id, newX1, newZ1) {
    const element = sketchGroup.getObjectByName(id);
    if (!element) return;

    const data = element.userData;

    // Moving face-plane sketches is not yet supported
    if (data.plane) return;

    if (data.type === 'rectangle') {
        const width = data.x2 - data.x1;
        const height = data.z2 - data.z1;
        const x1 = newX1, z1 = newZ1;
        const x2 = newX1 + width, z2 = newZ1 + height;

        element.userData = { ...data, x1, z1, x2, z2 };

        // Rebuild geometry with new positions (vertices are baked in world space)
        element.traverse(obj => {
            if (obj.isMesh) {
                obj.geometry.dispose();
                obj.geometry = buildQuadGeometry(rectCorners(x1, z1, x2, z2, null, 0.01));
            } else if (obj.isLine) {
                const corners = rectCorners(x1, z1, x2, z2, null, 0.015);
                const points = corners.map(c => new THREE.Vector3(c.x, c.y, c.z));
                points.push(points[0].clone());
                obj.geometry.dispose();
                obj.geometry = new THREE.BufferGeometry().setFromPoints(points);
            }
        });
    } else if (data.type === 'circle') {
        const radius = data.radius;

        element.userData = { ...data, centerX: newX1, centerZ: newZ1 };

        element.traverse(obj => {
            if (obj.isMesh) {
                const rimPoints = circleWorldPoints(newX1, newZ1, radius, null, 0.01);
                const centerWP = { x: newX1, y: 0.01, z: newZ1 };
                obj.geometry.dispose();
                obj.geometry = buildCircleFillGeometry(centerWP, rimPoints);
            } else if (obj.isLine) {
                const outlineVecs = circleWorldPoints(newX1, newZ1, radius, null, 0.015);
                obj.geometry.dispose();
                obj.geometry = new THREE.BufferGeometry().setFromPoints(
                    outlineVecs.map(p => new THREE.Vector3(p.x, p.y, p.z))
                );
            }
        });
    }
}

/**
 * Clear all sketches
 */
export function clearAllSketches() {
    while (sketchGroup.children.length > 0) {
        const child = sketchGroup.children[0];
        sketchGroup.remove(child);
        child.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
}

/**
 * Get all sketch elements
 */
export function getSketchElements() {
    return sketchGroup.children.map(child => ({
        id: child.name,
        ...child.userData
    }));
}

/**
 * Rebuild all sketch visuals from state data (used by undo/redo restore).
 * @param {Array} sketches - Array of sketch objects from state
 */
export function syncSketchesFromState(sketches) {
    clearAllSketches();
    for (const sketch of sketches) {
        if (sketch.type === 'rectangle') {
            addRectangle(sketch);
        } else if (sketch.type === 'circle') {
            addCircle(sketch);
        }
    }
    selectedElementId = null;
    hoveredElementId = null;
}

export default {
    initSketchRender,
    updatePreviewRect,
    updatePreviewCircle,
    addRectangle,
    addCircle,
    removeSketchElement,
    clearAllSketches,
    getSketchElements,
    setSelectedElement,
    setHoveredElement,
    moveElement
};
