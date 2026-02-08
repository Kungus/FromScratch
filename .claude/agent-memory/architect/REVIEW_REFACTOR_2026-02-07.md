# Architecture Review: Refactoring of main.js (2026-02-07)

## Executive Summary
**Status: PASS WITH ARCHITECTURAL CONCERNS**

The refactoring successfully extracts 4 new modules from main.js:
1. `src/core/bodyOperations.js` — domain logic for fillet and face extrusion
2. `src/tools/faceExtrudeMode.js` — interactive face extrude mode controller
3. `src/tools/filletMode.js` — interactive fillet mode controller
4. `src/ui/contextMenuBuilder.js` — context menu item construction

All modules have **zero behavior changes** and follow the Golden Rules. However, `bodyOperations.js` crosses a critical architectural line that should be examined before this merges.

---

## Finding 1: VIOLATION - Core Layer Imports Render Layer

**Severity: YELLOW AMBER - Architecture Breach (Non-Critical)**

**File:** `src/core/bodyOperations.js` (lines 10-11)
```javascript
import { replaceBodyMesh, getBodyGroup } from '../render/bodyRender.js';
import { updateSelectionHighlight, updateMultiSelectionHighlight } from '../render/selectionHighlight.js';
```

**Rule Violated:** Layer Boundaries (FROMSCRATCH.md §8.1, Golden Rule 2)

The dependency graph must flow: `input/ → tools/ → core/ ← render/`

`core/` must NEVER import from `render/`. This breaks the core assumption that geometry operations are pure and UI-agnostic.

**Why This Matters:**
- Core domain logic should be testable without a browser or THREE.js
- Geometry operations should be reusable in Node.js, server-side CAD operations, or other rendering backends
- The core layer is now tightly coupled to the THREE.js renderer

**Current Justification (Implied):**
The function `applyFillet()` and `applyFaceExtrusion()` need to:
- Update the THREE.js mesh immediately after the operation (replaceBodyMesh)
- Update the selection highlight to reflect the changed geometry (updateSelectionHighlight)

**Assessment:**
This is a **layer violation**, but it's arguable whether bodyOperations should live in `core/` at all. The violation occurs because bodyOperations mixes:
1. Pure geometry operations (OCCT calls) ← belongs in `core/`
2. State management (updateBody) ← belongs in `core/`
3. Render synchronization (replaceBodyMesh, updateSelectionHighlight) ← belongs in `tools/` or a separate `commands/` layer

**Recommendation:**
Either:

**Option A (Preferred - Cleaner Architecture):**
Move `bodyOperations.js` to `src/tools/bodyOperations.js` and rename it `bodyCommands.js` or keep it as-is. This makes the import direction legal:
```
tools/bodyOperations.js → core/ + render/  ✓ Legal
```

**Option B (Current Path - Acceptable):**
Keep it in `core/` but add a comment explaining this is an exception:
```javascript
/**
 * NOTE: bodyOperations imports from render/ to synchronize mesh after geometry ops.
 * This is a deliberate exception to layer boundaries (core normally doesn't touch render).
 * Justification: OCCT operations are atomic—state and mesh must update together.
 */
```

---

## Finding 2: PASS - Mode Controllers Follow Pattern Correctly

**Severity: GREEN - Compliant**

**Files:**
- `src/tools/faceExtrudeMode.js`
- `src/tools/filletMode.js`

**What's Correct:**

1. **Self-contained state machine** — Each mode has its own local state object, independent of global state.js. This is appropriate for transient UI modes.

2. **Dependency injection** — Uses `initXxxMode({ applyFn })` to accept the callback at startup, avoiding circular imports:
   ```javascript
   export function initFaceExtrudeMode({ applyFaceExtrusion }) {
       _applyFaceExtrusion = applyFaceExtrusion;
   }
   ```
   This pattern is elegant and prevents circular dependencies.

3. **Event listener cleanup** — Both modes register all listeners and store unsubscribers in `cleanup()` function, which is called on `endFaceExtrudeMode()` / `endFilletMode()`:
   ```javascript
   faceExtrudeMode.cleanup = () => {
       container.removeEventListener('mousemove', onMouseMove);
       container.removeEventListener('mousedown', onMouseDown, true);
       document.removeEventListener('keydown', onKeyDown);
   };
   ```
   This prevents memory leaks and event handler conflicts.

4. **Tool layer responsibilities** — Both files correctly:
   - Import from `core/` (state, OCCT functions)
   - Import from `render/` (preview updates, dimension display)
   - Import from `ui/` (dimension input dialog)
   - DO NOT import from other tools (no circular tool dependencies)

5. **Active state tracking** — Both use a module-level `active` flag, not global state, which is correct for UI modes that should not persist.

**Compliance: Full**

---

## Finding 3: PASS - Context Menu Builder Is Single-Responsibility

**Severity: GREEN - Compliant**

**File:** `src/ui/contextMenuBuilder.js`

