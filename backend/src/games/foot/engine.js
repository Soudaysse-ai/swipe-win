// Yas Foot — football de table à deux joueurs (« button football »).
//
// Chaque joueur a 5 palets. À son tour, il tire UN de ses palets comme une
// fronde (direction + puissance). Le serveur simule la physique (frottement,
// rebonds entre palets, ballon, bords, poteaux) jusqu'à l'arrêt complet, puis
// la main passe à l'adversaire. Un but : le ballon franchit entièrement la ligne
// entre les poteaux. Après un but, les palets reprennent leur place et l'équipe
// qui a encaissé engage.
// Fin : premier à `goalsToWin` buts (3), ou fin du temps de jeu (`matchSeconds`,
// 5 min) — le score décide, égalité possible.
//
// Avant le coup d'envoi (`setupSeconds`, 15 s) : chaque joueur choisit son équipe
// (drapeau, deux joueurs ne peuvent pas prendre la même) et sa formation. Quand
// les deux sont prêts, ou à la fin du compte à rebours, la partie commence.
// Passes : si le tir envoie le ballon sur un coéquipier (le tireur touche le
// ballon, puis le premier autre palet touché est de son équipe), le joueur
// rejoue — au plus `MAX_PASSES` fois de suite.
//
// La simulation est déterministe et entièrement calculée côté serveur : le
// navigateur reçoit les images de la trajectoire (événement « shot ») pour
// l'animer, puis l'état final officiel.
const { EngineError } = require('../engineError');

const W = 1000;                 // longueur du terrain (axe x, buts à gauche et à droite)
const H = 600;                  // largeur du terrain (axe y)
const GOAL_TOP = 200;
const GOAL_BOTTOM = 400;
const GOAL_DEPTH = 55;
const DISC_R = 32;
const BALL_R = 15;
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
const FRAME_EVERY = 2;          // une image sur deux pas : 30 images par seconde
const FRAME_MS = 1000 / 30;
const OPEN_DELAY_MS = 800;      // le temps de voir le terrain avant le premier tir
const TURN_GAP_MS = 300;
const GOAL_PAUSE_MS = 2000;
const END_PAUSE_MS = 2200;
const VS_MS = 2600;             // écran « équipe contre équipe » avant le coup d'envoi
const DISCS = 5;
const MAX_PASSES = 2;
const MAX_HITS = 80;

// Formations de l'équipe qui attaque vers la droite (gardien, puis joueurs de champ) ;
// l'autre équipe est symétrique.
const FORMATIONS = {
  '1-2-1-1': { name: 'Équilibrée', pos: [[60, 300], [210, 170], [210, 430], [325, 300], [425, 300]] },
  '1-2-2': { name: 'Offensive', pos: [[60, 300], [200, 180], [200, 420], [405, 190], [405, 410]] },
  '1-3-1': { name: 'Défensive', pos: [[60, 300], [185, 140], [165, 300], [185, 460], [405, 300]] },
  '1-1-2-1': { name: 'Losange', pos: [[60, 300], [175, 300], [300, 170], [300, 430], [425, 300]] },
};
const DEFAULT_FORMATION = '1-2-1-1';
const FORMATION = FORMATIONS[DEFAULT_FORMATION].pos;
// Équipes (codes pays) : drapeaux dessinés côté navigateur.
const TEAMS = ['km', 'mg', 'sn', 'ma', 'ci', 'cm', 'ng', 'dz', 'gh', 'eg', 'tn', 'fr', 'br', 'ar', 'it', 'jp'];
const POSTS = [[0, GOAL_TOP], [0, GOAL_BOTTOM], [W, GOAL_TOP], [W, GOAL_BOTTOM]];

const r2 = (x) => Math.round(x * 100) / 100;
const other = (s, u) => s.players.find(p => p !== u);

