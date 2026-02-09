# FromScratch Architecture Memory

## Current Review Status (2026-02-08)
**Latest Review:** Gizmo Mode, Context Widget, Translation System
**Result:** PASS — All architectural rules compliant
**Files reviewed:** gizmoMode.js, translateSubElementMode.js, gizmoRender.js, contextWidget.js, bodyOperations.js (translate functions)

See detailed review: `REVIEW_2026-02-08-GIZMO-CONTEXT-TRANSLATION.md`

## Verified Architectural Patterns

### Tool Interactive Mode Pattern (GOLD STANDARD)
All interactive modes (`gizmoMode`, `translateSubElementMode`, `faceExtrudeMode`, `filletMode`, `chamferMode`, `booleanMode`, `moveBodyMode`) follow identical pattern:
- `initXxxMode({ callback1, callback2, ... })` — dependency injection
- `startXxxMode(...)` — register event listeners, initialize state
- `endXxxMode()` — cleanup and dispatch fromscratch:modeend
- `isXxxModeActive()` — query function
- Dispatch `fromscratch:modestart` on entry (coordinates with contextWidget)
- Store event cleanup functions in module scope
- Use capture-phase listeners + stopImmediatePropagation() to block pointer.js

### Atomic Operation Pattern
All operations in `bodyOperations.js` follow: OCCT → tessellate → validate → store → state update → mesh replace → selection clear

### Preview Strategies
- **Cheap (visual only):** Body mesh repositioning (gizmoMode line 239-250)
- **Medium (render):** Face extrusion using existing triangle subset (gizmoMode line 251-264)
- **Expensive (OCCT):** Vertex/edge rebuild, 100ms debounced (gizmoMode line 266-272, translateSubElementMode line 319-330)

### Event Coordination
- `fromscratch:modestart`: Dispatched by all modes on entry; contextWidget listens and hides
- `fromscratch:settool`: Dispatched by tool switches; contextWidget listens and hides
- `fromscratch:modeend`: Dispatched by all modes on exit (unused currently, but consistent)

## Layer Boundaries - VERIFIED COMPLIANT (2026-02-08)

### Dependency Direction Rules (STRICT)
```
input/ → tools/ → core/ ← render/ ← ui/
        ↓
      ui/
```

**Verified in latest review:**
- gizmoMode.js (tools): imports core→input→render→ui ✓
- translateSubElementMode.js (tools): imports core→input→render→ui ✓
- gizmoRender.js (render): imports THREE.js + input/camera only ✓
- contextWidget.js (ui): imports all layers except body tools ✓
- bodyOperations.js (tools): imports core + render (DOCUMENTED EXCEPTION for atomic sync) ✓

### Known Exceptions (Intentional)
- `bodyOperations.js` imports from `render/` (replaceBodyMesh, updateSelectionHighlight, removeBodyMesh) — justified for atomic state→mesh→selection sync
- `contextWidget.js` imports from `tools/sketchOnFaceTool` — UI can invoke tool entry points

## State Management - VERIFIED COMPLIANT

### Single Source of Truth
- All geometry state lives in `state.js` (bodies, sketches, selections)
- No duplicate geometry caches in render or tool modules
- Preview states are local to interactive modes (not written to state.js)
- OCCT shapes stored separately in `occtShapeStore.js` (reference-counted)

### State Update Pattern
Interactive modes → DI callback → bodyOperations → pushUndoSnapshot + OCCT op + state.updateBody + mesh replace

## Pure Function Boundaries

### Core Layer Purity (VERIFIED)
- `occtEngine.js`: All functions pure (no THREE.js, no DOM, no state mutation)
- `occtTessellate.js`: Pure (input shape → output tessellation data)
- `snap.js`: Pure (coordinates → snapped coordinates)
- `sketchPlane.js`: Pure (plane + coords ↔ transforms)

### Tool Layer (VERIFIED)
- No OCCT imports except through `occtEngine.js` and `occtShapeStore.js`
- No direct state mutations (use callbacks or pushUndoSnapshot pattern)
- Preview calculations may create temporary THREE.js meshes (acceptable)

