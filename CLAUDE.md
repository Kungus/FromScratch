# CLAUDE.md - FromScratch Project

## What Is This?
Precision 3D modeling tool. Web-based, free, Shapr3D-inspired.
Think: sketch a shape, pull it into 3D, fillet the edges. Simple.

## Read First
`FROMSCRATCH.md` — The full methodology doc. Has principles, architecture, POC sequence.

## Project Structure
```
fromscratch/
├── index.html              # UI shell
├── lib/
│   └── occt/               # OpenCascade.js WASM + JS files
├── src/
│   ├── main.js             # Entry point, wires everything together
│   ├── core/
│   │   ├── state.js        # THE source of truth
│   │   ├── snap.js         # Grid snapping logic
│   │   ├── bodyHitTest.js  # Vertex/edge/face proximity detection
│   │   ├── occtInit.js     # OCCT WASM loading singleton
│   │   ├── occtShapeStore.js # Live shape registry (refId → TopoDS_Shape)
│   │   ├── occtEngine.js   # Shape creation + boolean ops (pure functions)
│   │   ├── occtTessellate.js # Shape → mesh data + topology maps
│   │   └── undoRedo.js       # Snapshot-based undo/redo engine
│   ├── input/
│   │   ├── camera.js       # Orbit (Shift+drag), pan, zoom
│   │   ├── pointer.js      # Mouse/touch → world coordinates
│   │   └── bodyRaycast.js  # Raycast to 3D body meshes
│   ├── render/
│   │   ├── sceneSetup.js   # THREE.js scene, lights
│   │   ├── gridRender.js   # Ground plane grid
│   │   ├── snapRender.js   # Snap indicator (green dot)
│   │   ├── sketchRender.js # Rectangles, circles, selection
│   │   ├── bodyRender.js   # 3D bodies (extruded shapes)
│   │   ├── selectionHighlight.js # Face/edge/vertex highlights
│   │   ├── dimensionRender.js # Live dimension display
│   │   └── gizmoRender.js  # 3D translation gizmo (colored axis arrows)
│   ├── tools/
│   │   ├── selectTool.js   # Select sketches (2D)
│   │   ├── bodySelectTool.js # Select bodies/faces/edges/vertices
│   │   ├── rectangleTool.js # Draw rectangles
│   │   ├── circleTool.js   # Draw circles
│   │   ├── extrudeTool.js  # Extrude sketches to 3D
│   │   ├── bodyOperations.js # Fillet + face extrusion + boolean OCCT commands
│   │   ├── faceExtrudeMode.js # Interactive drag-to-extrude on faces
│   │   ├── filletMode.js   # Interactive drag-to-radius fillet
│   │   ├── booleanMode.js  # Interactive pick-body for subtract/union
│   │   ├── translateSubElementMode.js # Interactive edge/vertex translation
│   │   ├── gizmoMode.js    # Interactive drag-on-axis translation gizmo
│   │   └── sketchOnFaceTool.js # Sketch-on-face mode controller
│   └── ui/
│       ├── viewCube.js     # 3D orientation cube
│       ├── dimensionInput.js # Type-to-specify dialog
│       ├── contextMenu.js  # Generic right-click menu renderer
│       ├── contextMenuBuilder.js # Context menu item construction
│       └── contextWidget.js # Floating action panel near selected elements
```

## The Golden Rules

**1. State is truth.** Renderer just displays it.

**2. Geometry = pure functions.** No THREE.js, no DOM, no side effects.

**3. One module = one thing.** If you say "and", it's two modules.

**4. Use libraries for math.** Don't reinvent triangulation or booleans.

**5. We build the UX.** Tools, snap system, interaction—that's ours.

