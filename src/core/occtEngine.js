/**
 * FromScratch - OCCT Engine
 * Pure shape-creation functions. Takes params, returns OCCT shapes.
 * No THREE.js, no DOM, no side effects.
 */

import { getOC } from './occtInit.js';

/**
 * Create a box shape
 * @param {number} x1 - Min X
 * @param {number} z1 - Min Z
 * @param {number} x2 - Max X
 * @param {number} z2 - Max Z
 * @param {number} height - Height (Y direction)
 * @param {number} baseY - Base Y position (default 0)
 * @returns {Object} TopoDS_Shape
 */
export function makeBox(x1, z1, x2, z2, height, baseY = 0) {
    const oc = getOC();

    const width = x2 - x1;
    const depth = z2 - z1;

    // BRepPrimAPI_MakeBox takes corner point + dx, dy, dz
    const origin = new oc.gp_Pnt_3(x1, baseY, z1);
    const builder = new oc.BRepPrimAPI_MakeBox_3(origin, width, height, depth);
    const shape = builder.Shape();

    // Clean up intermediates
    origin.delete();
    builder.delete();

    return shape;
}

/**
 * Create a cylinder shape
 * @param {number} centerX - Center X
 * @param {number} centerZ - Center Z
 * @param {number} radius - Radius
 * @param {number} height - Height (Y direction)
 * @param {number} baseY - Base Y position (default 0)
 * @returns {Object} TopoDS_Shape
 */
export function makeCylinder(centerX, centerZ, radius, height, baseY = 0) {
    const oc = getOC();

    // Create axis at the center position, pointing up (Y)
    const origin = new oc.gp_Pnt_3(centerX, baseY, centerZ);
    const dir = new oc.gp_Dir_4(0, 1, 0);
    const axis = new oc.gp_Ax2_3(origin, dir);

    const builder = new oc.BRepPrimAPI_MakeCylinder_3(axis, radius, height);
    const shape = builder.Shape();

    // Clean up
    origin.delete();
    dir.delete();
    axis.delete();
    builder.delete();

    return shape;
}

/**
 * Extrude a profile (wire) along a direction
 * @param {Object} wire - TopoDS_Wire defining the profile
 * @param {Object} direction - {x, y, z} extrusion vector
 * @returns {Object} TopoDS_Shape (solid)
 */
export function extrudeProfile(wire, direction) {
    const oc = getOC();

    // Make a face from the wire
    const face = new oc.BRepBuilderAPI_MakeFace_15(wire, true);

    if (!face.IsDone()) {
        face.delete();
        throw new Error('Failed to create face from wire — wire may be self-intersecting or open');
    }

    const faceShape = face.Shape();

    if (faceShape.IsNull()) {
        face.delete();
        throw new Error('Face creation produced null shape');
    }

    // Extrude along direction
    const vec = new oc.gp_Vec_4(direction.x, direction.y, direction.z);
    const prism = new oc.BRepPrimAPI_MakePrism_1(faceShape, vec, false, true);

    if (!prism.IsDone()) {
        prism.delete();
        vec.delete();
        faceShape.delete();
        face.delete();
        throw new Error('Prism extrusion failed — direction may be invalid or height too small');
    }

    const shape = prism.Shape();

    if (shape.IsNull()) {
        prism.delete();
        vec.delete();
        faceShape.delete();
        face.delete();
        throw new Error('Extrusion produced null shape');
    }

    // Clean up
    face.delete();
    faceShape.delete();
    vec.delete();
    prism.delete();

    return shape;
}

/**
 * Create a rectangular wire on a given plane
 * @param {number} x1 - Local U min
 * @param {number} z1 - Local V min
 * @param {number} x2 - Local U max
 * @param {number} z2 - Local V max
 * @param {Object} plane - {origin, normal, uAxis, vAxis} from sketchPlane
 * @returns {Object} TopoDS_Wire in 3D space
 */
export function makeRectangleWire(x1, z1, x2, z2, plane) {
    const oc = getOC();

    // If plane is provided, transform 2D coords to 3D
    // Otherwise assume XZ ground plane
    let p1, p2, p3, p4;
    if (plane) {
        p1 = localToWorld(x1, z1, plane);
        p2 = localToWorld(x2, z1, plane);
        p3 = localToWorld(x2, z2, plane);
        p4 = localToWorld(x1, z2, plane);
    } else {
        p1 = { x: x1, y: 0, z: z1 };
        p2 = { x: x2, y: 0, z: z1 };
        p3 = { x: x2, y: 0, z: z2 };
        p4 = { x: x1, y: 0, z: z2 };
    }

    const gp1 = new oc.gp_Pnt_3(p1.x, p1.y, p1.z);
    const gp2 = new oc.gp_Pnt_3(p2.x, p2.y, p2.z);
    const gp3 = new oc.gp_Pnt_3(p3.x, p3.y, p3.z);
    const gp4 = new oc.gp_Pnt_3(p4.x, p4.y, p4.z);

    const eb1 = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
    const edge1 = eb1.Edge();
    eb1.delete();
    const eb2 = new oc.BRepBuilderAPI_MakeEdge_3(gp2, gp3);
    const edge2 = eb2.Edge();
    eb2.delete();
    const eb3 = new oc.BRepBuilderAPI_MakeEdge_3(gp3, gp4);
    const edge3 = eb3.Edge();
    eb3.delete();
    const eb4 = new oc.BRepBuilderAPI_MakeEdge_3(gp4, gp1);
    const edge4 = eb4.Edge();
    eb4.delete();

    const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
    wireBuilder.Add_1(edge1);
    wireBuilder.Add_1(edge2);
    wireBuilder.Add_1(edge3);
    wireBuilder.Add_1(edge4);
    const wire = wireBuilder.Wire();

    // Clean up
    gp1.delete(); gp2.delete(); gp3.delete(); gp4.delete();
    edge1.delete(); edge2.delete(); edge3.delete(); edge4.delete();
    wireBuilder.delete();

    return wire;
}

/**
 * Create a circular wire on a given plane
 * @param {number} centerU - Local U center
 * @param {number} centerV - Local V center
 * @param {number} radius - Radius
 * @param {Object} plane - {origin, normal, uAxis, vAxis} from sketchPlane
 * @returns {Object} TopoDS_Wire in 3D space
 */
