// Matchmaking « Jouer maintenant ».
//
// 1. Le joueur entre dans la file du jeu demandé (avec sa cote du jeu).
// 2. Toutes les secondes, on forme des groupes de joueurs de niveau proche.
//    L'écart de cote toléré s'élargit avec l'attente (±100, +25 toutes les 5 s,
//    illimité après 60 s).
// 3. Pour Yas Cards / Yas Ludo, on vise 4 joueurs ; après 15 s d'attente on
//    accepte 3, après 30 s on accepte 2 (sauf si le joueur a imposé un format).
// 4. Chaque joueur reçoit une demande de confirmation (10 s). Si tous acceptent,
//    un salon est créé et la partie démarre. Sinon, ceux qui ont accepté
//    reprennent leur place dans la file.
// Aucun faux adversaire n'est jamais créé : uniquement de vrais joueurs.
const crypto = require('crypto');
const pool = require('../db/pool');
const hub = require('./hub');
const rooms = require('./rooms');
const runtime = require('./matchRuntime');
const { getEngine } = require('../games');
const analytics = require('../services/analytics');
const { AppError } = require('../lib/errors');

const CONFIRM_MS = () => parseInt(process.env.MATCHMAKING_CONFIRM_MS || '10000', 10);
const TICK_MS = () => parseInt(process.env.MATCHMAKING_TICK_MS || '1000', 10);

const queues = new Map();     // gameId -> [entry]
const inQueue = new Map();    // userId -> entry
const proposals = new Map();  // proposalId -> proposal
const userProposal = new Map(); // userId -> proposalId
let ticker = null;

function ratingWindow(waitedMs) {
  if (waitedMs >= 60_000) return Infinity;
  return 100 + 25 * Math.floor(waitedMs / 5000);
}

function allowedSizes(entry, engine, now) {
  const waited = now - entry.joinedAt;
  const all = [];
  for (let n = engine.maxPlayers; n >= engine.minPlayers; n--) all.push(n);
  if (entry.sizes?.length) return all.filter(n => entry.sizes.includes(n));
  if (engine.maxPlayers === engine.minPlayers) return all;
  // préférence pour les parties complètes, puis assouplissement avec l'attente
  return all.filter(n => n === engine.maxPlayers || (n === 3 && waited >= 15_000) || (n === 2 && waited >= 30_000));
}

async function playerRating(userId, gameId) {
  const { rows } = await pool.query('SELECT rating FROM player_game_stats WHERE user_id = $1 AND game_id = $2', [userId, gameId]);
  return rows[0] ? Number(rows[0].rating) : 1000;
}

async function join(user, gameId, { sizes = null } = {}) {
  const engine = getEngine(gameId);
  const game = await runtime.loadGame(gameId);
  if (!engine || !game?.is_active) throw new AppError(400, 'GAME_UNAVAILABLE', 'Ce jeu n\'est pas disponible');
  if (runtime.userMatchId(user.userId)) throw new AppError(400, 'IN_MATCH', 'Termine d\'abord ta partie en cours');
  if (userProposal.has(user.userId)) throw new AppError(400, 'PENDING_PROPOSAL', 'Une partie t\'attend déjà');
  leave(user.userId);
  if (rooms.roomOf(user.userId)) await rooms.leave(user.userId);
  const validSizes = Array.isArray(sizes) ? sizes.map(Number).filter(n => n >= engine.minPlayers && n <= engine.maxPlayers) : null;
  const entry = {
    userId: user.userId, username: user.username, avatar: user.avatar, gameId,
    rating: await playerRating(user.userId, gameId), joinedAt: Date.now(),
    sizes: validSizes?.length ? validSizes : null,
  };
  if (!queues.has(gameId)) queues.set(gameId, []);
  queues.get(gameId).push(entry);
  inQueue.set(user.userId, entry);
  analytics.track('matchmaking_started', { userId: user.userId, gameId, properties: { sizes: entry.sizes } });
  emitStatus(entry);
  return entry;
}

function emitStatus(entry) {
  hub.emitToUser(entry.userId, 'matchmaking:status', {
    state: 'searching', gameId: entry.gameId, since: entry.joinedAt, sizes: entry.sizes,
    queueSize: queues.get(entry.gameId)?.length || 0,
  });
}

function leave(userId) {
  const entry = inQueue.get(userId);
  if (!entry) return false;
  inQueue.delete(userId);
  const q = queues.get(entry.gameId) || [];
  const i = q.indexOf(entry);
  if (i >= 0) q.splice(i, 1);
  hub.emitToUser(userId, 'matchmaking:status', { state: 'idle', gameId: entry.gameId });
  return true;
}

// Forme un groupe autour du joueur qui attend depuis le plus longtemps.
function formGroups(gameId, now = Date.now()) {
  const engine = getEngine(gameId);
  const q = (queues.get(gameId) || []).slice().sort((a, b) => a.joinedAt - b.joinedAt);
  const groups = [];
  const used = new Set();
  for (const anchor of q) {
    if (used.has(anchor.userId)) continue;
    const sizes = allowedSizes(anchor, engine, now);
    const candidates = q.filter(e => e !== anchor && !used.has(e.userId))
      .filter(e => {
        const win = Math.max(ratingWindow(now - anchor.joinedAt), ratingWindow(now - e.joinedAt));
        return Math.abs(e.rating - anchor.rating) <= win;
      })
      .sort((a, b) => Math.abs(a.rating - anchor.rating) - Math.abs(b.rating - anchor.rating));
    for (const size of sizes) {
      const compatible = candidates.filter(e => allowedSizes(e, engine, now).includes(size));
      if (compatible.length >= size - 1) {
        const group = [anchor, ...compatible.slice(0, size - 1)];
        group.forEach(e => used.add(e.userId));
        groups.push(group);
        break;
      }
    }
  }
  return groups;
}

