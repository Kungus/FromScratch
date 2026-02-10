/**
 * FromScratch - Extrude Tool
 * Click on a 2D sketch and drag up to extrude it into a 3D body.
 * Supports type-to-specify: press D to enter exact height.
 * Supports face extrusion: sketches drawn on body faces extrude outward
 * and boolean-fuse with the parent body.
 */

import * as THREE from 'three';
import { setInteracting, getBodyById } from '../core/state.js';
import { onPointer } from '../input/pointer.js';
import { getCamera } from '../input/camera.js';
import { isOCCTReady } from '../core/occtInit.js';
import { makeBox, makeCylinder, makeRectangleWire, makeCircleWire, extrudeProfile, booleanFuse, booleanCut } from '../core/occtEngine.js';
import { tessellateShape } from '../core/occtTessellate.js';
import { storeShape, getShape } from '../core/occtShapeStore.js';
import { raycastToPlane } from '../input/planeRaycast.js';

// Tool state
const toolState = {
    isActive: false,
    isExtruding: false,
    awaitingDimensions: false,
    selectedSketch: null,      // The sketch being extruded
    startScreenY: 0,           // Screen Y when extrusion started
    startScreenX: 0,           // Screen X when extrusion started
    currentHeight: 0,          // Current extrusion height
    isFaceExtrusion: false,    // True when extruding from face sketch
    plane: null,               // The sketch plane (for face extrusions)
    parentBodyId: null,        // Parent body to fuse with
    normalScreenDir: null      // {dx, dy} — face normal projected to screen space
};

// Callbacks
let onPreviewUpdate = null;     // Called while dragging with preview data
let onCommit = null;            // Called when extrusion is committed
let onRequestDimensionInput = null;  // Called when user starts typing
let getSketchElements = null;   // Function to get sketch elements for hit testing

// Unsubscribe functions for pointer events
let unsubscribers = [];

// Keydown handler reference (for removal)
let keydownHandler = null;

// Sensitivity for height from screen drag (units per pixel)
const HEIGHT_SENSITIVITY = 0.02;

/**
 * Activate the extrude tool
 */
export function activateExtrudeTool() {
    if (toolState.isActive) return;

    toolState.isActive = true;
    toolState.isExtruding = false;
    toolState.selectedSketch = null;
    toolState.isFaceExtrusion = false;
    toolState.plane = null;
    toolState.parentBodyId = null;
    toolState.normalScreenDir = null;

    // Subscribe to pointer events
    unsubscribers.push(
        onPointer('down', handlePointerDown),
        onPointer('move', handlePointerMove),
        onPointer('up', handlePointerUp)
    );

    // Add keyboard listener for type-to-specify and cancel
    keydownHandler = handleKeyDown;
    document.addEventListener('keydown', keydownHandler);

    console.log('Extrude tool activated');
}

/**
 * Deactivate the extrude tool
 */
export function deactivateExtrudeTool() {
    if (!toolState.isActive) return;

    toolState.isActive = false;
    toolState.isExtruding = false;
    toolState.selectedSketch = null;
    toolState.isFaceExtrusion = false;
    toolState.plane = null;
    toolState.parentBodyId = null;
    toolState.normalScreenDir = null;

    // Unsubscribe from pointer events
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    // Remove keyboard listener
    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    // Clear any preview
    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    console.log('Extrude tool deactivated');
}

/**
 * Set callback for preview updates
 * @param {Function} callback - Called with preview data or null
 */
export function setExtrudePreviewCallback(callback) {
    onPreviewUpdate = callback;
}

/**
 * Set callback for when extrusion is committed
 * @param {Function} callback - Called with body data
 */
export function setExtrudeCommitCallback(callback) {
    onCommit = callback;
}

/**
 * Set callback for when user wants dimension input
 * @param {Function} callback - Called with current height
 */
export function setExtrudeDimensionCallback(callback) {
    onRequestDimensionInput = callback;
}

/**
 * Set function to get sketch elements for hit testing
 * @param {Function} fn - Function that returns array of sketch elements
 */
export function setGetSketchElementsFunction(fn) {
    getSketchElements = fn;
}

/**
 * Commit extrusion with specific height (called from dimension input)
 * @param {number} height - Extrusion height
 */
export function commitWithHeight(height) {
    if (!toolState.selectedSketch) return;

    const bodyData = createBodyData(toolState.selectedSketch, height);

    // Clear preview
    if (onPreviewUpdate) {
        onPreviewUpdate(null);
    }

    // Commit
    if (onCommit) {
        onCommit(bodyData);
    }

    // Reset state
    toolState.isExtruding = false;
    toolState.awaitingDimensions = false;
    toolState.selectedSketch = null;
    toolState.isFaceExtrusion = false;
    toolState.plane = null;
    toolState.parentBodyId = null;
    toolState.normalScreenDir = null;
    setInteracting(false);
}

