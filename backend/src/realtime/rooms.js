// Salons de jeu : privés (code YAS-482913), publics (listés), issus du
// matchmaking ou d'une invitation. Après un match, le salon redevient ouvert :
// les joueurs restés peuvent relancer une revanche.
const crypto = require('crypto');
const pool = require('../db/pool');
const hub = require('./hub');
const runtime = require('./matchRuntime');
const { getEngine } = require('../games');
const analytics = require('../services/analytics');
const { AppError } = require('../lib/errors');

const ROOM_IDLE_GRACE_MS = () => parseInt(process.env.ROOM_GRACE_MS || '60000', 10);

const rooms = new Map();     // roomId -> room
const byCode = new Map();    // code -> roomId
const userRoom = new Map();  // userId -> roomId

const fail = (code, message) => new AppError(400, code, message);

async function newCode() {
  for (let i = 0; i < 10; i++) {
    const code = `YAS-${String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')}`;
    if (byCode.has(code)) continue;
    const { rows } = await pool.query('SELECT 1 FROM game_rooms WHERE code = $1', [code]);
    if (!rows.length) return code;
  }
  throw new AppError(500, 'CODE_GEN', 'Impossible de générer un code de salon');
}

function normalizeCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  return digits.length === 6 ? `YAS-${digits}` : null;
}

function publicRoom(room) {
  return {
    id: room.id, code: room.code, gameId: room.gameId, hostId: room.hostId, visibility: room.visibility,
    source: room.source, status: room.status, minPlayers: room.minPlayers, maxPlayers: room.maxPlayers,
    matchId: room.matchId, tournamentMatchId: room.tournamentMatchId || null,
    players: [...room.players.values()].map(p => ({
      userId: p.userId, username: p.username, avatar: p.avatar, level: p.level, ready: p.ready, connected: hub.isOnline(p.userId),
    })),
  };
}

function broadcast(room) {
  const payload = publicRoom(room);
  hub.emitToUsers([...room.players.keys()], 'room:state', payload);
}

async function userCard(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, u.status, COALESCE(g.level, 1) AS level
       FROM users u LEFT JOIN player_global_stats g ON g.user_id = u.id WHERE u.id = $1`, [userId]);
  if (!rows[0]) throw fail('USER_NOT_FOUND', 'Joueur introuvable');
  return { userId: rows[0].id, username: rows[0].username, avatar: rows[0].avatar, level: rows[0].level };
}

async function isBlockedBetween(userId, others) {
  if (!others.length) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = ANY($2::uuid[]))
        OR (blocked_id = $1 AND blocker_id = ANY($2::uuid[])) LIMIT 1`, [userId, others]);
  return rows.length > 0;
}

