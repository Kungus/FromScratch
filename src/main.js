/**
 * FromScratch - Main Entry Point
 * Bootstraps the application.
 */

import { initScene, render } from './render/sceneSetup.js';
import { initCamera, getCamera } from './input/camera.js';
import { initGrid } from './render/gridRender.js';
import { getState, setGridSize, setSnapSize, setActiveTool, subscribe, addBody, removeBody, getBodyById, updateBody, getBodySelection, getBodyHover, getBodyMultiSelection, getActiveSketchPlane, clearBodySelection, setShapeRemovalFn, addSketch, removeSketch, updateSketch, getSketches, getBodies } from './core/state.js';
import { removeShape } from './core/occtShapeStore.js';
import { initUndoRedo, pushUndoSnapshot, undo, redo } from './core/undoRedo.js';
import { initViewCube, updateViewCube, showViewLabel } from './ui/viewCube.js';
import { initPointer, onPointer, getPointerState } from './input/pointer.js';
import { initSnapRender, updateSnapIndicator, updateSnapIndicator3D, hideSnapIndicator } from './render/snapRender.js';
import { initSketchRender, updatePreviewRect, updatePreviewCircle, addRectangle, addCircle, getSketchElements, setSelectedElement, setHoveredElement, moveElement, removeSketchElement, syncSketchesFromState } from './render/sketchRender.js';
import { initBodyRender, updateBodyPreview, addBodyMesh, removeBodyMesh, replaceBodyMesh, getBodyGroup } from './render/bodyRender.js';
import { initBodyRaycast, setBodyGroup } from './input/bodyRaycast.js';
import { initSelectionHighlight, updateHoverHighlight, updateSelectionHighlight, updateMultiSelectionHighlight } from './render/selectionHighlight.js';
import {
    activateBodySelectTool,
    deactivateBodySelectTool,
    setBodySelectCallbacks
} from './tools/bodySelectTool.js';
import {
    activateSelectTool,
    deactivateSelectTool,
    setSelectionChangeCallback,
    setMoveCallback,
    setGetElementsFunction,
    setDuplicateCallback,
    setHoverCallback,
    setDragStartCallback
} from './tools/selectTool.js';
import { initDimensionRender, showRectDimensions, showDimensions, hideDimensions } from './render/dimensionRender.js';
import { initDimensionInput, showDimensionInput, hideInput } from './ui/dimensionInput.js';
import {
    activateRectangleTool,
    deactivateRectangleTool,
    setPreviewCallback,
    setCommitCallback,
    setDimensionInputCallback,
    commitWithDimensions,
    cancelDrawing
} from './tools/rectangleTool.js';
import {
    activateCircleTool,
    deactivateCircleTool,
    setCirclePreviewCallback,
    setCircleCommitCallback,
    setCircleDimensionCallback,
    commitCircleWithRadius,
    cancelCircleDrawing
} from './tools/circleTool.js';
import {
    activateExtrudeTool,
    deactivateExtrudeTool,
    setExtrudePreviewCallback,
    setExtrudeCommitCallback,
    setExtrudeDimensionCallback,
    setGetSketchElementsFunction,
    commitWithHeight,
    cancelExtrusion
} from './tools/extrudeTool.js';
import { initFaceGrid } from './render/faceGridRender.js';
import {
    enterSketchOnFace,
    exitSketchOnFace,
    isInSketchOnFaceMode,
    setSketchOnFaceCallbacks
} from './tools/sketchOnFaceTool.js';
import { initContextMenu, showContextMenu } from './ui/contextMenu.js';
import { getDrawingCoords } from './input/planeRaycast.js';
import { localToWorld } from './core/sketchPlane.js';
import { snap } from './core/snap.js';
import { detectSubElement } from './core/bodyHitTest.js';

