# Gizmo Feature OCCT Audit — 2026-02-08

## Files Audited
- `src/core/occtEngine.js` — `getFaceVertexPositions()` function (lines 814-849)
- `src/tools/bodyOperations.js` — `applyTranslateFace()` function (lines 425-477)
- `src/tools/gizmoMode.js` — `tryRebuildPreview()` function (lines 85-129)

## Executive Summary
**✅ CLEAN AUDIT** — All OCCT objects properly managed. No memory leaks detected.

The gizmo feature code demonstrates excellent OCCT memory hygiene:
- All explorers properly deleted
- All downcast wrappers cleaned up
- Preview shapes deleted after tessellation
- Proper try/catch cleanup patterns

## Detailed Findings

### `getFaceVertexPositions()` — occtEngine.js:814-849
**Status: ✅ CORRECT**

Objects created:
1. `TopExp_Explorer_2` (line 823) — ✅ deleted at line 845
2. `TopoDS.Vertex_1()` downcast (line 830) — ✅ deleted at line 842
3. `BRep_Tool.Pnt()` result (line 831) — ✅ deleted at line 841
4. `getFaceByIndex()` result (line 816) — ✅ deleted at line 846

**Pattern observed:** Clean loop with per-iteration cleanup (pnt, vertex) + post-loop cleanup (explorer, face).

### `applyTranslateFace()` — bodyOperations.js:425-477
**Status: ✅ CORRECT**

OCCT calls:
- `getShape()` — borrows from shape store (caller does NOT delete)
- `getFaceVertexPositions()` — returns plain JS objects (no OCCT wrappers to clean)
- `rebuildShapeWithMovedVertices()` — returns new shape (ownership transferred to caller)
- `tessellateShape()` — takes shape, returns plain data (no cleanup needed)
- `storeShape()` — takes ownership of newShape (ref counted in store)
- `removeShape()` — decrements ref count on old shape

**Ownership flow:**
1. `rebuildShapeWithMovedVertices()` creates new shape → caller owns it (line 452)
2. `storeShape(newShape)` → store takes ownership (line 456)
3. `removeShape(oldShapeRef)` → decrements ref count on replaced shape (line 463)

**Result:** All OCCT objects properly transferred through the ownership chain.

### `tryRebuildPreview()` — gizmoMode.js:85-129
**Status: ✅ CORRECT — Critical Pattern**

```javascript
const newShape = rebuildShapeWithMovedVertices(shape, vertexMoves);
const tessellation = tessellateShape(newShape);
newShape.delete();  // ✅ Line 122 — PREVIEW SHAPE DELETED
```

**Why this matters:** Preview shapes are temporary and must be explicitly deleted. The code correctly:
1. Creates preview shape (line 120)
2. Tessellates it into plain JS data (line 121)
3. **Deletes the preview shape** (line 122) ← prevents leak on every mouse move

**Pattern:** This is the **gold standard for preview cleanup** — create OCCT shape, extract data, delete shape.

### `rebuildShapeWithMovedVertices()` — occtEngine.js:598-806
**Status: ✅ CORRECT**

Comprehensive cleanup verified:
- `edgeExplorer` — deleted at line 646
- `BRepAdaptor_Curve_2` — deleted in try/catch at lines 631, 636, 638
- `faceExplorer` — deleted at line 744
- `wireExplorer` — deleted at line 676, 720
- `BRepTools_WireExplorer_2` — deleted at line 720
- `gp_Pnt_3` objects — deleted at lines 711-712
- `BRep_Tool.Pnt()` results — deleted at lines 713-714
- `TopExp` vertex results — deleted at lines 715-716
- Builder objects — tracked in `intermediates[]` array, deleted at line 802
- `newWireBuilder` — pushed to intermediates at line 681, deleted at line 802
- Edge/wire/face objects — deleted after use or tracked in `newFaces[]`, deleted at line 801
- `shellExplorer` — deleted at line 778
- `shell` downcast — deleted at line 776
- `solidMaker` — deleted at line 775
- `sewing` — deleted at line 803
- `sewedShape` — conditionally deleted at line 787 (if replaced by solid)
- `analyzer` — deleted at line 793

**Cleanup strategy:** Deferred cleanup via `intermediates[]` and `newFaces[]` arrays, with try/catch wrappers to handle partial failures.

## Index Correctness
No 1-based indexing issues found. The code uses:
- `getFaceByIndex()` / `getEdgeByIndex()` / `getVertexPosition()` — these handle OCCT traversal internally
- Topology indices from tessellation maps (already 0-based from tessellator)

## API Usage
All constructor and method overloads correct:
- `TopExp_Explorer_2` ✓
- `TopoDS.Vertex_1`, `TopoDS.Face_1`, `TopoDS.Edge_1`, `TopoDS.Wire_1`, `TopoDS.Shell_1` ✓
- `BRepTools_WireExplorer_2` ✓
- `gp_Pnt_3` ✓
- `BRepBuilderAPI_MakeEdge_3`, `BRepBuilderAPI_MakeWire_1`, `BRepBuilderAPI_MakeFace_15`, `BRepBuilderAPI_MakeSolid_2` ✓
- `BRepBuilderAPI_Sewing_1` ✓
- `BRepCheck_Analyzer_1` ✓

## Summary

| Category | Count |
|----------|-------|
| Critical Issues | 0 |
| Warnings | 0 |
| Good Patterns | 3 |

### Good Patterns Found

1. **Preview Shape Cleanup** (gizmoMode.js:120-122)
   ```javascript
   const newShape = rebuildShapeWithMovedVertices(shape, vertexMoves);
   const tessellation = tessellateShape(newShape);
   newShape.delete();  // ✅ Temporary preview shape deleted
   ```
   **Gold standard:** Extract data from OCCT, then immediately delete the OCCT object.

2. **Deferred Cleanup Arrays** (occtEngine.js:656, 801-802)
   ```javascript
   const intermediates = []; // track builders for cleanup
   // ... later
   intermediates.forEach(o => { try { o.delete(); } catch (_) {} });
   ```
   **Robust:** Collects objects during complex construction, cleans up at end even on error paths.

3. **Per-Iteration Loop Cleanup** (occtEngine.js:829-843)
   ```javascript
   while (explorer.More()) {
       const vertex = oc.TopoDS.Vertex_1(explorer.Current());
       const pnt = oc.BRep_Tool.Pnt(vertex);
       // ... use pnt, vertex ...
       pnt.delete();     // ✅ cleanup before next iteration
       vertex.delete();  // ✅
       explorer.Next();
   }
   explorer.delete();    // ✅ cleanup after loop
   ```
   **Prevents accumulation:** Objects cleaned up every iteration, not held until loop end.

## Recommendation
**No action required.** The gizmo feature code is production-ready from an OCCT memory management perspective.

Continue using these patterns as reference for future OCCT code.