async function createRoom({ gameId, hostId, visibility = 'private', source = 'room', maxPlayers, settings = {}, tournamentMatchId = null }) {
  const game = await runtime.loadGame(gameId);
  const engine = getEngine(gameId);
  if (!game || !engine || !game.is_active) throw fail('GAME_UNAVAILABLE', 'Ce jeu n\'est pas disponible');
  const max = Math.min(engine.maxPlayers, Math.max(engine.minPlayers, parseInt(maxPlayers || engine.maxPlayers, 10)));
  if (hostId) await assertFree(hostId);
  const code = await newCode();
  const { rows } = await pool.query(
    `INSERT INTO game_rooms (code, game_id, host_id, visibility, source, max_players, settings, tournament_match_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
    [code, gameId, hostId, visibility, source, max, JSON.stringify(settings), tournamentMatchId]);
  const room = {
    id: rows[0].id, code, gameId, hostId, visibility, source, status: 'open',
    minPlayers: engine.minPlayers, maxPlayers: max, settings, tournamentMatchId,
    players: new Map(), matchId: null, idleTimers: new Map(), createdAt: rows[0].created_at,
  };
  rooms.set(room.id, room);
  byCode.set(code, room.id);
  if (hostId) {
    await addPlayer(room, hostId);
    analytics.track('room_created', { userId: hostId, gameId, properties: { visibility, source } });
  }
  return room;
}

// Un joueur ne peut être que dans un salon à la fois, et pas pendant une partie.
async function assertFree(userId, exceptRoomId = null) {
  if (runtime.userMatchId(userId)) throw fail('IN_MATCH', 'Termine d\'abord ta partie en cours');
  const current = userRoom.get(userId);
  if (current && current !== exceptRoomId) await leave(userId);
}

async function addPlayer(room, userId) {
  const card = await userCard(userId);
  room.players.set(userId, { ...card, ready: false });
  userRoom.set(userId, room.id);
  await pool.query(
    `INSERT INTO room_players (room_id, user_id) VALUES ($1, $2)
     ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL, is_ready = false, joined_at = NOW()`,
    [room.id, userId]);
}

async function join(userId, { roomId, code } = {}) {
  const id = roomId || byCode.get(normalizeCode(code));
  const room = id && rooms.get(id);
  if (!room || room.status === 'closed') throw fail('ROOM_NOT_FOUND', 'Salon introuvable ou fermé');
  if (room.players.has(userId)) { broadcast(room); return room; }
  if (room.status !== 'open') throw fail('ROOM_IN_GAME', 'Une partie est déjà en cours dans ce salon');
  if (room.players.size >= room.maxPlayers) throw fail('ROOM_FULL', 'Ce salon est complet');
  if (room.tournamentMatchId && !(room.allowed || []).includes(userId)) throw fail('ROOM_RESERVED', 'Salon réservé aux joueurs du tournoi');
  if (await isBlockedBetween(userId, [...room.players.keys()])) throw fail('BLOCKED', 'Impossible de rejoindre ce salon');
  await assertFree(userId, room.id);
  await addPlayer(room, userId);
  analytics.track('room_joined', { userId, gameId: room.gameId, properties: { visibility: room.visibility, source: room.source } });
  const invited = await pool.query(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'invite' AND data->>'roomId' = $2 LIMIT 1`, [userId, room.id]);
  if (invited.rows.length) analytics.track('invite_accepted', { userId, gameId: room.gameId, properties: { roomId: room.id } });
  broadcast(room);
  return room;
}

async function closeRoom(room) {
  room.status = 'closed';
  for (const t of room.idleTimers.values()) clearTimeout(t);
  rooms.delete(room.id);
  byCode.delete(room.code);
  await pool.query(`UPDATE game_rooms SET status = 'closed', closed_at = NOW() WHERE id = $1`, [room.id]);
}

async function removePlayer(room, userId) {
  room.players.delete(userId);
  clearTimeout(room.idleTimers.get(userId));
  room.idleTimers.delete(userId);
  if (userRoom.get(userId) === room.id) userRoom.delete(userId);
  await pool.query('UPDATE room_players SET left_at = NOW() WHERE room_id = $1 AND user_id = $2', [room.id, userId]);
  hub.emitToUser(userId, 'room:left', { roomId: room.id });
  if (room.players.size === 0) return closeRoom(room);
  if (room.hostId === userId) {
    room.hostId = room.players.keys().next().value;
    await pool.query('UPDATE game_rooms SET host_id = $2 WHERE id = $1', [room.id, room.hostId]);
  }
  broadcast(room);
}

async function leave(userId) {
  const room = rooms.get(userRoom.get(userId));
  if (!room) { userRoom.delete(userId); return; }
  if (room.status === 'in_game' && runtime.userMatchId(userId) === room.matchId) {
    throw fail('IN_MATCH', 'Utilise « Abandonner » pour quitter une partie en cours');
  }
  await removePlayer(room, userId);
}

async function setReady(userId, ready) {
  const room = rooms.get(userRoom.get(userId));
  if (!room) throw fail('NO_ROOM', 'Tu n\'es dans aucun salon');
  if (room.status !== 'open') throw fail('ROOM_IN_GAME', 'Partie déjà lancée');
  room.players.get(userId).ready = !!ready;
  pool.query('UPDATE room_players SET is_ready = $3 WHERE room_id = $1 AND user_id = $2', [room.id, userId, !!ready]).catch(() => {});
  broadcast(room);
  // Lancement automatique quand le salon est complet et que tout le monde est prêt.
  if (room.players.size === room.maxPlayers && allReady(room)) await startMatch(room);
  return room;
}

const allReady = (room) => [...room.players.values()].every(p => p.ready);

