# OCCT Auditor Memory

## Key Findings from Recent Audits

### Inline Builder Leak Pattern (HIGH RISK) — NEW 2026-02-08
**Pattern:** `new oc.BRepBuilderAPI_MakeSomething(...).ResultMethod()` creates a builder object that is NEVER deleted.

**Common mistake:**
```javascript
const edge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2).Edge();
// ❌ Forgot: builder.delete();
```

**Why it leaks:** The builder object is created, the result is extracted via `.Edge()` or `.Shape()`, but the builder wrapper itself still exists in WASM memory and must be explicitly deleted.

**Found in:**
- `makeRectangleWire()` — lines 125-128 (4 leaks per call)
- `makeCircleWire()` — line 168 (1 leak per call)

**Safe pattern:**
```javascript
const builder = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
const edge = builder.Edge();
builder.delete();  // ✓ Cleanup
```

---

### Wire Reference Leak Pattern (HIGH RISK)
**Pattern:** `oc.TopoDS.Wire_1(explorer.Current())` creates a **new wrapper object** that MUST be deleted.

**Common mistake:**
```javascript
const wire = oc.TopoDS.Wire_1(wireExplorer.Current());
// ... use wire ...
wireExplorer.delete();
// ❌ Forgot: wire.delete();
```

**Why it leaks:** Even though `TopoDS.Wire_1()` is a downcast that references existing geometry, opencascade.js creates a **new Emscripten binding wrapper** that requires explicit cleanup.

**Found in:**
- `extrudeFaceAndFuse()` — line 312 (FIXED in audit 2026-02-07)
- `extrudeFaceAndCut()` — line 360 (FIXED in audit 2026-02-07)

**Fix:** Always delete downcast results: `wire.delete()`, `edge.delete()`, `face.delete()`, etc.

---

### Geometry Object Cleanup (gp_* classes)
**Pattern:** Primitive geometry objects (`gp_Pnt`, `gp_Dir`, `gp_Vec`, `gp_Ax2`, `gp_Circ`, `gp_Trsf`) MUST be deleted.

**Leak found:**
- `makeCircleWire()` line 167: `gp_Circ_2` object never deleted (FIXED in audit 2026-02-07)

**Best practice:** Track all `new oc.gp_*` calls and ensure matching `.delete()` in cleanup section.

---

### Message_ProgressRange Inline Construction
**Pattern:** Objects passed inline to OCCT methods may leak if ownership is unclear.

**Suspicious code in `tessellateShape()`:**
```javascript
mesher.Perform_1(new oc.Message_ProgressRange_1());
```

**Question:** Does `Perform_1()` take ownership? If not, this leaks once per tessellation.

**Safe pattern:**
```javascript
const progress = new oc.Message_ProgressRange_1();
mesher.Perform_1(progress);
progress.delete();
```

---

### Chamfer API Workaround (CORRECT)
**Pattern:** This OCCT.js build only exposes `Add(edge)` base class method, not the overloaded `Add(distance, edge, face)`.

**Workaround in `chamferEdges()` lines 440-450:**
```javascript
const faces = [];
for (const edge of edges) {
    const face = findAdjacentFace(shape, edge);
    chamfer.Add(edge);               // Base class method
    const ic = chamfer.NbContours(); // Get contour index
    chamfer.SetDist(distance, ic, face);  // Set distance via index + face ref
    faces.push(face);  // Track for cleanup
}
// ...
faces.forEach(f => f.delete());  // Cleanup
```

**Why it's correct:** This is the documented pattern when `Add(distance, edge, face)` overload unavailable. The `findAdjacentFace()` helper correctly returns face wrappers that the caller manages.

---

## Good Patterns Observed

### Try-Finally for Conditional Cleanup
`occtTessellate.js` lines 161-180:
```javascript
let adaptor = null;
try {
    adaptor = new oc.BRepAdaptor_Curve_2(edge);
    // ... use adaptor ...
} catch (e) {
    // Handle error
} finally {
    if (adaptor) adaptor.delete();
}
```

