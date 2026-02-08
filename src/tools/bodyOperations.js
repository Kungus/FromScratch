/**
 * Body Operations — OCCT-based operations on bodies (fillet, face extrusion).
 * Atomic commands: OCCT geometry + state update + render sync.
 */

import { getBodyById, updateBody, removeBody, clearBodySelection, getBodySelection, clearBodyMultiSelection } from '../core/state.js';
import { getShape, removeShape, storeShape } from '../core/occtShapeStore.js';
import { pushUndoSnapshot } from '../core/undoRedo.js';
import { filletEdges, chamferEdges, getEdgeByIndex, getFaceByIndex, extrudeFaceAndFuse, extrudeFaceAndCut, booleanCut, booleanFuse, translateShape, getEdgeEndpoints, getVertexPosition, rebuildShapeWithMovedVertices, getFaceVertexPositions } from '../core/occtEngine.js';
import { tessellateShape } from '../core/occtTessellate.js';
import { replaceBodyMesh, removeBodyMesh, getBodyGroup } from '../render/bodyRender.js';
import { updateSelectionHighlight, updateMultiSelectionHighlight } from '../render/selectionHighlight.js';

/**
 * Validate a tessellation result for obvious corruption.
 * Catches garbage output from OCCT operations on topologically invalid shapes.
 * @param {Object} tessellation - From tessellateShape()
 * @param {Object} [refTessellation] - Reference tessellation to compare bounds against
 * @returns {{valid: boolean, reason: string}}
 */
function validateTessellation(tessellation, refTessellation) {
    if (!tessellation || !tessellation.positions || tessellation.positions.length === 0) {
        return { valid: false, reason: 'empty tessellation' };
    }

    const pos = tessellation.positions;

    // Check for NaN/Infinity
    for (let i = 0; i < pos.length; i++) {
        if (!isFinite(pos[i])) {
            return { valid: false, reason: 'NaN/Infinity in vertex positions' };
        }
    }

    // Compute bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
        minX = Math.min(minX, pos[i]);     maxX = Math.max(maxX, pos[i]);
        minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
        minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
    }

    // If we have a reference, check that the result isn't wildly different
    if (refTessellation && refTessellation.positions && refTessellation.positions.length > 0) {
        const rp = refTessellation.positions;
        let rMinX = Infinity, rMinY = Infinity, rMinZ = Infinity;
        let rMaxX = -Infinity, rMaxY = -Infinity, rMaxZ = -Infinity;
        for (let i = 0; i < rp.length; i += 3) {
            rMinX = Math.min(rMinX, rp[i]);     rMaxX = Math.max(rMaxX, rp[i]);
            rMinY = Math.min(rMinY, rp[i + 1]); rMaxY = Math.max(rMaxY, rp[i + 1]);
            rMinZ = Math.min(rMinZ, rp[i + 2]); rMaxZ = Math.max(rMaxZ, rp[i + 2]);
        }

        const refDiag = Math.sqrt(
            (rMaxX - rMinX) ** 2 + (rMaxY - rMinY) ** 2 + (rMaxZ - rMinZ) ** 2
        );
        const newDiag = Math.sqrt(
            (maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2
        );

        // If bounding box grew by more than 5x, something is wrong
        if (refDiag > 0.01 && newDiag > refDiag * 5) {
            return { valid: false, reason: `bounding box grew from ${refDiag.toFixed(2)} to ${newDiag.toFixed(2)}` };
        }
    }

    return { valid: true, reason: '' };
}

/**
 * Apply fillet to one or more edges of a body via OCCT
 * @param {string} bodyId - Body to fillet
 * @param {number[]} edgeIndices - Edge indices from topology
 * @param {number} radius - Fillet radius
 */
export function applyFillet(bodyId, edgeIndices, radius) {
    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) {
        console.warn('Cannot fillet: body has no OCCT shape');
        return;
    }

    const shape = getShape(body.occtShapeRef);
    if (!shape) {
        console.warn('Cannot fillet: OCCT shape not found');
        return;
    }

    const edges = [];
    for (const idx of edgeIndices) {
        const edge = getEdgeByIndex(shape, idx);
        if (edge) {
            edges.push(edge);
        } else {
            console.warn('Cannot fillet: edge not found at index', idx);
        }
    }

    if (edges.length === 0) {
        console.warn('Cannot fillet: no valid edges');
        return;
    }

    pushUndoSnapshot();

    try {
        const filletedShape = filletEdges(shape, edges, radius);
        const tessellation = tessellateShape(filletedShape);

        const check = validateTessellation(tessellation, body.tessellation);
        if (!check.valid) {
            console.warn(`Fillet produced corrupt geometry (${check.reason}) — rejecting`);
            filletedShape.delete();
            return;
        }

        const oldShapeRef = body.occtShapeRef;
        const newShapeRef = storeShape(filletedShape);

        updateBody(bodyId, {
            occtShapeRef: newShapeRef,
            tessellation
        });

        removeShape(oldShapeRef);

        const updatedBody = getBodyById(bodyId);
        replaceBodyMesh(bodyId, tessellation, updatedBody);

        clearBodySelection();
        clearBodyMultiSelection();
        updateSelectionHighlight(getBodySelection(), getBodyGroup());
        updateMultiSelectionHighlight([]);

        console.log(`Fillet applied: ${edges.length} edge(s), radius ${radius}`);
    } catch (e) {
        console.error('Fillet failed:', e.message || e);
    } finally {
        edges.forEach(e => e.delete());
    }
}

