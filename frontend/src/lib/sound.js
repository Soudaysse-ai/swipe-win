// Sons des jeux, synthétisés dans le navigateur (Web Audio) : aucun fichier à
// télécharger. Coupés par défaut ; le joueur les active lui-même (choix mémorisé).
import { useEffect, useState } from 'react';

const KEY = 'dy_sound';
const listeners = new Set();
let enabled = (() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } })();
let ctx = null;
let noiseBuf = null;

function audio() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

export function setSoundEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* stockage indisponible */ }
  if (enabled) audio(); // activation dans le geste de l'utilisateur (exigence des navigateurs)
  listeners.forEach(fn => fn(enabled));
}

export function useSoundEnabled() {
  const [on, setOn] = useState(enabled);
  useEffect(() => { listeners.add(setOn); return () => { listeners.delete(setOn); }; }, []);
  return [on, setSoundEnabled];
}

function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const n = c.createBufferSource();
  n.buffer = noiseBuf;
  return n;
}

function env(c, gain, t0, attack, hold, release) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + attack);
  g.gain.setValueAtTime(Math.max(gain, 0.0002), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  g.connect(c.destination);
  return g;
}

function tone(c, { type = 'sine', from, to = from, t = 0, dur = 0.1, gain = 0.2, attack = 0.004 }) {
  const t0 = c.currentTime + t;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  o.connect(env(c, gain, t0, attack, 0, dur));
  o.start(t0); o.stop(t0 + attack + dur + 0.05);
}

function burst(c, { t = 0, dur = 0.06, gain = 0.15, freq = 1200, q = 1, type = 'bandpass', attack = 0.003, hold = 0 }) {
  const t0 = c.currentTime + t;
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  n.connect(f); f.connect(env(c, gain, t0, attack, hold, dur));
  n.start(t0); n.stop(t0 + attack + hold + dur + 0.05);
}

// Sifflet d'arbitre : note aiguë modulée très vite.
function whistle(c, t, dur) {
  const t0 = c.currentTime + t;
  const o = c.createOscillator();
  const lfo = c.createOscillator();
  const depth = c.createGain();
  o.type = 'sine'; o.frequency.value = 2650;
  lfo.frequency.value = 32; depth.gain.value = 140;
  lfo.connect(depth); depth.connect(o.frequency);
  o.connect(env(c, 0.09, t0, 0.01, dur, 0.06));
  o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.1); lfo.stop(t0 + dur + 0.1);
}

export const sfx = {
  // Pichenette sur un palet, plus forte avec la puissance.
  kick(power = 0.6) {
    const c = audio(); if (!c) return;
    tone(c, { from: 160, to: 55, dur: 0.14, gain: 0.25 + power * 0.35 });
    burst(c, { dur: 0.03, gain: 0.08 + power * 0.1, freq: 2500, q: 0.8 });
  },
  // Choc palet / ballon.
  ball(i = 0.5) {
    const c = audio(); if (!c) return;
    tone(c, { type: 'triangle', from: 760, to: 320, dur: 0.06, gain: 0.06 + i * 0.2 });
    burst(c, { dur: 0.025, gain: 0.04 + i * 0.08, freq: 3200, q: 1.2 });
  },
  // Choc entre deux palets.
  disc(i = 0.5) {
    const c = audio(); if (!c) return;
    tone(c, { type: 'triangle', from: 430, to: 260, dur: 0.07, gain: 0.05 + i * 0.16 });
    burst(c, { dur: 0.03, gain: 0.03 + i * 0.07, freq: 1800, q: 1.5 });
  },
  wall(i = 0.5) {
    const c = audio(); if (!c) return;
    tone(c, { from: 190, to: 110, dur: 0.08, gain: 0.05 + i * 0.15 });
  },
  post(i = 0.5) {
    const c = audio(); if (!c) return;
    tone(c, { from: 1250, dur: 0.45, gain: 0.05 + i * 0.12 });
    tone(c, { from: 1890, dur: 0.3, gain: 0.03 + i * 0.07 });
  },
  pass() {
    const c = audio(); if (!c) return;
    tone(c, { type: 'triangle', from: 660, dur: 0.12, gain: 0.12 });
    tone(c, { type: 'triangle', from: 990, t: 0.11, dur: 0.18, gain: 0.12 });
  },
  // But : clameur du public qui monte puis retombe, coup de sifflet.
  goal() {
    const c = audio(); if (!c) return;
    burst(c, { dur: 1.6, gain: 0.22, freq: 700, q: 0.5, attack: 0.35, hold: 0.6 });
    burst(c, { dur: 1.2, gain: 0.12, freq: 1600, q: 0.7, attack: 0.3, hold: 0.5 });
    whistle(c, 0.05, 0.22);
  },
  whistle(long = false) {
    const c = audio(); if (!c) return;
    if (long) { whistle(c, 0, 0.25); whistle(c, 0.35, 0.25); whistle(c, 0.7, 0.7); } else whistle(c, 0, 0.3);
  },
  // C'est à toi.
  turn() {
    const c = audio(); if (!c) return;
    tone(c, { from: 880, dur: 0.09, gain: 0.07 });
    tone(c, { from: 1320, t: 0.08, dur: 0.12, gain: 0.07 });
  },
  tick() {
    const c = audio(); if (!c) return;
    tone(c, { type: 'square', from: 1500, dur: 0.02, gain: 0.03 });
  },
};