export function makeCircleWire(centerU, centerV, radius, plane) {
    const oc = getOC();

    let center, normal;
    if (plane) {
        const c = localToWorld(centerU, centerV, plane);
        center = new oc.gp_Pnt_3(c.x, c.y, c.z);
        normal = new oc.gp_Dir_4(plane.normal.x, plane.normal.y, plane.normal.z);
    } else {
        center = new oc.gp_Pnt_3(centerU, 0, centerV);
        normal = new oc.gp_Dir_4(0, 1, 0);
    }

    const axis = new oc.gp_Ax2_3(center, normal);
    const circle = new oc.gp_Circ_2(axis, radius);
    const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_8(circle);
    const edge = edgeBuilder.Edge();
    edgeBuilder.delete();
    const wireBuilder = new oc.BRepBuilderAPI_MakeWire_2(edge);
    const wire = wireBuilder.Wire();

    // Clean up
    center.delete();
    normal.delete();
    axis.delete();
    circle.delete();
    edge.delete();
    wireBuilder.delete();

    return wire;
}

/**
 * Retry a boolean operation with fuzzy tolerance.
 * Handles shapes with slightly inflated tolerances from sewing or rebuilding.
 */
function _booleanWithFuzzy(oc, shapeA, shapeB, operation) {
    const argsL = new oc.TopTools_ListOfShape_1();
    const toolsL = new oc.TopTools_ListOfShape_1();
    argsL.Append_1(shapeA);
    toolsL.Append_1(shapeB);

    const op = operation === 'fuse'
        ? new oc.BRepAlgoAPI_Fuse_1()
        : new oc.BRepAlgoAPI_Cut_1();

    op.SetArguments(argsL);
    op.SetTools(toolsL);
    op.SetFuzzyValue(1e-4);

    const progress = new oc.Message_ProgressRange_1();
    op.Build(progress);
    progress.delete();

    const done = op.IsDone();
    const hasErrors = typeof op.HasErrors === 'function' && op.HasErrors();

    if (!done || hasErrors) {
        argsL.delete();
        toolsL.delete();
        op.delete();
        throw new Error(`Boolean ${operation} failed (even with fuzzy tolerance)`);
    }

    const result = op.Shape();
    argsL.delete();
    toolsL.delete();
    op.delete();

    if (!result || result.IsNull()) {
        throw new Error(`Boolean ${operation} produced null shape (even with fuzzy tolerance)`);
    }

    return result;
}

/**
 * Boolean cut: base - tool
 * @param {Object} baseShape - TopoDS_Shape to cut from
 * @param {Object} toolShape - TopoDS_Shape to cut with
 * @returns {Object} Resulting TopoDS_Shape
 */
export function booleanCut(baseShape, toolShape) {
    const oc = getOC();

    // Try direct boolean first
    try {
        const cut = new oc.BRepAlgoAPI_Cut_3(baseShape, toolShape);
        const done = cut.IsDone();
        const hasErrors = typeof cut.HasErrors === 'function' && cut.HasErrors();

        if (done && !hasErrors) {
            const result = cut.Shape();
            if (!result.IsNull()) {
                cut.delete();
                return result;
            }
        }
        cut.delete();
    } catch (e) {
        // Fall through to fuzzy retry
    }

    // Retry with fuzzy tolerance
    console.log('booleanCut: retrying with fuzzy tolerance');
    return _booleanWithFuzzy(oc, baseShape, toolShape, 'cut');
}

/**
 * Boolean fuse: a + b
 * @param {Object} shapeA - First shape
 * @param {Object} shapeB - Second shape
 * @returns {Object} Resulting TopoDS_Shape
 */
export function booleanFuse(shapeA, shapeB) {
    const oc = getOC();

    // Try direct boolean first
    try {
        const fuse = new oc.BRepAlgoAPI_Fuse_3(shapeA, shapeB);
        const done = fuse.IsDone();
        const hasErrors = typeof fuse.HasErrors === 'function' && fuse.HasErrors();

        if (done && !hasErrors) {
            const result = fuse.Shape();
            if (!result.IsNull()) {
                fuse.delete();
                return result;
            }
        }
        fuse.delete();
    } catch (e) {
        // Fall through to fuzzy retry
    }

    // Retry with fuzzy tolerance
    console.log('booleanFuse: retrying with fuzzy tolerance');
    return _booleanWithFuzzy(oc, shapeA, shapeB, 'fuse');
}

/**
 * Fillet edges of a shape
 * @param {Object} shape - TopoDS_Shape
 * @param {Array} edges - Array of TopoDS_Edge objects
 * @param {number} radius - Fillet radius
 * @returns {Object} Resulting TopoDS_Shape
 */
export function filletEdges(shape, edges, radius) {
    const oc = getOC();
    const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);

    for (const edge of edges) {
        fillet.Add_2(radius, edge);
    }

    fillet.Build();

    if (!fillet.IsDone()) {
        fillet.delete();
        throw new Error(`Fillet failed: radius ${radius.toFixed(2)} may exceed edge length or conflict with adjacent geometry`);
    }

    const result = fillet.Shape();

    if (result.IsNull()) {
        fillet.delete();
        throw new Error('Fillet produced null shape');
    }

    fillet.delete();
    return result;
}

/**
 * Get the Nth edge from a shape by topology explorer index
 * @param {Object} shape - TopoDS_Shape
 * @param {number} edgeIndex - Index matching the order from TopExp_Explorer
 * @returns {Object|null} TopoDS_Edge or null
 */
export function getEdgeByIndex(shape, edgeIndex) {
    const oc = getOC();
    const explorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    let idx = 0;
    while (explorer.More()) {
        if (idx === edgeIndex) {
            const edge = oc.TopoDS.Edge_1(explorer.Current());
            explorer.delete();
            return edge;
        }
        idx++;
        explorer.Next();
    }
    explorer.delete();
    return null;
}

/**
 * Get the Nth face from a shape by topology explorer index
 * @param {Object} shape - TopoDS_Shape
 * @param {number} faceIndex - Index matching the order from TopExp_Explorer
 * @returns {Object|null} TopoDS_Face or null
 */
export function getFaceByIndex(shape, faceIndex) {
    const oc = getOC();
    const explorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    let idx = 0;
    while (explorer.More()) {
        if (idx === faceIndex) {
            const face = oc.TopoDS.Face_1(explorer.Current());
            explorer.delete();
            return face;
        }
        idx++;
        explorer.Next();
    }
    explorer.delete();
    return null;
}

