// scene.js — Three.js scene, camera, renderer, lighting

import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 15, 50);

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.6, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Ambient light — soft fill
const ambient = new THREE.AmbientLight(0x404060, 0.4);
scene.add(ambient);

// Hemisphere light — sky/ground
const hemi = new THREE.HemisphereLight(0x8888cc, 0x444422, 0.5);
scene.add(hemi);

// Player torch — point light that follows the camera
export const torch = new THREE.PointLight(0xffeedd, 1.2, 20, 2);
torch.castShadow = true;
torch.shadow.mapSize.set(512, 512);
camera.add(torch);
scene.add(camera);

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
