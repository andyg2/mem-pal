// hud.js — Crosshair, voice status, command toasts, room name display

let toastTimeout = null;
let generatingState = false;

export function setRoomName(name) {
  const el = document.getElementById('room-name');
  if (el) el.textContent = name || '';
}

export function setVoiceActive(active) {
  const el = document.getElementById('voice-indicator');
  if (el) {
    el.textContent = active ? '🎙 Listening...' : '🎙 Off';
    el.classList.toggle('active', active);
  }
}

export function setTranscript(text) {
  const el = document.getElementById('voice-transcript');
  if (el) el.textContent = text || '';
}

export function showToast(message, duration = 2500, isError = false) {
  const el = document.getElementById('command-toast');
  if (!el) return;
  el.textContent = message;
  el.style.opacity = '1';
  if (isError) {
    el.classList.add('error');
    duration = 8000;
  } else {
    el.classList.remove('error');
  }
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.style.opacity = '0';
    el.classList.remove('error');
  }, duration);
}

export function showGeneratingState(prompt) {
  generatingState = true;
  const el = document.getElementById('command-toast');
  if (!el) return;
  clearTimeout(toastTimeout);
  el.innerHTML = '<span class="loader"></span> Generating: "' + prompt.replace(/</g, '&lt;') + '"...';
  el.style.opacity = '1';
  el.classList.remove('error');
}

export function hideGeneratingState() {
  generatingState = false;
  const el = document.getElementById('command-toast');
  if (!el) return;
  el.innerHTML = '';
  el.style.opacity = '0';
}

export function setTargetInfo(text) {
  const el = document.getElementById('target-info');
  if (el) el.textContent = text || '';
}
