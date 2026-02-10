# OCCT Expert Agent Memory

## Verified API Availability (ocjs.org v2.0.0-beta)

### Confirmed AVAILABLE in opencascade.js WASM build
- `BRepBuilderAPI_MakeVertex(P: gp_Pnt)` - NO _1 suffix (single constructor)
  - Methods: `.Vertex()`, `.IsDone()`, `.Shape()`, `.delete()`
- `BRepBuilderAPI_MakeEdge_2(V1: TopoDS_Vertex, V2: TopoDS_Vertex)` - edge from two vertices
- `BRepBuilderAPI_MakeEdge_3(P1: gp_Pnt, P2: gp_Pnt)` - edge from two points
- `BRepBuilderAPI_MakeEdge_8(circle: gp_Circ)` - edge from circle
- `BRepBuilderAPI_MakeSolid_3(S: TopoDS_Shell)` - solid from shell (confirmed _3 = Shell overload)
- `BRepBuilderAPI_MakeWire` - Add_1(Edge), Add_2(Wire), Add_3(ListOfShape)
- `BRepBuilderAPI_MakeFace_15(wire, onlyPlane)` - face from wire
- `BRepTools_WireExplorer_2(W: TopoDS_Wire)` - wire traversal
- `BRep_Builder` - MakeShell, MakeSolid, Add all confirmed
- `BRepBuilderAPI_Sewing` - AVAILABLE despite CLAUDE.md saying otherwise (in TKTopAlgo)
- `BRepCheck_Analyzer` - AVAILABLE despite CLAUDE.md saying otherwise (in TKTopAlgo)
- `ShapeFix_Shape` - AVAILABLE despite CLAUDE.md saying otherwise (in TKShHealing)
- `TopExp_Explorer_2`, `TopExp.FirstVertex`, `TopExp.LastVertex` - confirmed
- `BRep_Tool.Pnt(vertex)` - confirmed

### Constructor Overload Numbering (from OCCT declaration order)
- `BRepBuilderAPI_MakeSolid_1()` = empty
- `BRepBuilderAPI_MakeSolid_2(CompSolid)` = from CompSolid
- `BRepBuilderAPI_MakeSolid_3(Shell)` = from Shell **<-- correct for shell->solid**
- `BRepBuilderAPI_MakeSolid_6(Solid)` = from existing Solid
- `BRepBuilderAPI_MakeSolid_7(Solid, Shell)` = add shell to solid
- `BRepBuilderAPI_MakeEdge_1()` = empty
- `BRepBuilderAPI_MakeEdge_2(V1, V2)` = from two vertices (shared topology)
- `BRepBuilderAPI_MakeEdge_3(P1, P2)` = from two gp_Pnt (independent topology)

### WASM Module Locations
- BRepBuilderAPI classes: `module.TKTopAlgo.wasm`
- ShapeFix classes: `module.TKShHealing.wasm`
- BRepCheck classes: `module.TKTopAlgo.wasm`
- ShapeUpgrade classes (incl. UnifySameDomain): `module.TKShHealing.wasm`
- BRepAlgoAPI boolean classes: `module.TKBO.wasm` + `module.TKBool.wasm`
- BRepFeat classes (SplitShape): `module.TKFeat.wasm` -- EXISTS in build but NOT loaded by occtInit.js
- All modules listed in occtInit.js REQUIRED_LIBS are loaded at startup

### Boolean Operation Coplanar Face Behavior
- **BRepAlgoAPI_Fuse does NOT merge coplanar faces by default** -- keeps them as separate topology
- Result of fusing box + protrusion on same plane: adjacent coplanar faces remain split with seam edges
- **SimplifyResult(unifyEdges, unifyFaces, angularTol)** merges coplanar faces AFTER Build
  - Inherited from BRepAlgoAPI_BuilderAlgo, available on Fuse/Cut/Common
  - Default: unifyEdges=true, unifyFaces=true
  - Internally uses ShapeUpgrade_UnifySameDomain
- **ShapeUpgrade_UnifySameDomain** -- standalone post-processor, in TKShHealing (LOADED)
  - Constructors: _1() empty, _2(shape, unifyEdges, unifyFaces, concatBSplines)
  - Methods: Build(), Shape(), History(), KeepShape(), SetLinearTolerance(), SetAngularTolerance()
  - WARNING: UnifyEdges+UnifyFaces together can produce INVALID solids on curved shapes
  - Safe pattern: `(shape, false, true, false)` -- faces only, no edge unification
- **Face splitting tools**: BRepFeat_SplitShape (in TKFeat, not loaded), BRepAlgoAPI_Splitter
- See: `coplanar-faces.md` for detailed analysis

### Key Findings
1. **BRepBuilderAPI_MakeVertex has NO _1 suffix** - it's just `BRepBuilderAPI_MakeVertex`
   The code's probe loop tries `BRepBuilderAPI_MakeVertex_1` first, then `BRepBuilderAPI_MakeVertex`
   This should work but is fragile
2. **BRepBuilderAPI_Sewing IS available** - the CLAUDE.md claim it's unavailable was likely wrong
   This means the `_buildWithSharedEdges` approach could potentially use Sewing instead
3. **BRepCheck_Analyzer and ShapeFix_Shape are also available** - could be used for validation/repair

## Critical Bug in rebuildShapeWithMovedVertices

### Edge Orientation Problem (Phase 2: _buildWithSharedEdges)
When adding a shared edge to a wire, the edge might need to be REVERSED depending on
which face is using it. The code adds the same edge object to multiple wires without
considering orientation. `BRepBuilderAPI_MakeWire.Add_1(edge)` may fail or produce
incorrect winding if the edge direction doesn't match the wire's expected vertex order.

### See: `api-availability.md` for detailed analysis
