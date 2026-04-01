// builder.js — 3D geometry generator: actions → Three.js meshes in scene

import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { collidables } from './controls.js';
import { Room, Structure, Locus, Doorway } from './palace.js';

// Map room IDs to their Three.js groups
export const roomGroups = new Map();
// Map structure/locus IDs to their meshes
export const meshIndex = new Map();

const WALL_THICKNESS = 0.2;
const DOOR_WIDTH = 2;
const DOOR_HEIGHT = 3;

// ─── Color lookup ───
const COLORS = {
  red: '#ff3333', blue: '#3366ff', green: '#33aa33', yellow: '#ffcc00',
  orange: '#ff8833', purple: '#9933ff', pink: '#ff66aa', white: '#eeeeee',
  black: '#222222', brown: '#8B4513', gray: '#888888', grey: '#888888',
  gold: '#ffd700', silver: '#c0c0c0', cyan: '#00cccc', teal: '#008080',
  maroon: '#800000', navy: '#000080', crimson: '#dc143c', ivory: '#fffff0',
};

export function resolveColor(name) {
  return COLORS[name.toLowerCase()] || '#888888';
}

// ─── Material helpers ───
function wallMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
}
function floorMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 });
}
function structMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
}

// ─── Room building ───

export function buildRoom(room) {
  const group = new THREE.Group();
  group.name = room.id;
  group.position.set(room.position.x, room.position.y, room.position.z);

  const { width, height, depth } = room.dimensions;
  const hw = width / 2, hd = depth / 2;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width, WALL_THICKNESS, depth),
    floorMat(room.floorColor)
  );
  floor.position.set(0, -WALL_THICKNESS / 2, 0);
  floor.receiveShadow = true;
  floor.userData = { type: 'floor', roomId: room.id };
  group.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(width, WALL_THICKNESS, depth),
    wallMat(room.ceilingColor)
  );
  ceiling.position.set(0, height + WALL_THICKNESS / 2, 0);
  ceiling.userData = { type: 'ceiling', roomId: room.id };
  group.add(ceiling);

  // Walls — check for doorways on each side
  const walls = buildWalls(room, width, height, depth, hw, hd, group);
  walls.forEach(w => {
    group.add(w);
    collidables.add(w);
  });

  // Ceiling light
  const light = new THREE.PointLight(0xffeedd, 1.5, width * 1.5, 1.5);
  light.position.set(0, height - 0.3, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  group.add(light);

  // Light fixture (small visible bulb)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#fff8e0', emissive: '#ffeecc', emissiveIntensity: 1.5 })
  );
  bulb.position.set(0, height - 0.15, 0);
  group.add(bulb);

  scene.add(group);
  roomGroups.set(room.id, group);

  // Rebuild structures
  for (const s of room.structures) {
    if (s.type === 'generated' && s.generatedCode) {
      try {
        // Reconstruct world position from room-local position
        const worldPos = {
          x: s.position.x + room.position.x,
          y: s.position.y + room.position.y,
          z: s.position.z + room.position.z,
        };
        buildFromGeneratedCode(s.generatedCode, worldPos, s.id, room.id, room, s.rotation?.y);
      } catch (e) {
        console.warn('Failed to rebuild generated structure:', s.id, e);
      }
    } else {
      buildStructureMesh(s, group, room);
    }
  }

  // Rebuild loci
  for (const l of room.loci) {
    buildLocusMesh(l, group, room);
  }

  return group;
}

