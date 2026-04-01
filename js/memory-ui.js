// memory-ui.js — Modal overlay for placing/viewing memory items, locus orb interaction

import { controls } from './controls.js';
import { MemoryItem, Locus } from './palace.js';
import { buildLocusMesh, getPlacementPosition, worldToRoom, meshIndex } from './builder.js';
import { showToast } from './hud.js';

let currentPalace = null;
let currentRoom = null;
let currentLocus = null;
let onSaveCallback = null;

export function init(palace, getSaveCallback) {
  currentPalace = palace;
  onSaveCallback = getSaveCallback;
  setupModal();
}

export function setPalace(palace) {
  currentPalace = palace;
}

function setupModal() {
  const saveBtn = document.getElementById('memory-save');
  const cancelBtn = document.getElementById('memory-cancel');

  saveBtn.addEventListener('click', () => {
    const hint = document.getElementById('memory-hint').value.trim();
    const content = document.getElementById('memory-content').value.trim();
    if (!content) {
      showToast('Memory content cannot be empty');
      return;
    }

    const item = new MemoryItem({ hint, content });

    if (currentLocus) {
      // Placing into existing locus
      currentLocus.memoryItem = item;
      // Update orb color
      const mesh = meshIndex.get(currentLocus.id);
      if (mesh) {
        mesh.material.color.set('#44aaff');
        mesh.material.emissive.set('#2266cc');
      }
    } else if (currentRoom) {
      // Create new locus at placement position
      const { position: worldPos } = getPlacementPosition();
      const localPos = worldToRoom(worldPos, currentRoom);
      localPos.y = 1.2; // eye-ish level
      const locus = new Locus({ position: localPos, label: hint, memoryItem: item });
      currentRoom.loci.push(locus);

      // Build orb
      const group = currentRoom._group;
      if (group) buildLocusMesh(locus, group, currentRoom);
    }

    closeModal();
    showToast('Memory placed!');
    if (onSaveCallback) onSaveCallback();
  });

  cancelBtn.addEventListener('click', closeModal);

  // Keyboard shortcuts for memory modal
  const modal = document.getElementById('memory-modal');
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelBtn.click();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.target.tagName !== 'TEXTAREA')) {
      e.preventDefault();
      saveBtn.click();
    }
  });

  // Ctrl+Enter in textarea triggers save
  document.getElementById('memory-content').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      saveBtn.click();
    }
  });

  // Keyboard shortcuts for memory-view modal
  const viewModal = document.getElementById('memory-view');
  viewModal.addEventListener('keydown', (e) => {
    const revealBtn = document.getElementById('memory-view-reveal');
    const closeBtn = document.getElementById('memory-view-close');
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      revealBtn.click();
    } else if (e.key === 'Escape') {
      closeBtn.click();
    }
  });
}

export function openPlaceMemory(room, locus = null, roomGroup = null) {
  currentRoom = room;
  currentRoom._group = roomGroup;
  currentLocus = locus;

  document.getElementById('memory-hint').value = locus?.memoryItem?.hint || '';
  document.getElementById('memory-content').value = locus?.memoryItem?.content || '';
  document.getElementById('memory-modal').style.display = 'flex';
  document.getElementById('memory-modal-title').textContent = locus?.memoryItem ? 'Edit Memory' : 'Place Memory';

  controls.unlock();
}

export function showMemory(locus) {
  if (!locus?.memoryItem) return;
  const item = locus.memoryItem;

  const viewEl = document.getElementById('memory-view');
  const hintEl = document.getElementById('memory-view-hint');
  const contentEl = document.getElementById('memory-view-content');
  const revealBtn = document.getElementById('memory-view-reveal');
  const closeBtn = document.getElementById('memory-view-close');

  hintEl.textContent = item.hint || '(no hint)';
  contentEl.textContent = item.content;
  contentEl.style.display = 'none';
  revealBtn.style.display = '';
  viewEl.style.display = 'flex';

  controls.unlock();

  revealBtn.onclick = () => {
    contentEl.style.display = '';
    revealBtn.style.display = 'none';
  };
  closeBtn.onclick = () => {
    viewEl.style.display = 'none';
    controls.lock();
  };
}

function closeModal() {
  document.getElementById('memory-modal').style.display = 'none';
  document.getElementById('memory-hint').value = '';
  document.getElementById('memory-content').value = '';
  currentLocus = null;
  currentRoom = null;
  controls.lock();
}
