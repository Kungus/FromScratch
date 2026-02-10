/**
 * FromScratch - OCCT Tessellation
 * Converts a TopoDS_Shape to renderable mesh data with topology maps.
 * Output is plain arrays — no THREE.js dependency.
 *
 * Returns:
 *   positions: Float32Array of vertex positions (x,y,z repeated)
 *   indices: Uint32Array of triangle indices
 *   normals: Float32Array of vertex normals
 *   faceMap: Array of { faceIndex, startTriangle, endTriangle, normal }
 *   edgeMap: Array of { edgeIndex, vertices: [{x,y,z},...] }
 *   vertexMap: Array of { vertexIndex, position: {x,y,z} }
 */

import { getOC } from './occtInit.js';

const DEFAULTS = {
    deflection: 0.1,
    angDeflection: 0.25,
    edgeSteps: 24,
    skipVertexMap: false
};

const PREVIEW = {
    deflection: 0.3,
    angDeflection: 0.5,
    edgeSteps: 8,
    skipVertexMap: true
};

/**
 * Internal tessellation with configurable quality parameters.
 */
function _tessellate(shape, opts) {
    const oc = getOC();

    const deflection = opts.deflection ?? DEFAULTS.deflection;
    const angDeflection = opts.angDeflection ?? DEFAULTS.angDeflection;
    const edgeSteps = opts.edgeSteps ?? DEFAULTS.edgeSteps;
    const skipVertexMap = opts.skipVertexMap ?? DEFAULTS.skipVertexMap;

    // Mesh the shape
    const mesher = new oc.BRepMesh_IncrementalMesh_2(
        shape,
        deflection,
        false,          // isRelative
        angDeflection,  // radians
        false           // isInParallel
    );
    mesher.Perform_1(new oc.Message_ProgressRange_1());

    const allPositions = [];
    const allNormals = [];
    const allIndices = [];
    const faceMap = [];
    const edgeMap = [];
    const vertexMap = [];

    let vertexOffset = 0;
    let triangleOffset = 0;
    let faceIndex = 0;

    // === FACES (triangulated surfaces) ===
    const faceExplorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_FACE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (faceExplorer.More()) {
        const face = oc.TopoDS.Face_1(faceExplorer.Current());
        const location = new oc.TopLoc_Location_1();
        const triangulation = oc.BRep_Tool.Triangulation(face, location);

        if (!triangulation.IsNull()) {
            const tri = triangulation.get();
            const nbNodes = tri.NbNodes();
            const nbTriangles = tri.NbTriangles();

            // Get face orientation (check if reversed for correct winding)
            const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

            // Compute face normal from first triangle for faceMap
            let faceNormal = null;

            // Collect vertex positions
            for (let i = 1; i <= nbNodes; i++) {
                const node = tri.Node(i);
                const transformed = node.Transformed(location.Transformation());
                allPositions.push(transformed.X(), transformed.Y(), transformed.Z());
                // Normals will be computed per-triangle below; placeholder
                allNormals.push(0, 0, 0);
            }

            // Collect triangles
            const faceStartTriangle = triangleOffset;
            for (let i = 1; i <= nbTriangles; i++) {
                const triangle = tri.Triangle(i);
                let n1 = triangle.Value(1) - 1 + vertexOffset;
                let n2 = triangle.Value(2) - 1 + vertexOffset;
                let n3 = triangle.Value(3) - 1 + vertexOffset;

                // Reverse winding if face is reversed
                if (isReversed) {
                    [n2, n3] = [n3, n2];
                }

                allIndices.push(n1, n2, n3);

                // Compute normal for this triangle
                const p1x = allPositions[n1 * 3], p1y = allPositions[n1 * 3 + 1], p1z = allPositions[n1 * 3 + 2];
                const p2x = allPositions[n2 * 3], p2y = allPositions[n2 * 3 + 1], p2z = allPositions[n2 * 3 + 2];
                const p3x = allPositions[n3 * 3], p3y = allPositions[n3 * 3 + 1], p3z = allPositions[n3 * 3 + 2];

                const ux = p2x - p1x, uy = p2y - p1y, uz = p2z - p1z;
                const vx = p3x - p1x, vy = p3y - p1y, vz = p3z - p1z;
                let nx = uy * vz - uz * vy;
                let ny = uz * vx - ux * vz;
                let nz = ux * vy - uy * vx;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                if (len > 0) { nx /= len; ny /= len; nz /= len; }

                if (!faceNormal) {
                    faceNormal = { x: nx, y: ny, z: nz };
                }

                // Accumulate normals for smooth shading on curved surfaces
                for (const idx of [n1, n2, n3]) {
                    allNormals[idx * 3] += nx;
                    allNormals[idx * 3 + 1] += ny;
                    allNormals[idx * 3 + 2] += nz;
                }

                triangleOffset++;
            }

            // Normalize accumulated vertex normals for this face
            for (let i = vertexOffset; i < vertexOffset + nbNodes; i++) {
                const ni = i * 3;
                const nlx = allNormals[ni], nly = allNormals[ni + 1], nlz = allNormals[ni + 2];
                const nlen = Math.sqrt(nlx * nlx + nly * nly + nlz * nlz);
                if (nlen > 0) {
                    allNormals[ni] /= nlen;
                    allNormals[ni + 1] /= nlen;
                    allNormals[ni + 2] /= nlen;
                }
            }

            faceMap.push({
                faceIndex,
                startTriangle: faceStartTriangle,
                endTriangle: triangleOffset,
                normal: faceNormal || { x: 0, y: 1, z: 0 }
            });

            vertexOffset += nbNodes;
        }

        location.delete();
        faceIndex++;
        faceExplorer.Next();
    }
    faceExplorer.delete();

    // === EDGES (polylines for edge rendering) ===
    let edgeIndex = 0;
    const edgeExplorer = new oc.TopExp_Explorer_2(
        shape,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (edgeExplorer.More()) {
        const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());
        const edgeVertices = [];

        let adaptor = null;
        try {
            // Use BRepAdaptor_Curve to sample edge geometry
            adaptor = new oc.BRepAdaptor_Curve_2(edge);
            const first = adaptor.FirstParameter();
            const last = adaptor.LastParameter();

            // Sample the curve at uniform intervals
            for (let i = 0; i <= edgeSteps; i++) {
                const t = first + (last - first) * (i / edgeSteps);
                const pt = adaptor.Value(t);
                edgeVertices.push({ x: pt.X(), y: pt.Y(), z: pt.Z() });
                pt.delete();
            }
        } catch (e) {
            // Skip edges that can't be sampled (degenerate edges)
        } finally {
            if (adaptor) adaptor.delete();
        }

        if (edgeVertices.length >= 2) {
            edgeMap.push({ edgeIndex, vertices: edgeVertices });
        }

        edgeIndex++;
        edgeExplorer.Next();
    }
    edgeExplorer.delete();

    // === VERTICES (point positions for vertex selection) ===
    if (!skipVertexMap) {
        let vIndex = 0;
        const vertexExplorer = new oc.TopExp_Explorer_2(
            shape,
            oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
            oc.TopAbs_ShapeEnum.TopAbs_SHAPE
        );

        while (vertexExplorer.More()) {
            const vertex = oc.TopoDS.Vertex_1(vertexExplorer.Current());
            const pt = oc.BRep_Tool.Pnt(vertex);
            vertexMap.push({
                vertexIndex: vIndex,
                position: { x: pt.X(), y: pt.Y(), z: pt.Z() }
            });
            pt.delete();
            vIndex++;
            vertexExplorer.Next();
        }
        vertexExplorer.delete();
    }

    mesher.delete();

    return {
        positions: new Float32Array(allPositions),
        indices: new Uint32Array(allIndices),
        normals: new Float32Array(allNormals),
        faceMap,
        edgeMap,
        vertexMap
    };
}

/**
 * Tessellate an OCCT shape into mesh data (full quality, for commits).
 * @param {Object} shape - TopoDS_Shape
 * @param {number} deflection - Mesh quality (smaller = finer, default 0.1)
 * @returns {Object} { positions, indices, normals, faceMap, edgeMap, vertexMap }
 */
export function tessellateShape(shape, deflection = 0.1) {
    return _tessellate(shape, { ...DEFAULTS, deflection });
}

/**
 * Tessellate an OCCT shape for preview display (coarser, faster).
 * Skips vertex map exploration and uses fewer edge curve steps.
 * @param {Object} shape - TopoDS_Shape
 * @returns {Object} { positions, indices, normals, faceMap, edgeMap, vertexMap }
 */
export function tessellateShapeForPreview(shape) {
    return _tessellate(shape, PREVIEW);
}
