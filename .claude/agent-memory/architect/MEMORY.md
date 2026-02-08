# FromScratch Architecture Memory

## Key Verified Patterns (POC 4 Phase E)

### Layer Boundaries - VERIFIED COMPLIANT
- **core/occtEngine.js**: Pure geometry layer, only imports `occtInit.js` (allowed same-layer dependency)
- **tools/extrudeTool.js**: Tool layer, correctly imports from core → input → render (legal direction)
- **render/bodyRender.js**: Render layer, only imports core (sketchPlane), no cross-layer violations
- **main.js**: Wiring layer, legitimately imports from all layers (exception rule confirmed)
- **input/pointer.js**: Input layer, fixed button check from `!== 2` to `!== 0` for left-click only

### State Management - VERIFIED COMPLIANT
- userData storage pattern in bodyRender.js (lines 377, 401) is a **read-only cache**, not primary state
- Primary geometry state lives in state.js (occtShapeRef, tessellation)
- userData mirrors state for convenience in render layer only
- No violations of "state as single source of truth"

### Pure Functions - VERIFIED COMPLIANT
- occtEngine.js: All OCCT functions remain pure (no THREE.js, no DOM, no side effects)
- New `extrudeFaceAndCut()` mirrors `extrudeFaceAndFuse()` correctly
- Both functions: extract wire → extrude → boolean op → cleanup
- No new impurities introduced

### Tool Pattern - VERIFIED COMPLIANT
- extrudeTool.js: Follows standard activate/deactivate, event subscription, cleanup pattern
- New booleanCut import (line 14): correctly added alongside booleanFuse
- Dimension input callback flow unchanged
- Height sign handling (positive → fuse, negative → cut) localized to createBodyData()

### Preview Color Logic - VERIFIED COMPLIANT
- bodyRender.js (line 144, 253): Red tint (0xe05555) applied when height < 0
- Applied at THREE.js material level only (render decision, not state)
- Math.abs() used for visual dimensions while preserving signed height for geometry
- No render module mutation of state

### Face Extrusion Interactive Mode - VERIFIED COMPLIANT
- main.js startFaceExtrudeMode/endFaceExtrudeMode: self-contained, clear event registration/cleanup
- Uses capture-phase mousedown (line 746) to prevent tool conflicts
- Branching logic in applyFaceExtrusion (line 570-573): `height >= 0` → fuse, else → cut
- Math.abs() for dimension labels (line 697) while preserving signed geometry direction

### Pointer Button Fix - VERIFIED COMPLIANT
- pointer.js line 138, 148: Changed to `e.button !== 0` (was `!== 2`)
- Effect: Only left-click (button 0) triggers tools
- Middle-click (button 1) and right-click (button 2) pass through (camera/context menu)
- Comment clarified (line 137)

## Critical Design Observations

### Cut Extrusion Algorithm (Elegant)
The negative height pattern is mathematically sound:
1. User drags inward → negative NDC dot product → negative height
2. `direction = normal * height` when height < 0 → direction points inward
3. OCCT extrudeProfile creates solid inside parent body
4. booleanCut(parent, interior_solid) removes material correctly
5. No special inward-flip logic needed; geometry naturally carves

### Three Boolean Paths Now Active
- **Ground plane**: makeBox/makeCylinder (always positive)
- **Face extrusion outward**: makeRectangleWire → extrudeProfile → booleanFuse
- **Face extrusion inward**: makeRectangleWire → extrudeProfile → booleanCut
All three paths correctly branch on height sign or plane type.

### Math.abs() Usage Verified
- Dimension display (main.js line 277, 697): Math.abs() for label only
- Body preview (bodyRender.js line 189, 218, 120): Math.abs() for geometry dimensions only
- Height preserved signed in tool state and commitData for geometry direction
- No double-negation or sign ambiguity found

## No Violations Found
- Layer boundaries: COMPLIANT
- Pure functions: COMPLIANT
- State mutation: COMPLIANT
- Tool pattern: COMPLIANT
- OCCT boundaries: COMPLIANT
- Preview/render decisions: COMPLIANT