## Current POC Status
- [x] POC 1: The Stage — grid, camera, view cube, snap visualization
- [x] POC 2: Drawing — rectangle tool, circle tool, dimensions, type-to-specify
- [x] Selection System — sketches: select, move, delete, duplicate
- [x] POC 3: Extrude — sketch becomes body
- [x] Smart Selection — body/face/edge/vertex contextual selection
- [x] OCCT Integration — real B-rep CAD kernel (opencascade.js WASM)
- [x] POC 4 Phase C: Drawing on Faces — rectangle/circle tools work on any face plane
- [x] POC 4 Phase D: Extrude from Face — outward extrusion from face sketches
- [x] POC 4 Phase E: Cut Extrusion — inward extrusion via booleanCut
- [x] POC 5: Fillet — interactive drag-to-radius with live OCCT preview
- [x] POC 6: Booleans — subtract, union via right-click context menu
- [x] Undo/Redo — Snapshot-based undo/redo with OCCT shape reference counting
- [x] Translation Gizmo — axis-constrained move for bodies, faces, edges, vertices
- [ ] POC 7: Full Loop — complete workflow

## Keyboard Shortcuts
| Key | Action |
|-----|--------|
| V | Select tool |
| R | Rectangle tool |
| C | Circle tool |
| E | Extrude tool |
| D | Enter dimensions (while drawing/extruding) |
| Shift+D | Duplicate selected |
| Delete | Delete selected |
| Escape | Deselect / Cancel |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| G | Toggle grid snap |
| 1/2/3/0 | Front/Right/Top/3D view |
| Middle-drag | Orbit camera |
| Shift+Middle-drag | Pan camera |
| Scroll | Zoom |

## Libraries We Use
- **THREE.js** — rendering
- **opencascade.js** — CAD kernel (B-rep geometry, booleans, fillet, tessellation) via WASM

## Libraries Ready to Add (when needed)
- **earcut** — polygon triangulation
- **clipper-lib** — 2D shape operations

## Run Locally
```bash
npx serve .
# opens at http://localhost:3000
```

## Quick Architecture
```
User Input → Tool → State → Render
                     ↑
               (single source of truth)
```

## Session Log

### 2026-02-04: POC 1 & 2 Complete
- Built clean modular architecture from scratch
- Implemented view cube with click-to-view and drag-to-orbit
- Created pointer system (screen → world raycasting)
- Built snap system with visual indicator
- Rectangle tool with live dimensions and type-to-specify (D key)
- Circle tool (click center, drag radius)
- Full selection system: select, move, delete, duplicate
- Hover highlighting for visual feedback
- Camera: Shift+drag to orbit, right-drag to pan, scroll to zoom

### 2026-02-05: POC 3 Complete - Extrusion
- Extrude tool: press E, click on sketch, drag up to set height
- Live preview with transparent 3D body while dragging
- Type-to-specify: press D during extrusion to enter exact height
- Rectangles extrude to boxes, circles to cylinders
- Source sketch removed after extrusion
- Bodies rendered with MeshStandardMaterial + edge lines
- Added body state management (addBody, removeBody, getBodies)

### 2026-02-05: Smart Selection System
- Contextual selection: hover determines what gets selected
- Proximity-based: vertex (8px) > edge (12px) > face
- Visual feedback: green hover, cyan selection
- Body raycasting with faceIndex for sub-element detection
- Screen-space proximity detection for precise targeting
- Delete key removes selected body
- Foundation for fillet (edge selection) and sketch-on-face

**Refinements made:**
- Double-click to select whole body, single-click for sub-elements
- Fixed "triangle problem": faces now group by normal direction
  - Box: 6 logical faces (each 2 triangles with same normal)
  - Cylinder: 3 logical faces (top cap, bottom cap, side)
- Face highlight renders full polygon, not individual triangles
- Vertex sorting by angle for proper polygon winding

### 2026-02-06: POC 4 Phase A+B — Sketch on Face Foundation
**New modules:**
- `src/core/sketchPlane.js` — Pure geometry: plane from face vertices, world↔local 2D transforms
- `src/input/planeRaycast.js` — Raycast from screen to arbitrary sketch plane
- `src/render/faceGridRender.js` — Grid overlay on selected face
- `src/tools/sketchOnFaceTool.js` — Mode controller: enter/exit sketch-on-face
- `src/ui/contextMenu.js` — Right-click context menu with context-sensitive options

