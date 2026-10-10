// Yas Penalty — séance de tirs au but à deux joueurs.
//
// Chaque tir : le tireur choisit une zone (1 haut gauche, 2 bas gauche, 3 centre,
// 4 haut droite, 5 bas droite), le gardien choisit sa zone de plongeon. Les deux
// choix sont verrouillés et cachés à l'adversaire jusqu'à la révélation.
// Les rôles alternent à chaque tir. 5 tirs chacun, arrêt anticipé quand l'un ne peut
// plus rattraper l'autre, mort subite ensuite, match nul après 20 tirs chacun.
// Chronomètre : 10 s par décision (voir `resolveShot`).
const { EngineError } = require('../engineError');

const ZONES = [1, 2, 3, 4, 5];
const REGULATION = 5;
const REVEAL_MS = 2600; // durée de l'animation de révélation avant la décision suivante

/**
 * Modèle de résolution V1, volontairement simple et déterministe :
 *  - tireur sans décision → tir manqué ;
 *  - sinon gardien sans décision → but ;
 *  - sinon même zone → arrêt, zones différentes → but.
 * Point d'extension prévu (puissance, précision, capacités des gardiens) sans
 * avantage payant : remplacer cette fonction par un modèle versionné.
 */
function resolveShot({ shot, dive }) {
  if (shot == null) return { goal: false, outcome: 'missed' };
  if (dive == null) return { goal: true, outcome: 'goal' };
  return shot === dive ? { goal: false, outcome: 'saved' } : { goal: true, outcome: 'goal' };
}

function newKick(s, k, now, config, delay = 0) {
  const shooter = s.players[(s.firstShooterIndex + k) % 2];
  const keeper = s.players.find(u => u !== shooter);
  const decisionMs = (config.decisionSeconds || 10) * 1000;
  s.kick = { index: k, shooter, keeper, shot: null, dive: null, opensAt: now + delay, deadline: now + delay + decisionMs };
}

function init({ players, rng, now, config }) {
  if (players.length !== 2) throw new EngineError('BAD_PLAYERS', 'Yas Penalty se joue à 2');
  const order = [...players].sort((a, b) => a.seat - b.seat).map(p => p.userId);
  const s = {
    players: order,
    firstShooterIndex: rng.int(2),
    history: [],
    score: { [order[0]]: 0, [order[1]]: 0 },
    taken: { [order[0]]: 0, [order[1]]: 0 },
    actions: { [order[0]]: 0, [order[1]]: 0 },
    timeouts: { [order[0]]: 0, [order[1]]: 0 },
    maxShots: config.maxShotsPerPlayer || 20,
    decisionMs: (config.decisionSeconds || 10) * 1000,
    status: 'playing',
    winner: null,
    endReason: null,
    kick: null,
  };
  newKick(s, 0, now, config);
  return s;
}

function view(state, viewerId) {
  const k = state.kick;
  return {
    players: state.players,
    score: state.score,
    taken: state.taken,
    history: state.history,
    status: state.status,
    winner: state.winner,
    endReason: state.endReason,
    suddenDeath: state.history.length >= REGULATION * 2,
    decisionMs: state.decisionMs,
    kick: k && state.status === 'playing' ? {
      index: k.index, shooter: k.shooter, keeper: k.keeper, opensAt: k.opensAt, deadline: k.deadline,
      shooterLocked: k.shot != null, keeperLocked: k.dive != null,
      // seul le joueur voit son propre choix tant que la révélation n'a pas eu lieu
      myChoice: viewerId === k.shooter ? k.shot : viewerId === k.keeper ? k.dive : null,
      myRole: viewerId === k.shooter ? 'shooter' : viewerId === k.keeper ? 'keeper' : null,
    } : null,
    lastShot: state.history[state.history.length - 1] || null,
  };
}

// Décide si la séance est terminée après un tir.
function checkEnd(s) {
  const [a, b] = s.players;
  const ta = s.taken[a]; const tb = s.taken[b];
  const sa = s.score[a]; const sb = s.score[b];
  if (ta <= REGULATION && tb <= REGULATION && (ta < REGULATION || tb < REGULATION)) {
    const ra = REGULATION - ta; const rb = REGULATION - tb;
    if (sa > sb + rb) return a;
    if (sb > sa + ra) return b;
    return null;
  }
  // fin du temps réglementaire ou mort subite : on compare après chaque paire de tirs
  if (ta === tb) {
    if (sa !== sb) return sa > sb ? a : b;
    if (ta >= s.maxShots) return 'draw';
  }
  return null;
}

function resolveKick(s, now, config, events, { shooterExpired = false, keeperExpired = false } = {}) {
  const k = s.kick;
  const shot = shooterExpired ? null : k.shot;
  const dive = keeperExpired && k.dive == null ? null : k.dive;
  const r = resolveShot({ shot, dive });
  if (r.goal) s.score[k.shooter] += 1;
  s.taken[k.shooter] += 1;
  const entry = { index: k.index, shooter: k.shooter, keeper: k.keeper, shot, dive, goal: r.goal, outcome: r.outcome };
  s.history.push(entry);
  events.push({ type: 'shot_result', payload: entry });
  const end = checkEnd(s);
  if (end) {
    s.status = 'finished';
    s.winner = end === 'draw' ? null : end;
    s.endReason = end === 'draw' ? 'max_shots' : s.history.length > REGULATION * 2 ? 'sudden_death' : s.history.length < REGULATION * 2 ? 'early_finish' : 'regulation';
    s.kick = null;
    events.push({ type: 'shootout_over', payload: { winner: s.winner, score: s.score } });
    return;
  }
  newKick(s, k.index + 1, now, config, config.revealMs ?? REVEAL_MS);
}