/**
 * Apply chamfer to one or more edges of a body via OCCT
 * @param {string} bodyId - Body to chamfer
 * @param {number[]} edgeIndices - Edge indices from topology
 * @param {number} distance - Chamfer distance
 */
export function applyChamfer(bodyId, edgeIndices, distance) {
    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) {
        console.warn('Cannot chamfer: body has no OCCT shape');
        return;
    }

    const shape = getShape(body.occtShapeRef);
    if (!shape) {
        console.warn('Cannot chamfer: OCCT shape not found');
        return;
    }

    const edges = [];
    for (const idx of edgeIndices) {
        const edge = getEdgeByIndex(shape, idx);
        if (edge) {
            edges.push(edge);
        } else {
            console.warn('Cannot chamfer: edge not found at index', idx);
        }
    }

    if (edges.length === 0) {
        console.warn('Cannot chamfer: no valid edges');
        return;
    }

    pushUndoSnapshot();

    try {
        const chamferedShape = chamferEdges(shape, edges, distance);
        const tessellation = tessellateShape(chamferedShape);

        const check = validateTessellation(tessellation, body.tessellation);
        if (!check.valid) {
            console.warn(`Chamfer produced corrupt geometry (${check.reason}) — rejecting`);
            chamferedShape.delete();
            return;
        }

        const oldShapeRef = body.occtShapeRef;
        const newShapeRef = storeShape(chamferedShape);

        updateBody(bodyId, {
            occtShapeRef: newShapeRef,
            tessellation
        });

        removeShape(oldShapeRef);

        const updatedBody = getBodyById(bodyId);
        replaceBodyMesh(bodyId, tessellation, updatedBody);

        clearBodySelection();
        clearBodyMultiSelection();
        updateSelectionHighlight(getBodySelection(), getBodyGroup());
        updateMultiSelectionHighlight([]);

        console.log(`Chamfer applied: ${edges.length} edge(s), distance ${distance}`);
    } catch (e) {
        console.error('Chamfer failed:', e.message || e);
    } finally {
        edges.forEach(e => e.delete());
    }
}

/**
 * Apply face extrusion (push/pull) via OCCT
 * @param {string} bodyId - Body to extrude from
 * @param {number} faceIndex - Face index from topology
 * @param {{x,y,z}} normal - Face outward normal
 * @param {number} height - Extrusion height (positive=fuse, negative=cut)
 */
export function applyFaceExtrusion(bodyId, faceIndex, normal, height) {
    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) {
        console.warn('Cannot extrude face: body has no OCCT shape');
        return;
    }

    const shape = getShape(body.occtShapeRef);
    if (!shape) {
        console.warn('Cannot extrude face: OCCT shape not found');
        return;
    }

    const face = getFaceByIndex(shape, faceIndex);
    if (!face) {
        console.warn('Cannot extrude face: face not found at index', faceIndex);
        return;
    }

    pushUndoSnapshot();

    const direction = {
        x: normal.x * height,
        y: normal.y * height,
        z: normal.z * height
    };

    try {
        let resultShape;
        if (height >= 0) {
            resultShape = extrudeFaceAndFuse(shape, face, direction);
        } else {
            resultShape = extrudeFaceAndCut(shape, face, direction);
        }
        const tessellation = tessellateShape(resultShape);

        const oldShapeRef = body.occtShapeRef;
        const newShapeRef = storeShape(resultShape);

        updateBody(bodyId, {
            occtShapeRef: newShapeRef,
            tessellation
        });

        removeShape(oldShapeRef);

        const updatedBody = getBodyById(bodyId);
        replaceBodyMesh(bodyId, tessellation, updatedBody);

        clearBodySelection();
        updateSelectionHighlight(getBodySelection(), getBodyGroup());

        const opName = height >= 0 ? 'extruded' : 'cut';
        console.log(`Face extrusion ${opName}: face ${faceIndex}, height ${height}`);
    } catch (e) {
        console.error('Face extrusion failed:', e.message || e);
    } finally {
        face.delete();
    }
}