**What works:**
- Right-click a face → "Sketch on Face" → camera zooms in and centers on face, grid overlay appears
- Right-click a sketch → "Extrude" option
- Right-click an edge → Fillet/Chamfer placeholders (POC 5)
- Right-click any body → Delete option
- Right-click empty space → Draw tools
- Escape exits sketch-on-face mode
- Double-click still selects whole body (preserved)

**Key fixes:**
- Face normal computed from world-space vertices (not local-space raycast normal)
- Grid extent sized to match actual face dimensions
- Camera zoom-to-fit based on face vertex spread

**Architecture decisions:**
- Context menu replaces double-click for mode entry (more discoverable, standard UX)
- Sketch plane computed from vertices, not relying on potentially local-space normals
- Face grid is a separate renderer (not mixed into existing gridRender)

### 2026-02-06: OCCT Integration — Real CAD Kernel
**New modules:**
- `lib/occt/` — OpenCascade.js v2.0 beta WASM + JS files
- `src/core/occtInit.js` — Async WASM loading singleton, dispatches `fromscratch:occtready`
- `src/core/occtShapeStore.js` — Registry: refId → live TopoDS_Shape, handles memory cleanup
- `src/core/occtEngine.js` — Pure functions: makeBox, makeCylinder, booleanCut, booleanFuse, filletEdges, extrudeProfile, makeRectangleWire, makeCircleWire
- `src/core/occtTessellate.js` — Shape → mesh data with topology maps (faceMap, edgeMap, vertexMap)

**Modified modules:**
- `index.html` — Loading overlay, async OCCT init in background
- `src/main.js` — Wire shape cleanup, import new modules
- `src/core/state.js` — Body schema: +occtShapeRef, +tessellation, +getBodyById, +updateBody, +setShapeRemovalFn
- `src/render/bodyRender.js` — Render from tessellation data (BufferGeometry from OCCT mesh), fallback to primitives
- `src/tools/extrudeTool.js` — Create OCCT shape on commit (makeBox/makeCylinder + tessellate)
- `src/core/bodyHitTest.js` — Topology-based detection from faceMap/edgeMap/vertexMap, fallback to normal-grouping
- `src/render/selectionHighlight.js` — Polyline edge highlights for OCCT edges

**Key design:**
- App loads instantly (THREE.js scene works immediately), OCCT loads in background
- Bodies created before OCCT loads use THREE.js primitives (backward compat)
- Bodies created after OCCT loads get real B-rep shapes + tessellation
- OCCT shapes stored in separate registry (not in state) to keep state serializable
- Topology maps give precise face/edge/vertex selection (no more normal-grouping heuristics)

### 2026-02-07: POC 4 Phase C — Drawing on Faces
**Modified modules:**
- `src/input/planeRaycast.js` — Added `getDrawingCoords()`: branches between ground plane and active sketch plane
- `src/tools/rectangleTool.js` — Plane-aware: uses `getDrawingCoords` for coordinates, attaches `plane`/`parentBodyId` to output
- `src/tools/circleTool.js` — Same treatment as rectangle tool
- `src/render/sketchRender.js` — Plane-aware rendering: preview + committed shapes render on arbitrary planes via `localToWorld`
- `src/render/snapRender.js` — Added `updateSnapIndicator3D()` for positioning snap dot at arbitrary 3D positions
- `src/render/dimensionRender.js` — `showRectDimensions` uses plane-aware label positioning; `showDimensions` accepts optional `worldY`
- `src/main.js` — Snap indicator branches on sketch plane; circle label positioning uses `localToWorld` when plane active

**Key design:**
- `getDrawingCoords(pointerState)` is the single branching point: returns `{u, v, worldPoint}` regardless of plane
- Snap system is plane-agnostic — works on local 2D coords from any plane
- Sketch rendering builds geometry from world-space points (via `localToWorld` for face planes, direct coords for ground)
- Shapes offset slightly along plane normal (not hardcoded Y) to avoid z-fighting
- Ground plane behavior unchanged — all changes are additive branching