function buildWalls(room, w, h, d, hw, hd, group) {
  const meshes = [];
  const doorsByWall = {};
  for (const dw of room.doorways) {
    doorsByWall[dw.wall] = dw;
  }

  const wallDefs = [
    { wall: 'north', pos: [0, h / 2, -hd], size: [w, h, WALL_THICKNESS], axis: 'x' },
    { wall: 'south', pos: [0, h / 2, hd], size: [w, h, WALL_THICKNESS], axis: 'x' },
    { wall: 'east', pos: [hw, h / 2, 0], size: [WALL_THICKNESS, h, d], axis: 'z' },
    { wall: 'west', pos: [-hw, h / 2, 0], size: [WALL_THICKNESS, h, d], axis: 'z' },
  ];

  for (const def of wallDefs) {
    if (doorsByWall[def.wall]) {
      // Wall with doorway — split into segments around the opening
      const door = doorsByWall[def.wall];
      const fullLen = def.axis === 'x' ? w : d;
      const halfLen = fullLen / 2;
      const doorHalf = DOOR_WIDTH / 2;

      // Left segment
      const leftLen = halfLen - doorHalf;
      if (leftLen > 0.1) {
        const leftSize = def.axis === 'x'
          ? [leftLen, h, WALL_THICKNESS]
          : [WALL_THICKNESS, h, leftLen];
        const leftMesh = new THREE.Mesh(new THREE.BoxGeometry(...leftSize), wallMat(room.wallColor));
        const offset = -(halfLen - leftLen / 2);
        leftMesh.position.set(
          def.axis === 'x' ? def.pos[0] + offset : def.pos[0],
          def.pos[1],
          def.axis === 'z' ? def.pos[2] + offset : def.pos[2]
        );
        leftMesh.userData = { type: 'wall', wall: def.wall, roomId: room.id };
        leftMesh.castShadow = true;
        leftMesh.receiveShadow = true;
        meshes.push(leftMesh);
      }

      // Right segment
      const rightLen = halfLen - doorHalf;
      if (rightLen > 0.1) {
        const rightSize = def.axis === 'x'
          ? [rightLen, h, WALL_THICKNESS]
          : [WALL_THICKNESS, h, rightLen];
        const rightMesh = new THREE.Mesh(new THREE.BoxGeometry(...rightSize), wallMat(room.wallColor));
        const offset = halfLen - rightLen / 2;
        rightMesh.position.set(
          def.axis === 'x' ? def.pos[0] + offset : def.pos[0],
          def.pos[1],
          def.axis === 'z' ? def.pos[2] + offset : def.pos[2]
        );
        rightMesh.userData = { type: 'wall', wall: def.wall, roomId: room.id };
        rightMesh.castShadow = true;
        rightMesh.receiveShadow = true;
        meshes.push(rightMesh);
      }

      // Top segment (above door)
      const topH = h - DOOR_HEIGHT;
      if (topH > 0.1) {
        const topSize = def.axis === 'x'
          ? [DOOR_WIDTH, topH, WALL_THICKNESS]
          : [WALL_THICKNESS, topH, DOOR_WIDTH];
        const topMesh = new THREE.Mesh(new THREE.BoxGeometry(...topSize), wallMat(room.wallColor));
        topMesh.position.set(def.pos[0], DOOR_HEIGHT + topH / 2, def.pos[2]);
        topMesh.userData = { type: 'wall', wall: def.wall, roomId: room.id };
        meshes.push(topMesh);
      }

      // Glowing doorway frame
      const frameMat = new THREE.MeshStandardMaterial({
        color: '#335588', emissive: '#4488ff', emissiveIntensity: 0.6,
        transparent: true, opacity: 0.7,
      });
      const frameThickness = 0.06;
      const frameUserData = { type: 'doorway', wall: def.wall, roomId: room.id };

      // Left vertical bar
      const leftBar = new THREE.Mesh(
        def.axis === 'x'
          ? new THREE.BoxGeometry(frameThickness, DOOR_HEIGHT, frameThickness)
          : new THREE.BoxGeometry(frameThickness, DOOR_HEIGHT, frameThickness),
        frameMat
      );
      leftBar.position.set(
        def.axis === 'x' ? def.pos[0] - DOOR_WIDTH / 2 : def.pos[0],
        DOOR_HEIGHT / 2,
        def.axis === 'z' ? def.pos[2] - DOOR_WIDTH / 2 : def.pos[2]
      );
      leftBar.userData = { ...frameUserData };
      group.add(leftBar);

      // Right vertical bar
      const rightBar = new THREE.Mesh(
        def.axis === 'x'
          ? new THREE.BoxGeometry(frameThickness, DOOR_HEIGHT, frameThickness)
          : new THREE.BoxGeometry(frameThickness, DOOR_HEIGHT, frameThickness),
        frameMat
      );
      rightBar.position.set(
        def.axis === 'x' ? def.pos[0] + DOOR_WIDTH / 2 : def.pos[0],
        DOOR_HEIGHT / 2,
        def.axis === 'z' ? def.pos[2] + DOOR_WIDTH / 2 : def.pos[2]
      );
      rightBar.userData = { ...frameUserData };
      group.add(rightBar);

      // Top horizontal bar
      const topBar = new THREE.Mesh(
        def.axis === 'x'
          ? new THREE.BoxGeometry(DOOR_WIDTH, frameThickness, frameThickness)
          : new THREE.BoxGeometry(frameThickness, frameThickness, DOOR_WIDTH),
        frameMat
      );
      topBar.position.set(
        def.pos[0],
        DOOR_HEIGHT,
        def.pos[2]
      );
      topBar.userData = { ...frameUserData };
      group.add(topBar);

      // Blue point light at top of doorway frame
      const doorLight = new THREE.PointLight(0x4488ff, 0.4, 5);
      doorLight.position.set(def.pos[0], DOOR_HEIGHT, def.pos[2]);
      group.add(doorLight);
    } else {
      // Solid wall
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.size), wallMat(room.wallColor));
      mesh.position.set(...def.pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { type: 'wall', wall: def.wall, roomId: room.id };
      meshes.push(mesh);
    }
  }
  return meshes;
}

