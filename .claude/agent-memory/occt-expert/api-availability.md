# Detailed API Availability Analysis

## rebuildShapeWithMovedVertices - Full Audit (2026-02-08)

### Phase 1: Face Boundary Extraction
- Uses `TopExp_Explorer_2`, `BRepTools_WireExplorer_2`, `TopExp.FirstVertex`, `TopExp.LastVertex`, `BRep_Tool.Pnt` -- all confirmed available.
- Correctly extracts vertex positions and applies moves.
- Detects degenerate edges (self-loops from circles) via distance check.

### Phase 2: _buildWithSharedEdges
- `BRepBuilderAPI_MakeVertex` -- available (NO _1 suffix, code probes correctly)
- `BRepBuilderAPI_MakeEdge_2(V1, V2)` -- available, creates edge from two TopoDS_Vertex
- `BRepBuilderAPI_MakeWire_1()` + `.Add_1(edge)` -- available
- `BRepBuilderAPI_MakeFace_15(wire, true)` -- available
- `BRep_Builder` + `.MakeShell(shell)` + `.Add(shell, face)` -- available
- `BRepBuilderAPI_MakeSolid_3(shell)` -- available, correct overload for Shell

### Phase 3: _buildDisconnectedFaces
- Same APIs as Phase 2 minus shared vertex/edge construction
- Uses `BRepBuilderAPI_MakeEdge_3(gp1, gp2)` for independent edges -- available

### Critical Issues Found
1. Edge orientation not handled in _buildWithSharedEdges (see MEMORY.md)
2. BRepBuilderAPI_Sewing actually IS available and would be a better approach
3. BRepCheck_Analyzer available for validation
4. ShapeFix_Shape available for repair