### 2026-02-07: POC 4 Phase D — Extrude from Face
**Modified modules:**
- `src/tools/extrudeTool.js` — Plane-aware hit testing (raycasts to sketch plane), screen-space normal projection for drag height, OCCT face extrusion path (wire → extrudeProfile → booleanFuse)
- `src/render/bodyRender.js` — New `createFaceExtrusionPreviewMesh()` orients THREE.js primitives on arbitrary face planes via `Matrix4.makeBasis`
- `src/main.js` — Commit callback branches: face extrusion replaces parent body mesh (fuse + retessellate); preview label positioned along face normal

**Key design:**
- `projectNormalToScreen()` converts face normal to 2D screen direction for intuitive drag-to-extrude on any face orientation
- Face extrusion OCCT path: `makeRectangleWire/makeCircleWire(plane)` → `extrudeProfile(wire, normal*height)` → `booleanFuse(parent, extruded)`
- Fused shape replaces parent body in state + scene (old OCCT shape freed, mesh replaced)
- Preview uses THREE.js primitives rotated to face plane; real OCCT shape created only on commit
- Ground-plane extrusion completely unchanged — all changes are additive branching
- Falls back gracefully: if parent shape missing, creates standalone body

### 2026-02-07: Interactive Previews — Face Extrusion + Fillet
**Modified modules:**
- `src/render/bodyRender.js` — Added `updateFaceExtrudePreview()` (face triangles offset along normal) and `updateTessellationPreview()` (OCCT tessellation as transparent preview). Fixed `clearBodyPreview()` to handle Group children (from tessellation edges).
- `src/main.js` — Added interactive face extrude mode (`startFaceExtrudeMode`/`endFaceExtrudeMode`) and interactive fillet mode (`startFilletMode`/`endFilletMode`). Updated context menu: "Extrude Face" and "Fillet Edge" now enter drag-based interactive modes instead of static dimension input dialog.

**What works:**
- Right-click face → "Extrude Face" → move mouse away from face → transparent preview grows/shrinks → click to commit
- Right-click edge → "Fillet Edge" → drag up → debounced OCCT fillet preview appears → click to commit
- Press D during either mode → type exact value → Enter to commit
- Press Escape → clean cancel, no preview left
- Fillet handles radius-too-large errors gracefully (keeps last valid preview)
- Face extrusion uses NDC + dot-product pattern (same as extrudeTool.js) for intuitive drag on any face orientation

**Key design:**
- Face extrude preview uses actual face tessellation triangles (not THREE.js primitives) for accurate representation
- Fillet preview runs real OCCT `filletEdges()` + `tessellateShape()` debounced at 100ms
- Both modes use capture-phase mousedown to commit (prevents click from reaching other tools)
- Interactive modes are self-contained: register/cleanup their own event listeners
- Dimension label tracks mouse during drag (positioned at face center for extrusion, screen center for fillet)

### 2026-02-07: POC 4 Phase E — Cut Extrusion
**Modified modules:**
- `src/core/occtEngine.js` — Added `extrudeFaceAndCut()`: mirrors `extrudeFaceAndFuse()` but uses `booleanCut` instead of `booleanFuse`
- `src/tools/extrudeTool.js` — Imported `booleanCut`. Removed positive-only clamp for face extrusion height (ground plane stays positive-only). Changed initial height to 0. Commit threshold uses `Math.abs`. `createBodyData` branches: positive → `booleanFuse`, negative → `booleanCut`
- `src/render/bodyRender.js` — `updateBodyPreview` uses `Math.abs` for minimum check. `createFaceExtrusionPreviewMesh` uses `Math.abs(height)` for geometry dimensions. Reddish tint (0xe05555) on preview when height < 0. `updateFaceExtrudePreview` also gets reddish tint for cuts
- `src/main.js` — Imported `extrudeFaceAndCut`. `startFaceExtrudeMode` allows negative height. Commit threshold uses `Math.abs`. `applyFaceExtrusion` branches: positive → `extrudeFaceAndFuse`, negative → `extrudeFaceAndCut`. Dimension labels show `Math.abs(height)`

