/**
 * Fillet Handle Render — Arrow widget at edge midpoint for fillet/chamfer interaction.
 * Points outward along the bisector of adjacent face normals.
 * Invisible fatter cylinder for hit-testing. Camera-distance scaling.
 */

import * as THREE from 'three';
import { getCamera } from '../input/camera.js';

let scene;
let handleGroup = null;
let visualGroup = null;
let hitMesh = null;
let material = null;

const COLOR_NORMAL = 0x818cf8;   // Indigo
const COLOR_BRIGHT = 0xa5b4fc;   // Lighter indigo on hover

const SHAFT_RADIUS = 0.015;
const SHAFT_LENGTH = 0.6;
const TIP_RADIUS = 0.05;
const TIP_LENGTH = 0.12;
const HIT_RADIUS = 0.07;
const HIT_LENGTH = 0.8;
const SCALE_FACTOR = 0.08;

let _direction = new THREE.Vector3(0, 1, 0); // stored direction

/**
 * Initialize handle and add to scene (hidden).
 */
export function initFilletHandle(sceneRef) {
    scene = sceneRef;

    handleGroup = new THREE.Group();
    handleGroup.name = 'filletHandle';
    handleGroup.visible = false;
    handleGroup.renderOrder = 1100;
    scene.add(handleGroup);

    // Visual: shaft + cone tip, built along +Y
    visualGroup = new THREE.Group();
    visualGroup.name = 'filletHandle-visual';

    material = new THREE.MeshBasicMaterial({
        color: COLOR_NORMAL,
        depthTest: false,
        transparent: true,
        opacity: 0.85
    });

    const shaftGeom = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 8);
    shaftGeom.translate(0, SHAFT_LENGTH / 2, 0);
    const shaft = new THREE.Mesh(shaftGeom, material);
    shaft.renderOrder = 1100;

    const tipGeom = new THREE.ConeGeometry(TIP_RADIUS, TIP_LENGTH, 12);
    tipGeom.translate(0, SHAFT_LENGTH + TIP_LENGTH / 2, 0);
    const tipMat = material.clone();
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.renderOrder = 1100;

    visualGroup.add(shaft);
    visualGroup.add(tip);
    handleGroup.add(visualGroup);

    // Hit-test mesh: invisible fatter cylinder
    const hitGeom = new THREE.CylinderGeometry(HIT_RADIUS, HIT_RADIUS, HIT_LENGTH, 8);
    hitGeom.translate(0, HIT_LENGTH / 2, 0);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    hitMesh = new THREE.Mesh(hitGeom, hitMat);
    hitMesh.userData.isFilletHandle = true;
    hitMesh.renderOrder = 1100;
    handleGroup.add(hitMesh);
}

/**
 * Show handle at a world position, oriented along direction.
 * @param {{x:number, y:number, z:number}} position - Edge midpoint
 * @param {{x:number, y:number, z:number}} direction - Outward direction (normalized)
 */
export function showFilletHandle(position, direction) {
    if (!handleGroup) return;

    handleGroup.position.set(position.x, position.y, position.z);

    // Store direction
    _direction.set(direction.x, direction.y, direction.z).normalize();

    // Rotate group so local +Y aligns with direction
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(up, _direction);

    visualGroup.quaternion.copy(quat);
    hitMesh.quaternion.copy(quat);

    updateFilletHandleScale();
    handleGroup.visible = true;
}

/**
 * Hide the handle.
 */
export function hideFilletHandle() {
    if (!handleGroup) return;
    handleGroup.visible = false;
}

/**
 * Is the handle currently visible?
 */
export function isFilletHandleVisible() {
    return handleGroup ? handleGroup.visible : false;
}

/**
 * Get the invisible hit-test mesh for raycasting.
 */
export function getFilletHandleHitMesh() {
    return hitMesh;
}

/**
 * Highlight (brighten) or reset the handle color.
 * @param {boolean} on - true to brighten, false to reset
 */
export function highlightFilletHandle(on) {
    if (!visualGroup) return;
    const color = on ? COLOR_BRIGHT : COLOR_NORMAL;
    const opacity = on ? 1.0 : 0.85;
    visualGroup.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.color.set(color);
            child.material.opacity = opacity;
        }
    });
}

/**
 * Update scale based on camera distance (call each frame).
 */
export function updateFilletHandleScale() {
    if (!handleGroup || !handleGroup.visible) return;
    const camera = getCamera();
    const dist = camera.position.distanceTo(handleGroup.position);
    const s = dist * SCALE_FACTOR;
    handleGroup.scale.set(s, s, s);
}

/**
 * Get the stored outward direction vector.
 */
export function getFilletHandleDirection() {
    return _direction.clone();
}

/**
 * Get the world position of the handle.
 */
export function getFilletHandlePosition() {
    if (!handleGroup) return null;
    return handleGroup.position.clone();
}
