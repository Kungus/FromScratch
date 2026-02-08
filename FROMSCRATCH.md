# FROMSCRATCH.md
## A Methodology for Precision 3D Modeling Tools
### Version 1.0

---

## 🎯 NORTH STAR

**One sentence:**
A free, web-based 3D modeler that brings Shapr3D's sketch-to-solid workflow to everyone—precise enough for 3D printing, approachable enough for first-timers, usable with just a finger or stylus.

**The feeling we're chasing:**
Open the app. Start drawing. Pull it into 3D. That's it. No tutorials required, no modes to escape, no dialogs to dismiss. Just you and the geometry, building exactly what you see in your head.

---

## 🧭 PRINCIPLES

These are the rules we won't break. When in doubt, return here.

### 1. Precision Is Available, Not Demanded

You CAN type exact dimensions. You CAN snap to grid. But you can also just drag and eyeball it. Both are valid workflows. The tool doesn't judge.

*Bad: "Please enter width and height to create rectangle"*
*Good: Drag to draw, dimensions appear live, type to override if you want*

### 2. One Obvious Way

Not five ways to extrude. One way, done well. Fewer choices means less confusion. We can always add power later; we can't remove confusion retroactively.

*Bad: Extrude tool, Push/Pull tool, Pad operation, Boss feature*
*Good: Select a shape. Pull it up. Done.*

### 3. Never Trap The User

Escape ALWAYS exits. It's always clear what's selected. It's always clear what tool is active. There are no hidden modes. You can't get "stuck" somewhere.

*Bad: "How do I exit sketch mode?" (asked 10,000 times in FreeCAD forums)*
*Good: Tap elsewhere = done sketching. Escape = cancel everything. Always.*

### 4. Show The Objects

Dimensions visible while dragging. Snap points light up before you commit. The grid is visible and obvious. No invisible helpers—if it affects your work, you see it.

*Bad: "Why did it snap there? What did it snap to?"*
*Good: Glowing dot shows snap point BEFORE you release*

### 5. Correct Geometry Or No Geometry

Operations that would create invalid meshes fail gracefully with a clear message. We don't produce garbage geometry and leave users to figure out why their 3D print failed.

*Bad: Silent failure, inverted normals, non-manifold edges*
*Good: "Can't fillet: edge too short for radius 5. Try radius 3 or smaller."*

### 6. Touch-First, Mouse-Enhanced

Design every interaction for a single pointer (finger/stylus). Then add mouse conveniences (scroll zoom, right-drag pan, keyboard shortcuts) on top. Never require them.

*Bad: "Right-click to access context menu"*
*Good: Tap and hold shows options. Right-click also works but isn't required.*

---

## 🛞 DON'T REINVENT THE WHEEL

**Principle: Use free, well-tested libraries whenever possible.**

We're building a 3D modeling *tool*, not a 3D math *library*. If someone has already solved polygon triangulation, boolean operations, or mesh validation—and released it under a permissive license—we use it.

### Why This Matters

| Reinventing | Using Libraries |
|-------------|-----------------|
| Weeks debugging edge cases | Benefit from years of fixes |
| Our bugs, our problem | Community finds and fixes issues |
| Maintenance burden on us | Maintained by specialists |
| Distracted from the actual tool | Focus on UX and workflow |

### Libraries We'll Use

| Library | Purpose | License | Notes |
|---------|---------|---------|-------|
| **THREE.js** | 3D rendering | MIT | The foundation—scene, camera, meshes |
| **three-bvh-csg** | Boolean operations | MIT | Union, subtract, intersect solids |
| **earcut** | Polygon triangulation | ISC | Turn 2D shapes into triangles for extrusion |
| **clipper-lib** (Clipper2) | 2D boolean/offset | Boost | Combine/offset 2D sketch shapes |
| **gl-matrix** | Vector/matrix math | MIT | If we need perf beyond THREE's built-in |

### Libraries to Evaluate