**What works:**
- Draw rectangle on ground → extrude up → right-click top face → "Sketch on Face" → draw circle → E tool → drag downward → red-tinted preview going into body → release → hole punched (boolean cut)
- Both paths support cut: E-tool path (sketch on face → extrude) and interactive path (right-click face → "Extrude Face" → drag inward)
- Positive drag = add material (blue preview, booleanFuse), negative drag = remove material (red preview, booleanCut)
- Ground plane extrusion unchanged (always positive)
- Dimension labels always show positive values

**Key design:**
- Normal-to-screen projection naturally produces negative dot products when dragging toward the body — just stop clamping
- `direction = normal * height`: when height is negative, direction points inward, OCCT creates solid inside parent → `booleanCut` removes it
- Two new functions: `extrudeFaceAndCut` in occtEngine.js, mirrors existing `extrudeFaceAndFuse`
- Visual indicator: red-tinted transparent preview for cut operations

### 2026-02-07: Refactor — Extract Modes & Operations from main.js
**New modules:**
- `src/tools/bodyOperations.js` — `applyFillet()` and `applyFaceExtrusion()`: atomic OCCT commands (geometry + state + render sync)
- `src/tools/faceExtrudeMode.js` — Interactive face extrude state machine (drag-to-height, D for dimensions, Escape cancel)
- `src/tools/filletMode.js` — Interactive fillet state machine (drag-to-radius, debounced OCCT preview, D for dimensions)
- `src/ui/contextMenuBuilder.js` — `buildContextMenuItems()`: constructs menu items based on hover/selection target

**Modified modules:**
- `src/main.js` — Removed ~590 lines (1,100 → 510). Added imports + 3 init calls. Kept: bootstrap, tool callbacks, event wiring, animate loop, re-exports.

**Key design:**
- Dependency injection pattern (`initXxxMode({ applyFn })`) avoids circular imports
- Each extracted module has a single responsibility and self-contained state
- bodyOperations in `tools/` (not `core/`) because it imports from `render/` for atomic mesh sync
- Zero behavior changes — pure extraction refactor

### 2026-02-07: POC 6 — Boolean Operations (Subtract / Union)
**New modules:**
- `src/tools/booleanMode.js` — Interactive pick-second-body mode for subtract/union

**Modified modules:**
- `src/tools/bodyOperations.js` — Added `applyBoolean(bodyIdA, bodyIdB, operation)`: OCCT boolean + state + mesh sync
- `src/ui/contextMenuBuilder.js` — "Subtract..." and "Union with..." menu items (shown when 2+ bodies exist)
- `src/main.js` — Wire `initBooleanMode` + pass `startBooleanMode` to context menu builder

**What works:**
- Right-click body → "Subtract..." or "Union with..." (only shown when 2+ bodies exist)
- Crosshair cursor + status text banner while picking second body
- Body A highlighted cyan; hover other bodies → green highlight; Body A excluded from hover
- Click Body B → boolean operation executes, result replaces Body A, Body B removed
- Escape cancels pick mode cleanly
- Both subtract (booleanCut) and union (booleanFuse) operations

**Bug fixes during implementation:**
- `selectionHighlight.js` — `createBodyOutline` only checked `isLineSegments` but OCCT bodies use `THREE.Line` for edges. Fixed to check both `isLineSegments || isLine`
- `bodySelectTool.js` — Double-click threshold increased from 300ms to 500ms (was too tight for reliable detection)

**Key design:**
- Follows established interactive mode pattern (init/start/end/isActive)
- No dimension input needed — booleans don't take a numeric parameter
- `applyBoolean` in bodyOperations.js handles: OCCT boolean → tessellate → store shape → update Body A → remove Body B
- State removal of Body B auto-frees its OCCT shape via `_removeShapeFn`
- Boolean mode uses capture-phase mousedown with `stopImmediatePropagation` to prevent pointer.js/bodySelectTool from seeing clicks during pick mode

### 2026-02-08: Undo/Redo System
**New modules:**
- `src/core/undoRedo.js` — Snapshot-based undo/redo engine with OCCT shape ref counting

