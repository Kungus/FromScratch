/**
 * FromScratch - Undo/Redo System
 * Snapshot-based: before each undoable mutation, deep-clone state.document.
 * On undo/redo, restore snapshot + rebuild visuals via callback.
 * OCCT shapes use reference counting to survive across snapshots.
 */

import { getState, replaceDocument, clearBodySelection, clearBodyHover, clearBodyMultiSelection, clearSelection } from './state.js';
import { retainShape, releaseShape } from './occtShapeStore.js';

const MAX_UNDO = 50;

let undoStack = [];
let redoStack = [];
let _onRestore = null;

/**
 * One-time init: provide the restore callback.
 * @param {Object} opts
 * @param {Function} opts.onRestore - Called after state is replaced; must rebuild all visuals.
 */
export function initUndoRedo({ onRestore }) {
    _onRestore = onRestore;
}

/**
 * Deep-clone a body array entry, including typed arrays in tessellation.
 */
function cloneBody(body) {
    const clone = { ...body };
    if (body.tessellation) {
        const t = body.tessellation;
        clone.tessellation = {
            ...t,
            positions: t.positions ? new Float32Array(t.positions) : null,
            indices: t.indices ? new Uint32Array(t.indices) : null,
            normals: t.normals ? new Float32Array(t.normals) : null,
            faceMap: t.faceMap ? t.faceMap.map(f => ({ ...f })) : null,
            edgeMap: t.edgeMap ? t.edgeMap.map(e => ({
                ...e,
                positions: e.positions ? new Float32Array(e.positions) : null
            })) : null,
            vertexMap: t.vertexMap ? t.vertexMap.map(v => ({ ...v })) : null
        };
    }
    if (body.base) {
        clone.base = { ...body.base };
    }
    return clone;
}

/**
 * Deep-clone a sketch entry.
 */
function cloneSketch(sketch) {
    const clone = { ...sketch };
    if (sketch.plane) {
        clone.plane = {
            ...sketch.plane,
            origin: { ...sketch.plane.origin },
            normal: { ...sketch.plane.normal },
            uAxis: { ...sketch.plane.uAxis },
            vAxis: { ...sketch.plane.vAxis }
        };
    }
    return clone;
}

/**
 * Capture a snapshot of current document state.
 * Retains OCCT shape refs so they survive even if live state releases them.
 */
function captureSnapshot() {
    const doc = getState().document;
    const bodies = doc.bodies.map(b => cloneBody(b));
    const sketches = doc.sketches.map(s => cloneSketch(s));

    // Retain shape refs for this snapshot
    for (const body of bodies) {
        if (body.occtShapeRef) {
            retainShape(body.occtShapeRef);
        }
    }

    return { bodies, sketches };
}

/**
 * Release all OCCT shape refs held by a snapshot.
 */
function releaseSnapshotShapes(snapshot) {
    for (const body of snapshot.bodies) {
        if (body.occtShapeRef) {
            releaseShape(body.occtShapeRef);
        }
    }
}

/**
 * Push a snapshot of the current state onto the undo stack.
 * Call this BEFORE performing any undoable mutation.
 */
export function pushUndoSnapshot() {
    const snapshot = captureSnapshot();
    undoStack.push(snapshot);

    // Enforce max stack size
    while (undoStack.length > MAX_UNDO) {
        const oldest = undoStack.shift();
        releaseSnapshotShapes(oldest);
    }

    // Clear redo stack (new action invalidates redo history)
    for (const snap of redoStack) {
        releaseSnapshotShapes(snap);
    }
    redoStack = [];
}

/**
 * Restore a snapshot: replace document state and rebuild visuals.
 */
function restoreSnapshot(snapshot) {
    const doc = getState().document;

    // Release shape refs for current live state bodies
    for (const body of doc.bodies) {
        if (body.occtShapeRef) {
            releaseShape(body.occtShapeRef);
        }
    }

    // Retain shape refs for the snapshot's bodies (they become the new live state)
    for (const body of snapshot.bodies) {
        if (body.occtShapeRef) {
            retainShape(body.occtShapeRef);
        }
    }

    // Deep-clone snapshot data so the snapshot itself remains stable
    const restoredBodies = snapshot.bodies.map(b => cloneBody(b));
    const restoredSketches = snapshot.sketches.map(s => cloneSketch(s));

    // Replace document
    replaceDocument({ bodies: restoredBodies, sketches: restoredSketches });

    // Release the snapshot's own retains (net effect: live state holds refs at count=1)
    for (const body of snapshot.bodies) {
        if (body.occtShapeRef) {
            releaseShape(body.occtShapeRef);
        }
    }

    // Clear interaction state
    clearBodySelection();
    clearBodyHover();
    clearBodyMultiSelection();
    clearSelection();

    // Rebuild visuals
    if (_onRestore) {
        _onRestore();
    }
}

/**
 * Undo the last action.
 */
export function undo() {
    if (undoStack.length === 0) return;

    // Capture current state as redo point
    const currentSnapshot = captureSnapshot();
    redoStack.push(currentSnapshot);

    // Pop and restore
    const snapshot = undoStack.pop();
    restoreSnapshot(snapshot);

    console.log(`Undo (${undoStack.length} remaining)`);
}

/**
 * Redo the last undone action.
 */
export function redo() {
    if (redoStack.length === 0) return;

    // Capture current state as undo point
    const currentSnapshot = captureSnapshot();
    undoStack.push(currentSnapshot);

    // Pop and restore
    const snapshot = redoStack.pop();
    restoreSnapshot(snapshot);

    console.log(`Redo (${redoStack.length} remaining)`);
}

/**
 * Check if undo is possible.
 */
export function canUndo() {
    return undoStack.length > 0;
}

/**
 * Check if redo is possible.
 */
export function canRedo() {
    return redoStack.length > 0;
}