// ─── Structures ───

const structureGenerators = {
  pillar(s) {
    const geo = new THREE.CylinderGeometry(0.3, 0.35, 3.5, 8);
    const mesh = new THREE.Mesh(geo, structMat(s.color));
    mesh.position.set(s.position.x, 1.75, s.position.z);
    mesh.castShadow = true;
    return mesh;
  },
  column(s) { return structureGenerators.pillar(s); },

  shelf(s) {
    const group = new THREE.Group();
    const mat = structMat(s.color);
    // Two vertical supports
    for (const xOff of [-0.45, 0.45]) {
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.3), mat);
      support.position.set(xOff, 0.9, 0);
      support.castShadow = true;
      group.add(support);
    }
    // Three shelves
    for (const yOff of [0.4, 1.0, 1.6]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.35), mat);
      plank.position.set(0, yOff, 0);
      plank.castShadow = true;
      group.add(plank);
    }
    group.position.set(s.position.x, 0, s.position.z);
    return group;
  },
  bookshelf(s) { return structureGenerators.shelf(s); },

  table(s) {
    const group = new THREE.Group();
    const mat = structMat(s.color);
    // Top
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.8), mat);
    top.position.set(0, 0.75, 0);
    top.castShadow = true;
    group.add(top);
    // Legs
    for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6), mat);
      leg.position.set(x, 0.375, z);
      group.add(leg);
    }
    group.position.set(s.position.x, 0, s.position.z);
    return group;
  },
  desk(s) { return structureGenerators.table(s); },

  pedestal(s) {
    const geo = new THREE.BoxGeometry(0.5, 1.0, 0.5);
    const mesh = new THREE.Mesh(geo, structMat(s.color));
    mesh.position.set(s.position.x, 0.5, s.position.z);
    mesh.castShadow = true;
    return mesh;
  },
  stand(s) { return structureGenerators.pedestal(s); },

  arch(s) {
    const group = new THREE.Group();
    const mat = structMat(s.color);
    // Two pillars
    for (const xOff of [-0.8, 0.8]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 3.0, 8), mat);
      pillar.position.set(xOff, 1.5, 0);
      pillar.castShadow = true;
      group.add(pillar);
    }
    // Top arc (half torus)
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.15, 8, 12, Math.PI),
      mat
    );
    arc.position.set(0, 3.0, 0);
    arc.rotation.z = Math.PI;
    arc.rotation.y = Math.PI / 2;
    group.add(arc);
    group.position.set(s.position.x, 0, s.position.z);
    return group;
  },
  archway(s) { return structureGenerators.arch(s); },

  statue(s) {
    const group = new THREE.Group();
    const mat = structMat(s.color);
    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 8), mat);
    base.position.set(0, 0.15, 0);
    group.add(base);
    // Body (abstract figure)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6), mat);
    body.position.set(0, 0.9, 0);
    body.castShadow = true;
    group.add(body);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
    head.position.set(0, 1.7, 0);
    group.add(head);
    group.position.set(s.position.x, 0, s.position.z);
    return group;
  },

  torch(s) {
    const group = new THREE.Group();
    const mat = structMat(s.color);
    // Bracket
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat);
    bracket.position.set(0, 1.8, 0);
    group.add(bracket);
    // Flame (emissive sphere)
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#ff6600', emissive: '#ff4400', emissiveIntensity: 2 })
    );
    flame.position.set(0, 2.15, 0);
    group.add(flame);
    // Light
    const light = new THREE.PointLight(0xff6633, 0.8, 8, 2);
    light.position.set(0, 2.2, 0);
    group.add(light);
    group.position.set(s.position.x, 0, s.position.z);
    return group;
  },

  chest(s) {
    const group = new THREE.Group();
    const mat = structMat(s.color || '#8B4513');
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), mat);
    body.position.set(0, 0.25, 0);
    body.castShadow = true;
    group.add(body);
    // Lid (slightly curved look via half cylinder)
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.82, 8, 1, false, 0, Math.PI), mat);
    lid.rotation.z = Math.PI / 2;
    lid.rotation.y = Math.PI / 2;
    lid.position.set(0, 0.5, 0);
    group.add(lid);
    group.position.set(s.position.x, 0, s.position.z);
    return group;
  },
};