**Modified modules:**
- `src/core/state.js` — Added sketch CRUD (`addSketch`, `removeSketch`, `updateSketch`, `getSketches`, `getSketchById`) + `replaceDocument()` for undo restore
- `src/core/occtShapeStore.js` — Replaced flat `Map<refId, shape>` with ref-counted entries `Map<refId, {shape, refCount}>`. Added `retainShape()`/`releaseShape()`. `removeShape()` now decrements instead of immediate delete.
- `src/render/sketchRender.js` — `addRectangle`/`addCircle` accept optional `id` field. Added `syncSketchesFromState()` to rebuild visuals from state array.
- `src/tools/selectTool.js` — Added `setDragStartCallback()` for undo snapshot on move start
- `src/tools/bodyOperations.js` — Added `pushUndoSnapshot()` before each OCCT operation (fillet, chamfer, face extrude, boolean, move)
- `src/ui/contextMenuBuilder.js` — Added `pushUndoSnapshot()` before delete sketch/body actions. Added `removeSketch()` alongside `removeSketchElement()`.
- `src/main.js` — Dual-write sketches to state+render at all mutation sites. Wire `initUndoRedo` with `onRestore` callback. Push snapshots at commit callbacks. Export `undo`/`redo`.
- `index.html` — Ctrl+Z/Ctrl+Y keyboard shortcuts, undo/redo toolbar buttons, help hint update

**What works:**
- Ctrl+Z undoes, Ctrl+Y / Ctrl+Shift+Z redoes
- Toolbar buttons for undo/redo
- All operations are undoable: draw sketch, delete sketch, move sketch, duplicate, extrude, fillet, chamfer, boolean, move body, delete body, face extrusion
- OCCT shapes survive across snapshots via reference counting (freed only when no snapshot references them)
- Max 50 undo steps (oldest discarded with proper shape cleanup)
- New action after undo clears redo stack
- Active interactive modes (fillet, extrude face, boolean, move, chamfer) cancelled on restore
- Sketch-on-face mode exited on restore

**Key design:**
- Snapshot-based (not command pattern): deep-clone `state.document` before each mutation
- OCCT shapes use reference counting: `retainShape` on snapshot capture, `releaseShape` on discard
- Dual-write approach: sketches written to both `state.document.sketches` (source of truth) and `sketchRender` (visual). On undo, state restored and `syncSketchesFromState()` rebuilds render.
- `onRestore` callback in main.js: cancels modes, clears body group, rebuilds all meshes, syncs sketches, clears highlights
- Typed arrays in tessellation deep-copied via `new Float32Array(original)`
- Plane objects in sketches deep-copied to prevent aliasing

## Ideas Backlog
- **Polygon/Circle tool unification**: Circle tool could become polygon tool
  - Parameter for number of sides (3=triangle, 6=hex, 48=smooth circle)
  - Same interaction, different geometry output

### 2026-02-08: Sub-Element Translation (Move Edge / Move Vertex)
**New modules:**
- `src/tools/translateSubElementMode.js` — Interactive drag-to-move mode for edges and vertices

**Modified modules:**
- `src/core/occtEngine.js` — Added `getVertexPositions()`, `getEdgeEndpoints()`, `getVertexPosition()`, `rebuildShapeWithMovedVertices()` (shape rebuild by moving vertices)
- `src/tools/bodyOperations.js` — Added `applyTranslateSubElement()`: atomic OCCT rebuild + state + mesh sync
- `src/ui/contextMenuBuilder.js` — "Move Edge" and "Move Vertex" context menu items + injected `startTranslateSubElementMode`
- `src/main.js` — Wire `initTranslateSubElementMode`, pass to context menu builder, add to undo restore cancel list

**What works:**
- Right-click edge → "Move Edge" → drag perpendicular to edge direction → debounced OCCT preview → click to commit
- Right-click vertex → "Move Vertex" → drag freely on XZ plane → debounced OCCT preview → click to commit
- X/Y/Z keys constrain vertex movement to a single axis (with visual axis line)
- D key → type exact distance → commit with exact value
- Escape → cancel (no changes)
- Ctrl+Z undoes committed translations
- Shapes with curved edges (from fillet/chamfer) rejected with error message

