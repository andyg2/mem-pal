# CLAUDE.md — Memory Palace Project Guide

## Project Overview

Memory Palace is a 3D first-person spatial memory application. Users navigate rooms, generate 3D objects via Claude CLI, and store memories at spatial locations using the method of loci. Built with vanilla HTML/CSS/JS + Three.js (no build step) and a Node.js/Express server.

## Quick Start

```bash
npm install
npm start          # Starts Express server on port 3000
# Open http://localhost:3000 in Chrome or Edge
```

Requires `claude` CLI installed and authenticated (used for AI object generation).

## Architecture

```
mem-pal/
  index.html          # Single HTML entry — all CSS embedded, import map for Three.js
  server.js           # Express server — static files, Claude CLI bridge, object library
  package.json        # Dependencies: express, express-rate-limit, three
  .gitignore          # Excludes node_modules/, library/
  library/            # Auto-generated cache of AI objects (gitignored)
  js/
    main.js           # App entry — bootstrap, render loop, unified command pipeline
    scene.js          # Three.js scene, camera, renderer, lighting setup
    controls.js       # PointerLockControls, WASD+sprint, collision via raycasting
    voice.js          # Web Speech API wrapper (Chrome/Edge only)
    parser.js         # Regex-based command parser → action objects
    builder.js        # 3D geometry generators + Claude code execution + placement
    palace.js         # Data model classes with JSON serialization
    storage.js        # localStorage save/load with debounced auto-save
    memory-ui.js      # Place/view memory modals with keyboard shortcuts
    hud.js            # Crosshair, voice status, toasts, loading spinner
```

## Key Data Flow

### Command Pipeline (main.js)

1. User speaks (voice.js) or types (command bar) a command
2. `handleCommand(text)` snapshots crosshair position + target BEFORE any async work
3. Checks for delete → built-in parser → Claude generation (in that order)
4. Built-in commands execute locally; unknown commands go to server

### AI Object Generation

```
handleCommand("add a piano")
  → snapshotPos = getPlacementPosition()  // captures surface hit + wall info NOW
  → generateWithClaude("piano", snapshotPos, room)
    → POST /api/generate-or-library { prompt, forceNew }
    → Server: check library/index.json for cache hit
    → Cache miss: execFile(claudePath, ['-p', prompt, '--model', 'haiku'])
    → Claude returns Three.js function body
    → Server: strip markdown fences, cache to library/piano.js
    → Browser: new Function('THREE', code) → mesh added to scene
    → Positioned at snapshotted crosshair location, rotated if wall-mounted
```

### Placement System (builder.js: getPlacementPosition)

- Raycasts from camera along crosshair direction
- **Horizontal surface** (floor, table): places on top, y offset +0.01
- **Vertical surface** (wall): places against wall, nudged 0.05 outward, rotated to face room
- **Fallback**: 3 units in front of player on floor
- Returns `{ position, wallNormal, isWall, wallDirection, yRotation }`

### Data Model (palace.js)

```
Palace → rooms[] → Room
  Room → structures[] → Structure (type, position, rotation, scale, color, generatedCode, libraryKey)
  Room → loci[] → Locus → MemoryItem (hint, content)
  Room → doorways[] → Doorway (wall, targetRoomId)
```

All classes have `toJSON()` / `static fromJSON()` for serialization.

## Server (server.js)

### Endpoints

| Method | Path                       | Description                                     |
| ------ | -------------------------- | ----------------------------------------------- |
| GET    | `/*`                       | Static file serving                             |
| POST   | `/api/generate`            | Generate object (Claude only, no library check) |
| POST   | `/api/generate-or-library` | Check library cache first, then Claude          |
| GET    | `/api/library`             | List all cached objects                         |
| GET    | `/api/library/:key`        | Get cached object code                          |
| POST   | `/api/library`             | Save object to library                          |

### Security

- **Rate limiting**: 10 requests/min on generation endpoints (express-rate-limit)
- **Path validation**: Library file paths verified to stay within `library/` directory
- **Prompt length cap**: 500 characters max
- **Claude path resolution**: Uses `which`/`where` at startup to find absolute path
- **Cross-platform**: `platform()` check for Windows vs Mac/Linux shell behavior

### Claude CLI Invocation

- Model: `haiku` (fastest, sufficient for geometry generation)
- Timeout: 120 seconds
- Prompt includes a system prompt instructing Claude to return ONLY a JS function body using THREE.\*
- Response is cleaned: markdown fences stripped, prose lines removed

## Browser Modules

### main.js — Orchestrator