// Extracted modules
import { applyFillet, applyChamfer, applyFaceExtrusion, applyBoolean, applyMoveBody, applyTranslateSubElement } from './tools/bodyOperations.js';
import { initFaceExtrudeMode, startFaceExtrudeMode, endFaceExtrudeMode, isFaceExtrudeModeActive } from './tools/faceExtrudeMode.js';
import { initFilletMode, startFilletMode, endFilletMode, isFilletModeActive } from './tools/filletMode.js';
import { initChamferMode, startChamferMode, endChamferMode, isChamferModeActive } from './tools/chamferMode.js';
import { initBooleanMode, startBooleanMode, endBooleanMode, isBooleanModeActive } from './tools/booleanMode.js';
import { initMoveBodyMode, startMoveBodyMode, endMoveBodyMode, isMoveBodyModeActive } from './tools/moveBodyMode.js';
import { initTranslateSubElementMode, startTranslateSubElementMode, endTranslateSubElementMode, isTranslateSubElementModeActive } from './tools/translateSubElementMode.js';
import { initContextMenuBuilder, buildContextMenuItems } from './ui/contextMenuBuilder.js';

let isRunning = false;

/**
 * Initialize the application
 * @param {HTMLElement} container - DOM element to render into
 * @param {HTMLElement} viewCubeContainer - DOM element for view cube
 */
