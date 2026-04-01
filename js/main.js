// main.js — Bootstrap, render loop, event wiring, Claude integration

import * as THREE from 'three';
import { scene, camera, renderer } from './scene.js';
import { controls, updateControls, lockControls, collidables } from './controls.js';
import { Palace, Room, Structure, Locus, Doorway } from './palace.js';
import { buildRoom, buildStructureMesh, buildLocusMesh, rebuildPalace, getTargetedObject, getPlacementPosition, worldToRoom, resolveColor, removeMesh, roomGroups, meshIndex, buildFromGeneratedCode } from './builder.js';
import { parse } from './parser.js';
import * as voice from './voice.js';
import * as hud from './hud.js';
import * as storage from './storage.js';
import * as memoryUI from './memory-ui.js';

// ─── State ───
let palace = null;
const clock = new THREE.Clock();
let commandBarOpen = false;

// ─── Initialization ───
function init() {
  const btnContinue = document.getElementById('btn-continue');
  const btnNew = document.getElementById('btn-new');

  if (storage.hasSavedPalace()) {
    btnContinue.style.display = '';
    btnContinue.addEventListener('click', () => {
      palace = storage.loadPalace();
      startPalace();
    });
  }

  btnNew.addEventListener('click', () => {
    storage.deletePalace();
    palace = createDefaultPalace();
    startPalace();
  });

  setupCommandBar();
}

function createDefaultPalace() {
  const p = new Palace({ name: 'My Palace' });
  const room = new Room({ name: 'Grand Hall', position: { x: 0, y: 0, z: 0 } });
  p.rooms.push(room);
  p.playerSpawn = { x: 0, y: 1.6, z: 0 };
  return p;
}

function startPalace() {
  rebuildPalace(palace);
  camera.position.set(palace.playerSpawn.x, palace.playerSpawn.y, palace.playerSpawn.z);

  voice.init();
  voice.onTranscript(handleTranscript);
  memoryUI.init(palace, () => storage.autoSave(palace));

  const currentRoom = palace.getRoomAt(camera.position) || palace.rooms[0];
  if (currentRoom) hud.setRoomName(currentRoom.name);
  hud.setVoiceActive(false);

  lockControls();
  animate();
}

// ─── Command Bar ───
function setupCommandBar() {
  const input = document.getElementById('command-input');
  const bar = document.getElementById('command-bar');

  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Don't trigger WASD etc
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (text) handleCommand(text);
      closeCommandBar();
    } else if (e.key === 'Escape') {
      closeCommandBar();
    }
  });

  // Prevent pointer lock on command bar click
  bar.addEventListener('click', (e) => e.stopPropagation());
}

function openCommandBar() {
  const bar = document.getElementById('command-bar');
  const input = document.getElementById('command-input');
  commandBarOpen = true;
  bar.style.display = 'flex';
  controls.unlock();
  // Keep HUD visible
  document.getElementById('hud').style.display = '';
  setTimeout(() => input.focus(), 50);
}

function closeCommandBar() {
  const bar = document.getElementById('command-bar');
  const input = document.getElementById('command-input');
  commandBarOpen = false;
  bar.style.display = 'none';
  input.value = '';
  controls.lock();
}

// ─── Render loop ───
let pulseTime = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  updateControls(delta);
  checkBounds();
  updateRoomName();
  updateTargetInfo();
  animateLocusOrbs(delta);

  renderer.render(scene, camera);
}

/** If the player is outside all rooms, nudge them to the nearest room center */
function checkBounds() {
  const pos = camera.position;
  const room = palace.getRoomAt(pos);
  if (room) return; // inside a room, all good

  // Find the nearest room
  let nearest = null;
  let minDist = Infinity;
  for (const r of palace.rooms) {
    const dx = pos.x - r.position.x;
    const dz = pos.z - r.position.z;
    const dist = dx * dx + dz * dz;
    if (dist < minDist) {
      minDist = dist;
      nearest = r;
    }
  }

  if (nearest) {
    // Clamp player inside the nearest room bounds (with small margin)
    const hw = nearest.dimensions.width / 2 - 0.5;
    const hd = nearest.dimensions.depth / 2 - 0.5;
    pos.x = Math.max(nearest.position.x - hw, Math.min(nearest.position.x + hw, pos.x));
    pos.z = Math.max(nearest.position.z - hd, Math.min(nearest.position.z + hd, pos.z));
  }
}

function updateRoomName() {
  const room = palace.getRoomAt(camera.position);
  if (room) hud.setRoomName(room.name);
}