/**
 * Apply boolean operation between two bodies via OCCT
 * @param {string} bodyIdA - Target body (result replaces this)
 * @param {string} bodyIdB - Tool body (removed after operation)
 * @param {'subtract'|'union'} operation - Boolean operation type
 */
export function applyBoolean(bodyIdA, bodyIdB, operation) {
    const bodyA = getBodyById(bodyIdA);
    const bodyB = getBodyById(bodyIdB);
    if (!bodyA || !bodyA.occtShapeRef || !bodyB || !bodyB.occtShapeRef) {
        console.warn('Cannot boolean: one or both bodies have no OCCT shape');
        return;
    }

    const shapeA = getShape(bodyA.occtShapeRef);
    const shapeB = getShape(bodyB.occtShapeRef);
    if (!shapeA || !shapeB) {
        console.warn('Cannot boolean: OCCT shape not found');
        return;
    }

    pushUndoSnapshot();

    try {
        const resultShape = operation === 'subtract'
            ? booleanCut(shapeA, shapeB)
            : booleanFuse(shapeA, shapeB);
        const tessellation = tessellateShape(resultShape);

        // Update Body A with the result
        const oldShapeRefA = bodyA.occtShapeRef;
        const newShapeRef = storeShape(resultShape);

        updateBody(bodyIdA, {
            occtShapeRef: newShapeRef,
            tessellation
        });

        removeShape(oldShapeRefA);

        const updatedBody = getBodyById(bodyIdA);
        replaceBodyMesh(bodyIdA, tessellation, updatedBody);

        // Remove Body B (mesh + state; state removal auto-frees OCCT shape)
        removeBodyMesh(bodyIdB);
        removeBody(bodyIdB);

        clearBodySelection();
        clearBodyMultiSelection();
        updateSelectionHighlight(getBodySelection(), getBodyGroup());
        updateMultiSelectionHighlight([]);

        console.log(`Boolean ${operation}: ${bodyIdA} ${operation === 'subtract' ? '-' : '+'} ${bodyIdB}`);
    } catch (e) {
        console.error(`Boolean ${operation} failed:`, e.message || e);
    }
}

/**
 * Apply sub-element translation (move edge or vertex) via OCCT shape rebuild
 * @param {string} bodyId - Body to modify
 * @param {'edge'|'vertex'} elementType - What to move
 * @param {Object} elementData - From bodyHitTest (edgeIndex, position, vertexIndex, etc.)
 * @param {{x: number, y: number, z: number}} delta - Movement delta
 */
export function applyTranslateSubElement(bodyId, elementType, elementData, delta) {
    console.log(`applyTranslateSubElement: bodyId=${bodyId}, type=${elementType}, edgeIndex=${elementData?.edgeIndex}, vertexIndex=${elementData?.vertexIndex}, delta=(${delta?.x?.toFixed(3)},${delta?.y?.toFixed(3)},${delta?.z?.toFixed(3)})`);

    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) {
        console.warn('Cannot translate sub-element: body has no OCCT shape');
        return;
    }

    const shape = getShape(body.occtShapeRef);
    if (!shape) {
        console.warn('Cannot translate sub-element: OCCT shape not found');
        return;
    }

    pushUndoSnapshot();

    try {
        let vertexMoves;

        if (elementType === 'edge') {
            const endpoints = getEdgeEndpoints(shape, elementData.edgeIndex);
            if (!endpoints) {
                console.warn('Cannot translate edge: endpoints not found');
                return;
            }
            vertexMoves = [
                {
                    from: endpoints.startVertex,
                    to: {
                        x: endpoints.startVertex.x + delta.x,
                        y: endpoints.startVertex.y + delta.y,
                        z: endpoints.startVertex.z + delta.z
                    }
                },
                {
                    from: endpoints.endVertex,
                    to: {
                        x: endpoints.endVertex.x + delta.x,
                        y: endpoints.endVertex.y + delta.y,
                        z: endpoints.endVertex.z + delta.z
                    }
                }
            ];
        } else if (elementType === 'vertex') {
            const pos = getVertexPosition(shape, elementData.vertexIndex);
            if (!pos) {
                console.warn('Cannot translate vertex: position not found');
                return;
            }
            vertexMoves = [
                {
                    from: pos,
                    to: {
                        x: pos.x + delta.x,
                        y: pos.y + delta.y,
                        z: pos.z + delta.z
                    }
                }
            ];
        } else {
            console.warn('Unknown element type:', elementType);
            return;
        }

        console.log(`applyTranslateSubElement: rebuilding with ${vertexMoves.length} vertex moves:`, vertexMoves.map(m => `(${m.from.x.toFixed(3)},${m.from.y.toFixed(3)},${m.from.z.toFixed(3)}) -> (${m.to.x.toFixed(3)},${m.to.y.toFixed(3)},${m.to.z.toFixed(3)})`));
        const newShape = rebuildShapeWithMovedVertices(shape, vertexMoves);
        console.log('applyTranslateSubElement: OCCT rebuild succeeded, tessellating...');
        const tessellation = tessellateShape(newShape);

        const oldShapeRef = body.occtShapeRef;
        const newShapeRef = storeShape(newShape);

        updateBody(bodyId, {
            occtShapeRef: newShapeRef,
            tessellation
        });

        removeShape(oldShapeRef);

        const updatedBody = getBodyById(bodyId);
        replaceBodyMesh(bodyId, tessellation, updatedBody);

        clearBodySelection();
        clearBodyMultiSelection();
        updateSelectionHighlight(getBodySelection(), getBodyGroup());
        updateMultiSelectionHighlight([]);

        console.log(`Sub-element translated: ${elementType} on ${bodyId}`);
    } catch (e) {
        console.error('Sub-element translation FAILED:', e.message || e, e.stack || '');
    }
}

