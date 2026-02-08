# FromScratch

A browser-based CAD application that combines the precision of professional CAD software with the accessibility of beginner-friendly tools. Think Shapr3D's intuitive sketch-to-3D workflow, running entirely in your browser — for free.

## Why?

The free CAD landscape has a gap: Blender has a steep learning curve for CAD work, FreeCAD has usability issues, Fusion 360 is cloud-dependent with licensing concerns, and Tinkercad lacks precision. FromScratch aims to fill that gap with a precision-first, touch-friendly experience powered by the OpenCascade geometry kernel.

## Features

- **Sketch-to-3D workflow** — Draw 2D sketches, extrude them into 3D
- **Precision-first** — Grid snapping, direct numerical input
- **Touch-friendly** — Designed for touch from the start (iPad-ready)
- **Professional geometry kernel** — Powered by [OpenCascade.js](https://ocjs.org/) (WASM)
- **No install required** — Runs in any modern browser
- **Modular architecture** — Clean 20-module codebase

### Current Operations
- Rectangle & circle sketch tools
- Extrude (including face extrude)
- Fillet & chamfer
- Boolean operations (union, subtract, intersect)
- Body move & sub-element translate
- Sketch on face
- Undo/redo

## Getting Started

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/FromScratch.git
cd FromScratch

# Install dependencies (automatically copies WASM files to lib/occt/)
npm install

# Serve locally (any static server works)
npx serve .
# or
python -m http.server 8000
```

Then open `http://localhost:3000` (or whatever port your server uses).

## Project Structure

```
├── index.html          # Entry point
├── src/
│   ├── main.js         # App bootstrap
│   ├── core/           # State, geometry engine, snapping, undo
│   ├── input/          # Pointer, camera, raycasting
│   ├── render/         # Three.js scene, grids, highlights
│   ├── tools/          # Sketch & 3D operation tools
│   └── ui/             # Context menus, dimension input, view cube
├── lib/occt/           # OpenCascade WASM (generated via npm install)
├── scripts/            # Build/setup scripts
└── FROMSCRATCH.md      # Development methodology & principles
```

## Tech Stack

- **Geometry kernel:** [OpenCascade.js](https://ocjs.org/) (WASM)
- **3D rendering:** [Three.js](https://threejs.org/) (via CDN)
- **No build step** — ES modules loaded directly by the browser

## License

ISC