/**
 * Extrude a face of a shape along a direction, then fuse with the original.
 * This is the "push/pull" operation.
 * @param {Object} shape - Original TopoDS_Shape
 * @param {Object} face - TopoDS_Face to extrude
 * @param {{x:number, y:number, z:number}} direction - Extrusion vector (normal * height)
 * @returns {Object} Resulting fused TopoDS_Shape
 */
export function extrudeFaceAndFuse(shape, face, direction) {
    const oc = getOC();

    const wireExplorer = new oc.TopExp_Explorer_2(
        face,
        oc.TopAbs_ShapeEnum.TopAbs_WIRE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    if (!wireExplorer.More()) {
        wireExplorer.delete();
        throw new Error('Face has no wire boundary');
    }

    const wire = oc.TopoDS.Wire_1(wireExplorer.Current());
    wireExplorer.delete();

    let faceMaker = null, independentFace = null, vec = null, prism = null, extrudedShape = null, fuse = null;
    try {
        faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
        if (!faceMaker.IsDone()) throw new Error('Failed to rebuild face from wire');
        independentFace = faceMaker.Shape();

        vec = new oc.gp_Vec_4(direction.x, direction.y, direction.z);
        prism = new oc.BRepPrimAPI_MakePrism_1(independentFace, vec, false, true);
        if (!prism.IsDone()) throw new Error('Face extrusion prism failed');
        extrudedShape = prism.Shape();

        fuse = new oc.BRepAlgoAPI_Fuse_3(shape, extrudedShape);
        if (!fuse.IsDone()) throw new Error('Boolean fuse failed during face extrusion');

        return fuse.Shape();
    } finally {
        wire.delete();
        faceMaker?.delete();
        independentFace?.delete();
        vec?.delete();
        prism?.delete();
        extrudedShape?.delete();
        fuse?.delete();
    }
}

/**
 * Extrude a face of a shape along a direction, then cut from the original.
 * This is the "push/pull inward" operation (boolean subtraction).
 * @param {Object} shape - Original TopoDS_Shape
 * @param {Object} face - TopoDS_Face to extrude
 * @param {{x:number, y:number, z:number}} direction - Extrusion vector (normal * height, points inward)
 * @returns {Object} Resulting cut TopoDS_Shape
 */
export function extrudeFaceAndCut(shape, face, direction) {
    const oc = getOC();

    const wireExplorer = new oc.TopExp_Explorer_2(
        face,
        oc.TopAbs_ShapeEnum.TopAbs_WIRE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    if (!wireExplorer.More()) {
        wireExplorer.delete();
        throw new Error('Face has no wire boundary');
    }

    const wire = oc.TopoDS.Wire_1(wireExplorer.Current());
    wireExplorer.delete();

    let faceMaker = null, independentFace = null, vec = null, prism = null, extrudedShape = null, cut = null;
    try {
        faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
        if (!faceMaker.IsDone()) throw new Error('Failed to rebuild face from wire');
        independentFace = faceMaker.Shape();

        vec = new oc.gp_Vec_4(direction.x, direction.y, direction.z);
        prism = new oc.BRepPrimAPI_MakePrism_1(independentFace, vec, false, true);
        if (!prism.IsDone()) throw new Error('Face cut extrusion prism failed');
        extrudedShape = prism.Shape();

        cut = new oc.BRepAlgoAPI_Cut_3(shape, extrudedShape);
        if (!cut.IsDone()) throw new Error('Boolean cut failed during face extrusion');

        return cut.Shape();
    } finally {
        wire.delete();
        faceMaker?.delete();
        independentFace?.delete();
        vec?.delete();
        prism?.delete();
        extrudedShape?.delete();
        cut?.delete();
    }
}

/**
 * Find a face adjacent to a given edge in a shape.
 * Required by BRepFilletAPI_MakeChamfer which needs a face reference for each edge.
 * @param {Object} shape - TopoDS_Shape
 * @param {Object} edge - TopoDS_Edge
 * @returns {Object|null} TopoDS_Face or null
 */
function findAdjacentFace(shape, edge) {
    const oc = getOC();
    const explorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
        const face = oc.TopoDS.Face_1(explorer.Current());
        // Check if this face contains the edge
        const edgeExplorer = new oc.TopExp_Explorer_2(
            face,
            oc.TopAbs_ShapeEnum.TopAbs_EDGE,
            oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );
        while (edgeExplorer.More()) {
            const faceEdge = oc.TopoDS.Edge_1(edgeExplorer.Current());
            if (faceEdge.IsSame(edge)) {
                faceEdge.delete();
                edgeExplorer.delete();
                explorer.delete();
                return face;
            }
            faceEdge.delete();
            edgeExplorer.Next();
        }
        edgeExplorer.delete();
        face.delete();
        explorer.Next();
    }
    explorer.delete();
    return null;
}

/**
 * Chamfer edges of a shape (flat bevel)
 * @param {Object} shape - TopoDS_Shape
 * @param {Array} edges - Array of TopoDS_Edge objects
 * @param {number} distance - Chamfer distance
 * @returns {Object} Resulting TopoDS_Shape
 */
export function chamferEdges(shape, edges, distance) {
    const oc = getOC();
    const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);

    // This build only exposes Add(edge) from the base class.
    // Use Add(edge) + SetDist(distance, contourIndex, face) to set chamfer distance.
    const faces = [];
    for (const edge of edges) {
        const face = findAdjacentFace(shape, edge);
        if (!face) {
            console.warn('No adjacent face found for chamfer edge');
            continue;
        }
        chamfer.Add(edge);
        const ic = chamfer.NbContours();
        chamfer.SetDist(distance, ic, face);
        faces.push(face);
    }

    chamfer.Build();

    if (!chamfer.IsDone()) {
        chamfer.delete();
        faces.forEach(f => f.delete());
        throw new Error(`Chamfer failed: distance ${distance.toFixed(2)} may exceed edge length or conflict with adjacent geometry`);
    }

    const result = chamfer.Shape();

    if (result.IsNull()) {
        chamfer.delete();
        faces.forEach(f => f.delete());
        throw new Error('Chamfer produced null shape');
    }

    chamfer.delete();
    faces.forEach(f => f.delete());

    return result;
}

