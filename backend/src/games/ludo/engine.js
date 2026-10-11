// Yas Ludo — 2 à 4 joueurs, 4 pions chacun.
//
// Modèle du plateau
//  - Parcours principal de 52 cases (0..51) dans le sens horaire.
//  - Chaque couleur part de sa case de départ : rouge 0, vert 13, jaune 26, bleu 39.
//  - Progression d'un pion : -1 = base ; 0..50 = parcours principal (case absolue
//    (départ + p) % 52) ; 51..55 = couloir d'arrivée ; 56 = arrivé.
//  - Cases protégées : les 4 cases de départ et les 4 étoiles (8, 21, 34, 47).
//
// Règles V1 (cf. cahier des charges §9)
//  - Le serveur lance le dé (1..6) ; le navigateur n'affiche que l'animation.
//  - 6 obligatoire pour sortir un pion (placé sur la case de départ).
//  - Un 6 donne un lancer supplémentaire ; le 3e six consécutif est annulé et termine le tour.
//  - Capture : arriver sur une case ordinaire occupée par un adversaire le renvoie à sa base
//    et donne un lancer supplémentaire. Pas de capture sur une case protégée (les pions de
//    couleurs différentes peuvent y cohabiter). Pas de blocage par deux pions.
//  - Arrivée au nombre exact.
//  - Aucun mouvement possible : le tour passe (sauf lancer supplémentaire dû à un 6).
//  - Chronomètre de 20 s par action. À l'expiration, le serveur joue à la place du joueur
//    selon la règle déterministe `autoChoice` ci-dessous ; N expirations consécutives
//    (maxTimeouts, 3 par défaut) = forfait.
const { EngineError } = require('../engineError');

const TRACK = 52;
const HOME = 56;
const START = { red: 0, green: 13, yellow: 26, blue: 39 };
const STARS = [8, 21, 34, 47];
const SAFE = new Set([...Object.values(START), ...STARS]);
// Couleurs attribuées dans le sens horaire selon le nombre de joueurs.
const COLORS_BY_COUNT = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

const absolute = (color, p) => (p >= 0 && p <= 50 ? (START[color] + p) % TRACK : null);

function init({ players, rng, now, config }) {
  if (players.length < 2 || players.length > 4) throw new EngineError('BAD_PLAYERS', 'Yas Ludo se joue de 2 à 4 joueurs');
  const order = [...players].sort((a, b) => a.seat - b.seat).map(p => p.userId);
  const colors = COLORS_BY_COUNT[order.length];
  const turnMs = config.turnSeconds * 1000;
  return {
    players: order,
    colors: Object.fromEntries(order.map((u, i) => [u, colors[i]])),
    tokens: Object.fromEntries(order.map(u => [u, [-1, -1, -1, -1]])),
    turn: order[rng.int(order.length)],
    phase: 'roll',
    dice: null,
    sixes: 0,
    movable: [],
    finished: [],
    forfeited: [],
    timeouts: Object.fromEntries(order.map(u => [u, 0])),
    actions: Object.fromEntries(order.map(u => [u, 0])),
    stats: Object.fromEntries(order.map(u => [u, { captures: 0, sixes: 0, moves: 0 }])),
    lastMove: null,
    lastRoll: null,             // { userId, value, seq } : reste affiché après la fin du tour
    turnMs,
    turnDeadline: now + turnMs,
    status: 'playing',
    endReason: null,
  };
}

function view(state) {
  return {
    players: state.players, colors: state.colors, tokens: state.tokens, turn: state.turn,
    phase: state.phase, dice: state.dice, sixes: state.sixes, movable: state.movable,
    finished: state.finished, forfeited: state.forfeited, lastMove: state.lastMove, lastRoll: state.lastRoll || null,
    turnDeadline: state.turnDeadline, turnMs: state.turnMs, status: state.status,
    timeouts: state.timeouts, safe: [...SAFE], start: START,
  };
}

const active = (s) => s.players.filter(u => !s.finished.includes(u) && !s.forfeited.includes(u));

// Pions déplaçables pour un joueur avec le dé `d`.
function movableTokens(s, userId, d) {
  return s.tokens[userId].map((p, i) => {
    if (p === HOME) return null;
    if (p === -1) return d === 6 ? i : null;
    return p + d <= HOME ? i : null;
  }).filter(i => i !== null);
}

function targetOf(s, userId, i, d) {
  const p = s.tokens[userId][i];
  return p === -1 ? 0 : p + d;
}

