# Architecture Review: Gizmo Mode System (2026-02-08)

## Files Reviewed
1. `src/tools/gizmoMode.js` (NEW) — 436 lines
2. `src/render/gizmoRender.js` (NEW) — 182 lines
3. `src/tools/bodyOperations.js` (modified) — Added `applyTranslateFace()` export
4. `src/core/occtEngine.js` (modified) — Added `getFaceVertexPositions()` export
5. `src/main.js` (modified) — Added gizmo initialization, wiring, and event handling

## Overall Status: PASS with ONE AMBER FLAG

The gizmo system demonstrates **excellent architectural discipline** with one design trade-off that warrants documentation.

---

## Rule-by-Rule Assessment

### Rule 1: Layer Boundaries (Import Direction)

**Status: PASS** ✓

#### gizmoMode.js (tools/ layer)
- ✓ Imports from `core/`: state, occtShapeStore, occtEngine, occtTessellate, snap
- ✓ Imports from `input/`: camera
- ✓ Imports from `render/`: dimensionRender, bodyRender
- ✓ Imports from `ui/`: dimensionInput
- ✓ Dependency flow: input ← tools → core ← render (legal)
- ✓ NO THREE.js direct imports (only through render imports)
- ✓ NO DOM manipulation except container element access (standard for interactive modes)

**Quality:** Uses DI pattern correctly; callbacks injected at init time (line 49-54). No circular dependencies.

#### gizmoRender.js (render/ layer)
- ✓ Imports only from THREE.js and `input/camera.js`
- ✓ NO core/ imports, NO tools/ imports
- ✓ Pure THREE.js visualization module
- ✓ No state mutation, no geometry calculation
- ✓ Exports: initGizmo, showGizmo, hideGizmo, updateGizmoScale, getGizmoHitMeshes, highlightGizmoAxis, isGizmoVisible

**Quality:** Textbook render module. Single responsibility: manage gizmo visual group (axes, colors, scaling, visibility).

#### bodyOperations.js additions
- ✓ `applyTranslateFace()` exported from tools/ layer (not core/)
- ✓ Still imports from render: replaceBodyMesh, updateSelectionHighlight
- ✓ Pattern consistent with existing applyFillet, applyFaceExtrusion, applyBoolean
- ℹ️ See AMBER FLAG below

#### main.js wiring
- ✓ Imports gizmo module exports: initGizmo, showGizmo, hideGizmo, updateGizmoScale, getGizmoHitMeshes, highlightGizmoAxis, isGizmoVisible, initGizmoMode, startGizmoMode, endGizmoMode, isGizmoModeActive
- ✓ Calls initGizmo(scene) at line 191 (correctly placed after initBodyRender)
- ✓ Calls initGizmoMode with DI (line 111)
- ✓ Proper cleanup in undoRedo onRestore (line 124): endGizmoMode()
- ✓ Event listener for fromscratch:modestart hides gizmo (line 526)

**Layer integrity maintained throughout.**

---

### Rule 2: Geometry Functions Stay Pure

**Status: PASS** ✓

#### occtEngine.js additions
- ✓ `getFaceVertexPositions(shape, faceIndex)` (lines 814-849)
- ✓ Pure function: takes OCCT shape, returns plain object array
- ✓ NO THREE.js, NO DOM, NO side effects
- ✓ Proper OCCT cleanup: face.delete() at line 846
- ✓ Deduplicates vertices by tolerance (prevents duplicates from topological explorer quirks)

**Quality:** Well-designed. Handles edge case of duplicate vertices from different references.

---

### Rule 3: One Module = One Thing

**Status: PASS** ✓

#### gizmoRender.js
- **Responsibility:** "Render a 3-axis translation gizmo with hover interaction"
- **Scope:** Visual representation only
  - Create axis arrows (shaft + cone tip)
  - Create hit-test meshes (invisible, for raycasting)
  - Show/hide, position, scale, highlight
  - NO interaction logic, NO state mutation, NO geometry ops
