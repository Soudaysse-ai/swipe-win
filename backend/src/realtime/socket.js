// Point d'entrée WebSocket (Socket.IO). Chaque connexion est authentifiée par
// le jeton du joueur ; toutes les commandes sont validées côté serveur.
//
// Client → serveur (avec accusé de réception { ok, ... }) :
//   room:create, room:join, room:leave, room:ready, room:start, room:list
//   matchmaking:join, matchmaking:leave, matchmaking:accept, matchmaking:decline
//   bot:start (partie d'entraînement contre des bots)
//   match:action, match:sync, match:resign
//   chat:send, chat:history, friend:invite, ping
// Serveur → client :
//   room:state, room:left, matchmaking:status|found|confirmations|cancelled,
//   match:starting, match:state, match:ended, game:event,
//   player:disconnected, player:reconnected, player:forfeited,
//   friend:online, friend:offline, friend:request, friend:accepted, friend:invite,
//   chat:message, chat:hidden, notification:new, session:restore
const { Server } = require('socket.io');
const hub = require('./hub');
const rooms = require('./rooms');
const runtime = require('./matchRuntime');
const matchmaking = require('./matchmaking');
const training = require('./training');
const { verifyToken } = require('../services/authService');
const friends = require('../services/friends');
const chat = require('../services/chat');
const notifications = require('../services/notifications');
const { hit } = require('../lib/rateLimit');
const { AppError } = require('../lib/errors');

function errorPayload(err) {
  if (err instanceof AppError || err.code) return { ok: false, code: err.code || 'ERROR', message: err.message };
  console.error('socket handler', err);
  hub.countError();
  return { ok: false, code: 'INTERNAL', message: 'Erreur interne, réessayez.' };
}

// Membres d'un salon (ou joueurs d'une partie liée à ce salon).
function chatMembers(roomId, userId) {
  const room = rooms.getRoom(roomId);
  if (room) return [...room.players.keys()];
  const m = runtime.liveMatches().find(x => x.roomId === roomId);
  return m ? m.players.map(p => p.userId) : (userId ? [] : []);
}

function activityOf(userId) {
  const matchId = runtime.userMatchId(userId);
  if (matchId) return { type: 'match', gameId: runtime.getLive(matchId)?.gameId };
  const room = rooms.roomOf(userId);
  if (room) return { type: 'room', gameId: room.gameId };
  return null;
}