async function start(userId) {
  const room = rooms.get(userRoom.get(userId));
  if (!room) throw fail('NO_ROOM', 'Tu n\'es dans aucun salon');
  if (room.hostId !== userId) throw fail('NOT_HOST', 'Seul l\'hôte peut lancer la partie');
  if (room.status !== 'open') throw fail('ROOM_IN_GAME', 'Partie déjà lancée');
  if (room.players.size < room.minPlayers) throw fail('NOT_ENOUGH_PLAYERS', `Il faut au moins ${room.minPlayers} joueurs`);
  if (!allReady(room)) throw fail('NOT_READY', 'Tous les joueurs doivent être prêts');
  return startMatch(room);
}

async function startMatch(room) {
  if (room.status !== 'open') return room;
  room.status = 'in_game';
  try {
    const m = await runtime.createMatch({
      gameId: room.gameId, roomId: room.id, mode: room.source,
      users: [...room.players.values()].map(p => ({ userId: p.userId, username: p.username, avatar: p.avatar })),
      tournamentMatchId: room.tournamentMatchId,
    });
    room.matchId = m.id;
    await pool.query(`UPDATE game_rooms SET status = 'in_game' WHERE id = $1`, [room.id]);
  } catch (err) {
    room.status = 'open';
    broadcast(room);
    throw err;
  }
  broadcast(room);
  return room;
}

// Fin de match : le salon rouvre pour une revanche ; les joueurs déconnectés en sont retirés.
runtime.onMatchEnded(async ({ match }) => {
  const room = rooms.get(match.roomId);
  if (!room || room.matchId !== match.id) return;
  room.status = 'open';
  room.matchId = null;
  for (const p of room.players.values()) p.ready = false;
  await pool.query(`UPDATE game_rooms SET status = 'open' WHERE id = $1`, [room.id]).catch(() => {});
  // Les salons de tournoi ne servent qu'une fois (le match suivant est créé par le tournoi).
  if (room.tournamentMatchId) {
    for (const userId of [...room.players.keys()]) await removePlayer(room, userId);
    return;
  }
  for (const userId of [...room.players.keys()]) {
    if (!hub.isOnline(userId)) await removePlayer(room, userId);
  }
  if (rooms.has(room.id)) broadcast(room);
});

// Déconnexion complète d'un joueur : on garde sa place un moment dans un salon en attente.
function onUserOffline(userId) {
  const room = rooms.get(userRoom.get(userId));
  if (!room || room.status !== 'open') return;
  clearTimeout(room.idleTimers.get(userId));
  room.idleTimers.set(userId, setTimeout(() => {
    if (!hub.isOnline(userId) && room.players.has(userId) && room.status === 'open') {
      removePlayer(room, userId).catch(err => console.error('room idle', err));
    }
  }, ROOM_IDLE_GRACE_MS()));
  broadcast(room);
}

function onUserOnline(userId) {
  const room = rooms.get(userRoom.get(userId));
  if (!room) return;
  clearTimeout(room.idleTimers.get(userId));
  room.idleTimers.delete(userId);
  broadcast(room);
}

function listPublic(gameId) {
  return [...rooms.values()]
    .filter(r => r.visibility === 'public' && r.status === 'open' && (!gameId || r.gameId === gameId) && r.players.size < r.maxPlayers)
    .map(publicRoom);
}

function roomOf(userId) {
  const room = rooms.get(userRoom.get(userId));
  return room ? publicRoom(room) : null;
}

function getRoom(roomId) { return rooms.get(roomId) || null; }
function getByCode(code) { return rooms.get(byCode.get(normalizeCode(code))) || null; }

// Nombre de joueurs « actifs » par jeu (salons + parties + file d'attente).
function playersByGame() {
  const counts = {};
  for (const r of rooms.values()) counts[r.gameId] = (counts[r.gameId] || 0) + r.players.size;
  return counts;
}

function allRooms() { return [...rooms.values()].map(publicRoom); }

// Au démarrage : les salons en mémoire ont disparu, on les ferme en base.
async function closeStaleRooms() {
  await pool.query(`UPDATE game_rooms SET status = 'closed', closed_at = NOW() WHERE status <> 'closed'`);
}

function shutdown() {
  for (const r of rooms.values()) for (const t of r.idleTimers.values()) clearTimeout(t);
  rooms.clear(); byCode.clear(); userRoom.clear();
}

module.exports = {
  createRoom, join, leave, setReady, start, startMatch, addPlayer, onUserOffline, onUserOnline,
  listPublic, roomOf, getRoom, getByCode, playersByGame, allRooms, closeStaleRooms, publicRoom, broadcast,
  normalizeCode, shutdown,
};
