/**
 * FromScratch - OCCT Shape Store
 * Registry of live TopoDS_Shape objects.
 * State holds string ref IDs; this module holds the actual OCCT objects.
 * Handles memory cleanup (.delete()) when shapes are removed.
 */

let nextId = 1;
const shapes = new Map(); // refId → { shape, refCount }

/**
 * Store an OCCT shape and return a ref ID
 * @param {Object} shape - A TopoDS_Shape (or subclass)
 * @returns {string} Reference ID
 */
export function storeShape(shape) {
    const refId = 'occt_shape_' + (nextId++);
    shapes.set(refId, { shape, refCount: 1 });
    return refId;
}

/**
 * Get a shape by ref ID
 * @param {string} refId
 * @returns {Object|null} The TopoDS_Shape or null
 */
export function getShape(refId) {
    const entry = shapes.get(refId);
    return entry ? entry.shape : null;
}

/**
 * Increment reference count (used by undo/redo snapshots)
 * @param {string} refId
 */
export function retainShape(refId) {
    const entry = shapes.get(refId);
    if (entry) entry.refCount++;
}

/**
 * Decrement reference count, free OCCT memory when it reaches 0
 * @param {string} refId
 */
export function releaseShape(refId) {
    const entry = shapes.get(refId);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
        entry.shape.delete();
        shapes.delete(refId);
    }
}

/**
 * Remove a shape (decrements ref count; frees when no references remain)
 * @param {string} refId
 */
export function removeShape(refId) {
    releaseShape(refId);
}

/**
 * Get the number of stored shapes (for debugging)
 * @returns {number}
 */
export function getShapeCount() {
    return shapes.size;
}