/**
 * Move a body by translating its OCCT shape
 * @param {string} bodyId - Body to move
 * @param {number} dx - X offset
 * @param {number} dy - Y offset
 * @param {number} dz - Z offset
 */
export function applyMoveBody(bodyId, dx, dy, dz) {
    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) {
        console.warn('Cannot move: body has no OCCT shape');
        return;
    }

    const shape = getShape(body.occtShapeRef);
    if (!shape) {
        console.warn('Cannot move: OCCT shape not found');
        return;
    }

    pushUndoSnapshot();

    try {
        const movedShape = translateShape(shape, dx, dy, dz);
        const tessellation = tessellateShape(movedShape);

        const oldShapeRef = body.occtShapeRef;
        const newShapeRef = storeShape(movedShape);

        updateBody(bodyId, {
            occtShapeRef: newShapeRef,
            tessellation
        });

        removeShape(oldShapeRef);

        const updatedBody = getBodyById(bodyId);
        replaceBodyMesh(bodyId, tessellation, updatedBody);

        clearBodySelection();
        clearBodyMultiSelection();
        updateSelectionHighlight(getBodySelection(), getBodyGroup());
        updateMultiSelectionHighlight([]);

        console.log(`Body moved: ${bodyId} by (${dx}, ${dy}, ${dz})`);
    } catch (e) {
        console.error('Move body failed:', e.message || e);
    }
}

/**
 * Translate all vertices of a face by a delta vector via OCCT shape rebuild.
 * @param {string} bodyId - Body to modify
 * @param {number} faceIndex - Face index from topology
 * @param {{x: number, y: number, z: number}} delta - Movement delta
 */
export function applyTranslateFace(bodyId, faceIndex, delta) {
    const body = getBodyById(bodyId);
    if (!body || !body.occtShapeRef) {
        console.warn('Cannot translate face: body has no OCCT shape');
        return;
    }

    const shape = getShape(body.occtShapeRef);
    if (!shape) {
        console.warn('Cannot translate face: OCCT shape not found');
        return;
    }

    const faceVerts = getFaceVertexPositions(shape, faceIndex);
    if (!faceVerts || faceVerts.length === 0) {
        console.warn('Cannot translate face: no vertices found');
        return;
    }

    pushUndoSnapshot();

    try {
        const vertexMoves = faceVerts.map(v => ({
            from: v,
            to: { x: v.x + delta.x, y: v.y + delta.y, z: v.z + delta.z }
        }));

        const newShape = rebuildShapeWithMovedVertices(shape, vertexMoves);
        const tessellation = tessellateShape(newShape);

        const oldShapeRef = body.occtShapeRef;
        const newShapeRef = storeShape(newShape);

        updateBody(bodyId, {
            occtShapeRef: newShapeRef,
            tessellation
        });

        removeShape(oldShapeRef);

        const updatedBody = getBodyById(bodyId);
        replaceBodyMesh(bodyId, tessellation, updatedBody);

        clearBodySelection();
        clearBodyMultiSelection();
        updateSelectionHighlight(getBodySelection(), getBodyGroup());
        updateMultiSelectionHighlight([]);

        console.log(`Face translated: face ${faceIndex} on ${bodyId}`);
    } catch (e) {
        console.error('Face translation failed:', e.message || e);
    }
}