POC 4 Phase E passes full architectural review.

## 2026-02-07: Refactoring Review — Main.js Extraction

**Files Extracted:**
- `src/core/bodyOperations.js` (NEW) — fillet + face extrusion operations
- `src/tools/faceExtrudeMode.js` (NEW) — interactive face extrude mode
- `src/tools/filletMode.js` (NEW) — interactive fillet mode
- `src/ui/contextMenuBuilder.js` (NEW) — context menu item builder

**Status: PASS with AMBER FLAG**

**Findings:**

1. **VIOLATION (Amber):** bodyOperations.js imports from render/ (replaceBodyMesh, updateSelectionHighlight)
   - Core should never import from render
   - Justification: OCCT ops must atomically sync state→mesh→selection
   - Recommendation: Move to tools/ layer OR document as intentional exception

2. **COMPLIANT:** faceExtrudeMode & filletMode follow tool pattern perfectly
   - Self-contained state, proper cleanup, DI pattern for callbacks
   - No circular imports, event listeners properly unsubscribed

3. **COMPLIANT:** contextMenuBuilder is single-responsibility
   - Pure item construction, zero render/state mutation
   - DI pattern prevents circular imports

4. **COMPLIANT:** Initialization order correct, no dependency ordering issues

5. **COMPLIANT:** Geometry operations are pure; state/render sync is localized

6. **CAUTION:** OCCT memory management works but watch for leaks on long sessions

See detailed review: `REVIEW_REFACTOR_2026-02-07.md`

## 2026-02-08: Context Widget System — IMPLEMENTATION COMPLETE & VERIFIED

**Status: PASS — No architectural violations**

**Implementation delivered:**
- `src/ui/contextWidget.js` (NEW) — Floating action panel near selected sub-elements
- `index.html` — CSS styles for widget components
- `src/main.js` — Added initialization + hideWidget in onRestore callback
- **6 mode files** — Added `fromscratch:modestart` event dispatch at mode start

**Architecture verified:**

1. **Layer Boundaries:** COMPLIANT
   - contextWidget imports: state, input/camera, render, core/undoRedo, tools/sketchOnFaceTool
   - All imports legal (no upward/cross-layer violations)
   - UI layer correctly imports from view, state, input, tool layers

2. **State Management:** COMPLIANT
   - Subscribes to `state.interaction.bodySelection` changes
   - Widget rebuilds from state, no local cache
   - Delete action goes through proper state channel (removeBody)

3. **One Module = One Thing:** COMPLIANT
   - Single responsibility: "Display context-sensitive actions near selected sub-elements"
   - Does NOT execute actions, only triggers injected callbacks (DI pattern)

4. **Event Pattern:** NEW PATTERN ESTABLISHED
   - `fromscratch:modestart` event dispatched at start of every interactive mode
   - Widget listens and hides when any mode begins
   - Follows existing `fromscratch:settool` event convention
   - Decouples widget from mode implementation details

5. **Dependency Injection:** CONSISTENT WITH PROJECT
   - initContextWidget receives mode-starting callbacks
   - Same pattern as contextMenuBuilder
   - Avoids circular imports

6. **Performance:** ACCEPTABLE
   - Subscription fires once per selection change (user click)
   - Screen positioning calculation is negligible (~5 vector ops)
   - No geometry calculations

**Integration points verified:**
- State subscription → widget rebuild ✓
- Mode start → widget hide (event-driven) ✓
- Tool switch → widget hide (event-driven) ✓
- Undo/redo → widget hide (callback in onRestore) ✓
- Multi-select → widget labels update ("Fillet 3") ✓

**Risks identified & mitigated:**
- Widget updates during mode (safe — widget hidden during modes)
- Missing event dispatch in new mode (pattern established; code review catches)
- Stale mode callbacks (DI pattern decouples; signatures stable)
- Performance overhead (negligible — single vector math per selection)

**New UI→Tools delegation pattern established:**
```
contextWidget (UI) → DI callbacks → interactive modes (Tools)
```
Reusable pattern for future UI panels (toolbar, side panel, etc.)

