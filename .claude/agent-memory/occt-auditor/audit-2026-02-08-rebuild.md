# OCCT Audit — rebuildShapeWithMovedVertices Refactor (2026-02-08)

## Scope
Focused audit of rewritten `rebuildShapeWithMovedVertices()` and new helper functions:
- `_sewFacesIntoSolid()` — Sewing + healing + validation
- `_validateShape()` — BRepCheck validation
- `_buildPreservingOriginals()` — Fallback for curved faces

## Critical Issues Found

### 1. TopoDS_Shell leak in BRep_Builder fallback
**File:** `occtEngine.js:938-944`
**Pattern:**
```javascript
const shell = new oc.TopoDS_Shell();
builder.MakeShell(shell);
// ... add faces ...
builder.delete();
sewedShape = shell;  // ❌ Wrapper never deleted
```
**Fix:** The `TopoDS_Shell` wrapper object must be deleted after use. Current code assigns it but never frees the wrapper.

---

### 2. TopoDS_Shell downcast leak in compound extraction
**File:** `occtEngine.js:988`
**Pattern:**
```javascript
shellForSolid = oc.TopoDS.Shell_1(shellExp.Current());  // Creates new wrapper
// ...
// Cleanup logic on 1019-1021 doesn't handle when shellForSolid === shapeToUse
```
**Fix:** Downcast wrappers must always be deleted, even when they reference the same geometry as another object.

---

## Warnings

### 1. Preserved face cleanup ambiguity
**File:** `occtEngine.js:1092`
Preserved faces (not rebuilt) are pushed to `newFaces` array, then all faces deleted on line 1194. Unclear if downcast wrappers for preserved faces should be deleted (they reference original geometry).

**Recommendation:** Clone preserved faces OR track which are rebuilt vs. preserved.

---

### 2. Complex conditional cleanup in shellForSolid
**File:** `occtEngine.js:1015-1021`
Multi-reference cleanup logic relies on `===` equality checks which don't distinguish wrappers from geometry. Fragile pattern.

**Recommendation:** Use explicit ownership flags instead of reference equality.

---

## API Patterns Confirmed Correct

### Message_ProgressRange_1 inline construction
**Pattern in `_sewFacesIntoSolid()` lines 923-925:**
```javascript
const progress = new oc.Message_ProgressRange_1();
sewing.Perform(progress);
progress.delete();  // ✓ Correct
```
This IS the correct pattern. `Perform()` does NOT take ownership.

### BRepCheck_Analyzer cleanup
**Pattern in `_validateShape()` lines 1043-1049:**
```javascript
const analyzer = new oc.BRepCheck_Analyzer_1(shape, true);
if (!analyzer.IsValid_1()) { /* ... */ }
analyzer.delete();  // ✓ Correct
```
Analyzer object properly deleted in try-catch.

---

## Good Patterns to Reference

1. **Extract-and-delete builders** — Used throughout `occtEngine.js` (e.g., lines 153-164)
2. **Explorer cleanup on all paths** — `getEdgeByIndex()` deletes explorer on early return AND normal exit
3. **Try-finally safety** — `bodyOperations.js` ensures edge array cleanup even on exceptions

---

## Overall Assessment

**rebuildShapeWithMovedVertices rewrite is MOSTLY CORRECT but has 2 critical leaks:**
1. BRep_Builder fallback path leaks `TopoDS_Shell` wrapper
2. Compound extraction path conditionally leaks downcast shell wrapper

**Once fixed, the rebuild pipeline will be leak-free.**

All other OCCT usage in `occtEngine.js`, `bodyOperations.js`, and tool files is correct.
No issues found in `gizmoMode.js` or `translateSubElementMode.js` (they don't create OCCT objects).
