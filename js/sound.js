// Optional confirmation ticks, generated on the device with Web Audio (no files, no network).
// Each kind of stamp has its own short sound, so a stamp can be confirmed without looking:
//   ablation: one low tick (PF higher, RF lower) · milestone: two rising notes ·
//   map: two quick high ticks · lesion set start/end: two low ticks · undo: falling.
// Kept short, soft and tonal so it can't be mistaken for an equipment alarm.

import * as store from './store.js';

let audio = null;

export function soundOn() {
  return store.getMeta('tickSound') === true;
}

const PATTERNS = {
  ablation: [[520, 0]],
  // PF and RF: same single tick, PF higher and RF lower, so the energy can be told by ear.
  PF: [[620, 0]],
  RF: [[420, 0]],
  milestone: [[520, 0], [780, 0.09]],
  map: [[700, 0], [700, 0.08]],
  set: [[400, 0], [400, 0.08]],
  undo: [[520, 0], [390, 0.09]],
};

export function tick(kind, { force = false } = {}) {
  if (!force && !soundOn()) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const start = audio.currentTime + 0.01;
    for (const [freq, at] of PATTERNS[kind] ?? PATTERNS.ablation) {
      const t = start + at;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    }
  } catch {
    // No audio available: the visual confirmation still works.
  }
}