// Adversaires capturés si le pion i de userId arrive en progression `to`.
function capturesAt(s, userId, to) {
  const color = s.colors[userId];
  const abs = absolute(color, to);
  if (abs === null || SAFE.has(abs)) return [];
  const caught = [];
  for (const u of s.players) {
    if (u === userId || s.forfeited.includes(u)) continue;
    s.tokens[u].forEach((p, i) => { if (absolute(s.colors[u], p) === abs) caught.push({ userId: u, index: i }); });
  }
  return caught;
}

function nextPlayer(s, from) {
  const list = s.players;
  const idx = list.indexOf(from);
  for (let k = 1; k <= list.length; k++) {
    const u = list[(idx + k) % list.length];
    if (!s.finished.includes(u) && !s.forfeited.includes(u)) return u;
  }
  return null;
}

function startTurn(s, userId, now) {
  s.turn = userId;
  s.phase = 'roll';
  s.dice = null;
  s.sixes = 0;
  s.movable = [];
  s.turnDeadline = now + s.turnMs;
}

// Fin de partie quand il ne reste qu'un joueur actif : il prend la place suivante.
function checkEnd(s, events) {
  const remaining = active(s);
  if (remaining.length <= 1) {
    if (remaining.length === 1) s.finished.push(remaining[0]);
    s.status = 'finished';
    s.endReason = s.endReason || 'all_home';
    s.turn = null;
    s.phase = null;
    s.turnDeadline = null;
    events.push({ type: 'game_over', payload: { order: [...s.finished, ...[...s.forfeited].reverse()] } });
    return true;
  }
  return false;
}

function endTurn(s, now, events) {
  if (checkEnd(s, events)) return;
  const next = nextPlayer(s, s.turn);
  startTurn(s, next, now);
  events.push({ type: 'turn', payload: { userId: next } });
}

// Le joueur garde la main pour relancer.
function extraRoll(s, now, events, reason) {
  s.phase = 'roll';
  s.dice = null;
  s.movable = [];
  s.turnDeadline = now + s.turnMs;
  events.push({ type: 'extra_roll', payload: { userId: s.turn, reason } });
}

function doRoll(s, userId, rng, now, events) {
  const d = rng.int(6) + 1;
  s.dice = d;
  s.lastRoll = { userId, value: d, seq: (s.lastRoll?.seq || 0) + 1 };
  s.stats[userId].sixes += d === 6 ? 1 : 0;
  events.push({ type: 'dice_rolled', payload: { userId, value: d } });
  if (d === 6) {
    s.sixes += 1;
    if (s.sixes === 3) {
      events.push({ type: 'three_sixes', payload: { userId } });
      endTurn(s, now, events);
      return;
    }
  }
  const movable = movableTokens(s, userId, d);
  if (!movable.length) {
    events.push({ type: 'no_move', payload: { userId } });
    if (d === 6) extraRoll(s, now, events, 'six');
    else endTurn(s, now, events);
    return;
  }
  s.phase = 'move';
  s.movable = movable;
  s.turnDeadline = now + s.turnMs;
}

function doMove(s, userId, index, now, events) {
  const d = s.dice;
  const from = s.tokens[userId][index];
  const to = targetOf(s, userId, index, d);
  const caught = capturesAt(s, userId, to);
  for (const c of caught) s.tokens[c.userId][c.index] = -1;
  s.tokens[userId][index] = to;
  s.stats[userId].moves += 1;
  s.stats[userId].captures += caught.length;
  s.lastMove = { userId, index, from, to, captured: caught };
  events.push({ type: 'token_moved', payload: { userId, index, from, to, dice: d, captured: caught } });

  if (s.tokens[userId].every(p => p === HOME)) {
    s.finished.push(userId);
    events.push({ type: 'player_finished', payload: { userId, place: s.finished.length } });
    return endTurn(s, now, events);
  }
  if (d === 6 || caught.length) return extraRoll(s, now, events, caught.length ? 'capture' : 'six');
  return endTurn(s, now, events);
}

function apply(state, userId, action, { rng, now }) {
  if (state.status !== 'playing') throw new EngineError('GAME_OVER', 'La partie est terminée');
  if (!state.players.includes(userId)) throw new EngineError('NOT_PLAYER', 'Vous ne jouez pas dans cette partie');
  if (state.turn !== userId) throw new EngineError('NOT_YOUR_TURN', 'Ce n\'est pas votre tour');
  const s = structuredClone(state);
  const events = [];
  if (action?.type === 'roll') {
    if (s.phase !== 'roll') throw new EngineError('BAD_PHASE', 'Choisis d\'abord un pion à déplacer');
    doRoll(s, userId, rng, now, events);
  } else if (action?.type === 'move') {
    if (s.phase !== 'move') throw new EngineError('BAD_PHASE', 'Lance d\'abord le dé');
    if (!s.movable.includes(action.token)) throw new EngineError('ILLEGAL_MOVE', 'Ce pion ne peut pas bouger');
    doMove(s, userId, action.token, now, events);
  } else {
    throw new EngineError('BAD_ACTION', 'Action inconnue');
  }
  s.timeouts[userId] = 0;
  s.actions[userId] += 1;
  return { state: s, events };
}