function formation(s) {
  const [home, away] = s.players;
  const pos = (u) => (FORMATIONS[s.formations?.[u]] || FORMATIONS[DEFAULT_FORMATION]).pos;
  s.discs = {
    [home]: pos(home).map(([x, y]) => [x, y]),
    [away]: pos(away).map(([x, y]) => [W - x, H - y]),
  };
  s.ball = [W / 2, H / 2];
}

// Coup d'envoi : équipes manquantes attribuées (deux drapeaux différents), formations
// en place, chronomètre du match lancé.
function kickoff(s, now, { vs = true } = {}) {
  const [a, b] = s.players;
  if (!s.teams[a]) s.teams[a] = TEAMS.find(t => t !== s.teams[b]);
  if (!s.teams[b]) s.teams[b] = TEAMS.find(t => t !== s.teams[a]);
  formation(s);
  s.phase = 'play';
  s.setupEndsAt = null;
  const opens = now + (vs ? VS_MS : OPEN_DELAY_MS);
  s.turnOpensAt = opens;
  s.turnDeadline = opens + s.turnMs;
  s.matchEndsAt = opens + s.matchMs;
}

function init({ players, rng, now, config }) {
  if (players.length !== 2) throw new EngineError('BAD_PLAYERS', 'Yas Foot se joue à 2');
  const order = [...players].sort((a, b) => a.seat - b.seat).map(p => p.userId);
  const turnMs = (config.turnSeconds || 20) * 1000;
  const setupMs = (config.setupSeconds ?? 15) * 1000;
  const s = {
    players: order,                               // [0] attaque vers la droite, [1] vers la gauche
    discs: null,
    ball: null,
    teams: Object.fromEntries(order.map(u => [u, null])),
    formations: Object.fromEntries(order.map(u => [u, DEFAULT_FORMATION])),
    ready: Object.fromEntries(order.map(u => [u, false])),
    score: Object.fromEntries(order.map(u => [u, 0])),
    shots: Object.fromEntries(order.map(u => [u, 0])),
    passCount: Object.fromEntries(order.map(u => [u, 0])),
    timeouts: Object.fromEntries(order.map(u => [u, 0])),
    goals: [],
    goalsToWin: config.goalsToWin || 3,
    turn: order[rng.int(2)],
    passes: 0,                                    // passes réussies d'affilée par le joueur au tir
    phase: 'setup',                               // setup | play | ending
    seq: 0,
    turnMs,
    matchMs: (config.matchSeconds || 300) * 1000,
    setupEndsAt: now + setupMs,
    turnOpensAt: null,
    turnDeadline: null,
    matchEndsAt: null,
    endAt: null,
    status: 'playing',
    winner: null,
    endReason: null,
  };
  formation(s);
  if (setupMs <= 0) kickoff(s, now, { vs: false });
  return s;
}

const OPTIONS = {
  teams: TEAMS,
  formations: Object.fromEntries(Object.entries(FORMATIONS).map(([id, f]) => [id, { name: f.name, pos: f.pos }])),
};

function view(state) {
  return {
    players: state.players, discs: state.discs, ball: state.ball, score: state.score, shots: state.shots,
    goals: state.goals, goalsToWin: state.goalsToWin, turn: state.turn, phase: state.phase, seq: state.seq,
    teams: state.teams, formations: state.formations, ready: state.ready, setupEndsAt: state.setupEndsAt,
    passes: state.passes, maxPasses: MAX_PASSES, passCount: state.passCount,
    turnMs: state.turnMs, turnOpensAt: state.turnOpensAt, turnDeadline: state.turnDeadline,
    matchEndsAt: state.matchEndsAt, endAt: state.endAt, status: state.status, winner: state.winner,
    endReason: state.endReason, timeouts: state.timeouts,
    options: OPTIONS,
    field: {
      W, H, goalTop: GOAL_TOP, goalBottom: GOAL_BOTTOM, goalDepth: GOAL_DEPTH, discR: DISC_R, ballR: BALL_R, postR: POST_R,
      // Constantes physiques : le navigateur s'en sert pour prévoir la trajectoire pendant la visée.
      physics: {
        discMass: DISC_MASS, ballMass: BALL_MASS, dampDisc: DAMP_DISC, dampBall: DAMP_BALL, maxSpeed: MAX_SPEED,
        eBody: E_BODY, eBall: E_BALL, eWall: E_WALL, stop: STOP, substeps: SUBSTEPS,
      },
    },
  };
}

