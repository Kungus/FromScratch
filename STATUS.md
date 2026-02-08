# FromScratch — Status Report
**Date:** 2026-02-07

## What We Built
A web-based precision 3D modeling tool, from scratch. Shapr3D-inspired, running entirely in the browser with a real CAD kernel.

## What Works Today

### Core Infrastructure
- **THREE.js rendering** — scene, lights, camera (orbit/pan/zoom), view cube
- **Grid + snap system** — configurable grid with visual snap indicator
- **Pointer system** — screen → world raycasting, touch support

### 2D Sketching
- **Rectangle tool** (R) — click-drag to draw, live dimensions overlay
- **Circle tool** (C) — click center, drag radius
- **Type-to-specify** (D) — press D while drawing to enter exact dimensions
- **Selection** (V) — click to select, move, delete, duplicate sketches
- **Sketch on any face** — right-click a body face → "Sketch on Face" → draw on that plane

### 3D Modeling
- **Extrude from ground** (E) — click sketch, drag up, body appears
- **Extrude from face** — right-click face → "Extrude Face" → drag to set height with live preview
- **Fillet edges** — right-click edge → "Fillet Edge" → drag to set radius with live OCCT preview
- **Smart selection** — hover-based: vertex (8px) > edge (12px) > face priority
- **Multi-edge select** — Shift+click edges, then fillet all at once
- **Delete bodies** — right-click → "Delete Body" or select + Delete key

### CAD Kernel (OpenCascade.js)
- **Real B-rep geometry** — not mesh approximations, actual solid modeling
- **Boolean operations** — subtract and union via right-click context menu (pick two bodies)
- **Cut extrusion** — drag inward on face to punch holes (red preview for cut, blue for add)
- **Topology maps** — precise face/edge/vertex identification from tessellation
- **Smooth tessellation** — accumulated vertex normals for proper curved surface rendering
- **Memory managed** — shape store tracks live OCCT objects, cleans up on delete

### Interaction Polish
- **Context menu** — right-click anywhere for context-sensitive actions
- **Interactive previews** — face extrusion and fillet both use drag-based interaction with live preview
- **Dimension labels** — track mouse during drag operations
- **Keyboard shortcuts** — V/R/C/E/D/G/Delete/Escape/1-2-3-0

## Architecture

```
User Input → Tool → State → Render
                     ↑
               (single source of truth)
```

```
Sketch → occtEngine → TopoDS_Shape → occtTessellate → THREE.js BufferGeometry
```

### Module Count: 25 files
```
src/core/       — state, snap, bodyHitTest, occtInit, occtShapeStore, occtEngine, occtTessellate, sketchPlane
src/input/      — camera, pointer, bodyRaycast, planeRaycast
src/render/     — sceneSetup, gridRender, snapRender, sketchRender, bodyRender, selectionHighlight, dimensionRender, faceGridRender
src/tools/      — selectTool, bodySelectTool, rectangleTool, circleTool, extrudeTool, sketchOnFaceTool, bodyOperations, faceExtrudeMode, filletMode, chamferMode, booleanMode
src/ui/         — viewCube, dimensionInput, contextMenu, contextMenuBuilder
```

## What's Next

### Near-term (the path to a complete modeling loop)

1. **Push/Pull** — Click a face, drag to move it. Different from face extrusion: this modifies the existing body's dimensions rather than adding material. The most intuitive way to resize.

2. **Undo/Redo** — Command pattern wrapping state mutations. Every addBody/removeBody/updateBody becomes a reversible command. Essential before the tool is usable for real work.

3. **POC 7: Full Loop** — Complete workflow with all POCs integrated end-to-end.

### Medium-term (making it actually useful)

6. **Constraints / Dimensioning** — Lock sketch dimensions, set distances between edges. The foundation for parametric modeling.

7. **Multi-body workflows** — Move/rotate bodies, align faces, assembly-like operations.

8. **Export** — STEP/STL export from OCCT shapes. The kernel can do this natively.

### Ideas
- **Polygon tool** — Unify circle tool into a polygon tool (3=triangle, 6=hex, 48=smooth circle)
- **Line/Arc sketch tools** — For arbitrary profiles beyond rectangles and circles
- **Pattern/Array** — Duplicate features along edges or in grids
- **Section view** — Clip plane to see inside bodies

## Known Issues
- Cylinder "side" face is one big curved surface (segment selection could be useful)
- Body movement/transformation not yet implemented
- `moveElement()` only works on ground plane (face sketch move deferred)
- Fillet preview creates a new OCCT shape each frame (debounced to 100ms, but still heavy for complex bodies)

## Tech Stack
- **THREE.js** — rendering
- **OpenCascade.js** — WASM CAD kernel (B-rep geometry, booleans, fillet, tessellation)
- **Vanilla JS** — no framework, ES modules, zero build step
- **Run:** `npx serve .` → `http://localhost:3000`
