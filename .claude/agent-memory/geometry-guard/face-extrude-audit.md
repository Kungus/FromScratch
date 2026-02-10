# Face Extrude Mode Audit (2026-02-09)

## tryFaceExtrudePreview Function Audit

**Location**: `src/tools/faceExtrudeMode.js` lines 37-70

### Memory Leaks Found

#### CRITICAL: Wire object never deleted
- Line 394 in `extrudeFaceAndFuse`: `const wire = oc.TopoDS.Wire_1(wireExplorer.Current());`
- Line 463 in `extrudeFaceAndCut`: `const wire = oc.TopoDS.Wire_1(wireExplorer.Current());`
- `TopoDS.Wire_1()` returns a NEW OCCT object (not a handle to the original)
- Both functions delete `wire` at the end (lines 430, 499)
- BUT: if exception thrown at lines 398/401 or 467/470, `wire` leaks
- Wire leak also possible if prism fails (lines 407-414, 476-483)

#### Pattern Analysis
Both `extrudeFaceAndFuse` and `extrudeFaceAndCut` have identical structure:
1. Extract wire from face
2. Create faceMaker from wire
3. Check IsDone on faceMaker — THROWS on failure
4. Create prism from face
5. Check IsDone on prism — THROWS on failure
6. Create boolean operation
7. Check IsDone on boolean — THROWS on failure
8. Cleanup ALL objects

**Problem**: Steps 2-7 throw exceptions, but cleanup (step 8) is NOT in a finally block.

### Memory Safety Issues in tryFaceExtrudePreview

Line 58: `resultShape.delete();` — GOOD: preview shape deleted
Line 68: `face.delete();` — in finally block — GOOD

BUT: if `extrudeFaceAndFuse` or `extrudeFaceAndCut` throw an exception:
- The `face` object passed to them is NOT deleted within those functions
- The `tryFaceExtrudePreview` finally block correctly deletes `face` (line 68)
- So the face is safe

**However**: The wire/faceMaker/independentFace/vec/prism/extrudedShape/fuse objects inside `extrudeFaceAndFuse`/`extrudeFaceAndCut` LEAK if exceptions occur mid-function.

### Missing Validation Checks

1. **No IsNull() check on resultShape** (line 54-56)
   - `extrudeFaceAndFuse` / `extrudeFaceAndCut` return `fuse.Shape()` / `cut.Shape()`
   - Should check `resultShape.IsNull()` before calling `tessellateShape()`

2. **No IsDone/HasErrors checks on boolean operations** in occtEngine.js
   - Line 417: `const fuse = new oc.BRepAlgoAPI_Fuse_3(shape, extrudedShape);`
   - Line 418: `if (!fuse.IsDone())` — GOOD
   - BUT: No check for `fuse.HasErrors()` or `fuse.HasWarnings()`
   - Same for Cut operation (line 486-487)

3. **No validation of tessellation output**
   - `tessellateShape()` could return degenerate geometry
   - No NaN/bounds checks (unlike bodyOperations.js which has `validateTessellation()`)

### Error Handling

**Good patterns**:
- Line 65-66: Catch exceptions, log message, continue (no crash)
- Line 68: Finally block ensures `face` cleanup

**Missing patterns**:
- No validation of tessellation output (no NaN/bounds check)
- Silent failure on tessellation errors (caught by try/catch but no user feedback)

### endFaceExtrudeMode Cleanup

**Lines 232-246** — EXCELLENT:
- ✅ `clearTimeout(faceExtrudeMode.debounceTimer)` — timer cleanup
- ✅ `showBodyMesh(faceExtrudeMode.bodyId)` — restores hidden mesh
- ✅ `clearBodyPreview()` — removes preview geometry
- ✅ `hideDimensions()` / `hideInput()` — UI cleanup
- ✅ `faceExtrudeMode.cleanup()` — event listener removal
- ✅ Nulls out `debounceTimer` after clearing it

## Comparison with filletMode.js

### filletMode.tryFilletPreview (lines 46-77)

**Same pattern**:
- Get edges via `getEdgeByIndex`
- Call OCCT operation (`filletEdges`)
- Tessellate result
- Delete result shape
- Finally block deletes input edges

**Better pattern**:
- Lines 53-58: Collects edges into array, THEN checks if empty (early return)
- Line 75: `edges.forEach(e => e.delete());` in finally — ALL edges cleaned up

**Same issues**:
- No IsNull check on filletedShape
- No validation of tessellation output

### filletMode.endFilletMode (lines 247-263)

**Similar cleanup**:
- Clears debounce timer
- Shows body mesh
- Clears preview
- Hides UI elements
- Calls cleanup function

**One difference**:
- Line 253: `hideFilletHandle()` — fillet mode has a visual handle, face extrude doesn't

## Recommendations

### HIGH PRIORITY: Fix Memory Leaks in occtEngine.js

`extrudeFaceAndFuse` and `extrudeFaceAndCut` need try/finally blocks:

```javascript
export function extrudeFaceAndFuse(shape, face, direction) {
    const oc = getOC();
    const wireExplorer = new oc.TopExp_Explorer_2(...);

    if (!wireExplorer.More()) {
        wireExplorer.delete();
        throw new Error('Face has no wire boundary');
    }

    const wire = oc.TopoDS.Wire_1(wireExplorer.Current());
    wireExplorer.delete();

    let faceMaker = null;
    let independentFace = null;
    let vec = null;
    let prism = null;
    let extrudedShape = null;
    let fuse = null;

    try {
        faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
        if (!faceMaker.IsDone()) {
            throw new Error('Failed to rebuild face from wire');
        }
        independentFace = faceMaker.Shape();

        vec = new oc.gp_Vec_4(direction.x, direction.y, direction.z);
        prism = new oc.BRepPrimAPI_MakePrism_1(independentFace, vec, false, true);
        if (!prism.IsDone()) {
            throw new Error('Face extrusion prism failed');
        }
        extrudedShape = prism.Shape();

        fuse = new oc.BRepAlgoAPI_Fuse_3(shape, extrudedShape);
        if (!fuse.IsDone()) {
            throw new Error('Boolean fuse failed during face extrusion');
        }

        const result = fuse.Shape();
        return result;
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
```

### MEDIUM PRIORITY: Add Validation

1. In `tryFaceExtrudePreview`:
   - Check `resultShape.IsNull()` before tessellation
   - Validate tessellation output (NaN/bounds check)

2. In `extrudeFaceAndFuse` / `extrudeFaceAndCut`:
   - Check `fuse.HasErrors()` / `cut.HasErrors()` after IsDone
   - Check `result.IsNull()` before returning

### LOW PRIORITY: Consistency

- Add `validateTessellation()` check to preview path (same as bodyOperations.js)
- Consider surfacing tessellation errors to user (currently silent)
