# Geometry Guard Memory

## OCCT.js API Availability (2026-02-08 Audit)

### NOT Available in this build:
- `BRepCheck_Analyzer` — NO shape validation API exists
- `ShapeFix_Shape` — NO healing API exists
- `ShapeFix_Solid` — NO healing API exists
- `BRepBuilderAPI_Sewing` — NOT available (confirmed via code comment line 1037)

### Available validation:
- `BRepBuilderAPI_*.IsDone()` — Builder success check (not geometry validity)
- `BRepAlgoAPI_*.IsDone()` — Boolean operation success
- `BRepAlgoAPI_*.HasErrors()` / `HasWarnings()` — NOT USED anywhere in codebase
- Manual tessellation validation in bodyOperations.js (NaN/bounds checks)

## Critical Findings

### Missing Post-Operation Validation
- **NO** BRepCheck after rebuildShapeWithMovedVertices (lines 599-711)
- **NO** BRepCheck after boolean operations (booleanCut, booleanFuse)
- **NO** BRepCheck after filletEdges
- **NO** BRepCheck after chamferEdges
- **NO** BRepCheck after extrudeFaceAndFuse/Cut
- Only validation: `validateTessellation()` in bodyOperations.js checks for NaN/bounds explosion

### Boolean Operations Pattern
- `booleanCut()` / `booleanFuse()` in occtEngine.js: Create operator, extract Shape(), delete operator
- NO checks for `.IsDone()`, `.HasErrors()`, `.HasWarnings()`
- Called from: bodyOperations.js applyBoolean (line 309), applyFaceExtrusion (line 254/256)

### Fillet/Chamfer Pattern
- `filletEdges()` line 228: Creates BRepFilletAPI_MakeFillet, calls Add_2, Build(), extracts Shape()
- NO check for `.IsDone()` after Build()
- `chamferEdges()` line 444: Same pattern, no IsDone() check
- Called from: bodyOperations.js which DOES validate tessellation output

### rebuildShapeWithMovedVertices (The Big Risk)
- Two-phase strategy: shared-edge topology (ideal) → disconnected fallback (broken topology)
- **Shared-edge path** (`_buildWithSharedEdges` line 719):
  - Uses BRepBuilderAPI_MakeVertex_1 (probed at runtime, may not exist)
  - Uses BRepBuilderAPI_MakeEdge_2(v1, v2) (vertex overload, may not exist)
  - Uses BRepBuilderAPI_MakeSolid_3 (shell overload)
  - Checks `.IsDone()` on wire/face/solid builders BUT...
  - Returns **null** on any failure (silent fallback to disconnected)
  - NO validation of final solid shape
- **Disconnected path** (`_buildDisconnectedFaces` line 893):
  - Preserves original faces whose vertices weren't moved
  - Rebuilds moved faces independently (NO shared edges)
  - Uses BRepBuilderAPI_MakeSolid_3
  - NO check if resulting shell is closed/manifold
  - Throws error only if zero faces (line 1025)

### Extrusion Operations
- `extrudeFaceAndFuse` / `extrudeFaceAndCut` (lines 306, 355):
  - Wire extraction, face rebuild, prism, boolean
  - NO validation after any step
  - Called from bodyOperations.js which validates tessellation

## Validation Workaround Pattern

The codebase uses `validateTessellation()` (bodyOperations.js line 21) as a **post-hoc geometry sanity check**:
- Checks for NaN/Infinity in tessellation output
- Checks bounding box growth > 5x vs reference
- This catches CATASTROPHIC failures but NOT:
  - Non-manifold edges
  - Self-intersecting faces
  - Inverted normals
  - Degenerate faces
  - Open shells

## OCCT Constructor Overload Gotchas Observed

- `BRepBuilderAPI_MakeSolid_2` = CompSolid (WRONG for shell→solid)
- `BRepBuilderAPI_MakeSolid_3` = Shell (CORRECT, used in code)
- `BRepBuilderAPI_MakeVertex_1` may not exist in all builds (runtime probe line 723)
- `BRepBuilderAPI_MakeEdge_2(v1, v2)` may not exist (try/catch line 779)

## Known Safe Patterns

- **Fillet/Chamfer in bodyOperations.js**: Uses validateTessellation() after OCCT op
- **Boolean in bodyOperations.js**: Uses validateTessellation() after OCCT op
- **Face extrusion in bodyOperations.js**: Uses validateTessellation() after OCCT op
- All these operations push undo snapshot BEFORE mutation (correct)

## Known Unsafe Patterns

- **rebuildShapeWithMovedVertices**: NO validation, returns shape that may be:
  - Open shell (not a valid solid)
  - Non-manifold edges (1 edge shared by 3+ faces)
  - Self-intersecting after vertex move
- **Edge/vertex/face translation via gizmo**: Uses rebuildShapeWithMovedVertices, same risks
- **Primitive constructors** (makeBox, makeCylinder): Assume success, no validation

## Test Cases Needed (From Session Log)

1. Box → move edge → fillet (test: does fillet work after rebuild?)
2. Box → fillet → move edge (test: does disconnected fallback preserve fillet curves?)
3. Box → move edge → boolean subtract (test: does boolean work with potentially broken topology?)
4. Box → extrude face inward → move edge (test: cut operation + rebuild)

## Validation Strategy Recommendations

Since BRepCheck is unavailable:
1. **Expand validateTessellation()** to check:
   - Edge count consistency (sudden drops = degenerate faces)
   - Vertex count consistency
   - Normal consistency (inverted shells)
2. **Add pre-operation parameter validation**:
   - Fillet radius vs edge length
   - Extrusion depth vs body bounds
3. **Add IsDone() checks** to boolean/fillet operations
4. **Consider ShapeFix** — NOT AVAILABLE, skip
5. **Error messages**: Improve from "Operation failed" to actionable guidance

## Recent Audits

### getAdjacentFaceNormals (2026-02-09)
**Location**: `src/core/occtEngine.js` line 1258
**Purpose**: Find faces adjacent to an edge, compute their normals for fillet/chamfer handle positioning
**Critical issues found**:
1. Memory leak: `tri.Triangle(1)` returns OCCT object, never `.delete()`'d (line 1298)
2. Missing null check: `handleTri` should be validated before `.IsNull()` call (line 1294)
3. Degenerate triangle handling: silently skips, could return < 2 normals for valid edge

**Caller expectations**: `filletMode.js` and `chamferMode.js` assume exactly 2 normals returned (compute bisector via sum). Missing validation if < 2 returned.

### tryFaceExtrudePreview (2026-02-09)
**Location**: `src/tools/faceExtrudeMode.js` lines 37-70
**Critical memory leaks in extrudeFaceAndFuse/extrudeFaceAndCut**:
- Wire objects leak if exceptions thrown during face/prism/boolean creation
- NO try/finally blocks in occtEngine.js extrude functions
- All intermediate OCCT objects (wire, faceMaker, vec, prism, extrudedShape, fuse/cut) leak on error paths
**Missing validation**:
- No IsNull() check on resultShape before tessellation
- No HasErrors() check on boolean operations
- No tessellation output validation (NaN/bounds)
**See**: `face-extrude-audit.md` for detailed analysis and fix recommendations

## File Locations

- Core OCCT: `src/core/occtEngine.js`
- Operation wrappers: `src/tools/bodyOperations.js`
- Interactive modes: `src/tools/gizmoMode.js`, `src/tools/translateSubElementMode.js`, `src/tools/filletMode.js`, `src/tools/chamferMode.js`
- Tessellation: `src/core/occtTessellate.js` (not reviewed yet)
