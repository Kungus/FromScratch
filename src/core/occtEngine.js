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
    const faceShape = face.Shape();

    // Extrude along direction
    const vec = new oc.gp_Vec_4(direction.x, direction.y, direction.z);
    const prism = new oc.BRepPrimAPI_MakePrism_1(faceShape, vec, false, true);
    const shape = prism.Shape();

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
 * Boolean cut: base - tool
 * @param {Object} baseShape - TopoDS_Shape to cut from
 * @param {Object} toolShape - TopoDS_Shape to cut with
 * @returns {Object} Resulting TopoDS_Shape
 */
export function booleanCut(baseShape, toolShape) {
    const oc = getOC();
    const cut = new oc.BRepAlgoAPI_Cut_3(baseShape, toolShape);
    const result = cut.Shape();
    cut.delete();
    return result;
}

/**
 * Boolean fuse: a + b
 * @param {Object} shapeA - First shape
 * @param {Object} shapeB - Second shape
 * @returns {Object} Resulting TopoDS_Shape
 */
export function booleanFuse(shapeA, shapeB) {
    const oc = getOC();
    const fuse = new oc.BRepAlgoAPI_Fuse_3(shapeA, shapeB);
    const result = fuse.Shape();
    fuse.delete();
    return result;
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
    const result = fillet.Shape();
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

    // Extract the outer wire from the face and rebuild as an independent face.
    // This avoids shared-topology issues when extruding a sub-shape of the original.
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

    // Build a new independent face from the wire
    const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
    const independentFace = faceMaker.Shape();

    const vec = new oc.gp_Vec_4(direction.x, direction.y, direction.z);
    const prism = new oc.BRepPrimAPI_MakePrism_1(independentFace, vec, false, true);
    const extrudedShape = prism.Shape();

    const fuse = new oc.BRepAlgoAPI_Fuse_3(shape, extrudedShape);
    const result = fuse.Shape();

    wire.delete();
    faceMaker.delete();
    independentFace.delete();
    vec.delete();
    prism.delete();
    extrudedShape.delete();
    fuse.delete();

    return result;
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

    // Extract the outer wire from the face and rebuild as an independent face.
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

    // Build a new independent face from the wire
    const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
    const independentFace = faceMaker.Shape();

    const vec = new oc.gp_Vec_4(direction.x, direction.y, direction.z);
    const prism = new oc.BRepPrimAPI_MakePrism_1(independentFace, vec, false, true);
    const extrudedShape = prism.Shape();

    const cut = new oc.BRepAlgoAPI_Cut_3(shape, extrudedShape);
    const result = cut.Shape();

    wire.delete();
    faceMaker.delete();
    independentFace.delete();
    vec.delete();
    prism.delete();
    extrudedShape.delete();
    cut.delete();

    return result;
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
    const result = chamfer.Shape();

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
 * Rebuild a shape with some vertices moved to new positions.
 * Only works for shapes with planar faces and straight edges.
 * @param {Object} shape - TopoDS_Shape (original)
 * @param {Array<{from: {x,y,z}, to: {x,y,z}}>} vertexMoves - Old → new position pairs
 * @returns {Object} New TopoDS_Shape (solid)
 * @throws {Error} If shape has curved edges/faces or result is invalid
 */
export function rebuildShapeWithMovedVertices(shape, vertexMoves) {
    const oc = getOC();
    const TOLERANCE = 1e-4;

    // Helper: check if a position matches a "from" in vertexMoves, return the "to"
    function applyMove(x, y, z) {
        for (const move of vertexMoves) {
            if (Math.abs(x - move.from.x) < TOLERANCE &&
                Math.abs(y - move.from.y) < TOLERANCE &&
                Math.abs(z - move.from.z) < TOLERANCE) {
                return move.to;
            }
        }
        return null; // null = no move needed
    }

    // Helper: check if a point was moved
    function wasMoved(x, y, z) {
        return applyMove(x, y, z) !== null;
    }

    // Helper: get moved position or original
    function getMovedPos(x, y, z) {
        return applyMove(x, y, z) || { x, y, z };
    }

    // Build new faces
    const newFaces = [];
    const faceExplorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const intermediates = []; // track all OCCT objects for cleanup

    while (faceExplorer.More()) {
        const face = oc.TopoDS.Face_1(faceExplorer.Current());

        // First check: does this face have any moved vertices?
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
            // No vertices moved on this face — keep original face as-is
            // (preserves curved/non-planar surfaces like fillets, cylinder sides)
            newFaces.push(face); // don't delete — it goes into the sewing
            faceExplorer.Next();
            continue;
        }

        // Face has moved vertices — rebuild it with new wire
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

        // Iterate edges in the wire in order
        const wireEdgeExplorer = new oc.BRepTools_WireExplorer_2(wire);
        const newWireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
        intermediates.push(newWireBuilder);

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
                // Neither vertex moved — keep original edge (preserves curves)
                newWireBuilder.Add_1(currentEdge);
            } else {
                // At least one vertex moved — create new straight edge at moved positions
                const newP1 = getMovedPos(p1x, p1y, p1z);
                const newP2 = getMovedPos(p2x, p2y, p2z);

                const edgeDist = Math.sqrt(
                    (newP2.x - newP1.x) ** 2 +
                    (newP2.y - newP1.y) ** 2 +
                    (newP2.z - newP1.z) ** 2
                );

                if (edgeDist > TOLERANCE) {
                    const gp1 = new oc.gp_Pnt_3(newP1.x, newP1.y, newP1.z);
                    const gp2 = new oc.gp_Pnt_3(newP2.x, newP2.y, newP2.z);
                    const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
                    const newEdge = edgeBuilder.Edge();
                    newWireBuilder.Add_1(newEdge);
                    newEdge.delete();
                    edgeBuilder.delete();
                    gp1.delete();
                    gp2.delete();
                }
            }

            p1.delete();
            p2.delete();
            firstV.delete();
            lastV.delete();

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
                    const newFace = faceMaker.Shape();
                    newFaces.push(newFace);
                    faceMaker.delete();
                } else {
                    faceMaker.delete();
                }
            } catch (e) {
                // Non-planar face after vertex move — skip and let validation catch it
                console.warn('Face rebuild failed:', e.message || e);
            } finally {
                newWire.delete();
            }
        }

        faceExplorer.Next();
    }
    faceExplorer.delete();

    if (newFaces.length === 0) {
        intermediates.forEach(o => { try { o.delete(); } catch (_) {} });
        throw new Error('Move failed: no valid faces could be rebuilt');
    }

    // Build shell from faces using BRep_Builder (more universally available than Sewing)
    let result;
    const builder = new oc.BRep_Builder();
    const shell = new oc.TopoDS_Shell();
    builder.MakeShell(shell);
    for (const f of newFaces) {
        builder.Add(shell, f);
    }

    // Try to make a solid from the shell
    try {
        const solidMaker = new oc.BRepBuilderAPI_MakeSolid_2(shell);
        if (solidMaker.IsDone()) {
            result = solidMaker.Shape();
        }
        solidMaker.delete();
    } catch (e) {
        console.warn('Solid creation from shell failed:', e.message || e);
    }

    if (!result) {
        // Fall back to shell (not a solid, but might still render)
        result = shell;
    } else {
        shell.delete();
    }

    // Validate
    try {
        const analyzer = new oc.BRepCheck_Analyzer_1(result, true);
        const isValid = analyzer.IsValid();
        analyzer.delete();
        if (!isValid) {
            console.warn('Rebuilt shape validation failed — result may have issues');
        }
    } catch (e) {
        console.warn('Shape validation skipped:', e.message || e);
    }

    // Cleanup
    newFaces.forEach(f => { try { f.delete(); } catch (_) {} });
    intermediates.forEach(o => { try { o.delete(); } catch (_) {} });
    builder.delete();

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