## UI Patterns

### Context Widget Pattern (NEW)
- Subscribes to `state.interaction.bodySelection` changes
- Rebuilds widget from state, no local cache
- Injects DI callbacks to start interactive modes
- Hides on `fromscratch:modestart` event
- Hides on `fromscratch:settool` event

### Status Banner Pattern (ESTABLISHED)
- Status messages created/removed directly in tool modules
- Positioned at top-center of viewport
- ID-based for easy find-and-remove
- Matches existing modes (faceExtrudeMode, filletMode, etc.)

## Known Limitations (By Design)

### Vertex/Edge Movement
- Only works on planar faces with straight edges
- Curved edges (from fillet/chamfer) explicitly rejected
- Error message shown to user: `"Cannot move: [specific reason]"`

### Gizmo Visualization
- Only visible on body/face/edge/vertex selection
- Hidden when interactive modes start
- Camera-distance scaled for constant screen size
- 3 colored arrows (X=red, Y=green, Z=blue)

## Common Gotchas (Lessons Learned)

### OCCT Constructor Overloads
- `BRepBuilderAPI_MakeSolid_2` = CompSolid (NOT Shell)
- `BRepBuilderAPI_MakeSolid_3` = Shell (correct for shell→solid)
- `BRepBuilderAPI_MakeEdge_2(v1, v2)` = from TopoDS_Vertex pair
- `BRepBuilderAPI_MakeEdge_3(p1, p2)` = from gp_Pnt pair

### THREE.js Camera
- `camera.domElement` doesn't exist; use `document.getElementById('canvas-container')`
- `camera.getWorldDirection()` returns unit vector in world space

### Event Interception
- `stopPropagation()` alone doesn't block other handlers on same element
- Use `stopImmediatePropagation()` to block sibling listeners
- Capture-phase (`{ capture: true }`) + `stopImmediatePropagation()` blocks everything downstream

### DOM Element Positioning
- NDC projection: `camera.project(vec3)` returns {x: -1..+1, y: -1..+1}
- Screen coords: `x = (ndc.x + 1) / 2 * width`, `y = (1 - ndc.y) / 2 * height`
- Clamp to viewport to prevent off-screen panels

## Testing Recommendations

### For Vertex/Edge Translation
1. Box → move edge → expect box deforms
2. Box → fillet → move vertex on curved face (expect error)
3. Box → move vertex → exact distance input via D key
4. Axis constraint X/Y/Z keys on vertex mode

### For Gizmo
1. Body selection → gizmo appears
2. Hover arrow → brightens
3. Drag on X/Y/Z axis → previews move
4. Release → commits to state
5. Undo (Ctrl+Z) → reverts to original position
6. Other mode starts → gizmo hides

### For Context Widget
1. Face selection → widget shows "Extrude Face", "Sketch on Face"
2. Edge selection → widget shows "Move Edge", "Fillet N", "Chamfer N"
3. Vertex selection → widget shows "Move Vertex"
4. Body selection → widget shows "Move", "Subtract...", "Union...", "Delete"
5. Interactive mode starts → widget hides
6. Tool switch → widget hides

## Code Health Notes

### Performance
- Gizmo scale updated every frame (acceptable, one Vector3 distance call)
- Preview OCCT rebuilds debounced at 100ms (necessary for interactivity)
- Context widget repositioning negligible (~5 vector operations per selection change)

### Memory
- OCCT shapes reference-counted and cleaned up properly
- DOM status banners removed in endMode() functions
- THREE.js geometries and materials disposed in clearBodyPreview()
- Event listeners stored and removed in cleanup functions

### Code Organization
- gizmoMode + gizmoRender properly split (state machine vs. visual)
- translateSubElementMode self-contained with minimal render dependencies
- bodyOperations.js functions each handle complete atomic operation
- contextWidget.js single responsibility (display actions)