| Library | Purpose | When We'd Need It |
|---------|---------|-------------------|
| **robust-predicates** | Exact geometric predicates | If we hit floating-point edge cases |
| **cdt2d** | Constrained Delaunay triangulation | Complex sketch shapes with holes |
| **meshoptimizer** (WASM) | Mesh optimization | If export file size matters |
| **potpack** | Rectangle packing | UV unwrapping (future) |

### Rules for Adding Libraries

1. **Must be permissively licensed** (MIT, ISC, BSD, Boost, Apache 2.0)
2. **Must solve a real problem we have** (not "might be useful someday")
3. **Prefer small and focused** over large and sprawling
4. **Document why we added it** in the Decisions Log

### What We WILL Build Ourselves

Some things are core to our specific UX and worth owning:

- Sketch data structures (our format, our rules)
- The snap system (core to our precision-first philosophy)
- Tool interaction patterns (our UX, our feel)
- State management (simple, specific to our needs)

The line: **Math and algorithms = use libraries. UX and workflow = build ourselves.**

---

## 🚫 ANTI-GOALS

What we're NOT building. These keep scope sane.

| Won't Do | Why |
|----------|-----|
| Parametric history tree | Massive complexity. Shapr3D proves direct modeling is enough for 90% of work. |
| Assembly mode | Different tool, different problem. One body at a time. |
| Simulation / CAM / CAE | Wildly out of scope. Export to tools that do this. |
| NURBS surfaces | Mesh is fine for games and 3D printing. Keep it simple. |
| Every possible constraint | Start with snapping. Add constraints only if users scream for them. |
| Plugin/extension system | Nail the core first. Maybe v2. |
| Collaboration / cloud sync | Local-first. Export files. Keep it simple. |

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────┐
│                      INPUT LAYER                        │
│         (Pointer events, keyboard, touch)               │
│         Normalizes all input to common actions          │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     TOOL LAYER                          │
│  Active tool receives input, produces preview + commit  │
│  (RectangleTool, CircleTool, ExtrudeTool, FilletTool)   │
└─────────────────────────┬───────────────────────────────┘
                          │ commit()
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   COMMAND LAYER                         │
│     Commands modify state, are undoable/redoable        │
│     (CreateSketchElement, ExtrudeSketch, FilletEdge)    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    STATE LAYER                          │
│              Single source of truth                     │
│                                                         │
│  Document {                                             │
│    sketches: Sketch[]                                   │
│    bodies: Body[]                                       │
│    activeSketchPlane: Plane | null                      │
│  }                                                      │
└─────────────────────────┬───────────────────────────────┘
                          │ state changes
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   RENDER LAYER                          │
│     THREE.js - displays state, owns nothing             │
│     Reacts to state changes, never modifies state       │
└─────────────────────────────────────────────────────────┘
```

**Key insight:** The renderer is a VIEW. It doesn't own geometry. State is the single source of truth. This makes undo/redo trivial—just swap state snapshots.

---

## 📏 MODULE ORGANIZATION PRINCIPLES

This project will grow large. These principles keep it manageable:

### The One Thing Rule

> **Each module does ONE thing. If you need "and" to describe it, it's two modules.**

Good: "This module handles extrusion geometry."
Bad: "This module handles extrusion and filleting and chamfers."

### Separation of Concerns

| Layer | Does | Knows About UI? | Knows About THREE.js? |
|-------|------|-----------------|----------------------|
| `geometry/*` | Pure math. Inputs → outputs. | NO | NO |
| `tools/*` | User interaction, previews | YES | YES |
| `render/*` | Displays state (read-only) | YES | YES |
| `core/state.js` | Single source of truth | NO | NO |

### Pure Geometry Functions

Operations like extrude, fillet, boolean should be **pure functions**:

```javascript
// geometry/operations/extrude.js
// Pure - no THREE.js, no DOM, no state, no side effects
export function extrudeSketch(sketchData, depth, options) {
    // Math only
    return { positions: Float32Array, indices: Uint32Array };
}
```

This means:
- They can be unit tested without a browser
- They can be refined without touching UI code
- Bugs are isolated to one place

### Tools Wrap Geometry

Tools handle interaction and call pure geometry functions:

```javascript
// tools/extrudeTool.js
import { extrudeSketch } from '../geometry/operations/extrude.js';
import { addBody } from '../core/state.js';

export class ExtrudeTool {
    onDrag(delta) {
        const preview = extrudeSketch(this.sketch, delta.y);
        this.showPreview(preview);
    }
    
    onCommit() {
        addBody(extrudeSketch(this.sketch, this.finalDepth));
    }
}
```

### When To Split

Ask yourself:
- Can I describe this module without using "and"?
- Could someone understand this file without reading other files?
- If I'm fixing a bug in extrusion, do I need to read fillet code?

If the answer is "no" to any of these, consider splitting.

---

## 📁 MODULE STRUCTURE

```
/src
  /core
    state.js            # Document, Sketch, Body definitions
    commands.js         # Command base class, undo/redo stack
    snap.js             # Grid snap, point snap, midpoint snap
    
  /tools
    baseTool.js         # Tool interface
    selectTool.js       # Default: select faces/edges/sketches
    lineTool.js         # Draw lines
    rectangleTool.js    # Draw rectangles
    circleTool.js       # Draw circles
    arcTool.js          # Draw arcs
    extrudeTool.js      # Pull sketches into 3D
    filletTool.js       # Round edges
    chamferTool.js      # Bevel edges
    
  /geometry
    sketch.js           # Sketch elements (line, arc, circle)
    mesh.js             # Body mesh representation
    topology.js         # Validation, normals, welding
    tessellate.js       # Convert sketch curves to mesh
    booleans.js         # CSG operations (wraps library)
    
  /render
    sceneSetup.js       # THREE.js scene, lights, camera
    gridRender.js       # Ground plane grid
    sketchRender.js     # Render sketches as lines
    bodyRender.js       # Render bodies as meshes
    previewRender.js    # Ghost preview during operations
    snapRender.js       # Visualize snap points
    dimensionRender.js  # Dimension overlays
    
  /ui
    toolbar.js          # Tool buttons
    dimensionInput.js   # The "type to specify" field
    statusBar.js        # Current tool, selection info
    
  /input
    pointer.js          # Unified mouse/touch handling
    keyboard.js         # Shortcuts
    camera.js           # Orbit, pan, zoom controls
    
  main.js               # Bootstrap everything
  
/index.html             # Minimal shell
```

---

## 📐 DOMAIN: GEOMETRY

### Sketch Representation

Sketches are **vector** until they become bodies. A circle is a true circle (center + radius), not 32 line segments. Tessellation happens only when:
- Rendering (for display)
- Converting to body (extrusion)
- Exporting (STL)

```javascript
Sketch {
  id: string
  plane: Plane           // Where this sketch lives
  elements: Element[]    // Lines, arcs, circles, rectangles
  closed: boolean        // Can this be extruded?
}

Element = Line | Arc | Circle | Rectangle

Line {
  type: 'line'
  start: Point2D
  end: Point2D
}

Arc {
  type: 'arc'
  center: Point2D
  radius: number
  startAngle: number     // radians
  endAngle: number       // radians
}

Circle {
  type: 'circle'
  center: Point2D
  radius: number
}

Rectangle {
  type: 'rectangle'
  corner1: Point2D
  corner2: Point2D
  // Convenience - could be 4 lines, but this is simpler
}
```

### Body Representation

Bodies are **indexed triangle meshes**. Clean, validated, watertight.

```javascript
Body {
  id: string
  positions: Float32Array   // [x,y,z, x,y,z, ...]
  indices: Uint32Array      // [i,j,k, i,j,k, ...]
  normals: Float32Array     // Per-vertex normals
  
  // Computed on demand, cached
  edges: Edge[]             // For selection, filleting
  faces: Face[]             // For selection, sketching on
}
```

### Topology Rules

A valid body must be:
1. **Watertight** — Every edge shared by exactly 2 faces
2. **Consistent winding** — All face normals point outward
3. **No degenerate triangles** — No zero-area faces
4. **No self-intersection** — Faces don't pass through each other

Operations that would violate these rules must fail gracefully.

---

## ✏️ DOMAIN: SKETCHING

### The Flow

```
1. USER INITIATES SKETCH
   - Tap ground plane → sketch on ground
   - Tap face of body → sketch on that face
   - Camera auto-rotates to face the sketch plane
   - Grid becomes more prominent

2. USER DRAWS
   - Select tool (rectangle, circle, line)
   - Tap first point (snaps to grid/existing points)
   - Drag to second point
   - Live dimensions show size
   - Release to commit element

3. USER REFINES (optional)
   - Tap element to select
   - Drag to adjust
   - Type dimensions for precision

4. USER EXITS SKETCH
   - Tap outside sketch plane, or
   - Select a 3D tool (extrude), or
   - Press Escape
   - Closed shapes remain, ready to extrude
```

### Snapping System

Snapping is the primary precision mechanism. It's always active (can be toggled off).

| Snap Type | Visual | Priority |
|-----------|--------|----------|
| Grid | Faint dots on grid intersections | Low |
| Endpoint | Bright dot on existing endpoints | High |
| Midpoint | Triangle marker on edge midpoints | Medium |
| Center | Crosshair on circle/arc centers | High |
| Intersection | X marker where elements cross | High |

**Snap behavior:**
- Within 10px screen distance, snap activates
- Closest snap point wins
- Visual indicator appears BEFORE release
- Holding Shift temporarily disables snap

### Dimension Input

The "type to specify" pattern from Shapr3D:

```
While dragging rectangle:

     ┌────────────────────┐
     │                    │
     │                    │  ← Live preview
     │                    │
     └────────────────────┘
              │
        ┌─────┴─────┐
        │ 2.50 × 1.75│  ← Dimension badge (editable!)
        └───────────┘

- Badge shows current size
- Click badge OR just start typing to edit
- Tab switches between width/height
- Enter confirms
- Escape cancels
```

---

## 🔧 DOMAIN: OPERATIONS

### Extrude

**What it does:** Pulls a closed sketch into a 3D body, or adds/removes material from existing body.

**Inputs:**
- Selected: closed sketch OR face with sketch on it
- Parameter: depth (positive = add, negative = cut)

**The interaction:**
```
1. Select closed sketch (glows to show it's valid)
2. Drag up/down OR press E
3. Preview shows extruded shape
4. Dimension badge shows depth
5. Release OR type exact depth + Enter
6. Sketch becomes body (or modifies existing body)
```

**Edge cases:**
- Sketch not closed → "Close the shape to extrude"
- Self-intersecting sketch → "Shape intersects itself"
- Zero depth → Cancel, no change

---

### Fillet

**What it does:** Rounds edges with a specified radius.

**Inputs:**
- Selected: one or more edges
- Parameter: radius

**The interaction:**
```
1. Select edge(s) - they highlight
2. Press F OR tap fillet tool
3. Drag perpendicular to edge = radius preview
4. Dimension badge shows radius
5. Release OR type exact radius + Enter
6. Edges become rounded
```

**Edge cases:**
- Radius too large for edge → "Radius too large. Max: X"
- Adjacent fillets would collide → "Reduce radius or fillet fewer edges"
- Non-manifold result → "Can't fillet: would create invalid geometry"

---

### Chamfer

**What it does:** Bevels edges with a specified distance.

**Inputs:**
- Selected: one or more edges
- Parameter: distance (or two distances for asymmetric)

**The interaction:**
```
1. Select edge(s)
2. Press C OR tap chamfer tool
3. Drag = distance preview
4. Release OR type exact distance
5. Edges become beveled
```

---

### Boolean Subtract

**What it does:** Removes one body from another.

**Inputs:**
- Selected: two bodies (cutter highlighted differently)

**The interaction:**
```
1. Select first body (the one to keep)
2. Hold Shift, select second body (the cutter)
3. Press X OR tap subtract tool
4. Preview shows result
5. Confirm
6. Second body disappears, first body has hole
```

---

## 🎮 DOMAIN: INTERACTION

### Selection Model

**What can be selected:**
- Nothing (default state)
- Sketch element (line, circle, etc.)
- Closed sketch region (for extrusion)
- Body face
- Body edge
- Entire body

**How selection works:**
- Tap = select (replaces previous selection)
- Shift+tap = add to selection (multi-select)
- Tap nothing = deselect all
- Double-tap body = select entire body
- Drag on empty space = box select (future)

**Visual feedback:**
- Hovered: subtle highlight
- Selected: bright highlight + selection handles where relevant

### Tool Activation

**Explicit tool selection:**
- Toolbar buttons
- Keyboard shortcuts
- Selecting something may auto-activate relevant tool

**Tool states:**
- Idle: waiting for input
- Active: receiving input (dragging, etc.)
- Preview: showing what will happen
- Committed: operation complete, back to idle

**Cancel behavior:**
- Escape = cancel current tool operation
- Escape again = deselect all
- Escape again = return to select tool

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Drawing** | |
| L | Line tool |
| R | Rectangle tool |
| C | Circle tool |
| A | Arc tool |
| **Operations** | |
| E | Extrude |
| F | Fillet |
| K | Chamfer |
| X | Boolean subtract |
| **View** | |
| 1 | Front view |
| 2 | Right view |
| 3 | Top view |
| 0 | Perspective view |
| O | Toggle ortho/perspective |
| **General** | |
| Escape | Cancel / Deselect |
| Delete | Delete selected |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| G | Toggle grid snap |
| Space | Confirm operation |
| Tab | Cycle dimension fields |

### Camera Controls

**Touch/Mouse unified:**
- One finger drag / Left drag = Orbit
- Two finger drag / Right drag = Pan
- Pinch / Scroll = Zoom

**View presets:**
- Tap view button = instant snap to that view
- Double-tap = snap + fit all in view

---

## 🧪 POC SEQUENCE

Build capability incrementally. Each POC proves something specific.

### POC 1: The Stage

**Build:**
- THREE.js scene with ground plane
- Grid rendering (configurable size)
- Camera orbit/pan/zoom
- Grid snap logic (not visual yet)

**Prove:** We can display a precise 3D environment that feels responsive.

**Success criteria:**
- Smooth 60fps camera movement
- Grid visible from multiple angles
- Works on desktop and mobile

---

### POC 2: Drawing on the Ground

**Build:**
- Rectangle tool
- Pointer input handling
- Snap visualization (dots on grid)
- Live dimension display
- Type-to-specify input field

**Prove:** Users can draw precise shapes on a plane.

**Success criteria:**
- Draw rectangle by dragging
- See dimensions while dragging
- Type "3 x 2" and get exactly 3 × 2
- Grid snap works visibly

---

### POC 3: The First Extrusion

**Build:**
- Extrude tool
- Sketch → Body conversion (tessellation)
- Body rendering with edges visible
- Depth dimension input

**Prove:** Flat sketches become 3D bodies.

**Success criteria:**
- Select rectangle, drag up, it becomes a box
- Type depth "1.5" and get exactly 1.5 height
- Body is valid mesh (watertight, correct normals)

---

### POC 4: Sketch on Face

**Build:**
- Face selection
- Dynamic sketch plane (on selected face)
- Camera auto-orient to face
- Cut extrusion (negative depth removes material)

**Prove:** Iterative modeling works—build on what you built.

**Success criteria:**
- Select top face of box
- Draw circle on it
- Extrude down (negative) → hole punched through
- Resulting geometry is valid

---

### POC 5: Fillet Edges

**Build:**
- Edge selection
- Fillet operation
- Radius input
- Mesh subdivision for smooth fillet

**Prove:** We can modify bodies, not just create them.

**Success criteria:**
- Select top edges of box
- Apply fillet with radius 0.25
- Edges become smoothly rounded
- Geometry remains valid

---

### POC 6: Multiple Bodies + Boolean

**Build:**
- Multiple body support in state
- Body selection (vs face/edge)
- Boolean subtract operation (using library)
- Result replaces original bodies

**Prove:** Complex shapes via combination.

**Success criteria:**
- Create two overlapping boxes
- Subtract one from the other
- Clean result with no artifacts

---

### POC 7: Full Loop

**Build:**
- Circle tool
- Arc tool (stretch goal)
- Export to STL
- Undo/redo for all operations

**Prove:** Complete workflow from sketch to printable file.

**Success criteria:**
- Design a simple part (bracket, holder, etc.)
- Export STL
- Preview in 3D print slicer without errors
- Undo back to beginning, redo forward

---

## 📋 RELEASE CHECKLIST

Before sharing with humans:

### Functionality
- [ ] All sketch tools work (line, rectangle, circle)
- [ ] Extrude works (positive and negative)
- [ ] Fillet works
- [ ] Selection is obvious and consistent
- [ ] Undo/redo works for ALL operations
- [ ] Grid snap works
- [ ] Dimension input works

### Quality
- [ ] All operations produce valid geometry
- [ ] No console errors during normal use
- [ ] No memory leaks (check after 30 min use)
- [ ] 60fps on mid-range hardware

### Export
- [ ] STL export works
- [ ] Exported STL is valid (test in slicer)

### UX
- [ ] Every tool has a tooltip
- [ ] Current tool is always visible
- [ ] Selection state is always visible
- [ ] Error messages are helpful, not cryptic

### Platform
- [ ] Works: Chrome, Firefox, Safari, Edge
- [ ] Works: Desktop (mouse + keyboard)
- [ ] Works: Tablet (touch + stylus)
- [ ] Passable: Phone (small screen touch)

### Cleanup
- [ ] No debug UI visible
- [ ] No debug console.logs
- [ ] No dead code
- [ ] No TODO comments (either done or in issue tracker)

---

## 📓 DECISIONS LOG

Track important decisions and why we made them.

| Date | Decision | Rationale |
|------|----------|-----------|
| | | |
| | | |
| | | |

---

## 🔮 FUTURE IDEAS (Parking Lot)

Ideas that are out of scope for v1 but worth remembering:

- [ ] Spline/bezier sketching
- [ ] Shell operation (hollow out)
- [ ] Linear pattern (repeat in line)
- [ ] Circular pattern (repeat around axis)
- [ ] Mirror body
- [ ] Import STL and modify
- [ ] Dimension constraints (not just snap)
- [ ] Angle snap (15°, 30°, 45°, 90°)
- [ ] Save/load project file
- [ ] Measurement tool
- [ ] Section view
- [ ] Construction lines (guide lines that don't extrude)

---

## 📚 REFERENCES

### Inspiration

| Tool | What We're Taking |
|------|-------------------|
| **Shapr3D** | Sketch-to-solid flow, dimension input UX, touch-first design |
| **Plasticity** | Keyboard efficiency, smooth feel, artist-friendly CAD |
| **Tinkercad** | Zero-learning-curve onboarding, web-based simplicity |

### What We're Avoiding

| Tool | What We're NOT Doing |
|------|---------------------|
| **Blender** | Overwhelming modes, right-click select, 10-year learning curve |
| **FreeCAD** | sketcher sketcher sketcher sketcher sketcher sketcher sketcher |
| **Fusion 360** | Timeline anxiety, cloud dependency, subscription threat |

---

## 🌱 LESSONS FROM THE POC

What we learned from the proof-of-concept code that preceded this:

1. **Single file becomes unwieldy** — 10k lines is too much. Modules from day one.

2. **Global state is tempting but painful** — Everything talked to everything. State management matters.

3. **Geometry hacks accumulate** — "Just make it work" decisions created fragile topology. Do it right.

4. **THREE.js objects aren't state** — Using userData as state storage was a mistake. Separate concerns.

5. **The gizmo got complicated** — Transform gizmo code exploded. Consider if we even need one, or if direct manipulation is enough.

6. **Extrusion worked** — The core extrusion logic was sound. Worth studying when we reimplement.

7. **STL import/export worked** — Good reference for the I/O module.

---

*FromScratch v1.0*
*Let's build something precise.*