/**
 * Cancel the current extrusion
 */
export function cancelExtrusion() {
    if (toolState.isExtruding || toolState.awaitingDimensions) {
        toolState.isExtruding = false;
        toolState.awaitingDimensions = false;
        toolState.selectedSketch = null;
        toolState.isFaceExtrusion = false;
        toolState.plane = null;
        toolState.parentBodyId = null;
        toolState.normalScreenDir = null;
        setInteracting(false);
        if (onPreviewUpdate) {
            onPreviewUpdate(null);
        }
    }
}

// =============================================================================
// KEYBOARD HANDLER
// =============================================================================

function handleKeyDown(e) {
    // Only capture while extruding or awaiting dimensions
    if (!toolState.isExtruding && !toolState.awaitingDimensions) return;

    // Ignore if typing in an input field
    if (e.target.tagName === 'INPUT') return;

    // D key opens dimension input
    if (e.key.toLowerCase() === 'd' && !toolState.awaitingDimensions) {
        e.preventDefault();
        e.stopPropagation();

        toolState.awaitingDimensions = true;

        if (onRequestDimensionInput) {
            onRequestDimensionInput({
                currentHeight: toolState.currentHeight
            });
        }
    }

    // Escape cancels
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelExtrusion();
    }
}

// =============================================================================
// POINTER HANDLERS
// =============================================================================

function handlePointerDown(state) {
    if (!toolState.isActive) return;
    if (toolState.isExtruding) return;

    // Try to hit test a sketch element
    const sketch = hitTestSketch(state);
    if (!sketch) return;

    toolState.isExtruding = true;
    toolState.selectedSketch = sketch;
    toolState.startScreenY = state.screenY;
    toolState.startScreenX = state.screenX;
    toolState.currentHeight = 0;

    // Detect face extrusion
    if (sketch.plane && sketch.parentBodyId) {
        toolState.isFaceExtrusion = true;
        toolState.plane = sketch.plane;
        toolState.parentBodyId = sketch.parentBodyId;
        toolState.normalScreenDir = projectNormalToScreen(
            sketch.plane.origin,
            sketch.plane.normal,
            getCamera()
        );
    } else {
        toolState.isFaceExtrusion = false;
        toolState.plane = null;
        toolState.parentBodyId = null;
        toolState.normalScreenDir = null;
    }

    setInteracting(true);

    // Show initial preview
    updatePreview();
}

function handlePointerMove(state) {
    if (!toolState.isActive || !toolState.isExtruding) return;

    let height;

    if (toolState.isFaceExtrusion && toolState.normalScreenDir) {
        // Face extrusion: project mouse drag onto screen-space normal direction
        const camera = getCamera();
        const canvasContainer = document.getElementById('canvas-container');
        const rect = canvasContainer.getBoundingClientRect();
        const halfWidth = rect.width / 2;
        const halfHeight = rect.height / 2;

        const ndcDX = (state.screenX - toolState.startScreenX) / halfWidth;
        const ndcDY = -(state.screenY - toolState.startScreenY) / halfHeight;

        const dir = toolState.normalScreenDir;
        const projectedDist = ndcDX * dir.dx + ndcDY * dir.dy;

        // Scale by camera distance to face for stable feel
        const camPos = camera.position;
        const origin = toolState.plane.origin;
        const cameraDist = Math.sqrt(
            (camPos.x - origin.x) ** 2 +
            (camPos.y - origin.y) ** 2 +
            (camPos.z - origin.z) ** 2
        );

        height = projectedDist * cameraDist * 0.5;
    } else {
        // Ground plane: existing deltaY * HEIGHT_SENSITIVITY (positive only)
        const deltaY = toolState.startScreenY - state.screenY;
        height = Math.max(0.1, deltaY * HEIGHT_SENSITIVITY);
    }

    toolState.currentHeight = height;
    updatePreview();
}

