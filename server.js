import express from 'express';
import rateLimit from 'express-rate-limit';
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { tmpdir, platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const generateLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  message: JSON.stringify({ error: 'Too many requests, try again in a minute' })
});

const SYSTEM_PROMPT = `You are a Three.js geometry generator for a 3D memory palace app.
Return ONLY the body of a JavaScript function — no markdown fences, no explanation, no imports.
The function receives a single parameter: THREE (the Three.js library).
It must create and return a THREE.Group (or a single THREE.Mesh) representing the requested object.

Rules:
- Use THREE.MeshStandardMaterial for all materials (supports lighting/shadows)
- 1 unit = 1 meter. Make objects life-sized.
- Object should sit on the floor: bottom at y=0
- Set castShadow = true on visible meshes
- Use reasonable colors for the object (e.g. brown wood, black screen, silver metal)
- Compose complex objects from simple primitives (Box, Cylinder, Sphere, Cone, Torus, Plane)
- Do NOT use any imports, require, console.log, or async code
- Do NOT wrap in a function declaration — just provide the function BODY
- The returned group/mesh should be centered at x=0, z=0

Example for "a chair":
const group = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), mat);
seat.position.y = 0.45;
seat.castShadow = true;
group.add(seat);
const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.05), mat);
back.position.set(0, 0.7, -0.2);
back.castShadow = true;
group.add(back);
for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), mat);
  leg.position.set(x, 0.225, z);
  group.add(leg);
}
return group;`;

app.post('/api/generate', generateLimiter, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  if (prompt.length > 500) return res.status(400).json({ error: 'prompt too long (max 500 characters)' });

  try {
    const code = await runClaude(prompt);
    console.log('[generate] Cleaned code length:', code.length);
    res.json({ code });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const isWindows = platform() === 'win32';

// Find the claude executable path at startup
import { execSync } from 'child_process';
let claudePath = 'claude';
try {
  const which = isWindows ? 'where claude' : 'which claude';
  claudePath = execSync(which, { encoding: 'utf-8' }).trim().split('\n')[0].trim();
  console.log('Found claude at:', claudePath);
} catch (_) {
  console.warn('Could not find claude in PATH, using "claude" directly');
}

function runClaude(userPrompt) {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${SYSTEM_PROMPT}\n\nCreate: ${userPrompt}`;

    // Pass prompt directly as argument — execFile handles escaping on all platforms
    execFile(claudePath, ['-p', fullPrompt, '--output-format', 'text', '--model', 'haiku'], {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {

      if (err) {
        console.error('[generate] stderr:', stderr);
        reject(new Error(`claude failed: ${err.message}`));
        return;
      }

      let result = stdout.trim();
      console.log('[generate] Raw response length:', result.length);
      console.log('[generate] First 200 chars:', result.slice(0, 200));

      // Extract code from markdown fences if present
      const fenceMatch = result.match(/```(?:javascript|js|jsx)?\s*\n([\s\S]*?)\n```/i);
      if (fenceMatch) {
        result = fenceMatch[1];
      } else {
        // Strip any leading prose lines
        const lines = result.split('\n');
        const codeStart = lines.findIndex(l =>
          /^\s*(const|let|var|function|return|\/\/|for|if|new |group\.|mesh\.)/.test(l)
        );
        if (codeStart > 0) {
          result = lines.slice(codeStart).join('\n');
        }
      }

      resolve(result.trim());
    });
  });
}

// ─── Object Library (disk-based) ───

const LIBRARY_DIR = join(__dirname, 'library');
const LIBRARY_INDEX = join(LIBRARY_DIR, 'index.json');

// Ensure library directory exists
if (!existsSync(LIBRARY_DIR)) mkdirSync(LIBRARY_DIR, { recursive: true });

function loadLibraryIndex() {
  if (!existsSync(LIBRARY_INDEX)) return {};
  try { return JSON.parse(readFileSync(LIBRARY_INDEX, 'utf-8')); } catch { return {}; }
}

function saveLibraryIndex(index) {
  writeFileSync(LIBRARY_INDEX, JSON.stringify(index, null, 2), 'utf-8');
}

// Normalize a key: "a grand piano" → "grand piano", "add a TV" → "tv"
function normalizeKey(prompt) {
  return prompt
    .toLowerCase()
    .replace(/^(?:add|place|put|create)\s+/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .trim();
}

// GET /api/library — return the full index
app.get('/api/library', (req, res) => {
  res.json(loadLibraryIndex());
});

// GET /api/library/:key — return code for a specific item
app.get('/api/library/:key', (req, res) => {
  const index = loadLibraryIndex();
  const key = req.params.key.toLowerCase();
  if (!index[key]) return res.status(404).json({ error: 'not found' });

  const codePath = join(LIBRARY_DIR, index[key].file);
  const resolvedPath = join(LIBRARY_DIR, index[key].file);
  if (!resolvedPath.startsWith(LIBRARY_DIR)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  if (!existsSync(codePath)) return res.status(404).json({ error: 'file missing' });

  const code = readFileSync(codePath, 'utf-8');
  res.json({ key, code });
});

// POST /api/library — save an item { key, code }
app.post('/api/library', (req, res) => {
  const { key, code } = req.body;
  if (!key || !code) return res.status(400).json({ error: 'key and code required' });

  const normalizedKey = normalizeKey(key);
  const fileName = `${normalizedKey.replace(/[^a-z0-9]+/g, '-')}.js`;
  const index = loadLibraryIndex();

  writeFileSync(join(LIBRARY_DIR, fileName), code, 'utf-8');
  index[normalizedKey] = { file: fileName, savedAt: Date.now() };
  saveLibraryIndex(index);

  console.log(`[library] Saved "${normalizedKey}" → ${fileName}`);
  res.json({ saved: normalizedKey });
});

// POST /api/generate-or-library — check library first, then generate
app.post('/api/generate-or-library', generateLimiter, async (req, res) => {
  const { prompt, forceNew } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  if (prompt.length > 500) return res.status(400).json({ error: 'prompt too long (max 500 characters)' });

  const normalizedKey = normalizeKey(prompt);

  // Check library (unless "new" was requested)
  if (!forceNew) {
    const index = loadLibraryIndex();
    if (index[normalizedKey]) {
      const codePath = join(LIBRARY_DIR, index[normalizedKey].file);
      if (!codePath.startsWith(LIBRARY_DIR)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      if (existsSync(codePath)) {
        const code = readFileSync(codePath, 'utf-8');
        console.log(`[library] Cache hit: "${normalizedKey}"`);
        return res.json({ code, fromLibrary: true, key: normalizedKey });
      }
    }
  }

  // Generate with Claude
  try {
    const code = await runClaude(prompt);
    console.log('[generate] New object, will save to library as:', normalizedKey);

    // Auto-save to library
    const fileName = `${normalizedKey.replace(/[^a-z0-9]+/g, '-')}.js`;
    const index = loadLibraryIndex();
    writeFileSync(join(LIBRARY_DIR, fileName), code, 'utf-8');
    index[normalizedKey] = { file: fileName, savedAt: Date.now() };
    saveLibraryIndex(index);

    res.json({ code, fromLibrary: false, key: normalizedKey });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Memory Palace server running at http://localhost:${PORT}`);
  console.log('Using Claude CLI for 3D generation');
});
