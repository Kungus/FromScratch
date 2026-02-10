# Coplanar Face Merging/Splitting in OCCT Boolean Operations

## The Problem

When `BRepAlgoAPI_Fuse` combines two shapes that share a coplanar boundary (e.g., box + protrusion on top face), the result keeps the coplanar faces as **separate topological entities** with "seam edges" between them. Example: fusing a 4x4x4 box with a 2x2x2 protrusion on top produces 10 faces instead of the expected visual 6, because the top face of the box is split into an L-shaped region + the protrusion's base boundary.

## Default Behavior: NO Automatic Merging

`BRepAlgoAPI_Fuse` (and `_Cut`, `_Common`) do NOT merge same-domain faces by default. The raw boolean result preserves all intersection edges and face splits. This is by design -- the algorithm reports exactly what the boolean intersection produced.

## Solution 1: SimplifyResult() on the Boolean Operator

```javascript
// After Build (or using the convenience constructor that auto-builds):
const fuse = new oc.BRepAlgoAPI_Fuse_3(shapeA, shapeB);
fuse.SimplifyResult(true, true, 1e-6);  // unifyEdges, unifyFaces, angularTol
const result = fuse.Shape();
fuse.delete();
```

- `SimplifyResult` is inherited from `BRepAlgoAPI_BuilderAlgo`
- Must be called AFTER Build() completes (the _3 convenience constructors auto-build)
- Internally uses `ShapeUpgrade_UnifySameDomain`
- Merges the operation's history with the simplification history

## Solution 2: ShapeUpgrade_UnifySameDomain (Standalone Post-Processor)

```javascript
// Apply to any shape, not just boolean results
const unifier = new oc.ShapeUpgrade_UnifySameDomain_2(shape, false, true, false);
// params: shape, unifyEdges, unifyFaces, concatBSplines
unifier.Build();
const simplified = unifier.Shape();
unifier.delete();
```

- Lives in TKShHealing (loaded by occtInit.js)
- Can be applied to any shape, not just boolean results
- WARNING: unifyEdges=true + unifyFaces=true can produce INVALID solids on curved geometry
- Safe pattern: `(shape, false, true, false)` -- unify faces only

## When You WANT Coplanar Faces Kept Separate

For the FromScratch push/pull workflow, you may actually WANT to keep faces separate after fuse:
- The user draws a rectangle on the top face and extrudes it
- After fuse, the top face is split into the original area minus the protrusion footprint
- This split is USEFUL: the user can later select just the protrusion's top face to extrude further
- The L-shaped remaining face can also be independently selected

If you merge with SimplifyResult, the front face of the box + front face of protrusion become ONE face.
This makes it impossible to select just the protrusion's front face for further operations.

## Splitting Merged Faces (Reverse Direction)

If faces have been merged and you need to split them:

### Option A: BRepFeat_SplitShape (TKFeat module)
- Splits a face along a wire/edge
- Requires the edge to have a 2D pcurve on the face's surface
- Edge must go from boundary to boundary (or be closed)
- TKFeat.wasm EXISTS in the build but is NOT loaded by occtInit.js
- Would need to add 'module.TKFeat.wasm' to REQUIRED_LIBS in occtInit.js

### Option B: BRepAlgoAPI_Splitter
- General-purpose shape splitter (objects split by tools)
- In TKBO.wasm (already loaded)
- More heavyweight than SplitShape but more general

### Option C: Boolean with a thin planar shape
- Create a zero-thickness face at the split boundary
- Use BRepAlgoAPI_Section to compute intersection
- Topology will naturally split at the intersection

## Recommendation for FromScratch

**Do NOT call SimplifyResult by default.** The natural face splits from boolean operations are valuable for the push/pull CAD workflow. Users expect to be able to select individual result faces.

If a specific operation needs merged faces (e.g., export to STEP where cleaner topology is desired), apply `ShapeUpgrade_UnifySameDomain` as a post-processing step on export, not on the working model.

## Sources
- https://dev.opencascade.org/content/fusing-and-coplanar-feces
- https://dev.opencascade.org/content/fuse-not-merging-shapes-faces
- https://dev.opencascade.org/content/remove-seams-after-fuse
- https://dev.opencascade.org/doc/refman/html/class_b_rep_algo_a_p_i___builder_algo.html
- https://ocjs.org/reference-docs/classes/ShapeUpgrade_UnifySameDomain_1
- https://ocjs.org/reference-docs/classes/BRepAlgoAPI_Fuse_4
