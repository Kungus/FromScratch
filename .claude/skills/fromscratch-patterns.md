---
name: fromscratch-patterns
description: Core patterns for the FromScratch 3D modeling project
---

## Tool Pattern (every tool follows this)
- Export `activateTool()` / `deactivateTool()`
- Subscribe to pointer events in activate, store unsubscribers
- Unsubscribe all in deactivate
- Communicate with renderers via callbacks set from main.js
- Tool-local state object, never mutate global state directly

## OCCT Object Lifecycle
- Every `new oc.Something()` MUST have a `.delete()` call
- Shapes returned from boolean ops must be stored via `storeShape()` or `.delete()`d
- TopExp_Explorer: always call `.delete()` after iteration (even on early return)
- Constructor overloads: `oc.ClassName_N(...)` where N=1,2,3...
- OCCT triangulation indices are 1-based, JavaScript arrays are 0-based

## State Rules
- State is the single source of truth
- Bodies in state hold `occtShapeRef` (string ID), never the live OCCT object
- Renderers subscribe to state, never modify it
- Use `updateBody()` to change body properties, never mutate directly

## Preview Pattern
- Drag interaction shows THREE.js preview (fast, no OCCT)
- OCCT shape created only on commit (click or Enter)
- Exception: fillet preview runs real OCCT (debounced) because fillet geometry can't be approximated with primitives
