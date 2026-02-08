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
 * Tries shared-edge topology first (proper B-rep for downstream OCCT ops),
 * falls back to disconnected faces if shared edges aren't possible.
 * @param {Object} shape - TopoDS_Shape (original)
 * @param {Array<{from: {x,y,z}, to: {x,y,z}}>} vertexMoves - Old → new position pairs
 * @returns {Object} New TopoDS_Shape (solid or shell)
 * @throws {Error} If no valid faces could be rebuilt
 */
export function rebuildShapeWithMovedVertices(shape, vertexMoves) {
    const oc = getOC();
    const TOLERANCE = 1e-4;

    // Position key for shared vertex/edge deduplication
    function posKey(x, y, z) {
        return `${Math.round(x / TOLERANCE)},${Math.round(y / TOLERANCE)},${Math.round(z / TOLERANCE)}`;
    }

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
    const faceBoundaries = []; // Array of { positions: [{x,y,z}] }
    let hasNonPlanarFaces = false;

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
            hasNonPlanarFaces = true;
            faceExplorer.Next();
            continue;
        }

        const wire = oc.TopoDS.Wire_1(wireExp.Current());
        wireExp.delete();

        const edgeExp = new oc.BRepTools_WireExplorer_2(wire);
        const positions = [];

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
                hasNonPlanarFaces = true;
            }

            positions.push(getMovedPos(x1, y1, z1));

            p1.delete(); p2.delete();
            firstV.delete(); lastV.delete();
            edgeExp.Next();
        }
        edgeExp.delete();
        wire.delete();
        face.delete();

        if (positions.length < 3) hasNonPlanarFaces = true;
        faceBoundaries.push({ positions });
        faceExplorer.Next();
    }
    faceExplorer.delete();

    if (faceBoundaries.length === 0) {
        throw new Error('Move failed: no faces found in shape');
    }

    // ===== Phase 2: Try shared-edge topology (proper B-rep) =====
    // Only possible when all faces are planar with straight edges.
    // Shared edges give the shell proper topology so downstream OCCT ops
    // (fillet, chamfer, boolean) work correctly.
    if (!hasNonPlanarFaces && faceBoundaries.length >= 4) {
        try {
            const result = _buildWithSharedEdges(oc, faceBoundaries, posKey, TOLERANCE);
            if (result) {
                console.log('rebuildShapeWithMovedVertices: shared-edge topology succeeded');
                return result;
            }
        } catch (e) {
            console.warn('Shared-edge rebuild failed:', e.message || e);
        }
    }

    // ===== Phase 3: Disconnected fallback (renders OK, topology may be broken) =====
    console.log('rebuildShapeWithMovedVertices: using disconnected fallback');
    return _buildDisconnectedFaces(oc, shape, TOLERANCE, wasMoved, getMovedPos);
}

/**
 * Build shape with proper shared-edge topology.
 * Creates shared TopoDS_Vertex objects, then shared TopoDS_Edge objects
 * from those vertices. Faces built from shared edges have proper adjacency.
 * @returns {Object|null} TopoDS_Shape with proper topology, or null if build fails
 */