See detailed review: `REVIEW_CONTEXT_WIDGET_2026-02-08.md`

## 2026-02-08: Gizmo Mode System — FULL IMPLEMENTATION REVIEW

**Status: PASS with DOCUMENTED EXCEPTION**

**Files Added:**
- `src/tools/gizmoMode.js` (NEW, 436 lines) — Interactive drag-on-axis state machine
- `src/render/gizmoRender.js` (NEW, 182 lines) — 3-axis translation gizmo visual
- `src/core/occtEngine.js` (modified) — Added `getFaceVertexPositions()` pure function
- `src/tools/bodyOperations.js` (modified) — Added `applyTranslateFace()` operation
- `src/main.js` (modified) — Gizmo initialization, wiring, event handling

**Architecture Verified:**

1. **Layer Boundaries:** PASS
   - gizmoMode.js (tools/): imports core→input→render (legal)
   - gizmoRender.js (render/): imports only THREE.js + input/camera (pure)
   - EXCEPTION (intentional): bodyOperations.js imports render for atomic state→mesh→selection sync
   - Exception documented and justified; see REVIEW_GIZMO_2026-02-08.md

2. **Pure Functions:** PASS
   - getFaceVertexPositions(shape, faceIndex) returns plain object array
   - No THREE.js, DOM, state mutations in core/occtEngine additions

3. **Single Responsibility:** PASS
   - gizmoRender: "Render 3-axis gizmo" (visual only)
   - gizmoMode: "Interactive drag-on-axis state machine" (input→preview→commit)
   - applyTranslateFace: "Translate face vertices" (operation in bodyOperations)

4. **Tool Pattern:** EXCELLENT
   - initGizmoMode(callbacks) / startGizmoMode / endGizmoMode / isGizmoModeActive
   - DI callbacks injected at init (lines 49-54)
   - Event subscription/cleanup via mode.cleanup function (lines 334-339)
   - Capture-phase mousedown prevents tool conflicts (line 330)
   - No state.js writes — results via DI callbacks only

5. **OCCT Boundaries:** PASS
   - Only core/occtEngine exposes OCCT functions
   - gizmoMode calls pure functions: getEdgeEndpoints, getVertexPosition, getFaceVertexPositions, rebuildShapeWithMovedVertices
   - All data passed is plain objects (no OCCT objects leak to tools)

6. **State Management:** PASS
   - gizmoMode is entirely self-contained (mode object, lines 23-38)
   - No intermediate state written to state.js
   - Results committed via bodyOperations which handles atomic state→render→selection sync

7. **Integration:** COMPLETE
   - initGizmo(scene) at main.js:191 (correct order)
   - initGizmoMode DI at main.js:111
   - Undo cleanup at main.js:124
   - Hide on modestart (line 526)
   - Show on selection change (lines 530-543)
   - Hover highlight (lines 546-568)
   - Mousedown intercept (lines 571-603)
   - Scale update per frame (line 702)

**Mathematical Quality:** Excellent
- Screen-space projection (lines 59-71): normalizes correctly
- Axis drag via dot product (lines 213-227): sound
- Grid snap: projects to scalar, snaps, converts back (lines 223-226)
- Face extrusion: accounts for normal sign (lines 248-252)

**Key Design Decisions:**
- Geometry offsets baked into BufferGeometry via .translate() (gizmoRender.js:72,78,90) before rotation — avoids parent-space issues
- Cheap preview for body move (mesh position), expensive preview for sub-elements (OCCT rebuild, debounced 100ms)
- Face normal alignment check: if dot(normal, axis) > 0.9, delegate to applyFaceExtrusion; else call applyTranslateFace

**Known Limitations (intentional):**
- Only works on planar faces with straight edges (rebuildShapeWithMovedVertices checks GeomAbs_Line, line 630)
- Curved edges (fillet/chamfer) explicitly rejected (line 634)
- Detects and rejects; provides clear error message

See detailed review: `REVIEW_GIZMO_2026-02-08.md`