- `init()`: checks for saved palace, wires buttons
- `startPalace()`: builds scene, inits voice/memory/HUD, starts render loop
- `handleCommand(text)`: unified pipeline — snapshot → delete check → parser → Claude
- `executeAction(action)`: switch on action.type for built-in commands
- `generateWithClaude(prompt, placement, room, forceNew)`: async fetch + build
- `checkBounds()`: per-frame clamp to keep player inside rooms
- `animate()`: render loop — controls, bounds, HUD, locus pulse, render

### builder.js — Geometry Engine

- `buildRoom(room)`: floor, ceiling, walls (with doorway splits + glowing frames), light
- `buildStructureMesh(structure, group, room)`: hardcoded generators (pillar, shelf, table, etc.)
- `buildFromGeneratedCode(code, worldPos, id, roomId, room, yRotation)`: eval Claude code
- `buildLocusMesh(locus, group, room)`: ROYGBIV-colored glowing orbs
- `getPlacementPosition()`: surface-aware raycasting (horizontal + vertical)
- `getTargetedObject()`: crosshair raycasting for targeting
- `rebuildPalace(palace)`: reconstruct entire scene from data (handles generated structures)

### controls.js — Movement

- PointerLockControls with WASD + Left Shift sprint (3x)
- Collision detection via 4-directional raycasts against collidables Set
- Player height clamped at 1.6 units
- Blocker overlay click-to-resume handling

### parser.js — Command Recognition

Returns `{ type, ...params }` or `null`. Patterns:

- CREATE_ROOM, ADD_STRUCTURE, ADD_DOORWAY, PLACE_MEMORY
- SET_COLOR, RESIZE, DELETE_TARGET, TELEPORT, RENAME_ROOM, SAVE

### palace.js — Data Model

Classes: Palace, Room, Structure, Locus, MemoryItem, Doorway

- Structure stores `generatedCode` for rebuild on load
- Structure stores `libraryKey` for cache reference
- Palace.getRoomAt(pos) has 0.5m margin for doorway transitions

### storage.js — Persistence

- localStorage key: `mem-pal-palace`
- `autoSave(palace)`: 2-second debounce
- `savePalace(palace)`: immediate (used for deletes)
- Full palace serialized as JSON

### voice.js — Speech Recognition

- Web Speech API (Chrome/Edge only)
- Continuous mode with auto-restart on silence
- Toggle with V key
- Fires `onTranscript({ transcript, isFinal })`

### memory-ui.js — Memory Modals

- Place modal: hint + content fields, Ctrl+Enter to save, Escape to cancel
- View modal: hint shown → Space to reveal content → Escape to close

### hud.js — HUD Elements

- `showGeneratingState(prompt)`: persistent spinner + text
- `hideGeneratingState()`: clear spinner
- `showToast(msg, duration, isError)`: error toasts are red, 8 seconds
- Room name, voice indicator, crosshair, target info, controls help

## Conventions

- **No build step**: ES modules via `<script type="importmap">`, Three.js from node_modules
- **No framework**: vanilla JS, DOM manipulation via getElementById
- **Units**: 1 unit = 1 meter. Player height 1.6m, room default 10x4x10
- **IDs**: `uid()` generates `id_<timestamp36>_<counter>`
- **Colors**: named colors resolved via COLORS lookup in builder.js
- **Collidables**: global `Set<THREE.Mesh>` in controls.js, registered by builder
- **meshIndex**: `Map<id, THREE.Object3D>` for targeting/deletion
- **roomGroups**: `Map<roomId, THREE.Group>` for room management

## Common Tasks

### Adding a new built-in structure type

1. Add generator function in `builder.js` → `structureGenerators` object
2. Add name to parser.js regex pattern (line ~9) and to main.js `hasLocal` array (line ~236)

### Adding a new voice/text command

1. Add regex pattern + action factory in `parser.js` → `patterns` array
2. Handle the action type in `main.js` → `executeAction()` switch

### Adding a new HUD element

1. Add HTML element in `index.html` inside `#hud` div
2. Add CSS in the embedded `<style>` block
3. Add getter/setter in `hud.js`

### Changing the AI model

Edit `server.js` line with `--model haiku` → change to `sonnet` or `opus`

### Testing generation without browser

```bash
curl -s -X POST http://localhost:3000/api/generate-or-library \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a red chair", "forceNew": true}'
```

## Known Limitations

- **Voice**: Chrome/Edge only (Web Speech API)
- **Code execution**: `new Function()` eval of Claude output — sandboxing not implemented
- **Mobile**: No touch controls, desktop only
- **Persistence**: localStorage only (no server-side save)
- **Multiplayer**: Single user only
- **Generated code on reload**: Structures with `generatedCode` are re-eval'd on palace load