// ── Physique ────────────────────────────────────────────────────────────────

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
 * joueur 1, ballon), le but éventuel ('left' : cage de gauche, ou 'right'), la
 * passe éventuelle ({ to } : palet coéquipier touché) et les chocs
 * ([image, 'ball' | 'disc' | 'wall' | 'post', intensité 0–1]) pour les sons.
 */
function simulate(pos, userId, disc, vx, vy, { maxTicks = MAX_TICKS, frames: keepFrames = true } = {}) {
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
  const hit = (t, kind, speed) => {
    if (speed < 0.6 || hits.length >= MAX_HITS) return;
    const f = Math.floor(t / FRAME_EVERY);
    const last = hits[hits.length - 1];
    if (last && last[0] === f && last[1] === kind) return;
    hits.push([f, kind, Math.round(Math.min(1, speed / MAX_SPEED) * 100) / 100]);
  };
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
            hit(t, 'ball', speed);
          } else hit(t, 'disc', speed);
        }
      }
      for (const b of bodies) {
        const p = posts(b);
        if (p) hit(t, 'post', p);
        const w = walls(b);
        if (w) hit(t, 'wall', w * (b.ball ? 1 : 0.7));
      }
    }
    let moving = false;
    for (const b of bodies) {
      b.vx *= b.damp; b.vy *= b.damp;
      if (b.vx * b.vx + b.vy * b.vy < STOP * STOP) { b.vx = 0; b.vy = 0; } else moving = true;
    }
    if (ball.x < -BALL_R) goal = 'left';
    else if (ball.x > W + BALL_R) goal = 'right';
    if (keepFrames && (t % FRAME_EVERY === 0 || goal || !moving)) frames.push(snap());
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

// ── Règles ──────────────────────────────────────────────────────────────────

function finish(s, reason) {
  const [a, b] = s.players;
  s.status = 'finished';
  s.phase = null;
  s.winner = s.score[a] === s.score[b] ? null : (s.score[a] > s.score[b] ? a : b);
  s.endReason = reason;
  s.turn = null;
  s.turnDeadline = null;
  s.endAt = null;
}

// Avant-match : équipe, formation, « prêt ». Les deux prêts : coup d'envoi.
function applySetup(state, userId, action, now) {
  if (state.phase !== 'setup') throw new EngineError('NOT_SETUP', 'La partie a déjà commencé');
  const s = structuredClone(state);
  const opp = other(s, userId);
  if (action.team !== undefined && action.team !== null) {
    if (!TEAMS.includes(action.team)) throw new EngineError('BAD_TEAM', 'Équipe inconnue');
    if (s.teams[opp] === action.team) throw new EngineError('TEAM_TAKEN', 'Ton adversaire a déjà pris cette équipe');
    s.teams[userId] = action.team;
  }
  if (action.formation !== undefined && action.formation !== null) {
    if (!FORMATIONS[action.formation]) throw new EngineError('BAD_FORMATION', 'Formation inconnue');
    s.formations[userId] = action.formation;
  }
  if (action.ready === true) s.ready[userId] = true;
  formation(s);
  const events = [{ type: 'setup', payload: { userId, team: s.teams[userId], formation: s.formations[userId], ready: s.ready[userId] } }];
  if (s.players.every(u => s.ready[u])) {
    kickoff(s, now);
    events.push({ type: 'kickoff', payload: { teams: s.teams, formations: s.formations } });
  }
  return { state: s, events };
}