/**
 * Translate a shape by (dx, dy, dz)
 * @param {Object} shape - TopoDS_Shape to translate
 * @param {number} dx - X offset
 * @param {number} dy - Y offset
 * @param {number} dz - Z offset
 * @returns {Object} New translated TopoDS_Shape (copy)
 */
export function translateShape(shape, dx, dy, dz) {
    const oc = getOC();
    const vec = new oc.gp_Vec_4(dx, dy, dz);
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(vec);
    const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
    const result = transformer.Shape();
    vec.delete();
    trsf.delete();
    transformer.delete();
    return result;
}

/**
 * Get all vertex positions from a shape
 * @param {Object} shape - TopoDS_Shape
 * @returns {Array<{index: number, x: number, y: number, z: number}>}
 */
export function getVertexPositions(shape) {
    const oc = getOC();
    const vertices = [];
    const explorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    let idx = 0;
    while (explorer.More()) {
        const vertex = oc.TopoDS.Vertex_1(explorer.Current());
        const pnt = oc.BRep_Tool.Pnt(vertex);
        vertices.push({ index: idx, x: pnt.X(), y: pnt.Y(), z: pnt.Z() });
        pnt.delete();
        vertex.delete();
        idx++;
        explorer.Next();
    }
    explorer.delete();
    return vertices;
}

/**
 * Get start/end positions of an edge by index
 * @param {Object} shape - TopoDS_Shape
 * @param {number} edgeIndex - Edge index from topology explorer
 * @returns {Object|null} { startVertex: {x,y,z}, endVertex: {x,y,z}, direction: {x,y,z} }
 */
export function getEdgeEndpoints(shape, edgeIndex) {
    const oc = getOC();
    const edge = getEdgeByIndex(shape, edgeIndex);
    if (!edge) return null;

    const firstV = oc.TopExp.FirstVertex(edge, true);
    const lastV = oc.TopExp.LastVertex(edge, true);
    const p1 = oc.BRep_Tool.Pnt(firstV);
    const p2 = oc.BRep_Tool.Pnt(lastV);

    const start = { x: p1.X(), y: p1.Y(), z: p1.Z() };
    const end = { x: p2.X(), y: p2.Y(), z: p2.Z() };

    // Edge direction (normalized)
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const direction = len > 1e-10
        ? { x: dx / len, y: dy / len, z: dz / len }
        : { x: 1, y: 0, z: 0 };

    p1.delete();
    p2.delete();
    firstV.delete();
    lastV.delete();
    edge.delete();

    return { startVertex: start, endVertex: end, direction };
}

/**
 * Get position of a single vertex by index
 * @param {Object} shape - TopoDS_Shape
 * @param {number} vertexIndex - Vertex index from topology explorer
 * @returns {{x: number, y: number, z: number}|null}
 */
export function getVertexPosition(shape, vertexIndex) {
    const oc = getOC();
    const explorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    let idx = 0;
    while (explorer.More()) {
        if (idx === vertexIndex) {
            const vertex = oc.TopoDS.Vertex_1(explorer.Current());
            const pnt = oc.BRep_Tool.Pnt(vertex);
            const result = { x: pnt.X(), y: pnt.Y(), z: pnt.Z() };
            pnt.delete();
            vertex.delete();
            explorer.delete();
            return result;
        }
        idx++;
        explorer.Next();
    }
    explorer.delete();
    return null;
}

/**
 * Count topology elements of a given type in a shape.
 * @param {Object} shape - TopoDS_Shape
 * @param {number} elementType - TopAbs_ShapeEnum value (TopAbs_FACE, TopAbs_EDGE, etc.)
 * @returns {number}
 */