function handlePointerUp(state) {
    if (!toolState.isActive || !toolState.isExtruding) return;

    // If awaiting dimensions, keep preview and wait for input
    if (toolState.awaitingDimensions) {
        toolState.isExtruding = false;
        return;
    }

    toolState.isExtruding = false;

    // Only commit if height is meaningful
    if (Math.abs(toolState.currentHeight) > 0.05 && toolState.selectedSketch) {
        const bodyData = createBodyData(toolState.selectedSketch, toolState.currentHeight);

        // Clear preview
        if (onPreviewUpdate) {
            onPreviewUpdate(null);
        }

        // Commit
        if (onCommit) {
            onCommit(bodyData);
        }
    } else {
        // Cancel - height too small
        if (onPreviewUpdate) {
            onPreviewUpdate(null);
        }
    }

    toolState.selectedSketch = null;
    toolState.isFaceExtrusion = false;
    toolState.plane = null;
    toolState.parentBodyId = null;
    toolState.normalScreenDir = null;
    setInteracting(false);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Project a face normal into screen space to determine drag direction.
 * @param {{x,y,z}} origin3D - A point on the face (e.g. plane origin)
 * @param {{x,y,z}} normal3D - The face normal (unit vector)
 * @param {THREE.Camera} camera
 * @returns {{dx: number, dy: number}} Normalized 2D screen direction
 */
function projectNormalToScreen(origin3D, normal3D, camera) {
    const p0 = new THREE.Vector3(origin3D.x, origin3D.y, origin3D.z);
    const p1 = new THREE.Vector3(
        origin3D.x + normal3D.x,
        origin3D.y + normal3D.y,
        origin3D.z + normal3D.z
    );

    p0.project(camera);
    p1.project(camera);

    let dx = p1.x - p0.x;
    let dy = p1.y - p0.y;

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) {
        // Normal points directly at/away from camera — fall back to up
        return { dx: 0, dy: 1 };
    }

    return { dx: dx / len, dy: dy / len };
}

/**
 * Hit test sketch elements at pointer position.
 * For face-plane sketches, raycasts to the sketch plane for local coords.
 * For ground-plane sketches, uses worldX/worldZ directly.
 * @param {Object} state - Pointer state from pointer.js
 * @returns {Object|null} - Sketch element data or null
 */
function hitTestSketch(state) {
    if (!getSketchElements) return null;

    const elements = getSketchElements();
    const camera = getCamera();

    for (const elem of elements) {
        let u, v;

        if (elem.plane) {
            // Face-plane sketch: raycast to the sketch plane
            const result = raycastToPlane(state.ndcX, state.ndcY, elem.plane, camera);
            if (!result) continue;
            u = result.localPoint.u;
            v = result.localPoint.v;
        } else {
            // Ground-plane sketch
            u = state.worldX;
            v = state.worldZ;
        }

        if (elem.type === 'rectangle') {
            if (u >= elem.x1 && u <= elem.x2 &&
                v >= elem.z1 && v <= elem.z2) {
                return elem;
            }
        } else if (elem.type === 'circle') {
            const du = u - elem.centerX;
            const dv = v - elem.centerZ;
            const dist = Math.sqrt(du * du + dv * dv);
            if (dist <= elem.radius) {
                return elem;
            }
        }
    }

    return null;
}

/**
 * Create body data from sketch and height.
 * If OCCT is ready, creates a real B-rep shape and tessellates it.
 * For face sketches, extrudes along face normal and fuses with parent body.
 * @param {Object} sketch - Sketch element data
 * @param {number} height - Extrusion height
 * @returns {Object} - Body data
 */
