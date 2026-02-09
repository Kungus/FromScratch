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
- All these modules are loaded by `occtInit.js`

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