export function countTopologyElements(shape, elementType) {
    const oc = getOC();
    const explorer = new oc.TopExp_Explorer_2(shape, elementType, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    let count = 0;
    while (explorer.More()) {
        count++;
        explorer.Next();
    }
    explorer.delete();
    return count;
}

/**
 * Rebuild a shape with some vertices moved to new positions.
 * Builds individual faces, then sews them into a proper B-rep shell/solid
 * using BRepBuilderAPI_Sewing (handles edge sharing, orientation, tolerances).
 * Falls back to BRep_Builder if Sewing is unavailable.
 * @param {Object} shape - TopoDS_Shape (original)
 * @param {Array<{from: {x,y,z}, to: {x,y,z}}>} vertexMoves - Old → new position pairs
 * @returns {Object} New TopoDS_Shape (solid or shell)
 * @throws {Error} If no valid faces could be rebuilt
 */
export function rebuildShapeWithMovedVertices(shape, vertexMoves) {
    const oc = getOC();
    const TOLERANCE = 1e-4;

    function applyMove(x, y, z) {
        for (const move of vertexMoves) {
            if (Math.abs(x - move.from.x) < TOLERANCE &&
                Math.abs(y - move.from.y) < TOLERANCE &&
                Math.abs(z - move.from.z) < TOLERANCE) {
                return move.to;
            }
        }
        return null;
    }

    function wasMoved(x, y, z) {
        return applyMove(x, y, z) !== null;
    }

    function getMovedPos(x, y, z) {
        return applyMove(x, y, z) || { x, y, z };
    }

    // ===== Phase 1: Extract face boundary vertex positions =====
    const faceBoundaries = []; // Array of { positions: [{x,y,z}], hasCurvedEdges: bool }

    const faceExplorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (faceExplorer.More()) {
        const face = oc.TopoDS.Face_1(faceExplorer.Current());
        const wireExp = new oc.TopExp_Explorer_2(
            face, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );

        if (!wireExp.More()) {
            wireExp.delete();
            face.delete();
            faceExplorer.Next();
            continue;
        }

        const wire = oc.TopoDS.Wire_1(wireExp.Current());
        wireExp.delete();

        const edgeExp = new oc.BRepTools_WireExplorer_2(wire);
        const positions = [];
        let hasCurvedEdges = false;

        while (edgeExp.More()) {
            const currentEdge = edgeExp.Current();
            const firstV = oc.TopExp.FirstVertex(currentEdge, true);
            const lastV = oc.TopExp.LastVertex(currentEdge, true);
            const p1 = oc.BRep_Tool.Pnt(firstV);
            const p2 = oc.BRep_Tool.Pnt(lastV);

            // Detect degenerate/curved edge (self-loop = circle, etc.)
            const x1 = p1.X(), y1 = p1.Y(), z1 = p1.Z();
            const x2 = p2.X(), y2 = p2.Y(), z2 = p2.Z();
            const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
            if (dist < TOLERANCE) {
                hasCurvedEdges = true;
            }

            positions.push(getMovedPos(x1, y1, z1));

            p1.delete(); p2.delete();
            firstV.delete(); lastV.delete();
            currentEdge.delete();
            edgeExp.Next();
        }
        edgeExp.delete();
        wire.delete();
        face.delete();

        if (positions.length < 3) hasCurvedEdges = true;
        faceBoundaries.push({ positions, hasCurvedEdges });
        faceExplorer.Next();
    }
    faceExplorer.delete();

    if (faceBoundaries.length === 0) {
        throw new Error('Move failed: no faces found in shape');
    }

    // Count original topology for validation
    const origFaceCount = countTopologyElements(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);

    // ===== Phase 2: Build individual faces =====
    const newFaces = [];
    const hasAnyCurved = faceBoundaries.some(fb => fb.hasCurvedEdges);

    // If there are curved faces, use the disconnected fallback that preserves originals
    if (hasAnyCurved) {
        console.log('rebuildShapeWithMovedVertices: curved faces detected, using preserve-original fallback');
        return _buildPreservingOriginals(oc, shape, TOLERANCE, wasMoved, getMovedPos, origFaceCount);
    }

    // All planar faces — try shared-edge assembly first (no sewing, no tolerance inflation).
    // Shared edges eliminate BRepBuilderAPI_Sewing which inflates tolerances and breaks booleans.
    try {
        const result = _buildWithSharedEdges(oc, faceBoundaries, TOLERANCE);
        _validateShape(oc, result, origFaceCount);
        console.log('rebuildShapeWithMovedVertices: shared-edge assembly succeeded (no sewing)');
        return result;
    } catch (sharedEdgeErr) {
        console.warn('Shared-edge build failed, falling back to sewing:', sharedEdgeErr.message || sharedEdgeErr);
    }

    // ===== Fallback: Sewing-based assembly (may inflate tolerances) =====
    const vertexCache = _createVertexCache(oc, TOLERANCE);

    try {
        for (const fb of faceBoundaries) {
            const verts = fb.positions;
            const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();

            for (let i = 0; i < verts.length; i++) {
                const p1 = verts[i];
                const p2 = verts[(i + 1) % verts.length];

                const edgeDist = Math.sqrt(
                    (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2
                );
                if (edgeDist < TOLERANCE) continue;

                const v1 = vertexCache.getOrCreate(p1.x, p1.y, p1.z);
                const v2 = vertexCache.getOrCreate(p2.x, p2.y, p2.z);
                const eb = new oc.BRepBuilderAPI_MakeEdge_2(v1, v2);
                if (eb.IsDone()) {
                    const edge = eb.Edge();
                    wireBuilder.Add_1(edge);
                    edge.delete();
                }
                eb.delete();
            }

            if (!wireBuilder.IsDone()) {
                wireBuilder.delete();
                continue;
            }

            const wire = wireBuilder.Wire();
            wireBuilder.delete();

            try {
                const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
                if (faceMaker.IsDone()) {
                    newFaces.push(faceMaker.Shape());
                }
                faceMaker.delete();
            } catch (e) {
                console.warn('Face build failed:', e.message || e);
            }
            wire.delete();
        }
    } finally {
        vertexCache.deleteAll();
    }

    if (newFaces.length < 4) {
        newFaces.forEach(f => { try { f.delete(); } catch (_) {} });
        throw new Error(`Move failed: only ${newFaces.length} faces built (need >= 4)`);
    }

    // Sewing fallback (may inflate tolerances — booleans may need fuzzy retry)
    const result = _sewFacesIntoSolid(oc, newFaces, TOLERANCE, origFaceCount);
    newFaces.forEach(f => { try { f.delete(); } catch (_) {} });
    return result;
}

/**
 * Build a solid from face boundaries using shared vertex AND edge topology.
 * Each unique edge between two vertices is created once and reused (with reversed
 * orientation) by adjacent faces, producing a properly closed shell without sewing.
 * This eliminates tolerance inflation that causes downstream boolean failures.
 */
function _buildWithSharedEdges(oc, faceBoundaries, TOLERANCE) {
    const vertexCache = _createVertexCache(oc, TOLERANCE);
    const edgeCache = new Map(); // canonKey → TopoDS_Edge
    const newFaces = [];

    try {
        for (const fb of faceBoundaries) {
            const verts = fb.positions;
            const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();

            for (let i = 0; i < verts.length; i++) {
                const p1 = verts[i];
                const p2 = verts[(i + 1) % verts.length];

                const edgeDist = Math.sqrt(
                    (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2
                );
                if (edgeDist < TOLERANCE) continue;

                const v1 = vertexCache.getOrCreate(p1.x, p1.y, p1.z);
                const v2 = vertexCache.getOrCreate(p2.x, p2.y, p2.z);
                const v1Key = vertexCache.getKey(p1.x, p1.y, p1.z);
                const v2Key = vertexCache.getKey(p2.x, p2.y, p2.z);

                // Canonical edge direction: smaller key first
                const isForward = v1Key <= v2Key;
                const canonKey = isForward ? `${v1Key}|${v2Key}` : `${v2Key}|${v1Key}`;

                // Create canonical edge once (shared between adjacent faces)
                if (!edgeCache.has(canonKey)) {
                    const [cv1, cv2] = isForward ? [v1, v2] : [v2, v1];
                    const eb = new oc.BRepBuilderAPI_MakeEdge_2(cv1, cv2);
                    if (!eb.IsDone()) {
                        eb.delete();
                        continue;
                    }
                    edgeCache.set(canonKey, eb.Edge());
                    eb.delete();
                }

                const canonEdge = edgeCache.get(canonKey);

                if (isForward) {
                    wireBuilder.Add_1(canonEdge);
                } else {
                    // Reversed copy shares the same underlying BRep_TEdge
                    const revShape = canonEdge.Reversed();
                    const revEdge = oc.TopoDS.Edge_1(revShape);
                    wireBuilder.Add_1(revEdge);
                    revEdge.delete();
                    revShape.delete();
                }
            }

            if (!wireBuilder.IsDone()) {
                wireBuilder.delete();
                continue;
            }

            const wire = wireBuilder.Wire();
            wireBuilder.delete();

            try {
                const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
                if (faceMaker.IsDone()) {
                    newFaces.push(faceMaker.Shape());
                }
                faceMaker.delete();
            } catch (e) {
                console.warn('Face build failed:', e.message || e);
            }
            wire.delete();
        }
    } finally {
        vertexCache.deleteAll();
        edgeCache.clear(); // Edge data persists via faces (OCCT handle refs)
    }

    if (newFaces.length < 4) {
        newFaces.forEach(f => { try { f.delete(); } catch (_) {} });
        throw new Error(`Shared-edge build: only ${newFaces.length} faces built (need >= 4)`);
    }

    // Assemble faces into shell — no sewing needed (edges already shared)
    const builder = new oc.BRep_Builder();
    const shell = new oc.TopoDS_Shell();
    builder.MakeShell(shell);
    for (const f of newFaces) {
        builder.Add(shell, f);
    }
    builder.delete();
    newFaces.forEach(f => { try { f.delete(); } catch (_) {} });

    // Fix shell orientation (defense-in-depth)
    let fixedShell = null;
    try {
        const shellFixer = new oc.ShapeFix_Shell_2(shell);
        const progress = new oc.Message_ProgressRange_1();
        shellFixer.Perform(progress);
        progress.delete();
        fixedShell = shellFixer.Shell();
        shellFixer.delete();
        console.log('rebuildShapeWithMovedVertices: ShapeFix_Shell applied');
    } catch (e) {
        // ShapeFix_Shell not available — try ShapeFix_Shape
        try {
            const fixer = new oc.ShapeFix_Shape_2(shell);
            const progress = new oc.Message_ProgressRange_1();
            fixer.Perform(progress);
            progress.delete();
            fixedShell = fixer.Shape();
            fixer.delete();
        } catch (_) {
            // No fix available
        }
    }

    const shellForSolid = (fixedShell && !fixedShell.IsNull()) ? fixedShell : shell;

    // Promote to solid
    let result = null;
    try {
        const solidMaker = new oc.BRepBuilderAPI_MakeSolid_3(shellForSolid);
        if (solidMaker.IsDone()) {
            result = solidMaker.Shape();
        }
        solidMaker.delete();
    } catch (_) {}

    // Clean up shells
    try { shell.delete(); } catch (_) {}
    if (fixedShell && fixedShell !== shell) {
        try { fixedShell.delete(); } catch (_) {}
    }

    if (!result || result.IsNull()) {
        if (result) { try { result.delete(); } catch (_) {} }
        throw new Error('Shared-edge build: could not promote shell to solid');
    }

    return result;
}

/**
 * Create a vertex cache for sharing TopoDS_Vertex objects across faces.
 * Using shared vertices ensures adjacent faces share edge topology from construction,
 * producing solids that are robust for boolean operations (no sewing-induced tolerance inflation).
 */
function _createVertexCache(oc, TOLERANCE) {
    const cache = new Map();

    function getKey(x, y, z) {
        return `${Math.round(x / TOLERANCE)},${Math.round(y / TOLERANCE)},${Math.round(z / TOLERANCE)}`;
    }

    return {
        getKey,
        getOrCreate(x, y, z) {
            const key = getKey(x, y, z);
            if (cache.has(key)) return cache.get(key);

            const pnt = new oc.gp_Pnt_3(x, y, z);
            const maker = new oc.BRepBuilderAPI_MakeVertex(pnt);
            const vertex = maker.Vertex();
            maker.delete();
            pnt.delete();
            cache.set(key, vertex);
            return vertex;
        },

        deleteAll() {
            for (const v of cache.values()) {
                try { v.delete(); } catch (_) {}
            }
            cache.clear();
        }
    };
}

/**
 * Sew an array of faces into a proper B-rep shell/solid.
 * Uses BRepBuilderAPI_Sewing for edge sharing and orientation correction,
 * then ShapeFix_Shape for healing, then BRepCheck_Analyzer for validation.
 * Falls back to BRep_Builder if Sewing is unavailable.
 * @returns {Object} TopoDS_Shape (solid or shell)
 */
function _sewFacesIntoSolid(oc, faces, TOLERANCE, origFaceCount) {
    let sewedShape = null;

    // --- Try BRepBuilderAPI_Sewing (preferred: handles edge sharing + orientation) ---
    try {
        // All 5 params required in JS binding (C++ defaults not preserved)
        const sewing = new oc.BRepBuilderAPI_Sewing(TOLERANCE, true, true, true, false);
        for (const f of faces) {
            sewing.Add(f);
        }
        const progress = new oc.Message_ProgressRange_1();
        sewing.Perform(progress);
        progress.delete();
        sewedShape = sewing.SewedShape();
        sewing.delete();
        console.log('rebuildShapeWithMovedVertices: BRepBuilderAPI_Sewing succeeded');
    } catch (e) {
        console.warn('BRepBuilderAPI_Sewing not available or failed:', e.message || e);
        sewedShape = null;
    }

    // --- Fallback: BRep_Builder (no edge sharing but at least assembles) ---
    if (!sewedShape || sewedShape.IsNull()) {
        console.log('rebuildShapeWithMovedVertices: falling back to BRep_Builder');
        const builder = new oc.BRep_Builder();
        const shell = new oc.TopoDS_Shell();
        builder.MakeShell(shell);
        for (const f of faces) {
            builder.Add(shell, f);
        }
        builder.delete();
        sewedShape = shell;
    }

    // --- Try ShapeFix_Shape for healing (orientation, tolerances) ---
    let fixedShape = null;
    try {
        const fixer = new oc.ShapeFix_Shape_2(sewedShape);
        const progress = new oc.Message_ProgressRange_1();
        fixer.Perform(progress);
        progress.delete();
        fixedShape = fixer.Shape();
        fixer.delete();
        console.log('rebuildShapeWithMovedVertices: ShapeFix_Shape applied');
    } catch (e) {
        console.warn('ShapeFix_Shape not available:', e.message || e);
        fixedShape = null;
    }

    // Track all intermediate wrappers for guaranteed cleanup
    const intermediates = []; // OCCT wrappers to delete (excluding the final result)

    const useFixed = fixedShape && !fixedShape.IsNull();
    const shapeToUse = useFixed ? fixedShape : sewedShape;

    // Mark the unused one for cleanup
    if (useFixed) {
        intermediates.push(sewedShape);
    } else if (fixedShape) {
        intermediates.push(fixedShape);
    }

    // --- Extract shell from compound if needed (Sewing may return a compound) ---
    let shellForSolid = null;
    const shapeType = shapeToUse.ShapeType();

    if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_SOLID) {
        // Already a solid — validate and return
        console.log('rebuildShapeWithMovedVertices: ShapeFix produced solid directly');
        intermediates.forEach(o => { try { o.delete(); } catch (_) {} });
        _validateShape(oc, shapeToUse, origFaceCount);
        return shapeToUse;
    } else if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_SHELL) {
        shellForSolid = shapeToUse;
    } else if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
        // Extract first shell from compound
        const shellExp = new oc.TopExp_Explorer_2(
            shapeToUse,
            oc.TopAbs_ShapeEnum.TopAbs_SHELL,
            oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );
        if (shellExp.More()) {
            shellForSolid = oc.TopoDS.Shell_1(shellExp.Current());
            intermediates.push(shellForSolid); // downcast wrapper needs cleanup
        }
        shellExp.delete();
    }

    // --- Promote shell to solid ---
    let result = null;
    if (shellForSolid) {
        try {
            const solidMaker = new oc.BRepBuilderAPI_MakeSolid_3(shellForSolid);
            if (solidMaker.IsDone()) {
                result = solidMaker.Shape();
            }
            solidMaker.delete();
        } catch (_) {
            // MakeSolid failed
        }
    }

    if (!result || result.IsNull()) {
        // Return whatever we have (shell or compound)
        if (result && result.IsNull()) result.delete();
        console.warn('rebuildShapeWithMovedVertices: could not promote to solid, returning shell');
        // Clean intermediates but NOT shapeToUse (that's our return value)
        intermediates.forEach(o => {
            if (o !== shapeToUse) { try { o.delete(); } catch (_) {} }
        });
        _validateShape(oc, shapeToUse, origFaceCount);
        return shapeToUse;
    }

    // Success: clean up all intermediates (result is a new shape, independent)
    intermediates.forEach(o => { try { o.delete(); } catch (_) {} });
    if (shapeToUse !== result) {
        shapeToUse.delete();
    }

    _validateShape(oc, result, origFaceCount);
    return result;
}