export function buildStructureMesh(structure, group, room) {
  const gen = structureGenerators[structure.type];
  if (!gen) return null;
  const mesh = gen(structure);
  mesh.name = structure.id;
  mesh.userData = { type: 'structure', structureType: structure.type, structureId: structure.id, roomId: room.id };

  // Apply scale
  if (structure.scale.x !== 1 || structure.scale.y !== 1 || structure.scale.z !== 1) {
    mesh.scale.set(structure.scale.x, structure.scale.y, structure.scale.z);
  }
  if (structure.rotation.y) mesh.rotation.y = structure.rotation.y;

  group.add(mesh);
  meshIndex.set(structure.id, mesh);

  // Add child meshes to collidables
  mesh.traverse(child => {
    if (child.isMesh) collidables.add(child);
  });

  return mesh;
}

// ─── Locus orbs (ROYGBIV) ───

const ROYGBIV = [
  { color: '#ff0000', emissive: '#cc0000' }, // Red
  { color: '#ff7700', emissive: '#cc5500' }, // Orange
  { color: '#ffff00', emissive: '#cccc00' }, // Yellow
  { color: '#00cc00', emissive: '#009900' }, // Green
  { color: '#0066ff', emissive: '#0044cc' }, // Blue
  { color: '#4b0082', emissive: '#3a0066' }, // Indigo
  { color: '#8b00ff', emissive: '#6600cc' }, // Violet
];
let roygbivIndex = 0;

