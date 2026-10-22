// Sons des jeux (Yas Foot, Yas Cards), synthétisés dans le navigateur (Web Audio) :
// aucun fichier à télécharger. Coupés par défaut ; le joueur les active lui-même
// (choix mémorisé, commun à tous les jeux).
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
  // ── Yas Cards ──
  // Carte qui part de la main (petit « fff » de carton).
  cardFlick() {
    const c = audio(); if (!c) return;
    burst(c, { dur: 0.09, gain: 0.13, freq: 2600, q: 0.9, type: 'highpass', attack: 0.01 });
  },
  // Carte posée sur la défausse : claquement sec.
  cardLand() {
    const c = audio(); if (!c) return;
    burst(c, { dur: 0.05, gain: 0.22, freq: 1500, q: 1.1 });
    tone(c, { type: 'triangle', from: 210, to: 120, dur: 0.07, gain: 0.12 });
  },
  // Carte piochée : glissé doux.
  cardDraw() {
    const c = audio(); if (!c) return;
    burst(c, { dur: 0.16, gain: 0.08, freq: 1800, q: 0.6, attack: 0.04 });
  },
  // +2 / +4 : coup sourd puis deux notes qui montent.
  cardPlus(big = false) {
    const c = audio(); if (!c) return;
    tone(c, { from: 140, to: 60, dur: 0.22, gain: 0.32 });
    tone(c, { type: 'square', from: 523, t: 0.08, dur: 0.1, gain: 0.05 });
    tone(c, { type: 'square', from: big ? 880 : 784, t: 0.18, dur: 0.16, gain: 0.05 });
    if (big) tone(c, { type: 'square', from: 1175, t: 0.3, dur: 0.2, gain: 0.05 });
  },
  // Passe ton tour : « bzz » descendant.
  cardSkip() {
    const c = audio(); if (!c) return;
    tone(c, { type: 'sawtooth', from: 330, to: 150, dur: 0.22, gain: 0.07 });
  },
  // Changement de sens : glissando aller-retour.
  cardReverse() {
    const c = audio(); if (!c) return;
    tone(c, { type: 'triangle', from: 400, to: 900, dur: 0.16, gain: 0.1 });
    tone(c, { type: 'triangle', from: 900, to: 400, t: 0.16, dur: 0.16, gain: 0.1 });
  },
  // Joker : arpège scintillant.
  cardWild() {
    const c = audio(); if (!c) return;
    [784, 988, 1175, 1568].forEach((f, i) => tone(c, { type: 'triangle', from: f, t: i * 0.06, dur: 0.16, gain: 0.08 }));
  },
  // « Dernière carte ! » : deux bips vifs.
  lastCard() {
    const c = audio(); if (!c) return;
    tone(c, { type: 'square', from: 988, dur: 0.08, gain: 0.07 });
    tone(c, { type: 'square', from: 1319, t: 0.1, dur: 0.14, gain: 0.07 });
  },
  // Défausse mélangée dans la pioche.
  shuffle() {
    const c = audio(); if (!c) return;
    for (let i = 0; i < 6; i++) burst(c, { t: i * 0.05, dur: 0.04, gain: 0.08, freq: 2200 + i * 150, q: 1 });
  },
  // Victoire : petite fanfare.
  fanfare() {
    const c = audio(); if (!c) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(c, { type: 'triangle', from: f, t: i * 0.11, dur: i === 3 ? 0.45 : 0.14, gain: 0.11 }));
  },
  tick() {
    const c = audio(); if (!c) return;
    tone(c, { type: 'square', from: 1500, dur: 0.02, gain: 0.03 });
  },
};