/**
 * Validate a rebuilt shape using BRepCheck_Analyzer (if available)
 * and face count comparison. Logs warnings but does not throw.
 */
function _validateShape(oc, shape, origFaceCount) {
    // Face count check
    const newFaceCount = countTopologyElements(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
    const newEdgeCount = countTopologyElements(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
    console.log(`rebuildShapeWithMovedVertices: result has ${newFaceCount} faces, ${newEdgeCount} edges (original had ${origFaceCount} faces)`);

    if (newFaceCount < origFaceCount * 0.8) {
        console.warn(`Shape rebuild lost faces: ${origFaceCount} → ${newFaceCount}`);
    }

    // BRepCheck_Analyzer validation
    try {
        const analyzer = new oc.BRepCheck_Analyzer_1(shape, true);
        if (!analyzer.IsValid_1()) {
            console.warn('rebuildShapeWithMovedVertices: BRepCheck reports invalid shape (downstream ops may fail)');
        } else {
            console.log('rebuildShapeWithMovedVertices: BRepCheck reports valid shape');
        }
        analyzer.delete();
    } catch (e) {
        // BRepCheck not available — skip
    }
}

/**
 * Fallback: Preserve original faces that don't need rebuilding (keeps curves/fillets).
 * Only rebuilds faces whose vertices were moved.
 */
function _buildPreservingOriginals(oc, shape, TOLERANCE, wasMoved, getMovedPos, origFaceCount) {
    const newFaces = [];
    const vertexCache = _createVertexCache(oc, TOLERANCE);
    const faceExplorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (faceExplorer.More()) {
        const face = oc.TopoDS.Face_1(faceExplorer.Current());

        // Check if this face has any moved vertices
        let faceHasMovedVerts = false;
        const vertChecker = new oc.TopExp_Explorer_2(
            face,
            oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
            oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );
        while (vertChecker.More()) {
            const v = oc.TopoDS.Vertex_1(vertChecker.Current());
            const p = oc.BRep_Tool.Pnt(v);
            if (wasMoved(p.X(), p.Y(), p.Z())) {
                faceHasMovedVerts = true;
            }
            p.delete();
            v.delete();
            if (faceHasMovedVerts) break;
            vertChecker.Next();
        }
        vertChecker.delete();

        if (!faceHasMovedVerts) {
            // Keep original face (preserves curved/non-planar surfaces)
            newFaces.push(face);
            faceExplorer.Next();
            continue;
        }

        // Rebuild face with moved vertex positions
        const wireExplorer = new oc.TopExp_Explorer_2(
            face,
            oc.TopAbs_ShapeEnum.TopAbs_WIRE,
            oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );

        if (!wireExplorer.More()) {
            wireExplorer.delete();
            face.delete();
            faceExplorer.Next();
            continue;
        }

        const wire = oc.TopoDS.Wire_1(wireExplorer.Current());
        wireExplorer.delete();

        const wireEdgeExplorer = new oc.BRepTools_WireExplorer_2(wire);
        const newWireBuilder = new oc.BRepBuilderAPI_MakeWire_1();

        while (wireEdgeExplorer.More()) {
            const currentEdge = wireEdgeExplorer.Current();
            const firstV = oc.TopExp.FirstVertex(currentEdge, true);
            const lastV = oc.TopExp.LastVertex(currentEdge, true);
            const p1 = oc.BRep_Tool.Pnt(firstV);
            const p2 = oc.BRep_Tool.Pnt(lastV);

            const p1x = p1.X(), p1y = p1.Y(), p1z = p1.Z();
            const p2x = p2.X(), p2y = p2.Y(), p2z = p2.Z();
            const v1Moved = wasMoved(p1x, p1y, p1z);
            const v2Moved = wasMoved(p2x, p2y, p2z);

            if (!v1Moved && !v2Moved) {
                newWireBuilder.Add_1(currentEdge);
            } else {
                const newP1 = getMovedPos(p1x, p1y, p1z);
                const newP2 = getMovedPos(p2x, p2y, p2z);

                const edgeDist = Math.sqrt(
                    (newP2.x - newP1.x) ** 2 +
                    (newP2.y - newP1.y) ** 2 +
                    (newP2.z - newP1.z) ** 2
                );

                if (edgeDist > TOLERANCE) {
                    const sv1 = vertexCache.getOrCreate(newP1.x, newP1.y, newP1.z);
                    const sv2 = vertexCache.getOrCreate(newP2.x, newP2.y, newP2.z);
                    const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_2(sv1, sv2);
                    if (edgeBuilder.IsDone()) {
                        const newEdge = edgeBuilder.Edge();
                        newWireBuilder.Add_1(newEdge);
                        newEdge.delete();
                    }
                    edgeBuilder.delete();
                }
            }

            p1.delete();
            p2.delete();
            firstV.delete();
            lastV.delete();
            currentEdge.delete();

            wireEdgeExplorer.Next();
        }
        wireEdgeExplorer.delete();
        wire.delete();
        face.delete();

        if (newWireBuilder.IsDone()) {
            const newWire = newWireBuilder.Wire();
            try {
                const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(newWire, true);
                if (faceMaker.IsDone()) {
                    newFaces.push(faceMaker.Shape());
                }
                faceMaker.delete();
            } catch (e) {
                console.warn('Face rebuild failed:', e.message || e);
            } finally {
                newWire.delete();
            }
        }
        newWireBuilder.delete();

        faceExplorer.Next();
    }
    faceExplorer.delete();

    vertexCache.deleteAll();

    if (newFaces.length === 0) {
        throw new Error('Move failed: no valid faces could be rebuilt');
    }

    // Sew faces into solid (handles mixed original + rebuilt faces)
    const result = _sewFacesIntoSolid(oc, newFaces, TOLERANCE, origFaceCount);
    newFaces.forEach(f => { try { f.delete(); } catch (_) {} });
    return result;
}

/**
 * Get all vertex positions on a specific face by index.
 * @param {Object} shape - TopoDS_Shape
 * @param {number} faceIndex - Face index from topology explorer
 * @returns {Array<{x: number, y: number, z: number}>|null}
 */
export function getFaceVertexPositions(shape, faceIndex) {
    const oc = getOC();
    const face = getFaceByIndex(shape, faceIndex);
    if (!face) return null;

    const vertices = [];
    const seen = new Set();
    const TOLERANCE = 1e-5;

    const explorer = new oc.TopExp_Explorer_2(
        face,
        oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
        const vertex = oc.TopoDS.Vertex_1(explorer.Current());
        const pnt = oc.BRep_Tool.Pnt(vertex);
        const x = pnt.X(), y = pnt.Y(), z = pnt.Z();

        // Deduplicate by rounding to tolerance
        const key = `${Math.round(x / TOLERANCE)},${Math.round(y / TOLERANCE)},${Math.round(z / TOLERANCE)}`;
        if (!seen.has(key)) {
            seen.add(key);
            vertices.push({ x, y, z });
        }

        pnt.delete();
        vertex.delete();
        explorer.Next();
    }
    explorer.delete();
    face.delete();

    return vertices;
}

/**
 * Get the normals of faces adjacent to a given edge (typically 2 for a solid).
 * Used to compute the outward handle direction for fillet/chamfer.
 * @param {Object} shape - TopoDS_Shape
 * @param {number} edgeIndex - Edge index from topology explorer
 * @returns {Array<{x: number, y: number, z: number}>} Array of face normals (typically 2)
 */
export function getAdjacentFaceNormals(shape, edgeIndex) {
    const oc = getOC();
    const targetEdge = getEdgeByIndex(shape, edgeIndex);
    if (!targetEdge) return [];

    const normals = [];
    const faceExplorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (faceExplorer.More()) {
        const face = oc.TopoDS.Face_1(faceExplorer.Current());
        const edgeExp = new oc.TopExp_Explorer_2(
            face,
            oc.TopAbs_ShapeEnum.TopAbs_EDGE,
            oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );

        let found = false;
        while (edgeExp.More()) {
            const faceEdge = oc.TopoDS.Edge_1(edgeExp.Current());
            if (faceEdge.IsSame(targetEdge)) {
                found = true;
                faceEdge.delete();
                break;
            }
            faceEdge.delete();
            edgeExp.Next();
        }
        edgeExp.delete();

        if (found) {
            // Compute face normal from triangulation
            const loc = new oc.TopLoc_Location_1();
            const handleTri = oc.BRep_Tool.Triangulation(face, loc);
            if (handleTri && !handleTri.IsNull()) {
                const tri = handleTri.get();
                if (tri.NbTriangles() > 0) {
                    const t = tri.Triangle(1); // 1-based
                    const n1 = t.Value(1), n2 = t.Value(2), n3 = t.Value(3);
                    t.delete();
                    const p1 = tri.Node(n1), p2 = tri.Node(n2), p3 = tri.Node(n3);

                    // Cross product to get face normal
                    const ux = p2.X() - p1.X(), uy = p2.Y() - p1.Y(), uz = p2.Z() - p1.Z();
                    const vx = p3.X() - p1.X(), vy = p3.Y() - p1.Y(), vz = p3.Z() - p1.Z();
                    let nx = uy * vz - uz * vy;
                    let ny = uz * vx - ux * vz;
                    let nz = ux * vy - uy * vx;
                    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                    if (len > 1e-10) {
                        nx /= len; ny /= len; nz /= len;
                        // Account for face orientation
                        if (face.IsEqual(faceExplorer.Current())) {
                            const orient = face.Orientation_1();
                            if (orient === oc.TopAbs_Orientation.TopAbs_REVERSED) {
                                nx = -nx; ny = -ny; nz = -nz;
                            }
                        }
                        normals.push({ x: nx, y: ny, z: nz });
                    }
                    p1.delete(); p2.delete(); p3.delete();
                }
            }
            loc.delete();
        }

        face.delete();
        faceExplorer.Next();
        if (normals.length >= 2) break; // A solid edge borders exactly 2 faces
    }
    faceExplorer.delete();
    targetEdge.delete();

    return normals;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Transform local 2D (u, v) coordinates to world 3D using a sketch plane
 */
function localToWorld(u, v, plane) {
    return {
        x: plane.origin.x + u * plane.uAxis.x + v * plane.vAxis.x,
        y: plane.origin.y + u * plane.uAxis.y + v * plane.vAxis.y,
        z: plane.origin.z + u * plane.uAxis.z + v * plane.vAxis.z
    };
}