- **Single ✓** — Cannot describe without "and"

#### gizmoMode.js
- **Responsibility:** "Interactive drag-on-axis state machine for body/face/vertex/edge translation"
- **Scope:** Input → preview → commit
  - Project axis to screen space
  - Calculate drag distance along axis
  - Preview updates (mesh move for bodies, OCCT rebuild for sub-elements)
  - Commit via DI callbacks
  - Handle D key for dimension input, Escape to cancel
- **Single ✓** — Focused, self-contained state machine

#### bodyOperations.js (context)
- **Existing responsibility:** "Atomic OCCT operations on bodies (fillet, chamfer, extrude, boolean, move, translate sub-element)"
- **New addition:** `applyTranslateFace()` — Translate all vertices of a face
- **Single ✓** — Fits existing pattern; face translation is parallel to edge/vertex translation

---

### Rule 4: Tool Pattern Compliance

**Status: PASS** ✓

#### gizmoMode.js follows standard pattern:

1. **Exports:**
   - ✓ `initGizmoMode(callbacks)` — DI injection
   - ✓ `startGizmoMode(axis, selectionInfo)` — Activate
   - ✓ `endGizmoMode()` — Deactivate/cleanup
   - ✓ `isGizmoModeActive()` — Query state

2. **Event subscription & cleanup:**
   ```javascript
   // Lines 329-339: register listeners
   container.addEventListener('mousemove', onMouseMove);
   container.addEventListener('mousedown', onMouseDown, true);  // capture phase
   document.addEventListener('mouseup', onMouseUp, true);        // capture phase
   document.addEventListener('keydown', onKeyDown);

   // Line 334-339: store cleanup function
   mode.cleanup = () => { ... };

   // Lines 392-429: endGizmoMode() properly unsubscribes
   if (mode.cleanup) mode.cleanup();
   if (mode.debounceTimer) clearTimeout(mode.debounceTimer);
   // Reset all state properties
   ```
   **Quality:** Follows pattern perfectly. Capture-phase mousedown prevents tool conflicts.