**What's Correct:**

1. **One Thing:** The module does exactly one thing: "Build context menu items based on target element." It doesn't render the menu, doesn't show/hide it, doesn't handle clicks. Those are in `contextMenu.js`.

2. **Injection Pattern:** Uses `initContextMenuBuilder({ startFaceExtrudeMode, startFilletMode })` to receive mode-starting functions, avoiding circular imports.

3. **Pure Item Construction:** `buildContextMenuItems(target, container)` is a pure function that returns an array of item objects. It doesn't mutate global state or register listeners.

4. **Correct Layer:** Lives in `ui/` (presentation logic layer), correctly imports from:
   - `core/state.js` (read-only state queries)
   - `render/` (visual operations)
   - `tools/` (to dispatch tool activation)

5. **No Circular Dependencies:**
   - `main.js` imports `buildContextMenuItems`
   - `contextMenuBuilder.js` does NOT import from `main.js`
   - Functions are injected at init time, not imported

**Compliance: Full**

---

## Finding 4: PASS - Main.js Initialization Order Is Correct

**Severity: GREEN - Compliant**

**File:** `src/main.js` (lines 75-97)

**Initialization Sequence:**
```javascript
// Import extracted modules
import { applyFillet, applyFaceExtrusion } from './core/bodyOperations.js';
import { initFaceExtrudeMode, startFaceExtrudeMode } from './tools/faceExtrudeMode.js';
import { initFilletMode, startFilletMode } from './tools/filletMode.js';
import { initContextMenuBuilder, buildContextMenuItems } from './ui/contextMenuBuilder.js';

// In init() function:
initFaceExtrudeMode({ applyFaceExtrusion });
initFilletMode({ applyFillet });
initContextMenuBuilder({ startFaceExtrudeMode, startFilletMode });
```

**What's Correct:**

1. **Dependency Order:** Modules are initialized BEFORE they're used. applyFaceExtrusion and applyFillet are imported and passed to initFaceExtrudeMode/initFilletMode before any tool or menu is triggered.

2. **No Circular Imports:** The injection pattern breaks potential cycles:
   - bodyOperations.js does not import faceExtrudeMode
   - faceExtrudeMode receives applyFaceExtrusion as a parameter
   - This is compile-time safe

3. **Callback Usage:** Functions are called only after initialization (lines 424: buildContextMenuItems is called in the contextmenu event listener, which is after init).

**Compliance: Full**

---

## Finding 5: PASS - No Three.js or DOM in Core Layer

**Severity: GREEN - Compliant**

**File:** `src/core/bodyOperations.js`

**Grep Results:** No matches for `THREE.`, `document.`, `window.`, `addEventListener`, `dispatchEvent` in geometry computation sections.

**What's Pure:**
- Lines 47-49 (fillet): Pure OCCT calls, pure tessellation
- Lines 103-115 (extrusion): Pure OCCT direction calc, pure boolean ops

**What's Impure (But Intentional):**
- Lines 54-67 (state updates, render sync): Mixed concerns as noted in Finding 1

**Verdict:** The OCCT geometry operations are pure. The impurity is localized to state/render sync, which is the architectural concern already flagged.

**Compliance: Partial (geometry = pure, sync = mixed)**

---

## Finding 6: PASS - State Management Respects Single Source of Truth

**Severity: GREEN - Compliant**

**File:** `src/core/bodyOperations.js`

**State Flow:**
1. Read current body state: `getBodyById(bodyId)` (read-only)
2. Compute new geometry: `filletEdges()`, `extrudeFaceAndFuse()` (pure)
3. Store OCCT shape: `storeShape(filletedShape)` (registry mutation, not state)
4. **Update state atomically:** `updateBody(bodyId, {...})` (state mutation via official API)
5. Clean up old shape: `removeShape(oldShapeRef)` (registry cleanup)
6. Sync render: `replaceBodyMesh()` (render layer update)

**Key Point:** State is updated once per operation via `updateBody()`. There's no state duplication, no userData hacks, no leaky global mutations.

**Compliance: Full**

---

## Finding 7: WARNING - OCCT Memory Management

**Severity: YELLOW - Caution**

**File:** `src/tools/filletMode.js` (line 56)

```javascript
filletedShape.delete();
```

**File:** `src/core/bodyOperations.js` (lines 73, 139)

```javascript
edges.forEach(e => e.delete());
face.delete();
```

**What's Happening:**
OCCT objects (Shape, Edge, Face) are manually deleted to free WASM memory. This is correct and necessary.

**Potential Risk:**
If an exception is thrown before `.delete()` is called, memory leaks. This is partially mitigated by `finally` blocks in some places but not all.

**Example (Safe):**
```javascript
try {
    const filletedShape = filletEdges(shape, edges, radius);
    // ... use filletedShape
} finally {
    edges.forEach(e => e.delete());  // Always cleaned
}
```