function _buildWithSharedEdges(oc, faceBoundaries, posKey, TOLERANCE) {
    const tempObjects = []; // OCCT wrappers to clean up (safe: solid holds internal TShape refs)

    // --- Probe for MakeVertex constructor (may vary by OCCT.js build) ---
    let makeVertexFn = null;
    const probePoint = new oc.gp_Pnt_3(0, 0, 0);
    for (const ctorName of ['BRepBuilderAPI_MakeVertex_1', 'BRepBuilderAPI_MakeVertex']) {
        if (typeof oc[ctorName] === 'function') {
            try {
                const test = new oc[ctorName](probePoint);
                test.delete();
                makeVertexFn = (pt) => new oc[ctorName](pt);
                break;
            } catch (_) { /* try next */ }
        }
    }
    probePoint.delete();

    if (!makeVertexFn) {
        console.warn('BRepBuilderAPI_MakeVertex not available — cannot build shared edges');
        return null;
    }

    // --- Create shared vertices ---
    const vertexMap = new Map(); // posKey → TopoDS_Vertex

    for (const fb of faceBoundaries) {
        for (const pos of fb.positions) {
            const key = posKey(pos.x, pos.y, pos.z);
            if (!vertexMap.has(key)) {
                const gp = new oc.gp_Pnt_3(pos.x, pos.y, pos.z);
                const vb = makeVertexFn(gp);
                const vertex = vb.Vertex();
                vertexMap.set(key, vertex);
                tempObjects.push(vertex);
                vb.delete();
                gp.delete();
            }
        }
    }

    // --- Create shared edges (one per unique unordered vertex pair) ---
    const edgeMap = new Map(); // "k1|k2" (sorted) → TopoDS_Edge

    for (const fb of faceBoundaries) {
        const verts = fb.positions;
        for (let i = 0; i < verts.length; i++) {
            const p1 = verts[i];
            const p2 = verts[(i + 1) % verts.length];
            const k1 = posKey(p1.x, p1.y, p1.z);
            const k2 = posKey(p2.x, p2.y, p2.z);
            if (k1 === k2) continue;

            const edgeKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
            if (!edgeMap.has(edgeKey)) {
                const v1 = vertexMap.get(k1);
                const v2 = vertexMap.get(k2);
                if (!v1 || !v2) continue;

                try {
                    const eb = new oc.BRepBuilderAPI_MakeEdge_2(v1, v2);
                    if (eb.IsDone()) {
                        const edge = eb.Edge();
                        edgeMap.set(edgeKey, edge);
                        tempObjects.push(edge);
                    }
                    eb.delete();
                } catch (e) {
                    // MakeEdge_2 (vertex overload) not available
                    tempObjects.forEach(o => { try { o.delete(); } catch (_) {} });
                    return null;
                }
            }
        }
    }

    // --- Build faces from shared edges ---
    const newFaces = [];

    for (const fb of faceBoundaries) {
        const verts = fb.positions;
        const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();

        for (let i = 0; i < verts.length; i++) {
            const p1 = verts[i];
            const p2 = verts[(i + 1) % verts.length];
            const k1 = posKey(p1.x, p1.y, p1.z);
            const k2 = posKey(p2.x, p2.y, p2.z);
            if (k1 === k2) continue;

            const edgeKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
            const edge = edgeMap.get(edgeKey);
            if (edge) {
                wireBuilder.Add_1(edge);
            }
        }

        if (!wireBuilder.IsDone()) {
            wireBuilder.delete();
            newFaces.forEach(f => f.delete());
            tempObjects.forEach(o => { try { o.delete(); } catch (_) {} });
            return null;
        }

        const wire = wireBuilder.Wire();
        wireBuilder.delete();

        try {
            const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
            if (faceMaker.IsDone()) {
                newFaces.push(faceMaker.Shape());
            } else {
                faceMaker.delete();
                wire.delete();
                newFaces.forEach(f => f.delete());
                tempObjects.forEach(o => { try { o.delete(); } catch (_) {} });
                return null;
            }
            faceMaker.delete();
        } catch (e) {
            wire.delete();
            newFaces.forEach(f => f.delete());
            tempObjects.forEach(o => { try { o.delete(); } catch (_) {} });
            return null;
        }
        wire.delete();
    }

    if (newFaces.length < 4) {
        newFaces.forEach(f => f.delete());
        tempObjects.forEach(o => { try { o.delete(); } catch (_) {} });
        return null;
    }

    // --- Assemble shell from faces ---
    const builder = new oc.BRep_Builder();
    const shell = new oc.TopoDS_Shell();
    builder.MakeShell(shell);
    for (const f of newFaces) {
        builder.Add(shell, f);
    }

    // --- Make solid (using _3 = Shell overload) ---
    let result = null;
    try {
        const solidMaker = new oc.BRepBuilderAPI_MakeSolid_3(shell);
        if (solidMaker.IsDone()) {
            result = solidMaker.Shape();
        }
        solidMaker.delete();
    } catch (_) {
        // MakeSolid_3 not available or failed — fall through
    }

    if (!result) {
        result = shell;
    } else {
        shell.delete();
    }
    builder.delete();

    // Cleanup wrappers (safe: the solid holds internal refs to underlying TShape data)
    newFaces.forEach(f => { try { f.delete(); } catch (_) {} });
    tempObjects.forEach(o => { try { o.delete(); } catch (_) {} });

    return result;
}

/**
 * Fallback: Build shape with disconnected faces.
 * Each face is rebuilt independently — edges are NOT shared between faces.
 * Renders correctly but topology is broken for some OCCT operations.
 * Preserves original faces whose vertices weren't moved (keeps curves/fillets).
 */
function _buildDisconnectedFaces(oc, shape, TOLERANCE, wasMoved, getMovedPos) {
    const newFaces = [];
    const faceExplorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const intermediates = [];

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
                    newFaces.push(faceMaker.Shape());
                    faceMaker.delete();
                } else {
                    faceMaker.delete();
                }
            } catch (e) {
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

    // Build shell from faces
    const builder = new oc.BRep_Builder();
    const shell = new oc.TopoDS_Shell();
    builder.MakeShell(shell);
    for (const f of newFaces) {
        builder.Add(shell, f);
    }

    // Try to make solid (_3 = Shell overload, _2 was CompSolid = always failed)
    let result = null;
    try {
        const solidMaker = new oc.BRepBuilderAPI_MakeSolid_3(shell);
        if (solidMaker.IsDone()) {
            result = solidMaker.Shape();
        }
        solidMaker.delete();
    } catch (_) {
        // MakeSolid_3 not available
    }

    if (!result) {
        result = shell;
    } else {
        shell.delete();
    }
    builder.delete();

    newFaces.forEach(f => { try { f.delete(); } catch (_) {} });
    intermediates.forEach(o => { try { o.delete(); } catch (_) {} });

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