function propose(gameId, group) {
  const id = crypto.randomUUID();
  const proposal = {
    id, gameId, entries: group, accepted: new Set(), expiresAt: Date.now() + CONFIRM_MS(), timer: null,
  };
  for (const e of group) {
    inQueue.delete(e.userId);
    const q = queues.get(gameId);
    q.splice(q.indexOf(e), 1);
    userProposal.set(e.userId, id);
  }
  proposals.set(id, proposal);
  const players = group.map(e => ({ userId: e.userId, username: e.username, avatar: e.avatar }));
  hub.emitToUsers(group.map(e => e.userId), 'matchmaking:found', { proposalId: id, gameId, players, expiresAt: proposal.expiresAt });
  proposal.timer = setTimeout(() => expire(id), CONFIRM_MS());
  return proposal;
}

function requeue(entry) {
  if (!queues.has(entry.gameId)) queues.set(entry.gameId, []);
  queues.get(entry.gameId).push(entry); // garde son heure d'arrivée : priorité conservée
  inQueue.set(entry.userId, entry);
  emitStatus(entry);
}

function dissolve(proposal, dropped) {
  clearTimeout(proposal.timer);
  proposals.delete(proposal.id);
  for (const e of proposal.entries) {
    userProposal.delete(e.userId);
    if (dropped.has(e.userId)) {
      hub.emitToUser(e.userId, 'matchmaking:cancelled', { proposalId: proposal.id, reason: 'not_confirmed' });
      hub.emitToUser(e.userId, 'matchmaking:status', { state: 'idle', gameId: proposal.gameId });
    } else {
      hub.emitToUser(e.userId, 'matchmaking:cancelled', { proposalId: proposal.id, reason: 'other_declined', requeued: true });
      requeue(e);
    }
  }
}

function expire(id) {
  const proposal = proposals.get(id);
  if (!proposal) return;
  const dropped = new Set(proposal.entries.filter(e => !proposal.accepted.has(e.userId)).map(e => e.userId));
  dissolve(proposal, dropped);
}

async function accept(userId, proposalId) {
  const proposal = proposals.get(proposalId);
  if (!proposal || userProposal.get(userId) !== proposalId) throw new AppError(400, 'PROPOSAL_EXPIRED', 'Cette proposition a expiré');
  proposal.accepted.add(userId);
  hub.emitToUsers(proposal.entries.map(e => e.userId), 'matchmaking:confirmations', {
    proposalId, accepted: [...proposal.accepted],
  });
  if (proposal.accepted.size === proposal.entries.length) await launch(proposal);
  return { ok: true };
}

function decline(userId, proposalId) {
  const proposal = proposals.get(proposalId);
  if (!proposal) return { ok: true };
  dissolve(proposal, new Set([userId]));
  return { ok: true };
}

async function launch(proposal) {
  clearTimeout(proposal.timer);
  proposals.delete(proposal.id);
  for (const e of proposal.entries) userProposal.delete(e.userId);
  try {
    const room = await rooms.createRoom({
      gameId: proposal.gameId, hostId: null, visibility: 'private', source: 'quickplay',
      maxPlayers: proposal.entries.length,
    });
    for (const e of proposal.entries) await rooms.addPlayer(room, e.userId);
    for (const p of room.players.values()) p.ready = true;
    await rooms.startMatch(room);
    room.hostId = proposal.entries[0].userId;
    rooms.broadcast(room);
  } catch (err) {
    console.error('matchmaking: lancement impossible', err.message);
    for (const e of proposal.entries) {
      hub.emitToUser(e.userId, 'matchmaking:cancelled', { proposalId: proposal.id, reason: 'launch_failed' });
      hub.emitToUser(e.userId, 'matchmaking:status', { state: 'idle', gameId: proposal.gameId });
    }
  }
}

function tick() {
  const now = Date.now();
  for (const gameId of queues.keys()) {
    for (const group of formGroups(gameId, now)) propose(gameId, group);
  }
}

function start() {
  if (!ticker) ticker = setInterval(tick, TICK_MS());
}

function stop() {
  clearInterval(ticker);
  ticker = null;
  for (const p of proposals.values()) clearTimeout(p.timer);
  queues.clear(); inQueue.clear(); proposals.clear(); userProposal.clear();
}

function onUserOffline(userId) {
  leave(userId);
  const pid = userProposal.get(userId);
  if (pid) decline(userId, pid);
}

function queueSizes() {
  const out = {};
  for (const [g, q] of queues) out[g] = q.length;
  return out;
}

function statusOf(userId) {
  const e = inQueue.get(userId);
  if (e) return { state: 'searching', gameId: e.gameId, since: e.joinedAt, sizes: e.sizes };
  const pid = userProposal.get(userId);
  if (pid) {
    const p = proposals.get(pid);
    return { state: 'found', gameId: p.gameId, proposalId: pid, expiresAt: p.expiresAt };
  }
  return { state: 'idle' };
}

module.exports = {
  join, leave, accept, decline, tick, start, stop, onUserOffline, queueSizes, statusOf,
  _internals: { formGroups, ratingWindow, allowedSizes, queues },
};