function apply(state, userId, action, { now }) {
  if (state.status !== 'playing') throw new EngineError('GAME_OVER', 'La partie est terminée');
  if (!state.players.includes(userId)) throw new EngineError('NOT_PLAYER', 'Vous ne jouez pas dans cette partie');
  if (action?.type === 'setup') return applySetup(state, userId, action, now);
  if (action?.type !== 'shoot') throw new EngineError('BAD_ACTION', 'Action inconnue');
  if (state.phase === 'setup') throw new EngineError('NOT_OPEN', 'La partie n\'a pas encore commencé');
  if (state.phase !== 'play' || state.turn !== userId) throw new EngineError('NOT_YOUR_TURN', 'Ce n\'est pas ton tour');
  if (now < state.turnOpensAt) throw new EngineError('NOT_OPEN', 'Attends que le jeu s\'arrête');
  const disc = action.disc;
  if (!Number.isInteger(disc) || disc < 0 || disc >= DISCS) throw new EngineError('BAD_DISC', 'Palet invalide');
  const { dx, dy } = action;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new EngineError('BAD_SHOT', 'Tir invalide');
  const len = Math.hypot(dx, dy);
  if (len < MIN_POWER) throw new EngineError('TOO_WEAK', 'Tire un peu plus fort');
  const power = Math.min(1, len);
  const sim = simulate(state, userId, disc, (dx / len) * power * MAX_SPEED, (dy / len) * power * MAX_SPEED);

  const s = structuredClone(state);
  s.discs = sim.discs;
  s.ball = sim.ball;
  s.seq += 1;
  s.shots[userId] += 1;
  s.timeouts[userId] = 0;
  const animMs = Math.round(sim.frames.length * FRAME_MS);
  const [home, away] = s.players;
  const scorer = sim.goal === 'left' ? away : sim.goal === 'right' ? home : null;
  const pass = !scorer && sim.pass && s.passes < MAX_PASSES ? sim.pass : null;
  const events = [{
    type: 'shot',
    payload: {
      seq: s.seq, userId, disc, power: r2(power), frames: sim.frames, frameMs: FRAME_MS, goal: scorer,
      pass: pass ? pass.to : null, hits: sim.hits,
    },
  }];
  let pause = TURN_GAP_MS;
  if (scorer) {
    s.score[scorer] += 1;
    s.goals.push({ userId: scorer, by: userId, own: scorer !== userId });
    events.push({ type: 'goal', payload: { scorer, by: userId, own: scorer !== userId, score: s.score } });
    formation(s);
    s.turn = other(s, scorer); // l'équipe qui encaisse engage
    s.passes = 0;
    pause = GOAL_PAUSE_MS;
  } else if (pass) {
    // Passe réussie : le même joueur rejoue.
    s.passes += 1;
    s.passCount[userId] = (s.passCount[userId] || 0) + 1;
    events.push({ type: 'pass', payload: { userId, from: disc, to: pass.to, count: s.passes, max: MAX_PASSES } });
  } else {
    s.turn = other(s, userId);
    s.passes = 0;
  }
  const opensAt = now + animMs + pause;
  const won = scorer && s.score[scorer] >= s.goalsToWin;
  if (won || opensAt >= s.matchEndsAt) {
    // On laisse l'animation (et le but) se jouer avant de siffler la fin.
    s.phase = 'ending';
    s.endReason = won ? 'goals' : 'time_up';
    s.endAt = now + animMs + (scorer ? GOAL_PAUSE_MS : END_PAUSE_MS);
    s.turn = null;
    s.turnDeadline = null;
  } else {
    s.turnOpensAt = opensAt;
    s.turnDeadline = opensAt + s.turnMs;
  }
  return { state: s, events };
}

function deadline(state) {
  if (state.status !== 'playing') return null;
  if (state.phase === 'setup') return { at: state.setupEndsAt, userIds: [] };
  if (state.phase === 'ending') return { at: state.endAt, userIds: [] };
  if (state.matchEndsAt <= state.turnDeadline) return { at: state.matchEndsAt, userIds: [] };
  return { at: state.turnDeadline, userIds: [state.turn] };
}