**Why it's good:** Ensures cleanup even on early exit or exception. Use this pattern when OCCT object creation might fail or code has multiple exit paths.

### Cleanup Section Pattern
All `occtEngine.js` functions follow this structure:
```javascript
export function makeSomething(...) {
    const oc = getOC();

    // Create OCCT objects
    const obj1 = new oc.SomeClass_N(...);
    const obj2 = new oc.AnotherClass_N(...);
    const result = obj2.Shape();

    // Clean up intermediates
    obj1.delete();
    obj2.delete();

    return result;
}
```

**Why it's good:** Clear separation of "creation" and "cleanup" makes it easy to audit. Missing `.delete()` calls are visually obvious.

### Gold Standard: translateShape() (NEW - 2026-02-08)
**Perfect example of OCCT cleanup:**
```javascript
export function translateShape(shape, dx, dy, dz) {
    const oc = getOC();
    const vec = new oc.gp_Vec_4(dx, dy, dz);
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(vec);
    const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
    const result = transformer.Shape();
    vec.delete();      // ✓ gp_Vec deleted
    trsf.delete();     // ✓ gp_Trsf deleted
    transformer.delete(); // ✓ Builder deleted
    return result;
}
```
**Why it's exemplary:** All three intermediate OCCT objects (gp_Vec, gp_Trsf, builder) properly cleaned up. No inline construction. Clear variable names. Reference this pattern.

---

## OCCT API Patterns in This Codebase

### Boolean Operations (Verified Correct)
- `BRepAlgoAPI_Cut_3(base, tool)` — correct overload, returns new shape
- `BRepAlgoAPI_Fuse_3(shapeA, shapeB)` — correct overload, returns new shape
- Pattern: algo object must be deleted, result shape is caller's responsibility

### Shape Builders (Verified Correct)
- `BRepPrimAPI_MakeBox_3(origin, width, height, depth)`
- `BRepPrimAPI_MakeCylinder_3(axis, radius, height)`
- `BRepBuilderAPI_MakeFace_15(wire, planar)`
- `BRepPrimAPI_MakePrism_1(face, vec, copy, canonize)`
- `BRepBuilderAPI_Transform_2(shape, trsf, copy)` — NEW (Move Body feature)
- Pattern: builder `.delete()` required, `.Shape()` result is returned

### Transformation API (NEW - 2026-02-08)
- `gp_Trsf_1()` — default constructor (identity transform)
- `trsf.SetTranslation_1(vec)` — set translation from vector
- `BRepBuilderAPI_Transform_2(shape, trsf, true)` — third param `true` = copy mode (creates new shape, leaves original intact)
- Pattern: `gp_Vec`, `gp_Trsf`, and builder all need cleanup

### Explorers (Verified Correct)
- `TopExp_Explorer_2(shape, type, avoid)` — always deleted in this codebase
- Pattern: `while (explorer.More()) { ... explorer.Next(); } explorer.delete();`
- Downcast results from `.Current()` need cleanup: `oc.TopoDS.Face_1()`, `.Edge_1()`, `.Wire_1()`, `.Vertex_1()`

### Triangulation (Verified Correct Except Message_ProgressRange)
- 1-based indexing correctly converted to 0-based
- `TopLoc_Location` always deleted
- `BRep_Tool.Triangulation()` returns handle — no cleanup needed for handle itself, but location must be deleted

---

## Common Gotchas

1. **Downcast wrappers need cleanup:** `TopoDS.Wire_1()`, `TopoDS.Edge_1()`, etc. are NOT just casts — they create new wrapper objects.

2. **Handle vs Object:** Handles (e.g., from `BRep_Tool.Triangulation()`) do NOT need `.delete()` on the handle itself, but objects created from `.get()` follow normal rules.

3. **Inline object creation:** Avoid `someFn(new oc.Thing())` unless you're certain ownership transfers. Prefer explicit variable + cleanup.

4. **Inline builder chaining:** `new oc.BRepBuilderAPI_MakeEdge_3(p1, p2).Edge()` leaks the builder. Always store builder, extract result, delete builder.

