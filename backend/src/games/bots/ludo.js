// Bot Yas Ludo : lance le dé puis choisit un pion d'après la position visible.
// Facile : pion au hasard ; Normal : bonne règle avec une part d'hésitation ;
// Difficile : capture, sécurité, sorties de base et couloir d'arrivée en priorité.
const { absolute, capturesAt, SAFE, HOME } = require('../ludo/engine')._internals;

const NOISE = { easy: 0, normal: 30, hard: 0 };

// Une case du parcours est menacée si un pion adverse peut l'atteindre au prochain lancer.
function threatened(view, botId, abs) {
  if (abs === null || SAFE.has(abs)) return false;
  for (const u of view.players) {
    if (u === botId || view.forfeited.includes(u) || view.finished.includes(u)) continue;
    for (const p of view.tokens[u]) {
      if (p < 0 || p > 50) continue;
      const dist = (abs - absolute(view.colors[u], p) + 52) % 52;
      if (dist >= 1 && dist <= 6 && p + dist <= 50) return true;
    }
  }
  return false;
}

function moveScore(view, botId, index) {
  const d = view.dice;
  const color = view.colors[botId];
  const from = view.tokens[botId][index];
  const to = from === -1 ? 0 : from + d;
  const caps = capturesAt(view, botId, to).length;
  let s = caps * 100;
  if (to === HOME) s += 80;
  else if (to > 50) s += 45;
  if (from === -1) s += 55;
  const fromAbs = absolute(color, from);
  const toAbs = absolute(color, to);
  if (from >= 0 && from <= 50 && threatened(view, botId, fromAbs)) s += 35;
  if (to <= 50 && !caps && threatened(view, botId, toAbs)) s -= 50;
  if (toAbs !== null && SAFE.has(toAbs)) s += 15;
  return s + to / 10;
}

function chooseToken(view, botId, { level = 'normal', rng }) {
  const movable = view.movable || [];
  if (!movable.length) return null;
  if (level === 'easy') return movable[rng.int(movable.length)];
  const noise = NOISE[level] ?? 0;
  let best = null; let bestScore = -Infinity;
  for (const i of movable) {
    const s = moveScore(view, botId, i) + (noise ? rng.int(noise) : 0);
    if (s > bestScore) { best = i; bestScore = s; }
  }
  return best;
}

function decide(view, botId, opts) {
  if (view.status !== 'playing' || view.turn !== botId) return null;
  if (view.phase === 'roll') return { action: { type: 'roll' }, think: [1300, 1900] };
  if (view.phase === 'move') {
    const token = chooseToken(view, botId, opts);
    return token == null ? null : { action: { type: 'move', token }, think: [1300, 1800] };
  }
  return null;
}

module.exports = { decide, _internals: { chooseToken, moveScore, threatened } };