function forfeitInto(s, userId, reason, events) {
  s.status = 'finished';
  s.phase = null;
  s.winner = other(s, userId);
  s.endReason = reason;
  s.turn = null;
  s.turnDeadline = null;
  events.push({ type: 'player_forfeit', payload: { userId, reason } });
  return { state: s, events };
}

function timeout(state, { now, config }) {
  if (state.status !== 'playing') return { state, events: [] };
  const s = structuredClone(state);
  if (s.phase === 'setup') {
    kickoff(s, now);
    return { state: s, events: [{ type: 'kickoff', payload: { teams: s.teams, formations: s.formations } }] };
  }
  if (s.phase === 'ending') {
    finish(s, s.endReason || 'goals');
    return { state: s, events: [{ type: 'final_whistle', payload: { score: s.score, winner: s.winner } }] };
  }
  if (now >= s.matchEndsAt) {
    finish(s, 'time_up');
    return { state: s, events: [{ type: 'final_whistle', payload: { score: s.score, winner: s.winner } }] };
  }
  // Pas de tir dans le temps imparti : la main passe.
  const u = s.turn;
  const events = [{ type: 'turn_timeout', payload: { userId: u } }];
  s.timeouts[u] += 1;
  if (s.timeouts[u] >= (config.maxTimeouts || 3)) return forfeitInto(s, u, 'timeouts_limit', events);
  s.turn = other(s, u);
  s.passes = 0;
  s.turnOpensAt = now;
  s.turnDeadline = now + s.turnMs;
  return { state: s, events };
}

function forfeit(state, userId) {
  if (state.status !== 'playing') return { state, events: [] };
  return forfeitInto(structuredClone(state), userId, 'forfeit', []);
}

// Reprise après redémarrage du serveur : nouveau tour complet, au moins une minute de jeu.
function resume(state, { now }) {
  if (state.status !== 'playing') return state;
  const s = structuredClone(state);
  if (s.phase === 'setup') { s.setupEndsAt = now + 10_000; return s; }
  if (s.phase === 'ending') { s.endAt = now + 1000; return s; }
  s.turnOpensAt = now;
  s.turnDeadline = now + s.turnMs;
  s.matchEndsAt = Math.max(s.matchEndsAt, now + 60_000);
  return s;
}

function result(state) {
  if (state.status !== 'finished') return null;
  const stat = (u) => ({
    moves: state.shots[u], shots: state.shots[u], goals: state.score[u], passes: state.passCount?.[u] || 0,
    ownGoals: state.goals.filter(g => g.by === u && g.own).length, score: state.score[u],
  });
  if (!state.winner) {
    return {
      isDraw: true, reason: state.endReason,
      placements: state.players.map(u => ({ userId: u, place: 1, outcome: 'draw', stats: stat(u) })),
    };
  }
  const loser = other(state, state.winner);
  return {
    isDraw: false, reason: state.endReason,
    placements: [
      { userId: state.winner, place: 1, outcome: 'win', stats: stat(state.winner) },
      { userId: loser, place: 2, outcome: 'loss', stats: stat(loser) },
    ],
  };
}

function actionsCount(state, userId) {
  return state.shots[userId] || 0;
}

module.exports = {
  id: 'foot', rulesVersion: '1.1.0', minPlayers: 2, maxPlayers: 2,
  init, view, apply, deadline, timeout, forfeit, result, actionsCount, resume,
  // Choix d'avant-match : chaque joueur choisit de son côté, sans dépendre du plateau.
  versionFreeActions: ['setup'],
  _internals: {
    simulate, formation, FORMATION, FORMATIONS, TEAMS, MAX_PASSES, MAX_SPEED, FRAME_MS, MIN_POWER, VS_MS,
    FIELD: { W, H, GOAL_TOP, GOAL_BOTTOM, GOAL_DEPTH, DISC_R, BALL_R, POST_R },
  },
};
