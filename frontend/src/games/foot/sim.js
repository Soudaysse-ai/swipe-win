// FICHIER GÉNÉRÉ — ne pas modifier : copie de backend/src/games/foot/physics.js
// (npm run sync:foot dans backend/).
// Yas Foot — physique du terrain (palets, ballon, bords, poteaux), pure et déterministe.
//
// Ce fichier est la source unique de la simulation. Le navigateur en utilise une
// copie (frontend/src/games/foot/sim.js, générée par `npm run sync:foot`) pour
// animer un tir dès que le joueur relâche, sans attendre le serveur : les deux
// calculs donnent exactement les mêmes positions (mêmes opérations, uniquement
// + − × ÷ et racine carrée, arrondies de la même façon par tous les navigateurs).
// Un test vérifie que la copie est identique.
//
// Pas de dépendance, pas de Math.hypot ni de fonction trigonométrique ici : leur
// précision peut varier d'un moteur JavaScript à l'autre.

const W = 1000;                 // longueur du terrain (axe x, buts à gauche et à droite)
const H = 600;                  // largeur du terrain (axe y)
// Proportions de Soccer Stars : buts larges (40 % de la largeur), ballon ≈ 6 %.
const GOAL_TOP = 180;
const GOAL_BOTTOM = 420;
const GOAL_DEPTH = 60;
const DISC_R = 32;
const BALL_R = 18;
const POST_R = 6;
const DISC_MASS = 2;
const BALL_MASS = 1;
const DAMP_DISC = 0.982;        // frottement par pas (60 pas par seconde)
const DAMP_BALL = 0.986;
const MAX_SPEED = 15;           // vitesse d'un tir à pleine puissance (unités par pas)
const MIN_POWER = 0.05;
const E_BODY = 0.88;            // rebond entre palets
const E_BALL = 0.92;            // rebond palet / ballon
const E_WALL = 0.72;            // rebond sur les bords et les poteaux
const STOP = 0.05;
const SUBSTEPS = 2;
const MAX_TICKS = 900;          // 15 s au plus par tir
const TICK_MS = 1000 / 60;
const FRAME_EVERY = 2;          // images transmises : une sur deux pas (30 par seconde)
const MAX_HITS = 80;
const POSTS = [[0, GOAL_TOP], [0, GOAL_BOTTOM], [W, GOAL_TOP], [W, GOAL_BOTTOM]];

const r2 = (x) => Math.round(x * 100) / 100;

// Tir demandé (dx, dy : direction et puissance, longueur ≤ 1) → vitesse du palet.
// Renvoie null si le tir est trop faible.
function shotVelocity(dx, dy) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len >= MIN_POWER)) return null;
  const power = len < 1 ? len : 1;
  return { power, vx: (dx / len) * power * MAX_SPEED, vy: (dy / len) * power * MAX_SPEED };
}

// Renvoie la vitesse d'impact (0 sans choc) : sert aux passes et aux sons.
function collide(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const ia = 1 / a.m;
  const ib = 1 / b.m;
  const sum = ia + ib;
  const overlap = min - d;
  a.x -= nx * overlap * (ia / sum); a.y -= ny * overlap * (ia / sum);
  b.x += nx * overlap * (ib / sum); b.y += ny * overlap * (ib / sum);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return 0;
  const j = (-(1 + (a.ball || b.ball ? E_BALL : E_BODY)) * rv) / sum;
  a.vx -= j * ia * nx; a.vy -= j * ia * ny;
  b.vx += j * ib * nx; b.vy += j * ib * ny;
  return -rv;
}

// Poteaux : cercles fixes. Renvoie la vitesse d'impact (0 sans choc).
function posts(b) {
  let hit = 0;
  for (const [px, py] of POSTS) {
    const dx = b.x - px;
    const dy = b.y - py;
    const min = b.r + POST_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    b.x = px + nx * min; b.y = py + ny * min;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + E_WALL) * vn * nx; b.vy -= (1 + E_WALL) * vn * ny; hit = Math.max(hit, -vn); }
  }
  return hit;
}

// Bords du terrain, ouverts entre les poteaux sur les cages ; filets des cages.
// Renvoie la vitesse d'impact (0 sans choc).
function walls(b) {
  const r = b.r;
  const fitsMouth = b.y >= GOAL_TOP + r && b.y <= GOAL_BOTTOM - r;
  let hit = 0;
  const bounce = (axis, sign) => {
    const v = axis === 'x' ? b.vx : b.vy;
    if (v * sign < 0) hit = Math.max(hit, Math.abs(v));
    if (axis === 'x') b.vx = sign * Math.abs(b.vx) * E_WALL; else b.vy = sign * Math.abs(b.vy) * E_WALL;
  };
  if (b.x < 0 || b.x > W) {
    const left = b.x < 0;
    if (left && b.x < -GOAL_DEPTH + r) { b.x = -GOAL_DEPTH + r; bounce('x', 1); }
    if (!left && b.x > W + GOAL_DEPTH - r) { b.x = W + GOAL_DEPTH - r; bounce('x', -1); }
    if (b.y < GOAL_TOP + r) { b.y = GOAL_TOP + r; bounce('y', 1); }
    if (b.y > GOAL_BOTTOM - r) { b.y = GOAL_BOTTOM - r; bounce('y', -1); }
    return hit;
  }
  if (b.y < r) { b.y = r; bounce('y', 1); }
  if (b.y > H - r) { b.y = H - r; bounce('y', -1); }
  if (b.x < r && !fitsMouth) { b.x = r; bounce('x', 1); }
  if (b.x > W - r && !fitsMouth) { b.x = W - r; bounce('x', -1); }
  return hit;
}