function attach(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      // Production : uniquement les origines déclarées dans CORS_ORIGINS (motifs « * » acceptés).
      origin: require('../lib/cors').origin,
      credentials: true,
    },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    // Reprise de connexion courte côté Socket.IO (perte réseau de quelques secondes).
    connectionStateRecovery: { maxDisconnectionDuration: 30_000, skipMiddlewares: false },
  });
  hub.setIo(io);
  notifications.setEmitter((userId, event, payload) => hub.emitToUser(userId, event, payload));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('UNAUTHORIZED'));
    verifyToken(token)
      .then((auth) => { socket.data.user = auth; next(); })
      .catch((err) => next(new Error(err.code === 'SUSPENDED' ? 'SUSPENDED' : 'UNAUTHORIZED')));
  });

  hub.on('online', async (userId) => {
    rooms.onUserOnline(userId);
    for (const f of await friends.friendIds(userId).catch(() => [])) hub.emitToUser(f, 'friend:online', { userId });
  });
  hub.on('offline', async (userId) => {
    matchmaking.onUserOffline(userId);
    rooms.onUserOffline(userId);
    runtime.disconnect(userId);
    for (const f of await friends.friendIds(userId).catch(() => [])) hub.emitToUser(f, 'friend:offline', { userId });
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.userId}`);
    hub.addSocket(user.userId, socket.id);

    // Restauration de la session : partie en cours, salon, file d'attente.
    runtime.reconnect(user.userId);
    socket.emit('session:restore', {
      matchId: runtime.userMatchId(user.userId),
      room: rooms.roomOf(user.userId),
      matchmaking: matchmaking.statusOf(user.userId),
    });

    // Enregistre un handler avec accusé de réception, limitation de fréquence et gestion d'erreurs.
    const on = (event, fn, { max = 30, windowMs = 10_000 } = {}) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!hit(`sock:${event}:${user.userId}`, max, windowMs)) {
          return reply({ ok: false, code: 'RATE_LIMITED', message: 'Trop de requêtes' });
        }
        try {
          const out = await fn(payload || {});
          reply({ ok: true, ...(out || {}) });
        } catch (err) {
          reply(errorPayload(err));
        }
      });
    };

    on('ping', async ({ sentAt }) => {
      if (typeof sentAt === 'number') hub.recordLatency(Math.max(0, Date.now() - sentAt));
      return { serverNow: Date.now() };
    }, { max: 60 });

    // ── Salons ──
    on('room:create', async ({ gameId, visibility, maxPlayers }) => {
      const room = await rooms.createRoom({
        gameId, hostId: user.userId, visibility: visibility === 'public' ? 'public' : 'private', source: 'room', maxPlayers,
      });
      rooms.broadcast(room);
      return { room: rooms.publicRoom(room) };
    }, { max: 10 });
    on('room:join', async ({ code, roomId }) => ({ room: rooms.publicRoom(await rooms.join(user.userId, { code, roomId })) }), { max: 15 });
    on('room:leave', async () => { await rooms.leave(user.userId); });
    on('room:ready', async ({ ready }) => ({ room: rooms.publicRoom(await rooms.setReady(user.userId, ready !== false)) }));
    on('room:start', async () => ({ room: rooms.publicRoom(await rooms.start(user.userId)) }), { max: 10 });
    on('room:list', async ({ gameId }) => ({ rooms: rooms.listPublic(gameId) }));

    // ── Matchmaking ──
    on('matchmaking:join', async ({ gameId, sizes }) => {
      const e = await matchmaking.join(user, gameId, { sizes });
      return { since: e.joinedAt };
    }, { max: 10 });
    on('matchmaking:leave', async () => { matchmaking.leave(user.userId); });
    on('matchmaking:accept', async ({ proposalId }) => matchmaking.accept(user.userId, proposalId));
    on('matchmaking:decline', async ({ proposalId }) => matchmaking.decline(user.userId, proposalId));

    // ── Entraînement contre des bots ──
    on('bot:start', async ({ gameId, opponents, level }) => training.start(user, gameId, { opponents, level }), { max: 10 });

    // ── Parties ──
    on('match:action', async (msg) => {
      const res = await runtime.handleAction(user.userId, msg);
      if (!res.ok) throw Object.assign(new Error(res.message || 'Action refusée'), { code: res.code });
      return res;
    }, { max: 40 });
    on('match:sync', async ({ matchId }) => {
      const id = matchId || runtime.userMatchId(user.userId);
      const snap = id ? runtime.snapshot(id, user.userId) : null;
      return { snapshot: snap };
    });
    on('match:resign', async ({ matchId }) => {
      const res = await runtime.resign(user.userId, matchId);
      if (!res.ok) throw Object.assign(new Error('Abandon impossible'), { code: res.code });
    }, { max: 5 });

    // ── Chat ──
    on('chat:send', async (msg) => {
      const members = chatMembers(msg.roomId, user.userId);
      const matchId = runtime.userMatchId(user.userId);
      const message = await chat.send(user, { ...msg, matchId }, members);
      return { message };
    }, { max: 20 });
    on('chat:history', async ({ roomId }) => {
      if (!chatMembers(roomId, user.userId).includes(user.userId)) throw new AppError(403, 'NOT_MEMBER', 'Accès refusé');
      return { messages: await chat.history(roomId, user.userId) };
    });

    // ── Amis ──
    on('friend:invite', async ({ friendId, gameId }) => {
      const room = await friends.invite(rooms, user, friendId, gameId);
      return { room };
    }, { max: 10 });

    socket.on('disconnect', () => {
      hub.removeSocket(user.userId, socket.id);
    });
  });

  return io;
}

module.exports = { attach, activityOf };