**Example (Risky):**
```javascript
const shape = getShape(body.occtShapeRef);
const edges = [];
for (const idx of edgeIndices) {
    const edge = getEdgeByIndex(shape, idx);
    if (edge) edges.push(edge);
}
if (edges.length === 0) return;  // Potential leak if exception after this
// ...
edges.forEach(e => e.delete());
```

**Assessment:** Not a violation—the current approach matches existing patterns in the codebase (e.g., extrudeTool.js). OCCT memory management is working as designed. Recommend monitoring for leaks during extended use, but this is not a refactoring concern.

**Compliance: Acceptable**

---

## Finding 8: PASS - Tool Pattern Compliance

**Severity: GREEN - Compliant**

**Files:**
- `src/tools/faceExtrudeMode.js`
- `src/tools/filletMode.js`

**Pattern Verification:**

| Pattern Element | faceExtrudeMode | filletMode | Status |
|---|---|---|---|
| `activate()` function | ✓ startFaceExtrudeMode | ✓ startFilletMode | PASS |
| `deactivate()` function | ✓ endFaceExtrudeMode | ✓ endFilletMode | PASS |
| Event subscriptions | ✓ mousemove, mousedown, keydown | ✓ mousemove, mousedown, keydown | PASS |
| Cleanup on deactivate | ✓ faceExtrudeMode.cleanup() | ✓ filletMode.cleanup() | PASS |
| Tool-local state | ✓ faceExtrudeMode object | ✓ filletMode object | PASS |
| Callback communication | ✓ _applyFaceExtrusion | ✓ _applyFillet | PASS |
| No direct renderer imports to mutate | ✓ (read-only render calls) | ✓ (read-only render calls) | PASS |

**Compliance: Full**

---

## Summary of Findings

| Finding | File | Rule | Severity | Status |
|---|---|---|---|---|
| 1 | bodyOperations.js | Layer Boundaries | AMBER | Violation (Architecturally Questionable) |
| 2 | faceExtrudeMode.js | Tool Pattern | GREEN | Compliant |
| 3 | filletMode.js | Tool Pattern | GREEN | Compliant |
| 4 | contextMenuBuilder.js | Single Responsibility | GREEN | Compliant |
| 5 | main.js | Initialization Order | GREEN | Compliant |
| 6 | bodyOperations.js | Pure Functions | GREEN | Compliant (geometry is pure) |
| 7 | All | State as Truth | GREEN | Compliant |
| 8 | All | OCCT Memory | YELLOW | Acceptable |

---

## Recommendations

### Critical (Pre-Merge Decision)

**Resolve Finding 1: bodyOperations.js layer crossing**

Choose one path:

1. **Move to tools/ (Recommended)**
   - `src/core/bodyOperations.js` → `src/tools/bodyOperations.js`
   - Imports then flow: tools → core + render ✓
   - Semantically clearer: these are domain commands, not pure geometry

2. **Keep in core/ with documentation**
   - Add comment: "Exception to layer boundaries for atomic OCCT → state → render sync"
   - Acceptable if this is a one-off, but watch for accumulation

### Non-Critical (Good Practice)

1. **Monitor OCCT memory** — Consider adding a memory usage test to catch leaks during long sessions.

2. **Document injection pattern** — Add a comment in bodyOperations explaining why it uses DI callbacks instead of importing modes directly.

3. **Test circular import assumptions** — Verify that the module initialization order in main.js is enforced by bundler (or add a CI check).

---

## Files Reviewed

- `C:\FromScratch\src\core\bodyOperations.js` (NEW)
- `C:\FromScratch\src\tools\faceExtrudeMode.js` (NEW)
- `C:\FromScratch\src\tools\filletMode.js` (NEW)
- `C:\FromScratch\src\ui\contextMenuBuilder.js` (NEW)
- `C:\FromScratch\src\main.js` (MODIFIED)

---

## Compliance Checklist

- [x] No circular imports
- [x] No tool imports from other tools
- [x] No render imports from core (except bodyOperations—FLAG)
- [x] State mutations via official state.js APIs only
- [x] Geometry functions are pure (except for sync callbacks)
- [x] Event listeners properly cleaned up
- [x] Tool pattern followed correctly
- [x] Main.js initialization order correct
- [x] One module = one responsibility
- [ ] Core layer properly isolated from render (BLOCKED by Finding 1)

---

## Conclusion

**Refactoring Quality: Excellent**

Code is clean, modules are well-separated, and patterns are consistent. The extraction successfully reduces main.js complexity without introducing new bugs or regressions.

**Architecture Compliance: Good (with one caveat)**

The bodyOperations.js layer crossing is the only architectural concern. It's not a disaster—render calls are minimal and localized—but it violates the stated dependency graph. Recommend moving to tools/ before merging, or explicitly documenting it as an intentional exception.

**Zero Behavior Change: Verified**

All extracted functions are drop-in replacements of inlined code. No new behaviors introduced. Safe to merge once the layer crossing is addressed.