export function buildLocusMesh(locus, group, room) {
  const geo = new THREE.SphereGeometry(0.18, 16, 12);
  const colorSet = ROYGBIV[roygbivIndex % ROYGBIV.length];
  roygbivIndex++;
  const mat = new THREE.MeshStandardMaterial({
    color: colorSet.color,
    emissive: colorSet.emissive,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.85,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(locus.position.x, locus.position.y, locus.position.z);
  mesh.name = locus.id;
  mesh.userData = { type: 'locus', locusId: locus.id, roomId: room.id, roygbivColor: colorSet.color };
  group.add(mesh);
  meshIndex.set(locus.id, mesh);
  return mesh;
}

// ─── Build from Claude-generated code ───

export function buildFromGeneratedCode(code, worldPos, structureId, roomId, room, yRotation = null) {
  const group = roomGroups.get(roomId);
  if (!group) throw new Error('Room group not found');

  // Client-side fence stripping (safety net)
  let cleanCode = code;
  const fenceMatch = cleanCode.match(/```(?:javascript|js|jsx)?\s*\n([\s\S]*?)\n```/i);
  if (fenceMatch) cleanCode = fenceMatch[1];
  // Strip any leading non-code lines
  const lines = cleanCode.split('\n');
  const codeStart = lines.findIndex(l =>
    /^\s*(const|let|var|function|return|\/\/|for|if|new |group\.|mesh\.)/.test(l)
  );
  if (codeStart > 0) cleanCode = lines.slice(codeStart).join('\n');
  cleanCode = cleanCode.trim();

  // Execute the generated code
  console.log('[mem-pal] Executing generated code:\n', cleanCode);
  const fn = new Function('THREE', cleanCode);
  const result = fn(THREE);

  if (!result) throw new Error('Generated code returned nothing');

  // Position it in room-local coords
  const localPos = {
    x: worldPos.x - room.position.x,
    y: worldPos.y - room.position.y,
    z: worldPos.z - room.position.z,
  };

  result.position.set(localPos.x, localPos.y, localPos.z);
  if (yRotation != null) result.rotation.y = yRotation;
  result.name = structureId;
  result.userData = { type: 'structure', structureType: 'generated', structureId, roomId };

  group.add(result);
  meshIndex.set(structureId, result);

  // Register all child meshes as collidable
  result.traverse(child => {
    if (child.isMesh) {
      collidables.add(child);
      // Propagate userData to children for raycasting
      if (!child.userData.type) {
        child.userData = { ...result.userData };
      }
    }
  });

  return result;
}

// ─── Getting placement position (raycast to surface under crosshair) ───

const placementRaycaster = new THREE.Raycaster();
placementRaycaster.far = 15;

/**
 * Returns { position, wallNormal, isWall, wallDirection }
 * wallDirection is the wall name (north/south/east/west) if hitting a wall
 */
export function getPlacementPosition() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  placementRaycaster.set(camera.position, dir);

  const surfaces = [];
  scene.traverse(child => {
    if (child.isMesh) surfaces.push(child);
  });

  const hits = placementRaycaster.intersectObjects(surfaces, false);

  if (hits.length > 0) {
    const hit = hits[0];
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);

    const up = new THREE.Vector3(0, 1, 0);
    const dotUp = normal.dot(up);

    if (Math.abs(dotUp) > 0.5) {
      // Horizontal surface — place on top
      const pos = hit.point.clone();
      pos.y += 0.01;
      return { position: pos, wallNormal: null, isWall: false, wallDirection: null };
    } else {
      // Vertical surface (wall) — place against wall, facing room
      const pos = hit.point.clone();
      // Nudge slightly away from wall so object doesn't clip into it
      pos.add(normal.clone().multiplyScalar(0.05));

      // Determine wall direction from the hit object userData or from normal
      let wallDirection = hit.object.userData?.wall || null;
      if (!wallDirection) {
        // Infer from normal
        if (Math.abs(normal.z) > Math.abs(normal.x)) {
          wallDirection = normal.z > 0 ? 'south' : 'north';
        } else {
          wallDirection = normal.x > 0 ? 'east' : 'west';
        }
      }

      // Compute Y rotation so object faces into the room (opposite of wall normal)
      const yRotation = Math.atan2(normal.x, normal.z);

      return { position: pos, wallNormal: normal, isWall: true, wallDirection, yRotation };
    }
  }

  // Fallback: 3 units in front on the floor
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const pos = camera.position.clone().add(forward.multiplyScalar(3));
  pos.y = 0;
  return { position: pos, wallNormal: null, isWall: false, wallDirection: null };
}

/** Convert world pos to room-local pos */
export function worldToRoom(worldPos, room) {
  return {
    x: worldPos.x - room.position.x,
    y: worldPos.y - room.position.y,
    z: worldPos.z - room.position.z,
  };
}

// ─── Raycasting for targeting ───

const targetRaycaster = new THREE.Raycaster();
targetRaycaster.far = 10;

export function getTargetedObject() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  targetRaycaster.set(camera.position, dir);

  const objects = [];
  scene.traverse(child => {
    if (child.isMesh && child.userData.type) objects.push(child);
  });
  const hits = targetRaycaster.intersectObjects(objects, false);
  return hits.length > 0 ? hits[0] : null;
}

// ─── Rebuild entire palace ───

export function rebuildPalace(palace) {
  // Clear existing room groups
  for (const [id, group] of roomGroups) {
    group.traverse(child => {
      if (child.isMesh) collidables.delete(child);
    });
    scene.remove(group);
  }
  roomGroups.clear();
  meshIndex.clear();

  for (const room of palace.rooms) {
    buildRoom(room);
  }
}

// ─── Remove a mesh by structure/locus id ───

export function removeMesh(id) {
  const mesh = meshIndex.get(id);
  if (!mesh) return;
  mesh.traverse(child => {
    if (child.isMesh) {
      collidables.delete(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  });
  mesh.parent?.remove(mesh);
  meshIndex.delete(id);
}
