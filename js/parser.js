// parser.js — Regex command parser: transcript string → action objects

const patterns = [
  {
    regex: /(?:create|make|build|add)\s+(?:a\s+)?(?:new\s+)?room(?:\s+called\s+(.+))?/i,
    action: (m) => ({ type: 'CREATE_ROOM', name: m[1] || null }),
  },
  {
    regex: /(?:add|place|put|create)\s+(?:a\s+)?(?:new\s+)?(pillar|column|shelf|bookshelf|shelves|table|desk|pedestal|stand|arch|archway|statue|torch|chest)/i,
    action: (m) => ({ type: 'ADD_STRUCTURE', structureType: normalizeStructure(m[1]) }),
  },
  {
    regex: /(?:add|create|make)\s+(?:a\s+)?door(?:way)?\s+(?:to\s+the\s+|on\s+the\s+)?(north|south|east|west)/i,
    action: (m) => ({ type: 'ADD_DOORWAY', wall: m[1].toLowerCase() }),
  },
  {
    regex: /place\s+(?:a\s+)?memory(?:\s+here)?/i,
    action: () => ({ type: 'PLACE_MEMORY' }),
  },
  {
    regex: /(?:make\s+it|color|paint|colour)\s+(\w+)/i,
    action: (m) => ({ type: 'SET_COLOR', color: m[1].toLowerCase() }),
  },
  {
    regex: /make\s+it\s+(bigger|smaller|taller|shorter|wider|thinner)/i,
    action: (m) => ({ type: 'RESIZE', direction: m[1].toLowerCase() }),
  },
  {
    regex: /(?:delete|remove|destroy)\s+(?:this|that)/i,
    action: () => ({ type: 'DELETE_TARGET' }),
  },
  {
    regex: /(?:go\s+to|teleport\s+to|visit)\s+(.+)/i,
    action: (m) => ({ type: 'TELEPORT', roomName: m[1].trim() }),
  },
  {
    regex: /^save(?:\s+palace)?$/i,
    action: () => ({ type: 'SAVE' }),
  },
  {
    regex: /(?:name|rename)\s+(?:this\s+)?(?:room\s+)?(?:to\s+)?(.+)/i,
    action: (m) => ({ type: 'RENAME_ROOM', name: m[1].trim() }),
  },
];

const structureSynonyms = {
  column: 'pillar',
  bookshelf: 'shelf',
  shelves: 'shelf',
  desk: 'table',
  stand: 'pedestal',
  archway: 'arch',
};

function normalizeStructure(name) {
  const lower = name.toLowerCase();
  return structureSynonyms[lower] || lower;
}

export function parse(transcript) {
  const text = transcript.trim();
  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match) return p.action(match);
  }
  return null;
}