function createBodyData(sketch, height) {
    const base = sketch.type === 'rectangle'
        ? { x1: sketch.x1, z1: sketch.z1, x2: sketch.x2, z2: sketch.z2 }
        : { centerX: sketch.centerX, centerZ: sketch.centerZ, radius: sketch.radius };

    const bodyData = {
        id: 'body_' + Date.now(),
        type: 'extruded',
        sourceType: sketch.type,
        sourceId: sketch.id,
        base,
        height,
        baseY: 0,
        occtShapeRef: null,
        tessellation: null,
        isFaceExtrusion: false,
        parentBodyId: null
    };

    // Face extrusion path: wire → extrude along normal → fuse with parent
    if (sketch.plane && sketch.parentBodyId && isOCCTReady()) {
        try {
            // 1. Create wire on the face plane
            let wire;
            if (sketch.type === 'rectangle') {
                wire = makeRectangleWire(base.x1, base.z1, base.x2, base.z2, sketch.plane);
            } else if (sketch.type === 'circle') {
                wire = makeCircleWire(base.centerX, base.centerZ, base.radius, sketch.plane);
            }

            if (wire) {
                // 2. Extrude along face normal
                const n = sketch.plane.normal;
                const direction = { x: n.x * height, y: n.y * height, z: n.z * height };
                const extrudedShape = extrudeProfile(wire, direction);
                wire.delete();

                // 3. Boolean op with parent body: fuse (positive) or cut (negative)
                const parentBody = getBodyById(sketch.parentBodyId);
                const parentShape = parentBody ? getShape(parentBody.occtShapeRef) : null;

                if (parentShape) {
                    let resultShape;
                    try {
                        if (height > 0) {
                            resultShape = booleanFuse(parentShape, extrudedShape);
                        } else {
                            resultShape = booleanCut(parentShape, extrudedShape);
                        }
                    } catch (boolErr) {
                        // Boolean failed — fall through to standalone path
                        console.warn('OCCT: Boolean with parent failed, creating standalone extrusion:', boolErr.message || boolErr);
                        resultShape = null;
                    }

                    if (resultShape && !resultShape.IsNull()) {
                        extrudedShape.delete();
                        bodyData.occtShapeRef = storeShape(resultShape);
                        bodyData.tessellation = tessellateShape(resultShape);
                        bodyData.isFaceExtrusion = true;
                        bodyData.parentBodyId = sketch.parentBodyId;

                        const opName = height > 0 ? 'fused' : 'cut';
                        console.log(`OCCT: Face extrusion ${opName} — ${bodyData.tessellation.faceMap.length} faces, ${bodyData.tessellation.edgeMap.length} edges`);
                    } else {
                        // Boolean failed or produced null — add as standalone body
                        if (resultShape) resultShape.delete();
                        bodyData.occtShapeRef = storeShape(extrudedShape);
                        bodyData.tessellation = tessellateShape(extrudedShape);
                        console.warn('OCCT: Boolean produced invalid result, creating standalone extrusion');
                    }
                } else {
                    // No parent shape available — store standalone
                    bodyData.occtShapeRef = storeShape(extrudedShape);
                    bodyData.tessellation = tessellateShape(extrudedShape);
                    console.warn('OCCT: Parent shape not found, creating standalone extrusion');
                }
            }
        } catch (err) {
            console.warn('OCCT: Face extrusion failed:', err.message || err);
            // Don't set isFaceExtrusion — bodyData stays as standalone (non-face)
            // with null shape/tessellation, which means commit callback adds a new
            // (empty) body instead of destroying the parent
        }

        return bodyData;
    }

    // Ground plane path: standard makeBox/makeCylinder
    if (isOCCTReady()) {
        try {
            let shape;
            if (sketch.type === 'rectangle') {
                shape = makeBox(base.x1, base.z1, base.x2, base.z2, height, 0);
            } else if (sketch.type === 'circle') {
                shape = makeCylinder(base.centerX, base.centerZ, base.radius, height, 0);
            }

            if (shape) {
                bodyData.occtShapeRef = storeShape(shape);
                bodyData.tessellation = tessellateShape(shape);
                console.log(`OCCT: Created ${sketch.type} shape — ${bodyData.tessellation.faceMap.length} faces, ${bodyData.tessellation.edgeMap.length} edges, ${bodyData.tessellation.vertexMap.length} vertices`);
            }
        } catch (err) {
            console.warn('OCCT: Shape creation failed, falling back to mesh-based', err);
            bodyData.occtShapeRef = null;
            bodyData.tessellation = null;
        }
    }

    return bodyData;
}

/**
 * Update the preview
 */
function updatePreview() {
    if (!toolState.selectedSketch || !onPreviewUpdate) return;

    const previewData = {
        sourceType: toolState.selectedSketch.type,
        base: toolState.selectedSketch.type === 'rectangle'
            ? { x1: toolState.selectedSketch.x1, z1: toolState.selectedSketch.z1,
                x2: toolState.selectedSketch.x2, z2: toolState.selectedSketch.z2 }
            : { centerX: toolState.selectedSketch.centerX, centerZ: toolState.selectedSketch.centerZ,
                radius: toolState.selectedSketch.radius },
        height: toolState.currentHeight,
        baseY: 0,
        isFaceExtrusion: toolState.isFaceExtrusion,
        plane: toolState.plane,
        parentBodyId: toolState.parentBodyId
    };

    onPreviewUpdate(previewData);
}

/**
 * Check if tool is active
 */
export function isExtrudeToolActive() {
    return toolState.isActive;
}

/**
 * Check if currently extruding
 */
export function isExtruding() {
    return toolState.isExtruding;
}

/**
 * Get current height being extruded
 */
export function getCurrentHeight() {
    return toolState.currentHeight;
}

export default {
    activateExtrudeTool,
    deactivateExtrudeTool,
    setExtrudePreviewCallback,
    setExtrudeCommitCallback,
    setExtrudeDimensionCallback,
    setGetSketchElementsFunction,
    commitWithHeight,
    cancelExtrusion,
    isExtrudeToolActive,
    isExtruding,
    getCurrentHeight
};
