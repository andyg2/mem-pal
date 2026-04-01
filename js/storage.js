// storage.js — LocalStorage save/load with debounced auto-save

import { Palace } from './palace.js';

const STORAGE_KEY = 'mem-pal-palace';
let saveTimer = null;

export function savePalace(palace) {
  palace.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(palace.toJSON()));
}

export function loadPalace() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return Palace.fromJSON(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to load palace:', e);
    return null;
  }
}

export function hasSavedPalace() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function deletePalace() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Debounced auto-save — call after every state change */
export function autoSave(palace) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => savePalace(palace), 2000);
}