/**
 * Simule un tir. `pos` : { players, discs, ball } (état ou vue). Renvoie les
 * positions finales, les images de la trajectoire (palets du joueur 0, palets du
 * joueur 1, ballon ; une image tous les `frameEvery` pas), le but éventuel
 * ('left' : cage de gauche, ou 'right'), la passe éventuelle ({ to } : palet
 * coéquipier touché) et les chocs ([image, 'ball' | 'disc' | 'wall' | 'post',
 * intensité 0–1, x, y]) pour les sons et les étincelles.
 */
function simulate(pos, userId, disc, vx, vy, { maxTicks = MAX_TICKS, frames: keepFrames = true, frameEvery = FRAME_EVERY } = {}) {
  const bodies = [];
  for (const u of pos.players) {
    pos.discs[u].forEach(([x, y], i) => bodies.push({ x, y, vx: 0, vy: 0, r: DISC_R, m: DISC_MASS, damp: DAMP_DISC, owner: u, i }));
  }
  const ball = { x: pos.ball[0], y: pos.ball[1], vx: 0, vy: 0, r: BALL_R, m: BALL_MASS, damp: DAMP_BALL, ball: true };
  bodies.push(ball);
  const shooter = bodies.find(b => b.owner === userId && b.i === disc);
  shooter.vx = vx; shooter.vy = vy;
  const snap = () => bodies.map(b => [Math.round(b.x), Math.round(b.y)]);
  const frames = keepFrames ? [snap()] : null;
  const touches = [];   // palets ayant touché le ballon, dans l'ordre (sans doublon consécutif)
  const hits = [];
  const hit = (t, kind, speed, at) => {
    if (speed < 0.6 || hits.length >= MAX_HITS) return;
    const f = Math.floor(t / frameEvery);
    const last = hits[hits.length - 1];
    if (last && last[0] === f && last[1] === kind) return;
    hits.push([f, kind, Math.round(Math.min(1, speed / MAX_SPEED) * 100) / 100, Math.round(at.x), Math.round(at.y)]);
  };
  // Point de contact entre deux corps (pour placer les étincelles).
  const contact = (a, c) => ({ x: a.x + ((c.x - a.x) * a.r) / (a.r + c.r), y: a.y + ((c.y - a.y) * a.r) / (a.r + c.r) });
  let goal = null;
  let ticks = 0;
  for (let t = 1; t <= maxTicks; t++) {
    ticks = t;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const b of bodies) { b.x += b.vx / SUBSTEPS; b.y += b.vy / SUBSTEPS; }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i]; const c = bodies[j];
          const speed = collide(a, c);
          if (!speed) continue;
          if (a.ball || c.ball) {
            const d = a.ball ? c : a;
            if (touches[touches.length - 1] !== d) touches.push(d);
            hit(t, 'ball', speed, contact(a, c));
          } else hit(t, 'disc', speed, contact(a, c));
        }
      }
      for (const b of bodies) {
        const p = posts(b);
        if (p) hit(t, 'post', p, b);
        const w = walls(b);
        if (w) hit(t, 'wall', w * (b.ball ? 1 : 0.7), b);
      }
    }
    let moving = false;
    for (const b of bodies) {
      b.vx *= b.damp; b.vy *= b.damp;
      if (b.vx * b.vx + b.vy * b.vy < STOP * STOP) { b.vx = 0; b.vy = 0; } else moving = true;
    }
    if (ball.x < -BALL_R) goal = 'left';
    else if (ball.x > W + BALL_R) goal = 'right';
    if (keepFrames && (t % frameEvery === 0 || goal || !moving)) frames.push(snap());
    if (goal || !moving) break;
  }
  // Passe : le tireur touche le ballon, puis le premier autre palet touché est un coéquipier.
  let pass = null;
  if (touches[0] === shooter) {
    const next = touches.find(d => d !== shooter);
    if (next && next.owner === userId) pass = { to: next.i };
  }
  const out = { discs: {}, ball: [r2(ball.x), r2(ball.y)], frames, goal, ticks, pass, hits };
  for (const u of pos.players) out.discs[u] = bodies.filter(b => b.owner === u).map(b => [r2(b.x), r2(b.y)]);
  return out;
}

const FIELD = { W, H, GOAL_TOP, GOAL_BOTTOM, GOAL_DEPTH, DISC_R, BALL_R, POST_R };
const CONSTANTS = {
  DISC_MASS, BALL_MASS, DAMP_DISC, DAMP_BALL, MAX_SPEED, MIN_POWER, E_BODY, E_BALL, E_WALL, STOP, SUBSTEPS,
  MAX_TICKS, TICK_MS, FRAME_EVERY,
};

export { FIELD, CONSTANTS, shotVelocity, simulate, r2 };
