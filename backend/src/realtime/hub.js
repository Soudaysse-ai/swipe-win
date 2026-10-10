// Hub Socket.IO : présence des joueurs et envoi d'événements ciblés.
// Chaque socket rejoint le canal `user:<id>` ; on émet vers un joueur (tous
// ses onglets/appareils) via ce canal.
const pool = require('../db/pool');

const state = {
  io: null,
  online: new Map(),      // userId -> Set<socketId>
  presenceRows: new Map(), // userId -> presence_sessions.id
  listeners: { online: [], offline: [] },
  stats: { connections: 0, disconnects: 0, errors: 0, latencies: [] },
};

function setIo(io) { state.io = io; }

function emitToUser(userId, event, payload) {
  if (state.io) state.io.to(`user:${userId}`).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  for (const u of userIds) emitToUser(u, event, payload);
}

function isOnline(userId) {
  return (state.online.get(userId)?.size || 0) > 0;
}

function onlineUserIds() { return [...state.online.keys()]; }

function on(event, fn) { state.listeners[event].push(fn); }

// Renvoie true si c'est la première connexion de ce joueur.
function addSocket(userId, socketId) {
  let set = state.online.get(userId);
  const first = !set || set.size === 0;
  if (!set) { set = new Set(); state.online.set(userId, set); }
  set.add(socketId);
  state.stats.connections += 1;
  if (first) {
    pool.query('INSERT INTO presence_sessions (user_id) VALUES ($1) RETURNING id', [userId])
      .then(r => state.presenceRows.set(userId, r.rows[0].id))
      .catch(err => console.error('presence', err.message));
    pool.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [userId]).catch(() => {});
    state.listeners.online.forEach(fn => fn(userId));
  }
  return first;
}

// Renvoie true si le joueur n'a plus aucune connexion.
function removeSocket(userId, socketId) {
  const set = state.online.get(userId);
  if (!set) return true;
  set.delete(socketId);
  state.stats.disconnects += 1;
  if (set.size === 0) {
    state.online.delete(userId);
    const rowId = state.presenceRows.get(userId);
    state.presenceRows.delete(userId);
    if (rowId) pool.query('UPDATE presence_sessions SET ended_at = NOW() WHERE id = $1', [rowId]).catch(() => {});
    pool.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [userId]).catch(() => {});
    state.listeners.offline.forEach(fn => fn(userId));
    return true;
  }
  return false;
}

// Déconnecte de force un joueur (suspension / bannissement).
function disconnectUser(userId) {
  if (state.io) state.io.in(`user:${userId}`).disconnectSockets(true);
}

function recordLatency(ms) {
  state.stats.latencies.push(ms);
  if (state.stats.latencies.length > 500) state.stats.latencies.shift();
}

function socketStats() {
  const l = state.stats.latencies;
  const sorted = [...l].sort((a, b) => a - b);
  return {
    sockets: state.io ? state.io.of('/').sockets.size : 0,
    onlineUsers: state.online.size,
    totalConnections: state.stats.connections,
    totalDisconnects: state.stats.disconnects,
    errors: state.stats.errors,
    latencyAvgMs: l.length ? Math.round(l.reduce((s, x) => s + x, 0) / l.length) : null,
    latencyP95Ms: l.length ? sorted[Math.floor(sorted.length * 0.95)] : null,
  };
}

function countError() { state.stats.errors += 1; }

// Fermeture propre des sessions de présence (arrêt du serveur).
async function closeAllPresence() {
  const ids = [...state.presenceRows.values()];
  state.presenceRows.clear();
  if (ids.length) await pool.query('UPDATE presence_sessions SET ended_at = NOW() WHERE id = ANY($1::uuid[])', [ids]).catch(() => {});
}

module.exports = {
  setIo, emitToUser, emitToUsers, isOnline, onlineUserIds, on, addSocket, removeSocket,
  disconnectUser, recordLatency, socketStats, countError, closeAllPresence, _state: state,
};
