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
// La simulation (physics.js) est déterministe et le serveur fait foi. Le
// navigateur du tireur exécute la même simulation pour animer le tir dès le
// relâchement ; les autres reçoivent les images de la trajectoire (événement
// « shot »), puis tout le monde reçoit l'état final officiel.
const { EngineError } = require('../engineError');

const { FIELD, CONSTANTS, shotVelocity, simulate, r2 } = require('./physics');

const { W, H, GOAL_TOP, GOAL_BOTTOM, GOAL_DEPTH, DISC_R, BALL_R, POST_R } = FIELD;
const {
  DISC_MASS, BALL_MASS, DAMP_DISC, DAMP_BALL, MAX_SPEED, MIN_POWER, E_BODY, E_BALL, E_WALL, STOP, SUBSTEPS, FRAME_EVERY,
} = CONSTANTS;
const FRAME_MS = (1000 / 60) * FRAME_EVERY;   // 30 images par seconde
const OPEN_DELAY_MS = 800;      // le temps de voir le terrain avant le premier tir
const TURN_GAP_MS = 300;
const GOAL_PAUSE_MS = 2000;
const END_PAUSE_MS = 2200;
const VS_MS = 2600;             // écran « équipe contre équipe » avant le coup d'envoi
const DISCS = 5;
const MAX_PASSES = 2;

// Formations de l'équipe qui attaque vers la droite (gardien, puis joueurs de champ) ;
// l'autre équipe est symétrique.
const FORMATIONS = {
  // Placement de Soccer Stars : gardien sur sa ligne, deux défenseurs, deux attaquants écartés.
  '2-2': { name: 'Classique', pos: [[26, 300], [164, 238], [164, 362], [308, 130], [308, 470]] },
  '1-2-1-1': { name: 'Équilibrée', pos: [[60, 300], [210, 170], [210, 430], [325, 300], [425, 300]] },
  '1-2-2': { name: 'Offensive', pos: [[60, 300], [200, 180], [200, 420], [405, 190], [405, 410]] },
  '1-3-1': { name: 'Défensive', pos: [[60, 300], [185, 140], [165, 300], [185, 460], [405, 300]] },
  '1-1-2-1': { name: 'Losange', pos: [[60, 300], [175, 300], [300, 170], [300, 430], [425, 300]] },
};
const DEFAULT_FORMATION = '2-2';
const FORMATION = FORMATIONS[DEFAULT_FORMATION].pos;
// Équipes (codes pays) : drapeaux dessinés côté navigateur.
const TEAMS = ['km', 'mg', 'sn', 'ma', 'ci', 'cm', 'ng', 'dz', 'gh', 'eg', 'tn', 'fr', 'br', 'ar', 'it', 'jp'];

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

// ── Physique : voir physics.js (partagé avec le navigateur) ──────────────────

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
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 2 || Math.abs(dy) > 2) throw new EngineError('BAD_SHOT', 'Tir invalide');
  const shot = shotVelocity(dx, dy);
  if (!shot) throw new EngineError('TOO_WEAK', 'Tire un peu plus fort');
  const { power } = shot;
  const sim = simulate(state, userId, disc, shot.vx, shot.vy);

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
  id: 'foot', rulesVersion: '1.2.0', minPlayers: 2, maxPlayers: 2,
  init, view, apply, deadline, timeout, forfeit, result, actionsCount, resume,
  // Choix d'avant-match : chaque joueur choisit de son côté, sans dépendre du plateau.
  versionFreeActions: ['setup'],
  _internals: {
    simulate, shotVelocity, formation, FORMATION, FORMATIONS, TEAMS, MAX_PASSES, MAX_SPEED, FRAME_MS, MIN_POWER, VS_MS,
    FIELD,
  },
};
