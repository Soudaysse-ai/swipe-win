// Bot Yas Foot : choisit un palet et un tir en visant le ballon de façon à
// l'envoyer vers la cage adverse (point d'impact « balle fantôme »).
// Normal et Difficile essaient plusieurs tirs avec la vraie physique du jeu et
// gardent le meilleur résultat (but, ballon avancé, cage protégée) ; le tir
// réellement joué garde une petite imprécision, plus forte au niveau Facile.
const { simulate, FIELD, MIN_POWER, MAX_SPEED, FORMATIONS, TEAMS, MAX_PASSES } = require('../foot/engine')._internals;

const { W, H, GOAL_TOP, GOAL_BOTTOM, DISC_R, BALL_R } = FIELD;
const NOISE_DEG = { easy: 14, normal: 6, hard: 1.5 };
const POWERS = { easy: [0.85], normal: [0.65, 0.9], hard: [0.55, 0.8, 1] };
const MAX_SIMS = { easy: 0, normal: 18, hard: 45 };
const cache = new Map();

function rotate(dx, dy, deg) {
  const a = (deg * Math.PI) / 180;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

function candidates(view, me, level) {
  const home = view.players[0] === me;
  const attackX = home ? W + 40 : -40;
  const targets = level === 'easy'
    ? [[attackX, H / 2]]
    : [[attackX, H / 2], [attackX, GOAL_TOP + 40], [attackX, GOAL_BOTTOM - 40]];
  const [bx, by] = view.ball;
  const out = [];
  view.discs[me].forEach(([x, y], disc) => {
    const dist = Math.hypot(bx - x, by - y);
    for (const [tx, ty] of targets) {
      const ux = tx - bx; const uy = ty - by; const ul = Math.hypot(ux, uy);
      const gx = bx - (ux / ul) * (DISC_R + BALL_R);
      const gy = by - (uy / ul) * (DISC_R + BALL_R);
      const ax = gx - x; const ay = gy - y; const al = Math.hypot(ax, ay);
      if (al < 1) continue;
      const cut = (ax * ux + ay * uy) / (al * ul); // 1 = frappe dans l'axe
      if (cut < 0.25) continue;
      for (const p of POWERS[level]) out.push({ disc, dx: (ax / al) * p, dy: (ay / al) * p, pre: cut * 2 - dist / W });
    }
    // Dégagement : droit sur le ballon.
    const cx = bx - x; const cy = by - y; const cl = Math.hypot(cx, cy);
    if (cl > 1) out.push({ disc, dx: (cx / cl) * 0.9, dy: (cy / cl) * 0.9, pre: -dist / W });
  });
  return out.sort((a, b) => b.pre - a.pre);
}

// Valeur d'une position après le tir, du point de vue du bot.
function evaluate(view, me, sim) {
  const home = view.players[0] === me;
  if (sim.goal) return (sim.goal === 'right') === home ? 10_000 : -10_000;
  // Une passe réussie redonne la main : bonus, tant que la limite n'est pas atteinte.
  const passBonus = sim.pass && (view.passes || 0) < MAX_PASSES ? 25 : 0;
  const [bx, by] = sim.ball;
  const ownX = home ? 0 : W;
  let s = (home ? bx / W : 1 - bx / W) * 100;
  const danger = Math.hypot(bx - ownX, by - H / 2);
  if (danger < 260) s -= (260 - danger) * 0.45;
  const mine = sim.discs[me];
  if (mine.some(([x, y]) => (home ? x < bx : x > bx) && Math.abs(y - by) < 120)) s += 15;
  if (mine.some(([x, y]) => Math.hypot(x - ownX, y - H / 2) < 150)) s += 12;
  return s + passBonus;
}

// Avant-match : une équipe libre au hasard et une formation selon le niveau.
function chooseSetup(view, botId, { level, rng }) {
  const taken = new Set(view.players.filter(u => u !== botId).map(u => view.teams?.[u]).filter(Boolean));
  const free = TEAMS.filter(t => !taken.has(t));
  const team = free[rng.int(free.length)];
  const ids = Object.keys(FORMATIONS);
  const formation = level === 'easy' ? ids[rng.int(ids.length)] : (level === 'hard' ? '1-2-1-1' : ids[rng.int(2)]);
  return { type: 'setup', team, formation, ready: true };
}

function chooseShot(view, me, level, rng) {
  const list = candidates(view, me, level);
  let best = list[0];
  const sims = MAX_SIMS[level] ?? 0;
  if (sims && list.length) {
    let bestScore = -Infinity;
    for (const c of list.slice(0, sims)) {
      const sim = simulate(view, me, c.disc, c.dx * MAX_SPEED, c.dy * MAX_SPEED, { frames: false, maxTicks: 520 });
      const score = evaluate(view, me, sim) + c.pre;
      if (score > bestScore) { bestScore = score; best = c; }
    }
  }
  if (!best) {
    // Repli : le palet le plus proche tire droit sur le ballon.
    const [bx, by] = view.ball;
    const disc = view.discs[me].map(([x, y], i) => [Math.hypot(bx - x, by - y), i]).sort((a, b) => a[0] - b[0])[0][1];
    const [x, y] = view.discs[me][disc];
    const l = Math.hypot(bx - x, by - y) || 1;
    best = { disc, dx: ((bx - x) / l) * 0.8, dy: ((by - y) / l) * 0.8 };
  }
  const noise = NOISE_DEG[level] ?? 6;
  const deg = ((rng.int(2001) - 1000) / 1000) * noise;
  let [dx, dy] = rotate(best.dx, best.dy, deg);
  if (level === 'easy') { const k = 0.8 + rng.int(41) / 100; dx *= k; dy *= k; }
  const len = Math.hypot(dx, dy);
  if (len < MIN_POWER * 2) { dx = (dx / (len || 1)) * 0.3; dy = (dy / (len || 1)) * 0.3; }
  return { disc: best.disc, dx: Math.round(dx * 1000) / 1000, dy: Math.round(dy * 1000) / 1000 };
}

function decide(view, botId, { level = 'normal', rng }) {
  if (view.status !== 'playing') return null;
  if (view.phase === 'setup') {
    if (view.ready?.[botId]) return null;
    return { action: chooseSetup(view, botId, { level, rng }), think: [1200, 2400] };
  }
  if (view.phase !== 'play' || view.turn !== botId) return null;
  // La décision est calculée une fois par tour (programmation puis exécution).
  const key = `${botId}:${view.seq}:${view.turnOpensAt}:${level}`;
  let shot = cache.get(key);
  if (!shot) {
    shot = chooseShot(view, botId, level, rng);
    cache.set(key, shot);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return { action: { type: 'shoot', ...shot }, notBefore: view.turnOpensAt, think: [1400, 2600] };
}

module.exports = { decide, _internals: { chooseShot, chooseSetup, candidates, evaluate } };