function updateTargetInfo() {
  if (!controls.isLocked) return;
  const hit = getTargetedObject();
  if (hit) {
    const ud = hit.object.userData;
    if (ud.type === 'structure') {
      hud.setTargetInfo(`${ud.structureType} [${ud.structureId?.slice(0, 8)}]`);
    } else if (ud.type === 'locus') {
      const room = palace.getRoomById(ud.roomId);
      const locus = room?.loci.find(l => l.id === ud.locusId);
      hud.setTargetInfo(locus?.memoryItem ? `Memory: "${locus.memoryItem.hint || 'click to view'}"` : 'Empty locus');
    } else if (ud.type === 'wall') {
      hud.setTargetInfo(`Wall (${ud.wall})`);
    } else {
      hud.setTargetInfo('');
    }
  } else {
    hud.setTargetInfo('');
  }
}

function animateLocusOrbs(delta) {
  pulseTime += delta;
  const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 3);
  for (const room of palace.rooms) {
    for (const locus of room.loci) {
      const mesh = meshIndex.get(locus.id);
      if (mesh) {
        mesh.material.emissiveIntensity = 0.4 + pulse * 0.6;
      }
    }
  }
}

// ─── Unified command pipeline ───
// Both voice and text input feed into this

function handleTranscript({ transcript, isFinal }) {
  hud.setTranscript(transcript);
  if (!isFinal) return;
  hud.setTranscript('');
  handleCommand(transcript);
}

async function handleCommand(text) {
  // Snapshot crosshair state NOW — before any async work
  const snapshotPos = getPlacementPosition();
  const snapshotRoom = palace.getRoomAt(camera.position) || palace.rooms[0];
  const snapshotTarget = getTargetedObject();

  // Check for delete command (works on whatever crosshair is on right now)
  if (/^(?:delete|remove|destroy)\b/i.test(text.trim())) {
    if (!snapshotTarget) { hud.showToast('Look at something to delete'); return; }
    const ud = snapshotTarget.object.userData;
    if (ud.type === 'structure') {
      snapshotRoom.structures = snapshotRoom.structures.filter(s => s.id !== ud.structureId);
      removeMesh(ud.structureId);
      hud.showToast('Deleted');
    } else if (ud.type === 'locus') {
      snapshotRoom.loci = snapshotRoom.loci.filter(l => l.id !== ud.locusId);
      removeMesh(ud.locusId);
      hud.showToast('Deleted');
    } else {
      hud.showToast("Can't delete that");
    }
    storage.savePalace(palace); // immediate save, not debounced
    return;
  }

  // Try local parser for built-in commands
  const action = parse(text);

  if (action) {
    const builtInTypes = ['CREATE_ROOM', 'ADD_DOORWAY', 'PLACE_MEMORY', 'SET_COLOR',
      'RESIZE', 'DELETE_TARGET', 'TELEPORT', 'RENAME_ROOM', 'SAVE'];

    if (builtInTypes.includes(action.type) && action.type !== 'ADD_STRUCTURE') {
      executeAction(action);
      return;
    }

    if (action.type === 'ADD_STRUCTURE') {
      const hasLocal = ['pillar', 'column', 'shelf', 'bookshelf', 'table', 'desk',
        'pedestal', 'stand', 'arch', 'archway', 'statue', 'torch', 'chest'].includes(action.structureType);
      if (hasLocal) {
        executeAction(action);
        return;
      }
    }
  }

  // Check if user said "new" — bypass library
  const forceNew = /\bnew\b/i.test(text);
  const cleanPrompt = text.replace(/\bnew\b\s*/i, '').trim();

  // Send to Claude (or library) — use the snapshotted placement
  await generateWithClaude(cleanPrompt, snapshotPos, snapshotRoom, forceNew);
}

// ─── Claude generation ───
async function generateWithClaude(prompt, placement, currentRoom, forceNew = false) {
  const { position: worldPos, isWall, wallDirection, yRotation } = placement;
  hud.showGeneratingState(prompt);

  // Tell Claude if this is a wall placement so it generates flat/wall-mounted objects
  const wallHint = isWall ? ` (wall-mounted, on the ${wallDirection} wall — make it flat/shallow, facing outward from the wall)` : '';

  try {
    const response = await fetch('/api/generate-or-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt + wallHint, forceNew }),
    });

    if (!response.ok) {
      const err = await response.json();
      hud.hideGeneratingState();
      hud.showToast(`Error: ${err.error || 'generation failed'}`, 8000, true);
      return;
    }

    const { code, fromLibrary, key } = await response.json();

    const structure = new Structure({
      type: 'generated',
      position: worldToRoom(worldPos, currentRoom),
      color: '#888888',
      generatedCode: code,
      libraryKey: key,
    });
    if (isWall && yRotation != null) structure.rotation = { y: yRotation };
    currentRoom.structures.push(structure);

    buildFromGeneratedCode(code, worldPos, structure.id, currentRoom.id, currentRoom, isWall ? yRotation : null);

    hud.hideGeneratingState();
    hud.showToast(fromLibrary ? `Added ${key} (from library)` : `Created: ${key} (saved to library)`);
    storage.autoSave(palace);
  } catch (err) {
    console.error('Generation error:', err);
    hud.hideGeneratingState();
    hud.showToast(`Failed: ${err.message}`, 8000, true);
  }
}

