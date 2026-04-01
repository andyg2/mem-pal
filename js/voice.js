// voice.js — Web Speech API integration

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let listening = false;
let onTranscriptCb = null;
let supported = false;

export function isSupported() { return supported; }
export function isListening() { return listening; }

export function init() {
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition not supported in this browser');
    return;
  }
  supported = true;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.addEventListener('result', (e) => {
    const last = e.results[e.results.length - 1];
    const transcript = last[0].transcript.trim();
    const isFinal = last.isFinal;
    if (onTranscriptCb) onTranscriptCb({ transcript, isFinal });
  });

  recognition.addEventListener('end', () => {
    // Auto-restart if we're supposed to be listening
    if (listening) {
      try { recognition.start(); } catch (e) { /* already started */ }
    }
  });

  recognition.addEventListener('error', (e) => {
    if (e.error === 'not-allowed') {
      listening = false;
      console.error('Microphone access denied');
    }
  });
}

export function onTranscript(cb) { onTranscriptCb = cb; }

export function startListening() {
  if (!supported || listening) return;
  listening = true;
  try { recognition.start(); } catch (e) { /* already started */ }
}

export function stopListening() {
  if (!supported || !listening) return;
  listening = false;
  try { recognition.stop(); } catch (e) { /* already stopped */ }
}

export function toggleListening() {
  if (listening) stopListening();
  else startListening();
  return listening;
}