export function init(container, viewCubeContainer) {
    console.log('FromScratch initializing...');

    // Wire up OCCT shape cleanup for state.removeBody()
    setShapeRemovalFn(removeShape);

    // Initialize extracted modules
    initFaceExtrudeMode({ applyFaceExtrusion });
    initFilletMode({ applyFillet });
    initChamferMode({ applyChamfer });
    initBooleanMode({ applyBoolean });
    initMoveBodyMode({ applyMoveBody });
    initTranslateSubElementMode({ applyTranslateSubElement });
    initContextMenuBuilder({ startFaceExtrudeMode, startFilletMode, startChamferMode, startBooleanMode, startMoveBodyMode, startTranslateSubElementMode });

    // Initialize undo/redo system
    initUndoRedo({
        onRestore: () => {
            // Cancel any active interactive mode
            if (isFaceExtrudeModeActive()) endFaceExtrudeMode();
            if (isFilletModeActive()) endFilletMode();
            if (isChamferModeActive()) endChamferMode();
            if (isBooleanModeActive()) endBooleanMode();
            if (isMoveBodyModeActive()) endMoveBodyMode();
            if (isTranslateSubElementModeActive()) endTranslateSubElementMode();
            if (isInSketchOnFaceMode()) exitSketchOnFace();

            // Rebuild all body meshes from state
            const bodyGrp = getBodyGroup();
            while (bodyGrp.children.length > 0) {
                const child = bodyGrp.children[0];
                bodyGrp.remove(child);
                child.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                });
            }
            for (const body of getBodies()) {
                addBodyMesh(body);
            }

            // Rebuild all sketch visuals from state
            syncSketchesFromState(getSketches());

            // Clear highlights
            updateSelectionHighlight(getBodySelection(), getBodyGroup());
            updateMultiSelectionHighlight([]);
            updateHoverHighlight({ type: null, bodyId: null, subElementIndex: null, subElementData: null }, getBodyGroup());

            hideDimensions();
            hideInput();
        }
    });

    // Initialize scene
    const { scene, renderer } = initScene(container);

    // Initialize camera
    const aspect = container.clientWidth / container.clientHeight;
    const camera = initCamera(container, aspect);

    // Initialize grid
    initGrid(scene);

    // Initialize view cube
    if (viewCubeContainer) {
        initViewCube(viewCubeContainer, camera);
    }

    // Initialize pointer system
    initPointer(container);

    // Initialize snap visualization
    initSnapRender(scene);

    // Initialize sketch renderer
    initSketchRender(scene);

    // Initialize body renderer
    initBodyRender(scene);

    // Initialize body raycasting (must be after bodyRender)
    initBodyRaycast();
    setBodyGroup(getBodyGroup());

    // Initialize selection highlight
    initSelectionHighlight(scene);

    // Initialize face grid (for sketch-on-face mode)
    initFaceGrid(scene);

    // Initialize dimension renderer
    const appContainer = document.getElementById('app');
    initDimensionRender(appContainer);

    // Initialize dimension input (type-to-specify)
    initDimensionInput(appContainer);

    // Setup rectangle tool callbacks
    setPreviewCallback((rect) => {
        updatePreviewRect(rect);
        if (rect) {
            showRectDimensions(rect);
        } else {
            hideDimensions();
        }
    });

    setCommitCallback((rect) => {
        const sketch = { id: 'rect_' + Date.now(), type: 'rectangle', ...rect };
        pushUndoSnapshot();
        addSketch(sketch);
        addRectangle(sketch);
        hideDimensions();
        hideInput();
    });

    // Setup select tool callbacks
    setGetElementsFunction(() => getSketches());
    setSelectionChangeCallback((event) => {
        if (event.action === 'select') {
            setSelectedElement(event.id);
        } else if (event.action === 'deselect') {
            setSelectedElement(null);
        } else if (event.action === 'delete') {
            pushUndoSnapshot();
            removeSketch(event.id);
            removeSketchElement(event.id);
            setSelectedElement(null);
        }
    });
    setDragStartCallback(() => {
        pushUndoSnapshot();
    });
    setMoveCallback((event) => {
        const sketch = getSketches().find(s => s.id === event.id);
        if (sketch) {
            if (sketch.type === 'rectangle') {
                const w = sketch.x2 - sketch.x1;
                const h = sketch.z2 - sketch.z1;
                updateSketch(event.id, { x1: event.x1, z1: event.z1, x2: event.x1 + w, z2: event.z1 + h });
            } else if (sketch.type === 'circle') {
                updateSketch(event.id, { centerX: event.x1, centerZ: event.z1 });
            }
        }
        moveElement(event.id, event.x1, event.z1);
    });

    setHoverCallback((hoveredId) => {
        setHoveredElement(hoveredId);
    });

    setDuplicateCallback((data) => {
        pushUndoSnapshot();
        const offset = data.offsetX || 0.5;

        if (data.type === 'rectangle') {
            const sketch = {
                id: 'rect_' + Date.now(),
                type: 'rectangle',
                x1: data.x1 + offset,
                z1: data.z1 + offset,
                x2: data.x2 + offset,
                z2: data.z2 + offset,
                width: data.width,
                height: data.height
            };
            addSketch(sketch);
            addRectangle(sketch);
            setSelectedElement(sketch.id);
        } else if (data.type === 'circle') {
            const sketch = {
                id: 'circle_' + Date.now(),
                type: 'circle',
                centerX: data.centerX + offset,
                centerZ: data.centerZ + offset,
                radius: data.radius
            };
            addSketch(sketch);
            addCircle(sketch);
            setSelectedElement(sketch.id);
        }
    });

    // Handle dimension input request for rectangle (user pressed D while drawing)
    setDimensionInputCallback((info) => {
        const w = info.currentWidth > 0.01 ? info.currentWidth.toFixed(2).replace(/\.?0+$/, '') : '';
        const h = info.currentHeight > 0.01 ? info.currentHeight.toFixed(2).replace(/\.?0+$/, '') : '';
        const initialValue = w && h ? `${w} x ${h}` : '';

        showDimensionInput(
            (dimensions) => {
                commitWithDimensions(dimensions.width, dimensions.height);
                hideDimensions();
            },
            () => {
                cancelDrawing();
                hideDimensions();
            },
            initialValue
        );
    });

    // Setup circle tool callbacks
    setCirclePreviewCallback((circle) => {
        updatePreviewCircle(circle);
        if (circle) {
            if (circle.plane) {
                const wp = localToWorld(circle.centerX, circle.centerZ + circle.radius + 0.3, circle.plane);
                showDimensions(circle.radius * 2, null, wp.x, wp.z, wp.y);
            } else {
                showDimensions(circle.radius * 2, null, circle.centerX, circle.centerZ + circle.radius + 0.3);
            }
        } else {
            hideDimensions();
        }
    });

    setCircleCommitCallback((circle) => {
        const sketch = { id: 'circle_' + Date.now(), type: 'circle', ...circle };
        pushUndoSnapshot();
        addSketch(sketch);
        addCircle(sketch);
        hideDimensions();
        hideInput();
    });

    // Handle dimension input for circle (user pressed D while drawing)
    setCircleDimensionCallback((info) => {
        const r = info.currentRadius > 0.01 ? info.currentRadius.toFixed(2).replace(/\.?0+$/, '') : '';

        showDimensionInput(
            (dimensions) => {
                // For circle, use width as radius (or diameter/2)
                const radius = dimensions.height ? dimensions.width : dimensions.width;
                commitCircleWithRadius(radius);
                hideDimensions();
            },
            () => {
                cancelCircleDrawing();
                hideDimensions();
            },
            r
        );
    });

    // Setup extrude tool callbacks
    setGetSketchElementsFunction(getSketchElements);

    setExtrudePreviewCallback((data) => {
        updateBodyPreview(data);
        if (data) {
            if (data.plane && data.isFaceExtrusion) {
                // Face extrusion: position label at sketch center offset along normal
                let centerU, centerV;
                if (data.sourceType === 'rectangle') {
                    centerU = (data.base.x1 + data.base.x2) / 2;
                    centerV = (data.base.z1 + data.base.z2) / 2;
                } else {
                    centerU = data.base.centerX;
                    centerV = data.base.centerZ;
                }
                const wp = localToWorld(centerU, centerV, data.plane);
                const n = data.plane.normal;
                const labelX = wp.x + n.x * data.height / 2;
                const labelY = wp.y + n.y * data.height / 2;
                const labelZ = wp.z + n.z * data.height / 2;
                showDimensions(Math.abs(data.height), null, labelX, labelZ, labelY);
            } else {
                // Ground plane: existing positioning
                let posX, posZ;
                if (data.sourceType === 'rectangle') {
                    posX = (data.base.x1 + data.base.x2) / 2;
                    posZ = data.base.z2 + 0.3;
                } else {
                    posX = data.base.centerX;
                    posZ = data.base.centerZ + data.base.radius + 0.3;
                }
                showDimensions(data.height, null, posX, posZ);
            }
        } else {
            hideDimensions();
        }
    });

    setExtrudeCommitCallback((bodyData) => {
        pushUndoSnapshot();
        if (bodyData.isFaceExtrusion && bodyData.parentBodyId) {
            // Face extrusion: fused shape replaces the parent body
            const parentBody = getBodyById(bodyData.parentBodyId);
            if (parentBody) {
                const oldShapeRef = parentBody.occtShapeRef;
                // Update parent body with new fused shape data
                updateBody(bodyData.parentBodyId, {
                    occtShapeRef: bodyData.occtShapeRef,
                    tessellation: bodyData.tessellation
                });
                // Free old OCCT shape memory
                if (oldShapeRef) {
                    removeShape(oldShapeRef);
                }
                // Replace the parent body's mesh with the fused tessellation
                const updatedBody = getBodyById(bodyData.parentBodyId);
                replaceBodyMesh(bodyData.parentBodyId, bodyData.tessellation, updatedBody);

                console.log(`Face extrusion: fused onto parent body ${bodyData.parentBodyId}`);
            } else {
                // Parent gone — add as standalone body
                addBody(bodyData);
                addBodyMesh(bodyData);
            }
        } else {
            // Ground plane extrusion: add new body
            addBody(bodyData);
            addBodyMesh(bodyData);
        }
        // Remove the source sketch (state + render)
        removeSketch(bodyData.sourceId);
        removeSketchElement(bodyData.sourceId);
        // Exit sketch-on-face mode if active (removes face grid)
        if (isInSketchOnFaceMode()) {
            exitSketchOnFace();
        }
        // Clear selection and dimensions
        setSelectedElement(null);
        clearBodySelection();
        hideDimensions();
        hideInput();
    });

    // Handle dimension input for extrude (user pressed D while extruding)
    setExtrudeDimensionCallback((info) => {
        const h = info.currentHeight > 0.01 ? info.currentHeight.toFixed(2).replace(/\.?0+$/, '') : '';

        showDimensionInput(
            (dimensions) => {
                // Use the width as height (single value input)
                commitWithHeight(dimensions.width || dimensions.height || parseFloat(h));
                hideDimensions();
            },
            () => {
                cancelExtrusion();
                hideDimensions();
            },
            h
        );
    });

    // Setup body select tool callbacks
    setBodySelectCallbacks({
        onSelectionChange: (event) => {
            if (event.action === 'delete' && event.bodyId) {
                pushUndoSnapshot();
                removeBodyMesh(event.bodyId);
                removeBody(event.bodyId);
            }
            // Update selection highlight
            updateSelectionHighlight(getBodySelection(), getBodyGroup());
            // Update multi-selection highlights (Shift+click edges)
            updateMultiSelectionHighlight(getBodyMultiSelection());
        },
        onHoverChange: (event) => {
            // Update hover highlight
            updateHoverHighlight(getBodyHover(), getBodyGroup());
        },
        getBodyGroup: getBodyGroup
    });

    // Setup sketch-on-face mode callbacks
    setSketchOnFaceCallbacks({
        onEnter: ({ bodyId, plane }) => {
            console.log('Sketch-on-face mode entered for body:', bodyId);
        },
        onExit: () => {
            console.log('Sketch-on-face mode exited');
        }
    });

    // Initialize context menu
    initContextMenu(appContainer);

    // Right-click context menu
    container.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        // Always do a fresh sub-element detection from the current pointer hit,
        // since bodyHover may be stale if bodySelectTool is inactive (e.g. on rect/circle tool)
        const pState = getPointerState();
        let target = { type: null, bodyId: null, subElementIndex: null, subElementData: null };

        if (pState.bodyHit) {
            const rect = container.getBoundingClientRect();
            const sub = detectSubElement(
                pState.bodyHit,
                { x: e.clientX - rect.left, y: e.clientY - rect.top },
                getCamera(),
                rect
            );
            if (sub.type) {
                target = {
                    type: sub.type,
                    bodyId: pState.bodyHit.bodyId,
                    subElementIndex: sub.index,
                    subElementData: sub.data
                };
            } else {
                target = { type: 'body', bodyId: pState.bodyHit.bodyId, subElementIndex: null, subElementData: null };
            }
        }

        const items = buildContextMenuItems(target, container);

        if (items.length > 0) {
            showContextMenu(e.clientX, e.clientY, items);
        }
    });

    // Update snap indicator on pointer move
    onPointer('move', (state) => {
        const plane = getActiveSketchPlane();
        if (plane) {
            const coords = getDrawingCoords(state);
            if (coords) {
                const snapped = snap(coords.u, coords.v);
                const wp = localToWorld(snapped.x, snapped.z, plane);
                updateSnapIndicator3D(wp.x, wp.y, wp.z, state.isOver);
            } else {
                hideSnapIndicator();
            }
        } else {
            updateSnapIndicator(state.worldX, state.worldZ, state.isOver);
        }
    });

    // Hide snap indicator when pointer leaves
    container.addEventListener('mouseleave', hideSnapIndicator);

    // Listen for view changes to show label
    window.addEventListener('fromscratch:viewchange', (e) => {
        showViewLabel(e.detail.viewName);
    });

    // Log state changes (for debugging)
    subscribe((state, changedPath) => {
        console.log(`State changed: ${changedPath}`, state);
    });

    // Start render loop
    isRunning = true;
    animate();

    console.log('FromScratch ready!');
    console.log('Controls:');
    console.log('  - Left drag: Orbit');
    console.log('  - Right drag: Pan');
    console.log('  - Scroll: Zoom');
    console.log('  - Touch: One finger orbit, pinch zoom');

    return {
        scene,
        camera,
        renderer
    };
}

/**
 * Animation loop
 */
function animate() {
    if (!isRunning) return;

    requestAnimationFrame(animate);
    render(getCamera());

    // Update view cube to match camera orientation
    updateViewCube();
}

/**
 * Stop the application
 */
export function stop() {
    isRunning = false;
}

// Export state controls for UI
export { setGridSize, setSnapSize, getState, setActiveTool };

// Export tool controls
export { activateRectangleTool, deactivateRectangleTool };
export { activateCircleTool, deactivateCircleTool };
export { activateSelectTool, deactivateSelectTool };
export { activateExtrudeTool, deactivateExtrudeTool };
export { activateBodySelectTool, deactivateBodySelectTool };
export { exitSketchOnFace, isInSketchOnFaceMode };
export { undo, redo };

export default { init, stop };
