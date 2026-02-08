/**
 * Gizmo Render — 3D translation gizmo with colored axis arrows.
 * X = red, Y = green, Z = blue.
 * Invisible fatter cylinders for hit-testing. Camera-distance scaling.
 */

import * as THREE from 'three';
import { getCamera } from '../input/camera.js';

let scene;
let gizmoGroup = null;

// Per-axis data: { visual: Group, hitMesh: Mesh, color, bright }
const axes = {};

const AXIS_DEFS = {
    x: { dir: new THREE.Vector3(1, 0, 0), color: 0xcc3333, bright: 0xff5555 },
    y: { dir: new THREE.Vector3(0, 1, 0), color: 0x33cc33, bright: 0x55ff55 },
    z: { dir: new THREE.Vector3(0, 0, 1), color: 0x3333cc, bright: 0x5555ff }
};

const SHAFT_RADIUS = 0.02;
const SHAFT_LENGTH = 1.2;
const TIP_RADIUS = 0.06;
const TIP_LENGTH = 0.15;
const HIT_RADIUS = 0.08;
const HIT_LENGTH = 1.4;
const SCALE_FACTOR = 0.08;

/**
 * Initialize gizmo and add to scene.
 */
export function initGizmo(sceneRef) {
    scene = sceneRef;

    gizmoGroup = new THREE.Group();
    gizmoGroup.name = 'translationGizmo';
    gizmoGroup.visible = false;
    gizmoGroup.renderOrder = 1100;
    scene.add(gizmoGroup);

    for (const [axis, def] of Object.entries(AXIS_DEFS)) {
        const axisData = createAxisArrow(axis, def);
        axes[axis] = axisData;
        gizmoGroup.add(axisData.visual);
        gizmoGroup.add(axisData.hitMesh);
    }
}

/**
 * Create one axis arrow (visual shaft + cone tip + invisible hit cylinder).
 *
 * Geometry offsets are baked into the BufferGeometry via .translate() so that
 * when the parent object is rotated from +Y to +X or +Z, the offset rotates
 * with it.  Using .position.y would leave the offset in parent-space and
 * produce arrows that all float above the gizmo center.
 */
function createAxisArrow(axis, def) {
    const visual = new THREE.Group();
    visual.name = `gizmo-visual-${axis}`;

    const mat = new THREE.MeshBasicMaterial({
        color: def.color,
        depthTest: false,
        transparent: true,
        opacity: 0.85
    });

    // Shaft: CylinderGeometry is centered at origin along Y.
    // Translate geometry so base sits at origin and tip at +SHAFT_LENGTH.
    const shaftGeom = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 8);
    shaftGeom.translate(0, SHAFT_LENGTH / 2, 0);
    const shaft = new THREE.Mesh(shaftGeom, mat);
    shaft.renderOrder = 1100;

    // Tip: cone sitting on top of the shaft
    const tipGeom = new THREE.ConeGeometry(TIP_RADIUS, TIP_LENGTH, 12);
    tipGeom.translate(0, SHAFT_LENGTH + TIP_LENGTH / 2, 0);
    const tip = new THREE.Mesh(tipGeom, mat.clone());
    tip.renderOrder = 1100;

    visual.add(shaft);
    visual.add(tip);

    // Rotate visual group so local +Y maps to the target axis direction
    applyAxisRotation(visual, def.dir);

    // Hit-test mesh: invisible fatter cylinder covering the whole arrow
    const hitGeom = new THREE.CylinderGeometry(HIT_RADIUS, HIT_RADIUS, HIT_LENGTH, 8);
    hitGeom.translate(0, HIT_LENGTH / 2, 0);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeom, hitMat);
    hitMesh.userData.axis = axis;
    hitMesh.userData.isGizmoHit = true;
    hitMesh.renderOrder = 1100;

    // Same rotation as the visual
    applyAxisRotation(hitMesh, def.dir);

    return { visual, hitMesh, color: def.color, bright: def.bright, material: mat };
}

/**
 * Rotate an object so its local +Y points along worldDir.
 */
function applyAxisRotation(obj, worldDir) {
    if (worldDir.y === 1) return; // Already along Y
    if (worldDir.x === 1) {
        obj.rotation.z = -Math.PI / 2;
    } else if (worldDir.z === 1) {
        obj.rotation.x = Math.PI / 2;
    }
}

/**
 * Show gizmo at a world position.
 */
export function showGizmo(worldPosition) {
    if (!gizmoGroup) return;
    gizmoGroup.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
    updateGizmoScale();
    gizmoGroup.visible = true;
}

/**
 * Hide gizmo.
 */
export function hideGizmo() {
    if (!gizmoGroup) return;
    gizmoGroup.visible = false;
}

/**
 * Is the gizmo currently visible?
 */
export function isGizmoVisible() {
    return gizmoGroup ? gizmoGroup.visible : false;
}

/**
 * Update gizmo scale based on camera distance (call each frame).
 */
export function updateGizmoScale() {
    if (!gizmoGroup || !gizmoGroup.visible) return;
    const camera = getCamera();
    const dist = camera.position.distanceTo(gizmoGroup.position);
    const s = dist * SCALE_FACTOR;
    gizmoGroup.scale.set(s, s, s);
}

/**
 * Get the array of invisible hit-test meshes for raycasting.
 */
export function getGizmoHitMeshes() {
    if (!gizmoGroup) return [];
    return Object.values(axes).map(a => a.hitMesh);
}

/**
 * Highlight one axis (brighten), reset others. Pass null to reset all.
 */
export function highlightGizmoAxis(axis) {
    for (const [key, data] of Object.entries(axes)) {
        const color = key === axis ? data.bright : data.color;
        const opacity = key === axis ? 1.0 : 0.85;
        data.visual.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.color.set(color);
                child.material.opacity = opacity;
            }
        });
    }
}

/**
 * Get the world position of the gizmo center.
 */
export function getGizmoPosition() {
    if (!gizmoGroup) return null;
    return gizmoGroup.position.clone();
}
