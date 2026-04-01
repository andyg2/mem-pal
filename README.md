# Memory Palace

A 3D first-person memory palace application where you build rooms, place AI-generated objects, and store memories in spatial locations. Uses Three.js for rendering and Claude CLI for on-the-fly 3D object generation from natural language.

![Memory Palace](https://img.shields.io/badge/Three.js-3D-blue) ![Claude](https://img.shields.io/badge/Claude-AI%20Generation-purple) ![Node.js](https://img.shields.io/badge/Node.js-Server-green)

## How It Works

1. Navigate a 3D environment in first-person
2. Speak or type any command — Claude generates Three.js geometry for any object you describe
3. Place ROYGBIV-colored memory orbs at locations to store and recall information
4. Walk through your palace to review memories using the method of loci

## Quick Start

```bash
# Clone and install
git clone https://github.com/andyg2/mem-pal.git
cd mem-pal
npm install

# Requires Claude CLI to be installed and authenticated
# https://docs.anthropic.com/en/docs/claude-code

# Start the server
npm start

# Open http://localhost:3000 in Chrome or Edge
```

## Controls

| Key            | Action                      |
| -------------- | --------------------------- |
| `WASD`         | Move                        |
| `Mouse`        | Look around                 |
| `Left Shift`   | Sprint (3x speed)           |
| `T` or `` ` `` | Open command bar            |
| `V`            | Toggle voice commands       |
| `E`            | Place a memory at crosshair |
| `F`            | View memory on targeted orb |
| `Click`        | Interact with memory orbs   |
| `ESC`          | Pause                       |

### Memory Modal

| Key          | Action               |
| ------------ | -------------------- |
| `Enter`      | Save memory          |
| `Ctrl+Enter` | Save (from textarea) |
| `Space`      | Reveal answer        |
| `Escape`     | Close/cancel         |

## Voice & Text Commands

Open the command bar with `T` or use voice with `V`:

**Building**

- `create a room called [name]` — adds a connected room on the wall you're looking at
- `add a [anything]` — AI generates any 3D object (TV, piano, bookshelf, butterfly painting...)
- `add a new [anything]` — bypasses cache, generates a fresh version
- `add a picture of [x]` — looking at a wall places it wall-mounted, facing the room

**Editing**

- `make it [color]` — recolors the object you're looking at
- `make it bigger/smaller/taller/shorter/wider` — resize targeted object
- `delete` / `remove` — removes the object under your crosshair

**Navigation**

- `go to [room name]` — teleport to a named room
- `add a door [north/south/east/west]` — add a doorway to a wall

**Memory**

- `place memory here` — opens the memory placement modal

**Other**

- `rename room to [name]` — rename the current room
- `save` — force save

## Object Library

Every AI-generated object is automatically cached to `library/` on disk as a `.js` file. The next time you request the same object, it loads instantly from the cache — no Claude API call needed.

Use the `new` keyword to force a fresh generation: `add a new piano`

```
library/
  index.json        # Maps object names to files
  piano.js          # Cached Three.js geometry code
  red-cube.js
  butterfly.js
```

## Architecture

```
mem-pal/
  index.html          # Entry point — HTML, CSS, import map
  server.js           # Express server — static files, Claude CLI bridge, object library
  package.json
  library/            # Cached AI-generated object code
  js/
    main.js           # App bootstrap, render loop, command pipeline
    scene.js          # Three.js scene, camera, renderer, lighting
    controls.js       # PointerLockControls, WASD movement, collision
    voice.js          # Web Speech API wrapper
    parser.js         # Regex command parser
    builder.js        # 3D geometry generators, Claude code execution
    palace.js         # Data model (Palace/Room/Structure/Locus/MemoryItem)
    storage.js        # localStorage persistence
    memory-ui.js      # Memory placement/review modals
    hud.js            # Crosshair, voice status, toasts, loading spinner
```

### How AI Generation Works

```
Browser: "add a grand piano"
  → POST /api/generate-or-library { prompt: "a grand piano" }
  → Server checks library/index.json for cached version
  → Cache miss: spawns `claude -p "..." --model haiku`
  → Claude returns Three.js function body
  → Server strips markdown, caches to library/grand-piano.js
  → Browser executes code via new Function('THREE', code)
  → 3D object appears in the scene at the crosshair position
```

Wall-mounted objects are detected automatically — if your crosshair is on a wall when you issue a command, the AI is told to generate a flat/wall-mounted version and it's rotated to face into the room.

## Features

- **First-person 3D navigation** with collision detection
- **AI object generation** — describe anything and Claude builds it from Three.js primitives
- **Voice commands** via Web Speech API (Chrome/Edge)
- **Memory system** with ROYGBIV-colored orbs, hints, and reveal-to-recall
- **Multi-room palaces** with glowing doorway frames
- **Surface-aware placement** — objects land on floors, tables, and walls
- **Object library caching** — instant reuse of previously generated objects
- **Auto-save** to localStorage with immediate save on delete
- **Sprint mode** (Left Shift) for fast navigation

## Requirements

- **Node.js** 18+
- **Claude CLI** installed and authenticated (`claude` available in PATH)
- **Chrome or Edge** (required for voice commands and pointer lock)

## Security

- Rate limited: 10 generation requests per minute
- Library paths validated to prevent directory traversal
- Prompt length capped at 500 characters
- Generated code executed client-side (sandboxing planned)

## License

MIT
