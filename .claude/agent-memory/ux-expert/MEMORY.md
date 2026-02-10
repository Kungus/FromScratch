# UX Expert Agent Memory

## Current Fillet/Chamfer Implementation Pattern (2026-02-09)

### Interaction Flow
1. **Entry**: Right-click edge → context menu "Fillet Edge" OR click edge → context widget "Fillet" button
2. **Mode activation**: Enters fillet mode, cursor remains normal
3. **Adjustment**: Move mouse up/down to adjust radius (deltaY * 0.005 from initial position)
4. **Preview**: Debounced (100ms) OCCT preview appears as transparent overlay
5. **Dimension display**: Label at screen center (x:0, y:0, worldY:0)
6. **Commit**: Left-click to apply
7. **Cancel**: Escape key

### Key Issues Identified
1. **Disconnected interaction**: Two-step process (activate mode → then move mouse) vs. Shapr3D's direct manipulation
2. **Screen-center dimension label**: Not near the edge being modified
3. **No edge-pinned radius indicator**: Shapr3D shows radius value on the edge itself
4. **Missing edge loop selection**: Users requested this in Shapr3D community, we don't have it either
5. **No "Include Tangent Edges" option**: Shapr3D feature to auto-select tangent chains
6. **startScreenY = -1 pattern**: Requires mouse movement AFTER mode entry to initialize

## Shapr3D Fillet/Chamfer UX Pattern

### Core Interaction (from research)
- **Tool activation**: Tools menu → Chamfer/Fillet → Select type
- **Edge selection**: Tap/click edge(s) to select (multi-select supported)
- **Visual manipulation**: Drag arrows away from body (fillet) or toward body (chamfer)
- **Dimension badge**: Shows radius value, can be clicked to type exact value
- **Settings badge**: Access to advanced options (profile, continuity, corners)
- **Commit**: "Done" button

### Advanced Features
- **Include Tangent Edges** toggle: Auto-selects connected tangent edges
- **Profile slider**: Adjust fillet cross-section (sharp to flat)
- **Continuity options**: G0/G1/G2 (tangent is default G1)
- **Radius vs Chord Width**: Alternative measurement modes
- **Variable fillet**: Different radii at different points (advanced)

### Visual Feedback
- Dimension label shows current radius (near the edge)
- Preview updates live as you drag
- Settings accessible via badge/gear icon
- Clear "Done" action to commit

## Recommendations Priority

### 🔴 Critical
None identified - current implementation is functional, not trapping users

### 🟡 Important
1. **Single-step activation**: Click edge → immediately draggable (combine selection + mode entry)
2. **Edge-relative dimension label**: Position label near edge midpoint, not screen center
3. **Arrow/gizmo manipulation**: Visual handle on edge for direct drag (like Shapr3D arrows)

### 🟢 Polish
1. **Edge loop selection**: Double-click edge to select loop
2. **Tangent chain selection**: Option to auto-select connected tangent edges
3. **Inline dimension badge**: Tap dimension to edit (not just D key)
4. **Profile adjustment**: Slider for fillet cross-section shape
5. **Continuity options**: G0/G1/G2 selection

## Industry Comparison: Plasticity CAD

### Yellow Dot Interaction
- **Widget**: Yellow dot indicator on the edge
- **Drag behavior**: Move dot to specify distance
- **Direction determines type**: Positive = fillet, negative = chamfer
- **Live feedback**: Real-time curvature visualization with Toggle Curvature mode
- **Advanced options**: Variable distances, conic/G2 continuous shapes, adjustable limit ranges

### Key Difference from FromScratch
- Visual handle directly on the geometry (not invisible drag)
- Bi-directional: same widget for fillet AND chamfer based on drag direction
- Context-sensitive: works in-place rather than modal

## Industry Comparison: Fusion 360

### Workflow Pattern
- **Selection-first**: Click edges (or face to select all edges), THEN activate fillet
- **Dialog-based**: Radius input in a parameter dialog
- **Chain selection**: "Automatic Edge Chain" toggle to pick connected edges
- **Timeline-based**: Fillets are parametric features, can be reordered
- **Best practices**: Large fillets first, small fillets second; concave before convex

### Key Difference from FromScratch
- More dialog-heavy, less direct manipulation
- Strong emphasis on feature order and dependencies
- No visual gizmo/handle — relies on dialog + preview

## Related Files
- `src/tools/filletMode.js` - Current implementation
- `src/tools/chamferMode.js` - Mirror of fillet mode
- `src/ui/contextWidget.js` - Entry point for fillet/chamfer
- `src/ui/contextMenuBuilder.js` - Context menu integration
- `src/render/dimensionRender.js` - Dimension label positioning