**Key design:**
- `rebuildShapeWithMovedVertices()` is the core OCCT function: iterates all faces → rebuilds wires with moved vertex positions → sews into shell → makes solid → validates
- Only works for planar faces with straight edges (covers boxes, extruded rectangles, boolean results)
- Edge movement: perpendicular to edge direction, computed via cross product with camera view direction
- Vertex movement: free XZ ground plane (like moveBodyMode), with axis constraint toggle
- Debounced preview (100ms) rebuilds entire shape via OCCT for accurate preview
- Follows established interactive mode pattern (init/start/end/isActive, capture-phase events, status banner)

### 2026-02-08: Translation Gizmo + Context Widget
**New modules:**
- `src/render/gizmoRender.js` — 3D translation gizmo (colored axis arrows X=red, Y=green, Z=blue) with invisible hit-test meshes, camera-distance scaling, hover highlight
- `src/tools/gizmoMode.js` — Interactive drag-on-axis state machine for body/face/edge/vertex translation
- `src/ui/contextWidget.js` — Floating action panel near selected sub-elements (Extrude Face, Fillet Edge, Move Edge, etc.)

**Modified modules:**
- `src/core/occtEngine.js` — Major rewrite of `rebuildShapeWithMovedVertices()`: preserves original faces/edges when their vertices aren't moved, uses `BRepBuilderAPI_Sewing` + `ShapeFix_Shape` + `BRepCheck_Analyzer` for proper topology, added `getFaceVertexPositions()`, `countTopologyElements()`
- `src/tools/bodyOperations.js` — Added `applyTranslateFace()` for face vertex translation, diagnostic logging
- `src/ui/contextMenuBuilder.js` — Uses `showMoveGizmo` instead of old mode starters
- `src/main.js` — Wires gizmo render/mode, context widget, mode coordination via `fromscratch:modestart`/`modeend` events
- `src/tools/faceExtrudeMode.js`, `filletMode.js`, `chamferMode.js`, `booleanMode.js`, `moveBodyMode.js`, `translateSubElementMode.js` — Dispatch `fromscratch:modestart`/`modeend` events for mode coordination
- `src/tools/bodySelectTool.js` — Dispatch `fromscratch:bodyselected` event for context widget
- `index.html` — Context widget CSS styles

**What works:**
- Click body/face/edge/vertex → context widget appears with relevant actions (Extrude Face, Fillet Edge, Move Edge, etc.)
- Click "Move Edge/Vertex/Body" in widget → gizmo appears with 3 colored axis arrows
- Hover arrow → brightens, cursor changes to pointer
- Click-drag arrow → axis-constrained translation with live preview (debounced OCCT rebuild for edges/vertices/faces)
- D key during drag → dimension input for exact value
- Escape → cancel, no changes
- Face normal-aligned drag → delegates to face extrusion (push/pull)
- Gizmo auto-scales with camera distance for constant screen size
- All gizmo operations are undoable (Ctrl+Z)
- Gizmo hides when other modes start (fillet, boolean, etc.)

**Key design:**
- Context-menu-driven: gizmo appears via widget button click, not automatically on selection
- Gizmo uses invisible fatter cylinders for hit-testing (easier to click than visual arrows)
- `renderOrder: 1100` (above selection highlights at 1000) with `depthTest: false`
- Camera-distance scaling formula: `scale = camera.position.distanceTo(gizmoPos) * 0.08`
- `fromscratch:modestart`/`modeend` events coordinate gizmo, widget, and highlights

**Bugs fixed:**
- `rebuildShapeWithMovedVertices` double-delete of TopoDS_Edge (curved-edge check deleted edge, then catch block deleted again)
- `rebuildShapeWithMovedVertices` rejected entire shapes with ANY curved edges — now preserves unmoved faces/edges
- `BRepBuilderAPI_Sewing` IS available (requires all 5 constructor params in JS binding) — now used for proper topology rebuild
- Wire leak on MakeFace exception — fixed with `finally` block
- Selection highlights masking OCCT preview during drag — cleared on `fromscratch:modestart`