// ─── Execute built-in action ───
function executeAction(action) {
  const currentRoom = palace.getRoomAt(camera.position) || palace.rooms[0];

  switch (action.type) {
    case 'CREATE_ROOM': {
      const name = action.name || `Room ${palace.rooms.length + 1}`;

      // Raycast to find which wall the crosshair is pointing at
      let wall = null;
      const hit = getTargetedObject();
      if (hit && hit.object.userData.type === 'wall' && hit.object.userData.roomId === currentRoom.id) {
        wall = hit.object.userData.wall;
      }

      // Fallback: use camera direction to pick nearest wall
      if (!wall) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        if (Math.abs(forward.z) > Math.abs(forward.x)) {
          wall = forward.z < 0 ? 'north' : 'south';
        } else {
          wall = forward.x > 0 ? 'east' : 'west';
        }
      }

      const oppositeWall = { north: 'south', south: 'north', east: 'west', west: 'east' };
      // New room is adjacent — center-to-center distance = half of each room's dimension
      const newDimensions = { width: 10, height: 4, depth: 10 };
      const offset = {
        north: { x: 0, z: -(currentRoom.dimensions.depth / 2 + newDimensions.depth / 2) },
        south: { x: 0, z: currentRoom.dimensions.depth / 2 + newDimensions.depth / 2 },
        east: { x: currentRoom.dimensions.width / 2 + newDimensions.width / 2, z: 0 },
        west: { x: -(currentRoom.dimensions.width / 2 + newDimensions.width / 2), z: 0 },
      };

      const newPos = {
        x: currentRoom.position.x + offset[wall].x,
        y: 0,
        z: currentRoom.position.z + offset[wall].z,
      };

      const newRoom = new Room({ name, position: newPos, dimensions: newDimensions });
      palace.rooms.push(newRoom);

      if (!currentRoom.doorways.find(d => d.wall === wall)) {
        currentRoom.doorways.push(new Doorway({ wall, targetRoomId: newRoom.id }));
      }
      newRoom.doorways.push(new Doorway({ wall: oppositeWall[wall], targetRoomId: currentRoom.id }));

      const oldGroup = roomGroups.get(currentRoom.id);
      if (oldGroup) {
        oldGroup.traverse(c => { if (c.isMesh) collidables.delete(c); });
        scene.remove(oldGroup);
        roomGroups.delete(currentRoom.id);
      }
      buildRoom(currentRoom);
      buildRoom(newRoom);

      hud.showToast(`Created room: ${name}`);
      storage.autoSave(palace);
      break;
    }

    case 'ADD_STRUCTURE': {
      const { position: worldPos } = getPlacementPosition();
      const localPos = worldToRoom(worldPos, currentRoom);
      const structure = new Structure({
        type: action.structureType,
        position: localPos,
        rotation: { y: camera.rotation.y },
      });
      currentRoom.structures.push(structure);

      const group = roomGroups.get(currentRoom.id);
      if (group) buildStructureMesh(structure, group, currentRoom);

      hud.showToast(`Added ${action.structureType}`);
      storage.autoSave(palace);
      break;
    }

    case 'ADD_DOORWAY': {
      if (currentRoom.doorways.find(d => d.wall === action.wall)) {
        hud.showToast(`Already have a doorway on ${action.wall} wall`);
        break;
      }
      currentRoom.doorways.push(new Doorway({ wall: action.wall }));

      const oldGroup = roomGroups.get(currentRoom.id);
      if (oldGroup) {
        oldGroup.traverse(c => { if (c.isMesh) collidables.delete(c); });
        scene.remove(oldGroup);
        roomGroups.delete(currentRoom.id);
      }
      buildRoom(currentRoom);

      hud.showToast(`Added doorway on ${action.wall} wall`);
      storage.autoSave(palace);
      break;
    }

    case 'PLACE_MEMORY': {
      const group = roomGroups.get(currentRoom.id);
      memoryUI.openPlaceMemory(currentRoom, null, group);
      break;
    }

    case 'SET_COLOR': {
      const hit = getTargetedObject();
      if (!hit) { hud.showToast('Look at an object first'); break; }
      const color = resolveColor(action.color);
      const ud = hit.object.userData;

      if (ud.type === 'structure') {
        const struct = currentRoom.structures.find(s => s.id === ud.structureId);
        if (struct) struct.color = color;
        // Find the root mesh/group for this structure
        const rootMesh = meshIndex.get(ud.structureId);
        if (rootMesh) {
          rootMesh.traverse(child => {
            if (child.isMesh && child.material) {
              child.material.color.set(color);
            }
          });
        }
      } else if (ud.type === 'wall') {
        hit.object.material.color.set(color);
        if (ud.wall) currentRoom.wallColor = color;
      } else if (ud.type === 'floor') {
        hit.object.material.color.set(color);
        currentRoom.floorColor = color;
      }

      hud.showToast(`Colored ${action.color}`);
      storage.autoSave(palace);
      break;
    }

    case 'RESIZE': {
      const hit = getTargetedObject();
      if (!hit || hit.object.userData.type !== 'structure') {
        hud.showToast('Look at a structure to resize');
        break;
      }
      const struct = currentRoom.structures.find(s => s.id === hit.object.userData.structureId);
      const mesh = meshIndex.get(hit.object.userData.structureId);
      if (!struct || !mesh) break;

      const factor = { bigger: 1.2, smaller: 0.8, taller: 1, shorter: 1, wider: 1, thinner: 1 };
      const yFactor = { bigger: 1.2, smaller: 0.8, taller: 1.3, shorter: 0.7, wider: 1, thinner: 1 };
      const xFactor = { bigger: 1.2, smaller: 0.8, taller: 1, shorter: 1, wider: 1.3, thinner: 0.7 };

      struct.scale.x *= (xFactor[action.direction] || 1);
      struct.scale.y *= (yFactor[action.direction] || 1);
      struct.scale.z *= (factor[action.direction] || 1);
      mesh.scale.set(struct.scale.x, struct.scale.y, struct.scale.z);

      hud.showToast(`Made it ${action.direction}`);
      storage.autoSave(palace);
      break;
    }

    case 'DELETE_TARGET': {
      const hit = getTargetedObject();
      if (!hit) { hud.showToast('Look at something to delete'); break; }
      const ud = hit.object.userData;

      if (ud.type === 'structure') {
        currentRoom.structures = currentRoom.structures.filter(s => s.id !== ud.structureId);
        removeMesh(ud.structureId);
        hud.showToast('Deleted structure');
      } else if (ud.type === 'locus') {
        currentRoom.loci = currentRoom.loci.filter(l => l.id !== ud.locusId);
        removeMesh(ud.locusId);
        hud.showToast('Deleted locus');
      } else {
        hud.showToast("Can't delete that");
      }
      storage.savePalace(palace); // immediate save
      break;
    }

    case 'TELEPORT': {
      const target = palace.getRoomByName(action.roomName);
      if (!target) {
        hud.showToast(`Room "${action.roomName}" not found`);
        break;
      }
      camera.position.set(target.position.x, 1.6, target.position.z);
      hud.showToast(`Teleported to ${target.name}`);
      break;
    }

    case 'RENAME_ROOM': {
      currentRoom.name = action.name;
      hud.setRoomName(action.name);
      hud.showToast(`Room renamed to "${action.name}"`);
      storage.autoSave(palace);
      break;
    }

    case 'SAVE': {
      storage.savePalace(palace);
      hud.showToast('Palace saved!');
      break;
    }
  }
}

