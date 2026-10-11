// Bot Yas Penalty : choisit une zone de tir ou de plongeon sans jamais voir le choix
// de l'adversaire (seul l'historique des tirs déjà révélés est utilisé).
// Facile : au hasard ; Normal : évite un peu le centre au tir ;
// Difficile : repère les habitudes de l'adversaire dans l'historique.
const ZONES = [1, 2, 3, 4, 5];
const SHOOTER_WEIGHTS = { 1: 12, 2: 12, 3: 6, 4: 12, 5: 12 };

function weighted(weights, rng) {
  const total = ZONES.reduce((t, z) => t + weights[z], 0);
  let x = rng.int(total);
  for (const z of ZONES) {
    x -= weights[z];
    if (x < 0) return z;
  }
  return ZONES[ZONES.length - 1];
}

function frequencies(history, pick) {
  const f = Object.fromEntries(ZONES.map(z => [z, 0]));
  for (const h of history) { const z = pick(h); if (z != null) f[z] += 1; }
  return f;
}

function chooseZone(view, botId, { level = 'normal', rng }) {
  const k = view.kick;
  const opp = view.players.find(u => u !== botId);
  if (level === 'easy') return ZONES[rng.int(ZONES.length)];
  if (level === 'hard' && rng.int(100) < 55) {
    if (k.myRole === 'keeper') {
      const f = frequencies(view.history.filter(h => h.shooter === opp), h => h.shot);
      const seen = ZONES.reduce((t, z) => t + f[z], 0);
      if (seen >= 2) {
        const top = Math.max(...ZONES.map(z => f[z]));
        const best = ZONES.filter(z => f[z] === top);
        return best[rng.int(best.length)];
      }
    } else {
      const f = frequencies(view.history.filter(h => h.keeper === opp), h => h.dive);
      const seen = ZONES.reduce((t, z) => t + f[z], 0);
      if (seen >= 2) {
        const low = Math.min(...ZONES.map(z => f[z]));
        const best = ZONES.filter(z => f[z] === low);
        return best[rng.int(best.length)];
      }
    }
  }
  return k.myRole === 'shooter' ? weighted(SHOOTER_WEIGHTS, rng) : ZONES[rng.int(ZONES.length)];
}

function decide(view, botId, opts) {
  const k = view.kick;
  if (view.status !== 'playing' || !k || !k.myRole || k.myChoice != null) return null;
  return { action: { type: 'choose', zone: chooseZone(view, botId, opts) }, notBefore: k.opensAt, think: [1200, 3000] };
}

module.exports = { decide, _internals: { chooseZone } };