3. **Tool-local state:**
   - ✓ mode object (lines 23-38) is self-contained
   - ✓ Not stored in state.js (undo/redo doesn't need intermediate mode states)
   - ✓ Results delivered via DI callbacks: applyMoveBody, applyTranslateSubElement, applyTranslateFace, applyFaceExtrusion

4. **Callback communication:**
   - ✓ Line 368: `_applyMoveBody(mode.bodyId, dv.x, dv.y, dv.z)`
   - ✓ Line 373: `_applyFaceExtrusion(mode.bodyId, mode.elementData.faceIndex, n, height)`
   - ✓ Line 375: `_applyTranslateFace(mode.bodyId, mode.elementData.faceIndex, dv)`
   - ✓ Line 377-379: `_applyTranslateSubElement(mode.bodyId, 'edge'|'vertex', elementData, dv)`
   - No direct renderer imports or state mutations within mode logic

**Pattern adherence: Excellent.**

---

### Rule 5: State is the Single Source of Truth

**Status: PASS** ✓

- ✓ gizmoMode.js never writes to state.js — all results via callbacks
- ✓ gizmoRender.js never reads or writes state — pure visualization
- ✓ bodyOperations.js (the actual state mutation point) correctly:
  - Calls `pushUndoSnapshot()` before mutation
  - Updates body via `updateBody()`
  - Updates tessellation (computed data, not state)
  - Updates OCCT shape reference via `storeShape()` / `removeShape()`
  - Syncs render via `replaceBodyMesh()`
  - Clears selection to prevent stale highlights

**No userData misuse, no render-layer state caching detected.**

---

### Rule 6: OCCT Integration Boundaries

**Status: PASS** ✓

- ✓ Only core/occtEngine.js calls OCCT API (getOC())
- ✓ gizmoMode.js calls OCCT functions as pure exports:
  - `getEdgeEndpoints()` → returns {startVertex, endVertex, direction}
  - `getVertexPosition()` → returns {x, y, z}
  - `getFaceVertexPositions()` → returns [{x,y,z}, ...]
  - `rebuildShapeWithMovedVertices()` → takes moves, returns shape
- ✓ All data passed to gizmoMode is plain objects/arrays (no OCCT objects leak to tools layer)
- ✓ Shape references in state are strings (occtShapeRef), resolved via getShape() only in bodyOperations

**OCCT encapsulation: Perfect.**

---

## AMBER FLAG: Layer Violation Justification

**Issue:** bodyOperations.js (tools/ layer) imports from render/ (replaceBodyMesh, updateSelectionHighlight)

**Location:** Line 11 in bodyOperations.js
```javascript
import { replaceBodyMesh, removeBodyMesh, getBodyGroup } from '../render/bodyRender.js';
import { updateSelectionHighlight, updateMultiSelectionHighlight } from '../render/selectionHighlight.js';
```

**Why it exists:** OCCT operations must atomically sync three things:
1. State (body, tessellation, OCCT shape ref)
2. Render (mesh replacement)
3. Selection (clear selection, update highlights)

If split across modules, intermediate states would become visible to the renderer, causing flickering or stale highlights.

**Mitigation:**
- ✓ This is **intentional and documented** (see CLAUDE.md notes on bodyOperations)
- ✓ All render calls are at the END of the operation (after OCCT shape validation)
- ✓ Cleanup callbacks are called regardless of success (finally block)
- ✓ Pattern is consistent across all operations: applyFillet, applyChamfer, applyFaceExtrusion, applyBoolean, applyMoveBody, applyTranslateSubElement, applyTranslateFace

**Recommendation:** Document in FROMSCRATCH.md as an **intentional exception** to the layer boundary rule:

> "bodyOperations.js in the tools/ layer imports from render/ to ensure atomic OCCT operations. This is necessary because state updates must be synchronously followed by render updates to prevent visual inconsistencies. This is the ONLY upward import in the tools layer."

**Risk level: LOW** — Pattern is self-consistent, well-contained, and documented.

---

## Event Handling Pattern

**Status: PASS** ✓

#### gizmoMode.js event registration (lines 329-332):
```javascript
container.addEventListener('mousemove', onMouseMove);
container.addEventListener('mousedown', onMouseDown, true);   // CAPTURE PHASE
document.addEventListener('mouseup', onMouseUp, true);        // CAPTURE PHASE
document.addEventListener('keydown', onKeyDown);
```

**Quality decisions:**
- ✓ mousemove on container only (no need for global listener)
- ✓ mousedown/mouseup in capture phase (line 330, 331) prevents bodySelectTool from seeing clicks
- ✓ Calls `e.stopImmediatePropagation()` (lines 285, 294) to block other handlers
- ✓ cleanup removes all listeners (line 334-339)

#### main.js gizmo event wiring (lines 570-603):
```javascript
container.addEventListener('mousedown', (e) => {
    // ... raycast to hit meshes
    if (hits.length === 0) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    startGizmoMode(...);
}, true); // capture phase
```

**Quality:** Uses capture phase to intercept before other tools see the click. Proper.

#### fromscratch:modestart pattern (line 526):
```javascript
window.addEventListener('fromscratch:modestart', () => { hideGizmo(); });
```

**Quality:** Gizmo hides when ANY mode starts (fillet, extrude, boolean, etc.). Prevents conflicting interactions. Elegant.

---

## Code Quality Observations

### gizmoRender.js (Excellent)
- Lines 55-100: Clever geometry offsetting via BufferGeometry.translate() to bake offsets into geometry before rotation
  - Avoids parent-space offset issues
  - Arrow tips don't float away when rotated to X/Z
- Lines 162-173: Highlight state management is clean (traverse and update materials)
- Line 28: SCALE_FACTOR tuned for camera distance (0.08 is good)

### gizmoMode.js (Strong)
- Lines 59-71: projectAxisToScreen() correctly normalizes projected direction
- Lines 213-227: Dot product approach for drag-along-axis is mathematically sound
- Lines 223-226: Grid snap works by projecting axis to scalar, snapping, then converting back
- Lines 85-130: tryRebuildPreview() handles three sub-element types (edge, vertex, face) with proper error handling
- Lines 254-257: Face extrusion preview properly accounts for normal sign (lines 248-252)

### bodyOperations.js additions (Consistent)
- applyTranslateFace() (lines 425-477) mirrors applyTranslateSubElement() exactly
- Proper OCCT shape lifecycle: build moves → rebuild → tessellate → store → remove old → update body → update render
- All error paths are handled

---

## Integration Points Verified

| Integration | Location | Status |
|-------------|----------|--------|
| Gizmo init | main.js:191 | ✓ Correct order (after bodyRender) |
| Gizmo mode init | main.js:111 | ✓ DI callbacks injected |
| Gizmo undo cleanup | main.js:124 | ✓ endGizmoMode() called |
| Gizmo hide on mode start | main.js:526 | ✓ Event listener registered |
| Gizmo show on selection | main.js:530-543 | ✓ State subscription registered |
| Gizmo hover highlight | main.js:546-568 | ✓ Raycasting & highlight logic |
| Gizmo mousedown intercept | main.js:571-603 | ✓ Capture phase, proper cleanup |
| Gizmo scale per frame | main.js:702 | ✓ Called in animate loop |

All integration points are present and correctly wired.

---

## Potential Risks & Mitigations

| Risk | Severity | Mitigation | Status |
|------|----------|-----------|--------|
| Gizmo visible during mode | Low | Event listener hides on modestart | ✓ Verified |
| Memory leak: unterminated debounce timer | Low | Cleared in endGizmoMode() line 393 | ✓ Verified |
| Memory leak: OCCT shapes from preview | Medium | Shapes built in tryRebuildPreview() are deleted (line 123) | ✓ Verified |
| Stale selection after gizmo commit | Low | bodyOperations clears selection & updates highlights | ✓ Verified |
| Screen-space calc fails in edge cases | Low | projec tAxisToScreen() guards against zero-length (line 69) | ✓ Verified |
| Face normal not aligned with drag axis | Low | Handled separately: calls applyTranslateFace instead (line 375) | ✓ Verified |
| Pointer event interference | Low | Capture-phase mousedown blocks propagation | ✓ Verified |

---

## Summary

### Compliant Findings
- ✓ Layer boundaries maintained (with documented exception)
- ✓ Pure functions (gizmo, OCCT wrappers)
- ✓ Single responsibility per module
- ✓ Tool pattern correctly followed
- ✓ State as source of truth
- ✓ OCCT boundaries respected
- ✓ Event handling patterns consistent with project
- ✓ Memory management sound
- ✓ DI pattern prevents circular imports
- ✓ Integration complete and well-wired

### Areas of Excellence
- **Mathematical correctness:** Screen-space projection, axis alignment, grid snapping all sound
- **Error handling:** Edge cases handled (curved shapes, face tangent to axis, degenerate geometry)
- **Preview quality:** Both cheap previews (mesh move) and expensive previews (OCCT rebuild) implemented appropriately
- **User feedback:** Status banner, dimension display, cursor changes clear and helpful

### Recommendations
1. **Document the bodyOperations.js → render/ exception** in FROMSCRATCH.md as an intentional trade-off
2. **Monitor OCCT memory** on extended sessions (previewShape deletion appears correct, but log if session runs 1+ hours)
3. **Consider extracting computeSelectionCenter()** (lines 657-687) into a shared utility since gizmoMode & contextWidget use similar logic
4. **Add JSDoc type hints** for selectionInfo parameter (line 135) for clarity in future reviews

---

## Conclusion

**Status: PASS ✓**

The gizmo mode system is architecturally sound and implements advanced interactive geometry operations with discipline and clarity. The single layer boundary exception is intentional, well-justified, and properly mitigated.

POC 7 (Gizmo system) ready for integration.