/**
 * Coup automatique (chronomètre expiré), règle déterministe :
 *  1. un déplacement qui capture un adversaire ;
 *  2. sinon, sortir un pion de la base (sur un 6) ;
 *  3. sinon, avancer le pion le plus avancé ;
 *  à égalité, le pion de plus petit numéro.
 */
function autoChoice(s, userId) {
  const d = s.dice;
  const opts = s.movable.map(i => ({ i, p: s.tokens[userId][i], caps: capturesAt(s, userId, targetOf(s, userId, i, d)).length }));
  const capture = opts.filter(o => o.caps > 0).sort((a, b) => a.i - b.i)[0];
  if (capture) return capture.i;
  const exit = opts.filter(o => o.p === -1).sort((a, b) => a.i - b.i)[0];
  if (exit) return exit.i;
  return opts.sort((a, b) => b.p - a.p || a.i - b.i)[0].i;
}

function timeout(state, { rng, now, config }) {
  if (state.status !== 'playing') return { state, events: [] };
  const s = structuredClone(state);
  const userId = s.turn;
  const events = [{ type: 'turn_timeout', payload: { userId } }];
  s.timeouts[userId] += 1;
  if (s.timeouts[userId] >= (config.maxTimeouts || 3)) {
    return forfeitInto(s, userId, now, events, 'timeouts_limit');
  }
  if (s.phase === 'roll') {
    doRoll(s, userId, rng, now, events);
    // Le joueur absent ne garde pas la main : si un déplacement est possible, on le joue aussi.
    if (s.status === 'playing' && s.turn === userId && s.phase === 'move') doMove(s, userId, autoChoice(s, userId), now, events);
  } else {
    doMove(s, userId, autoChoice(s, userId), now, events);
  }
  return { state: s, events };
}

function forfeitInto(s, userId, now, events, reason) {
  if (!s.forfeited.includes(userId) && !s.finished.includes(userId)) s.forfeited.push(userId);
  s.tokens[userId] = s.tokens[userId].map(p => (p === HOME ? HOME : -1));
  events.push({ type: 'player_forfeit', payload: { userId, reason } });
  if (active(s).length <= 1) {
    s.endReason = s.finished.length ? 'all_home' : reason === 'timeouts_limit' ? 'timeouts_limit' : 'forfeit';
    checkEnd(s, events);
  } else if (s.turn === userId) {
    endTurn(s, now, events);
  }
  return { state: s, events };
}

function forfeit(state, userId, { now }) {
  if (state.status !== 'playing') return { state, events: [] };
  return forfeitInto(structuredClone(state), userId, now, [], 'forfeit');
}

function deadline(state) {
  if (state.status !== 'playing') return null;
  return { at: state.turnDeadline, userIds: [state.turn] };
}

function resume(state, { now }) {
  if (state.status !== 'playing') return state;
  return { ...state, turnDeadline: now + state.turnMs };
}

// Classement : arrivés dans l'ordre, puis abandons du dernier au premier.
function result(state) {
  if (state.status !== 'finished') return null;
  const order = [...state.finished, ...[...state.forfeited].reverse()];
  return {
    isDraw: false,
    reason: state.endReason,
    placements: order.map((u, i) => ({
      userId: u, place: i + 1, outcome: i === 0 ? 'win' : 'loss',
      stats: {
        moves: state.stats[u].moves, captures: state.stats[u].captures, sixes: state.stats[u].sixes,
        tokensHome: state.tokens[u].filter(p => p === HOME).length, forfeited: state.forfeited.includes(u),
      },
    })),
  };
}

function actionsCount(state, userId) {
  return state.actions[userId] || 0;
}

module.exports = {
  id: 'ludo', rulesVersion: '1.0.0', minPlayers: 2, maxPlayers: 4,
  init, view, apply, deadline, timeout, forfeit, result, actionsCount, resume,
  _internals: { absolute, movableTokens, capturesAt, autoChoice, START, SAFE, HOME },
};
