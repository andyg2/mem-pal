// palace.js — Data model: Palace → Room → Structure/Locus → MemoryItem

let _id = 0;
function uid() { return 'id_' + Date.now().toString(36) + '_' + (++_id); }

export class MemoryItem {
  constructor({ id, type = 'text', content = '', hint = '', createdAt } = {}) {
    this.id = id || uid();
    this.type = type;
    this.content = content;
    this.hint = hint;
    this.createdAt = createdAt || Date.now();
  }
  toJSON() { return { ...this }; }
  static fromJSON(o) { return new MemoryItem(o); }
}

export class Locus {
  constructor({ id, position = { x: 0, y: 1, z: 0 }, label = '', memoryItem = null } = {}) {
    this.id = id || uid();
    this.position = { ...position };
    this.label = label;
    this.memoryItem = memoryItem;
  }
  toJSON() {
    return {
      id: this.id,
      position: this.position,
      label: this.label,
      memoryItem: this.memoryItem ? this.memoryItem.toJSON() : null,
    };
  }
  static fromJSON(o) {
    return new Locus({
      ...o,
      memoryItem: o.memoryItem ? MemoryItem.fromJSON(o.memoryItem) : null,
    });
  }
}

export class Structure {
  constructor({ id, type = 'pillar', position = { x: 0, y: 0, z: 0 }, rotation = { y: 0 }, scale = { x: 1, y: 1, z: 1 }, color = '#888888', generatedCode = null, libraryKey = null } = {}) {
    this.id = id || uid();
    this.type = type;
    this.position = { ...position };
    this.rotation = { ...rotation };
    this.scale = { ...scale };
    this.color = color;
    this.generatedCode = generatedCode;
    this.libraryKey = libraryKey; // e.g. "piano", "tv" — for library lookup
  }
  toJSON() {
    return {
      id: this.id, type: this.type,
      position: { ...this.position }, rotation: { ...this.rotation }, scale: { ...this.scale },
      color: this.color, generatedCode: this.generatedCode, libraryKey: this.libraryKey,
    };
  }
  static fromJSON(o) { return new Structure(o); }
}

export class Doorway {
  constructor({ id, position = { x: 0, y: 0, z: 0 }, wall = 'north', targetRoomId = null } = {}) {
    this.id = id || uid();
    this.position = { ...position };
    this.wall = wall;
    this.targetRoomId = targetRoomId;
  }
  toJSON() { return { ...this, position: { ...this.position } }; }
  static fromJSON(o) { return new Doorway(o); }
}

export class Room {
  constructor({ id, name = 'Room', position = { x: 0, y: 0, z: 0 }, dimensions = { width: 10, height: 4, depth: 10 }, wallColor = '#7a7a7a', floorColor = '#4a4a4a', ceilingColor = '#5a5a5a', structures = [], loci = [], doorways = [] } = {}) {
    this.id = id || uid();
    this.name = name;
    this.position = { ...position };
    this.dimensions = { ...dimensions };
    this.wallColor = wallColor;
    this.floorColor = floorColor;
    this.ceilingColor = ceilingColor;
    this.structures = structures;
    this.loci = loci;
    this.doorways = doorways;
  }
  toJSON() {
    return {
      id: this.id, name: this.name,
      position: this.position, dimensions: this.dimensions,
      wallColor: this.wallColor, floorColor: this.floorColor, ceilingColor: this.ceilingColor,
      structures: this.structures.map(s => s.toJSON()),
      loci: this.loci.map(l => l.toJSON()),
      doorways: this.doorways.map(d => d.toJSON()),
    };
  }
  static fromJSON(o) {
    return new Room({
      ...o,
      structures: (o.structures || []).map(Structure.fromJSON),
      loci: (o.loci || []).map(Locus.fromJSON),
      doorways: (o.doorways || []).map(Doorway.fromJSON),
    });
  }
}

export class Palace {
  constructor({ id, name = 'My Palace', rooms = [], playerSpawn = { x: 0, y: 1.6, z: 0 }, createdAt, updatedAt } = {}) {
    this.id = id || uid();
    this.name = name;
    this.rooms = rooms;
    this.playerSpawn = { ...playerSpawn };
    this.createdAt = createdAt || Date.now();
    this.updatedAt = updatedAt || Date.now();
  }

  getRoomById(id) { return this.rooms.find(r => r.id === id); }
  getRoomByName(name) { return this.rooms.find(r => r.name.toLowerCase() === name.toLowerCase()); }

  /** Find which room the given world position is inside (with margin for doorways) */
  getRoomAt(pos) {
    const MARGIN = 0.5; // extra margin so doorway transitions are smooth
    for (const room of this.rooms) {
      const hw = room.dimensions.width / 2 + MARGIN;
      const hd = room.dimensions.depth / 2 + MARGIN;
      if (pos.x >= room.position.x - hw && pos.x <= room.position.x + hw &&
          pos.z >= room.position.z - hd && pos.z <= room.position.z + hd) {
        return room;
      }
    }
    return null;
  }

  toJSON() {
    return {
      id: this.id, name: this.name,
      rooms: this.rooms.map(r => r.toJSON()),
      playerSpawn: this.playerSpawn,
      createdAt: this.createdAt, updatedAt: this.updatedAt,
    };
  }
  static fromJSON(o) {
    return new Palace({
      ...o,
      rooms: (o.rooms || []).map(Room.fromJSON),
    });
  }
}
