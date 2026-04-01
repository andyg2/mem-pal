// controls.js — PointerLockControls + WASD movement + collision detection

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { camera, renderer } from './scene.js';

export const controls = new PointerLockControls(camera, renderer.domElement);
export const collidables = new Set();

const keys = {};
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const SPEED = 18;
const PLAYER_HEIGHT = 1.6;
const COLLISION_DIST = 0.6;

let palaceStarted = false;

// Key tracking
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup', e => { keys[e.code] = false; });

const blocker = document.getElementById('blocker');
const hud = document.getElementById('hud');

export function lockControls() {
  palaceStarted = true;
  controls.lock();
}

// Resume on click — use the canvas directly so pointer lock request is valid
renderer.domElement.addEventListener('click', () => {
  if (palaceStarted && !controls.isLocked) {
    controls.lock();
  }
});

// Also allow clicking the blocker overlay — hide it first so canvas gets the next click
if (blocker) {
  blocker.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (!palaceStarted) return;
    // Hide blocker so the canvas is exposed, then request lock
    blocker.style.display = 'none';
    // Small delay to let browser process the ESC cooldown
    setTimeout(() => controls.lock(), 100);
  });
}

controls.addEventListener('lock', () => {
  if (blocker) blocker.style.display = 'none';
  if (hud) hud.style.display = '';
  const resume = document.getElementById('resume-hint');
  if (resume) resume.style.display = 'none';
});

controls.addEventListener('unlock', () => {
  // Don't show blocker if a modal or command bar is open
  const modal = document.getElementById('memory-modal');
  if (modal && modal.style.display !== 'none') return;
  const cmdBar = document.getElementById('command-bar');
  if (cmdBar && cmdBar.style.display !== 'none') return;
  const memView = document.getElementById('memory-view');
  if (memView && memView.style.display !== 'none') return;
  if (blocker) blocker.style.display = '';
  if (hud) hud.style.display = 'none';
  if (palaceStarted) {
    const startBtns = document.getElementById('start-buttons');
    const resume = document.getElementById('resume-hint');
    if (startBtns) startBtns.style.display = 'none';
    if (resume) resume.style.display = '';
  }
});

/** Check collision in a given direction */
function checkCollision(pos, dir) {
  if (collidables.size === 0) return false;
  raycaster.set(pos, dir);
  raycaster.far = COLLISION_DIST;
  const hits = raycaster.intersectObjects([...collidables], false);
  return hits.length > 0;
}

/** Call every frame with delta seconds */
export function updateControls(delta) {
  if (!controls.isLocked) return;

  velocity.x -= velocity.x * 10 * delta;
  velocity.z -= velocity.z * 10 * delta;

  direction.z = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  direction.x = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  direction.normalize();

  const speed = keys['ShiftLeft'] ? SPEED * 3 : SPEED;
  if (direction.z !== 0) velocity.z += direction.z * speed * delta;
  if (direction.x !== 0) velocity.x += direction.x * speed * delta;

  const cam = camera;
  const pos = cam.position.clone();
  pos.y = PLAYER_HEIGHT;

  const forward = new THREE.Vector3();
  cam.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const moveForward = forward.clone().multiplyScalar(velocity.z * delta);
  const moveRight = right.clone().multiplyScalar(velocity.x * delta);

  if (moveForward.length() > 0.001) {
    const moveDir = moveForward.clone().normalize();
    if (!checkCollision(pos, moveDir)) {
      cam.position.add(moveForward);
    } else {
      velocity.z = 0;
    }
  }

  if (moveRight.length() > 0.001) {
    const moveDir = moveRight.clone().normalize();
    if (!checkCollision(pos, moveDir)) {
      cam.position.add(moveRight);
    } else {
      velocity.x = 0;
    }
  }

  cam.position.y = PLAYER_HEIGHT;
}