function apply(state, userId, action, { now, config }) {
  if (state.status !== 'playing') throw new EngineError('GAME_OVER', 'La séance est terminée');
  if (!state.players.includes(userId)) throw new EngineError('NOT_PLAYER', 'Vous ne jouez pas dans cette partie');
  if (action?.type !== 'choose') throw new EngineError('BAD_ACTION', 'Action inconnue');
  if (!ZONES.includes(action.zone)) throw new EngineError('BAD_ZONE', 'Zone invalide');
  const k = state.kick;
  if (now < k.opensAt) throw new EngineError('NOT_OPEN', 'Patiente jusqu\'au prochain tir');
  const s = structuredClone(state);
  const kick = s.kick;
  const events = [];
  if (userId === kick.shooter) {
    if (kick.shot != null) throw new EngineError('LOCKED', 'Ton choix est déjà verrouillé');
    kick.shot = action.zone;
  } else {
    if (kick.dive != null) throw new EngineError('LOCKED', 'Ton choix est déjà verrouillé');
    kick.dive = action.zone;
  }
  s.actions[userId] += 1;
  s.timeouts[userId] = 0;
  events.push({ type: 'choice_locked', payload: { userId, role: userId === kick.shooter ? 'shooter' : 'keeper' } });
  if (kick.shot != null && kick.dive != null) resolveKick(s, now, config, events);
  return { state: s, events };
}

function deadline(state) {
  if (state.status !== 'playing') return null;
  const k = state.kick;
  const waiting = [k.shot == null ? k.shooter : null, k.dive == null ? k.keeper : null].filter(Boolean);
  return { at: k.deadline, userIds: waiting };
}

function timeout(state, { now, config }) {
  if (state.status !== 'playing') return { state, events: [] };
  const s = structuredClone(state);
  const k = s.kick;
  const events = [];
  const shooterExpired = k.shot == null;
  const keeperExpired = k.dive == null;
  for (const [u, expired] of [[k.shooter, shooterExpired], [k.keeper, keeperExpired]]) {
    if (!expired) continue;
    s.timeouts[u] += 1;
    events.push({ type: 'decision_timeout', payload: { userId: u } });
  }
  const limit = config.maxTimeouts || 6;
  const absent = s.players.filter(u => s.timeouts[u] >= limit);
  if (absent.length === 1) return forfeitInto(s, absent[0], events, 'timeouts_limit');
  if (absent.length === 2) {
    s.status = 'finished'; s.winner = null; s.endReason = 'timeouts_limit'; s.kick = null;
    events.push({ type: 'shootout_over', payload: { winner: null, score: s.score } });
    return { state: s, events };
  }
  resolveKick(s, now, config, events, { shooterExpired, keeperExpired });
  return { state: s, events };
}

function forfeitInto(s, userId, events, reason) {
  s.status = 'finished';
  s.winner = s.players.find(u => u !== userId);
  s.endReason = reason;
  s.kick = null;
  events.push({ type: 'player_forfeit', payload: { userId, reason } });
  return { state: s, events };
}

function forfeit(state, userId) {
  if (state.status !== 'playing') return { state, events: [] };
  return forfeitInto(structuredClone(state), userId, [], 'forfeit');
}

function resume(state, { now, config }) {
  if (state.status !== 'playing') return state;
  const s = structuredClone(state);
  s.kick.opensAt = now;
  s.kick.deadline = now + (config.decisionSeconds || 10) * 1000;
  return s;
}

function result(state) {
  if (state.status !== 'finished') return null;
  const stat = (u) => {
    const asShooter = state.history.filter(h => h.shooter === u);
    const asKeeper = state.history.filter(h => h.keeper === u);
    return {
      moves: state.actions[u],
      goals: asShooter.filter(h => h.goal).length,
      shots: asShooter.length,
      saves: asKeeper.filter(h => h.outcome === 'saved').length,
      shotsFaced: asKeeper.length,
      goalsConceded: asKeeper.filter(h => h.goal).length,
      score: state.score[u],
    };
  };
  if (!state.winner) {
    return {
      isDraw: true, reason: state.endReason,
      placements: state.players.map(u => ({ userId: u, place: 1, outcome: 'draw', stats: stat(u) })),
    };
  }
  const loser = state.players.find(u => u !== state.winner);
  return {
    isDraw: false, reason: state.endReason,
    placements: [
      { userId: state.winner, place: 1, outcome: 'win', stats: stat(state.winner) },
      { userId: loser, place: 2, outcome: 'loss', stats: stat(loser) },
    ],
  };
}

function actionsCount(state, userId) {
  return state.actions[userId] || 0;
}

module.exports = {
  id: 'penalty', rulesVersion: '1.0.0', minPlayers: 2, maxPlayers: 2,
  init, view, apply, deadline, timeout, forfeit, result, actionsCount, resume,
  _internals: { resolveShot, checkEnd, REVEAL_MS, ZONES },
};
