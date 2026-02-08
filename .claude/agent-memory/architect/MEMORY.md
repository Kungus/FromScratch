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