### 2026-02-09: UX Polish — Handle Interactions & Selection Blocking
**Problem:** Clicking fillet/chamfer handle immediately committed (often with radius 0), returning to select mode. Gizmo allowed sub-element selection while visible, and couldn't be reused after first drag.

**Modified modules:**
- `src/tools/filletMode.js` — Click-and-drag on fillet handle: mousedown on handle starts drag, mousemove updates radius, mouseup ends drag (keeps preview), click off handle or Enter commits. Added handle hover highlight via raycasting. Fixed `stopPropagation` → `stopImmediatePropagation`.
- `src/tools/chamferMode.js` — Same click-and-drag pattern as fillet mode.
- `src/render/gizmoRender.js` — `showGizmo`/`hideGizmo` dispatch `fromscratch:gizmoshow`/`fromscratch:gizmohide` events (with change-detection guards to prevent duplicate dispatch).
- `src/tools/bodySelectTool.js` — Added `gizmoSuppressed` flag: listens for `fromscratch:gizmoshow`/`gizmohide` to fully suppress hover and click while gizmo is visible.
- `src/tools/gizmoMode.js` — `returnToGizmoIdle` now calls `setBodySelection('body', bodyId)` to re-establish selection after `applyMoveBody` clears it. Fixes gizmo becoming unresponsive after first drag.
- `src/ui/contextWidget.js` — Added `_gizmoVisible` flag: widget suppressed while gizmo is visible (prevents flash when selection is re-established).
- `src/main.js` — Gizmo capture-phase mousedown: clicks not on arrows now intercepted + gizmo hidden (instead of falling through to bodySelectTool).

**New module:**
- `src/render/filletHandleRender.js` — Fillet/chamfer handle widget: arrow at edge midpoint with invisible hit-test mesh, camera-distance scaling, hover highlight.

**What works:**
- Fillet/chamfer: click-hold handle → drag to set radius → release → preview stays → click away or Enter to commit, Escape to cancel
- Gizmo: fully blocks face/edge/vertex selection and hover while visible
- Gizmo: multi-axis sequential moves work (drag X, release, drag Y, release, drag Z...)
- Gizmo: click off arrows hides gizmo and exits move mode
- All operations still undoable

**Key design:**
- Handle raycasting uses same invisible hit-mesh pattern as gizmo arrows
- `fromscratch:gizmoshow`/`gizmohide` events decouple gizmo visibility from bodySelectTool (no circular imports)
- `gizmoSuppressed` flag separate from `modeSuppressed` — gizmo idle state is distinct from active drag modes
- Body selection re-established in `returnToGizmoIdle` because all bodyOperations clear selection on commit

## Next Steps
1. **POC 7: Full Loop** — complete workflow (all POCs integrated)
2. **Push/Pull** — Drag faces to modify body dimensions (face extrude mode is the foundation)
3. **Optional polish** — Extract gizmo event handling from main.js → `ui/gizmoController.js`, extract status banner helper

## OpenCascade.js Architecture
Bodies are now B-rep shapes stored in the OCCT kernel. Flow:
```
Sketch → occtEngine.makeBox/makeCylinder → TopoDS_Shape → occtTessellate → THREE.js BufferGeometry
```
- **Shape Store**: `occtShapeStore.js` maps ref IDs → live OCCT objects (handles memory cleanup)
- **State holds string refs**: body.occtShapeRef is a string → keeps state serializable
- **Preview stays mesh-based**: drag preview uses THREE.js primitives for speed; OCCT shape created on commit
- **Topology maps**: faceMap/edgeMap/vertexMap from tessellation replace normal-grouping heuristics
- **Graceful fallback**: if OCCT hasn't loaded yet, bodies still render via THREE.js primitives

## Known Issues / Polish Later
- Cylinder "side" face is one big curved surface (might want segment selection?)
- Could add multi-select (Shift+click to add to selection)
- OCCT edges render as `THREE.Line`, primitives as `THREE.LineSegments` — any code traversing body meshes must check for both
- `state.subscribe` logs ALL state changes (including hover) — very noisy in console, consider filtering
- `rebuildShapeWithMovedVertices` only works for planar faces with straight edges — curved faces preserved but not rebuilt