5. **Early returns in error paths:** Use try-finally or track cleanup flags to avoid leaks on early exit.

---

## Audit Metrics

**Latest audit:** 2026-02-08 (Vertex/Edge Translation feature)
**Scope:** `occtEngine.js` (getVertexPositions, getEdgeEndpoints, getVertexPosition, rebuildShapeWithMovedVertices), `bodyOperations.js` (applyTranslateSubElement), `translateSubElementMode.js`
**Issues found in NEW code:**
  - 0 critical leaks in new functions (excellent!)
  - 1 warning: unclear ownership in applyTranslateSubElement (line 342) — missing `newShape.delete()` after storeShape(), but may be intentional
**Issues found in PRE-EXISTING code:** Same 2 critical leaks (inline builders in makeRectangleWire + makeCircleWire)
**Code quality (new feature):** Excellent. `rebuildShapeWithMovedVertices()` has exemplary cleanup with try-catch around .delete() calls. New API query functions (`getEdgeEndpoints`, `getVertexPosition`) demonstrate correct wrapper cleanup patterns.

**Previous audit:** 2026-02-08 (Move Body feature)
**Scope:** `occtEngine.js` (translateShape), `bodyOperations.js` (applyMoveBody), `moveBodyMode.js`
**Issues found in NEW code:** 0 critical, 0 warnings
**Issues found in PRE-EXISTING code:** 2 critical leaks (inline builders in makeRectangleWire + makeCircleWire)
**Code quality (new feature):** Excellent. translateShape demonstrates gold-standard OCCT cleanup.

**Previous audit:** 2026-02-07 (chamfer code)
**Scope:** `occtEngine.js` (chamferEdges + findAdjacentFace), `bodyOperations.js` (applyChamfer), `chamferMode.js`
**Issues found:** 0 critical, 0 warnings — all patterns verified correct
**Code quality:** Excellent. Chamfer implementation demonstrates team learned from previous wire leak issue.

**Initial audit:** 2026-02-07
**Scope:** `occtEngine.js`, `extrudeTool.js`, `main.js`, `occtTessellate.js`
**Issues found:** 3 critical leaks (wire refs + gp_Circ), 1 warning (Message_ProgressRange)
**Code quality:** Cleanup patterns generally excellent; leaks were isolated oversights, not systemic issues.

---

## Priority Leak Fixes Needed

**HIGH PRIORITY:**
1. `makeRectangleWire()` lines 125-128 — 4 builder leaks per call (PRE-EXISTING)
2. `makeCircleWire()` line 168 — 1 builder leak per call (PRE-EXISTING)

**Both functions called frequently:** Every face extrusion that uses sketches (rectangle/circle on face) leaks 4-5 builder objects.

**MEDIUM PRIORITY:**
3. `storeShape()` ownership semantics — document whether it takes ownership or not. If NOT, add `.delete()` calls after `storeShape()` in:
   - `bodyOperations.js` lines 51, 117, 183, 239, 342, 392
   - If it DOES take ownership, remove `.delete()` from `translateSubElementMode.js` line 166
4. `tessellateShape()` — Message_ProgressRange inline construction (needs verification if ownership transfers)

---

## Codebase Trend Analysis

**Positive trend:** Each new feature (fillet → chamfer → boolean → move → vertex/edge translation) shows improving OCCT cleanup patterns. The latest `rebuildShapeWithMovedVertices()` function demonstrates defensive programming with try-catch around `.delete()` calls.

**Pre-existing technical debt:** The inline builder leaks in `makeRectangleWire()` and `makeCircleWire()` have been present since POC 4 (sketch-on-face). These are not regression — they're isolated oversights in early OCCT integration code.

**New finding:** Ownership semantics of `storeShape()` are unclear and inconsistent across the codebase. This needs documentation and possibly a refactor to make ownership explicit.

**Recommendation:**
1. Fix the two builder leaks in the next cleanup pass.
2. Document `storeShape()` ownership contract and ensure consistency.
3. Reference `translateShape()` and `rebuildShapeWithMovedVertices()` as gold standard patterns for new OCCT functions.