// ─── Click interaction ───
document.addEventListener('click', () => {
  if (!controls.isLocked || commandBarOpen) return;

  const hit = getTargetedObject();
  if (!hit) return;

  const ud = hit.object.userData;
  if (ud.type === 'locus') {
    const room = palace.getRoomById(ud.roomId);
    const locus = room?.loci.find(l => l.id === ud.locusId);
    if (locus?.memoryItem) {
      memoryUI.showMemory(locus);
    } else if (locus) {
      const group = roomGroups.get(room.id);
      memoryUI.openPlaceMemory(room, locus, group);
    }
  }
});

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', (e) => {
  // Command bar toggle
  if ((e.code === 'KeyT' || e.code === 'Backquote') && controls.isLocked && !commandBarOpen) {
    e.preventDefault();
    openCommandBar();
    return;
  }

  if (!controls.isLocked || commandBarOpen) return;

  switch (e.code) {
    case 'KeyV':
      voice.toggleListening();
      hud.setVoiceActive(voice.isListening());
      hud.showToast(voice.isListening() ? 'Voice ON — speak a command' : 'Voice OFF');
      break;

    case 'KeyE': {
      const currentRoom = palace.getRoomAt(camera.position) || palace.rooms[0];
      const group = roomGroups.get(currentRoom.id);
      memoryUI.openPlaceMemory(currentRoom, null, group);
      break;
    }

    case 'KeyF': {
      const hit = getTargetedObject();
      if (hit?.object.userData.type === 'locus') {
        const room = palace.getRoomById(hit.object.userData.roomId);
        const locus = room?.loci.find(l => l.id === hit.object.userData.locusId);
        if (locus?.memoryItem) memoryUI.showMemory(locus);
      }
      break;
    }
  }
});

// ─── Start ───
init();
