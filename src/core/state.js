/**
 * FromScratch - State Module
 * Single source of truth for the entire application.
 * The renderer displays this state; it never owns geometry.
 */

// Application state - this is THE source of truth
const state = {
    // Document data (what the user is building)
    document: {
        sketches: [],
        bodies: [],
        activeSketchPlane: null
    },
    
    // Viewport settings
    viewport: {
        gridSize: 0.5,          // Grid cell size in units
        gridDivisions: 20,      // Number of grid lines
        snapEnabled: true,      // Is grid snap active?
        snapSize: 0.25          // Snap increment (can differ from visual grid)
    },
    
    // Current interaction state
    interaction: {
        activeTool: 'select',   // Current tool name
        selection: [],          // Currently selected items (sketches)
        hovered: null,          // Item under cursor (sketches)
        isInteracting: false,   // Is a tool actively using the pointer?

        // Body selection state (for 3D bodies - face/edge/vertex)
        bodySelection: {
            type: null,             // 'body' | 'face' | 'edge' | 'vertex' | null
            bodyId: null,           // ID of selected body
            subElementIndex: null,  // Face index, edge key, or vertex index
            subElementData: null    // Additional data (normal, positions, etc.)
        },
        bodyHover: {
            type: null,
            bodyId: null,
            subElementIndex: null,
            subElementData: null
        },

        // Multi-selection for edges (Shift+click accumulation)
        bodyMultiSelection: []
    },
    
    // Camera state (for save/restore views)
    camera: {
        position: { x: 5, y: 5, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        isOrthographic: false
    }
};

// Listeners for state changes
const listeners = new Set();

/**
 * Subscribe to state changes
 * @param {Function} callback - Called when state changes
 * @returns {Function} Unsubscribe function
 */
export function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

/**
 * Notify all listeners of state change
 * @param {string} changedPath - Dot-notation path of what changed (e.g., 'viewport.gridSize')
 */
function notify(changedPath) {
    listeners.forEach(callback => callback(state, changedPath));
}

// =============================================================================
// STATE ACCESSORS (read)
// =============================================================================

export function getState() {
    return state;
}

export function getGridSize() {
    return state.viewport.gridSize;
}

export function getSnapSize() {
    return state.viewport.snapSize;
}

export function isSnapEnabled() {
    return state.viewport.snapEnabled;
}

export function getActiveTool() {
    return state.interaction.activeTool;
}

export function getSelection() {
    return state.interaction.selection;
}

export function isInteracting() {
    return state.interaction.isInteracting;
}

export function setInteracting(value) {
    state.interaction.isInteracting = value;
}

// =============================================================================
// STATE MUTATORS (write)
// =============================================================================

export function setGridSize(size) {
    if (size > 0 && size !== state.viewport.gridSize) {
        state.viewport.gridSize = size;
        notify('viewport.gridSize');
    }
}

export function setSnapSize(size) {
    if (size > 0 && size !== state.viewport.snapSize) {
        state.viewport.snapSize = size;
        notify('viewport.snapSize');
    }
}

export function setSnapEnabled(enabled) {
    if (enabled !== state.viewport.snapEnabled) {
        state.viewport.snapEnabled = enabled;
        notify('viewport.snapEnabled');
    }
}

export function setActiveTool(toolName) {
    if (toolName !== state.interaction.activeTool) {
        state.interaction.activeTool = toolName;
        notify('interaction.activeTool');
    }
}

export function setSelection(items) {
    state.interaction.selection = Array.isArray(items) ? items : [items];
    notify('interaction.selection');
}

export function clearSelection() {
    if (state.interaction.selection.length > 0) {
        state.interaction.selection = [];
        notify('interaction.selection');
    }
}

// =============================================================================
// BODY SELECTION (3D bodies - face/edge/vertex)
// =============================================================================

/**
 * Set body selection state
 * @param {string} type - 'body' | 'face' | 'edge' | 'vertex' | null
 * @param {string} bodyId - ID of the body
 * @param {*} subElementIndex - Index/key of sub-element (face index, edge key, vertex index)
 * @param {Object} subElementData - Additional data (normal, positions, etc.)
 */
export function setBodySelection(type, bodyId, subElementIndex = null, subElementData = null, faceResult = null) {
    state.interaction.bodySelection = { type, bodyId, subElementIndex, subElementData, faceResult };
    notify('interaction.bodySelection');
}

/**
 * Set body hover state
 */
export function setBodyHover(type, bodyId, subElementIndex = null, subElementData = null, faceResult = null) {
    state.interaction.bodyHover = { type, bodyId, subElementIndex, subElementData, faceResult };
    notify('interaction.bodyHover');
}

/**
 * Get current body selection
 */
export function getBodySelection() {
    return state.interaction.bodySelection;
}

/**
 * Get current body hover
 */
export function getBodyHover() {
    return state.interaction.bodyHover;
}

/**
 * Clear body selection
 */
export function clearBodySelection() {
    state.interaction.bodySelection = {
        type: null, bodyId: null, subElementIndex: null, subElementData: null, faceResult: null
    };
    notify('interaction.bodySelection');
}

/**
 * Clear body hover
 */
export function clearBodyHover() {
    state.interaction.bodyHover = {
        type: null, bodyId: null, subElementIndex: null, subElementData: null, faceResult: null
    };
    notify('interaction.bodyHover');
}

// =============================================================================
// BODY MULTI-SELECTION (Shift+click edge accumulation)
// =============================================================================

/**
 * Add a sub-element to multi-selection (toggle: remove if already present)
 * @param {string} type - 'edge' (for now)
 * @param {string} bodyId
 * @param {*} subElementIndex
 * @param {Object} subElementData
 * @returns {boolean} true if added, false if removed
 */
export function toggleBodyMultiSelection(type, bodyId, subElementIndex, subElementData) {
    const existing = state.interaction.bodyMultiSelection.findIndex(
        s => s.bodyId === bodyId && s.subElementIndex === subElementIndex
    );
    if (existing !== -1) {
        state.interaction.bodyMultiSelection.splice(existing, 1);
        notify('interaction.bodyMultiSelection');
        return false;
    } else {
        state.interaction.bodyMultiSelection.push({ type, bodyId, subElementIndex, subElementData });
        notify('interaction.bodyMultiSelection');
        return true;
    }
}

/**
 * Get all multi-selected items
 */
export function getBodyMultiSelection() {
    return state.interaction.bodyMultiSelection;
}

/**
 * Clear multi-selection
 */
export function clearBodyMultiSelection() {
    if (state.interaction.bodyMultiSelection.length > 0) {
        state.interaction.bodyMultiSelection = [];
        notify('interaction.bodyMultiSelection');
    }
}

// =============================================================================
// BODY MANAGEMENT
// =============================================================================

/**
 * Add a 3D body to the document
 * @param {Object} body - Body data {id, type, sourceType, base, height, baseY}
 */
export function addBody(body) {
    state.document.bodies.push(body);
    notify('document.bodies');
}

/**
 * Remove a body by ID
 * Cleans up OCCT shape if present.
 * @param {string} id - Body ID to remove
 */
export function removeBody(id) {
    const idx = state.document.bodies.findIndex(b => b.id === id);
    if (idx !== -1) {
        const body = state.document.bodies[idx];
        // Clean up OCCT shape via the store
        if (body.occtShapeRef && _removeShapeFn) {
            _removeShapeFn(body.occtShapeRef);
        }
        state.document.bodies.splice(idx, 1);
        notify('document.bodies');
    }
}

/**
 * Get a body by ID
 * @param {string} id - Body ID
 * @returns {Object|null} Body object or null
 */
export function getBodyById(id) {
    return state.document.bodies.find(b => b.id === id) || null;
}

/**
 * Update a body's data (e.g. after boolean op changes its shape)
 * @param {string} id - Body ID
 * @param {Object} updates - Fields to merge
 */
export function updateBody(id, updates) {
    const body = state.document.bodies.find(b => b.id === id);
    if (body) {
        Object.assign(body, updates);
        notify('document.bodies');
    }
}

// Callback for OCCT shape cleanup (set by main.js to avoid circular deps)
let _removeShapeFn = null;

/**
 * Register the shape removal function (called once from main.js)
 * @param {Function} fn - removeShape from occtShapeStore
 */
export function setShapeRemovalFn(fn) {
    _removeShapeFn = fn;
}

/**
 * Get all bodies
 * @returns {Array} Array of body objects
 */
export function getBodies() {
    return state.document.bodies;
}

// =============================================================================
// SKETCH MANAGEMENT
// =============================================================================

/**
 * Add a sketch to the document
 * @param {Object} sketch - {id, type, ...shape data}
 */
export function addSketch(sketch) {
    state.document.sketches.push(sketch);
    notify('document.sketches');
}

/**
 * Remove a sketch by ID
 * @param {string} id
 */
export function removeSketch(id) {
    const idx = state.document.sketches.findIndex(s => s.id === id);
    if (idx !== -1) {
        state.document.sketches.splice(idx, 1);
        notify('document.sketches');
    }
}

/**
 * Update a sketch's data
 * @param {string} id
 * @param {Object} updates - Fields to merge
 */
export function updateSketch(id, updates) {
    const sketch = state.document.sketches.find(s => s.id === id);
    if (sketch) {
        Object.assign(sketch, updates);
        notify('document.sketches');
    }
}

/**
 * Get all sketches
 * @returns {Array}
 */
export function getSketches() {
    return state.document.sketches;
}

/**
 * Get a sketch by ID
 * @param {string} id
 * @returns {Object|null}
 */
export function getSketchById(id) {
    return state.document.sketches.find(s => s.id === id) || null;
}

/**
 * Replace the entire document (used by undo/redo restore).
 * @param {Object} newDoc - { sketches, bodies }
 */
export function replaceDocument(newDoc) {
    state.document.sketches = newDoc.sketches;
    state.document.bodies = newDoc.bodies;
    notify('document');
}

// =============================================================================
// SKETCH PLANE (for sketch-on-face mode)
// =============================================================================

/**
 * Set the active sketch plane (entering sketch-on-face mode)
 * @param {SketchPlane} plane - {origin, normal, uAxis, vAxis} or null
 * @param {string|null} parentBodyId - ID of the body whose face we're sketching on
 */
export function setActiveSketchPlane(plane, parentBodyId = null) {
    state.document.activeSketchPlane = plane;
    state.document.sketchPlaneBodyId = parentBodyId;
    notify('document.activeSketchPlane');
}

/**
 * Get the active sketch plane
 * @returns {SketchPlane|null}
 */
export function getActiveSketchPlane() {
    return state.document.activeSketchPlane;
}

/**
 * Get the body ID associated with the active sketch plane
 * @returns {string|null}
 */
export function getSketchPlaneBodyId() {
    return state.document.sketchPlaneBodyId || null;
}

/**
 * Clear the active sketch plane (exiting sketch-on-face mode)
 */
export function clearActiveSketchPlane() {
    state.document.activeSketchPlane = null;
    state.document.sketchPlaneBodyId = null;
    notify('document.activeSketchPlane');
}

export function setCameraState(position, target, isOrthographic) {
    state.camera.position = { ...position };
    state.camera.target = { ...target };
    state.camera.isOrthographic = isOrthographic;
    notify('camera');
}

// =============================================================================
// SNAP HELPER
// =============================================================================

/**
 * Snap a value to the grid if snapping is enabled
 * @param {number} value - The value to snap
 * @returns {number} - Snapped value (or original if snap disabled)
 */
export function snapToGrid(value) {
    if (!state.viewport.snapEnabled) {
        return value;
    }
    const snap = state.viewport.snapSize;
    return Math.round(value / snap) * snap;
}

/**
 * Snap a 2D point to the grid
 * @param {number} x 
 * @param {number} y 
 * @returns {{x: number, y: number}}
 */
export function snapPoint2D(x, y) {
    return {
        x: snapToGrid(x),
        y: snapToGrid(y)
    };
}

/**
 * Snap a 3D point to the grid (snaps x and z, y is usually height)
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @returns {{x: number, y: number, z: number}}
 */
export function snapPoint3D(x, y, z) {
    return {
        x: snapToGrid(x),
        y: y,  // Don't snap Y by default (it's height)
        z: snapToGrid(z)
    };
}

export default state;
