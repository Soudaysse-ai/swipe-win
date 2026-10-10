// Activité en temps réel (mémoire du serveur de jeu).
const hub = require('../realtime/hub');
const rooms = require('../realtime/rooms');
const runtime = require('../realtime/matchRuntime');
const matchmaking = require('../realtime/matchmaking');

function liveStats() {
  const matches = runtime.liveMatches();
  const allRooms = rooms.allRooms();
  const byGame = {};
  for (const m of matches) byGame[m.gameId] = (byGame[m.gameId] || 0) + 1;
  return {
    onlineUsers: hub.onlineUserIds().length,
    liveMatches: matches.length,
    byGame,
    reconnecting: matches.filter(m => m.status === 'RECONNECTING').length,
    publicRooms: allRooms.filter(r => r.visibility === 'public' && r.status !== 'closed').length,
    privateRooms: allRooms.filter(r => r.visibility === 'private' && r.status !== 'closed').length,
    queues: matchmaking.queueSizes(),
    sockets: hub.socketStats(),
    matches: matches.map(m => ({
      matchId: m.id, gameId: m.gameId, status: m.status, startedAt: m.startedAt, version: m.version, mode: m.mode,
      players: m.players.map(p => ({ userId: p.userId, username: p.username, connected: p.connected })),
    })),
    rooms: allRooms.map(r => ({ id: r.id, code: r.code, gameId: r.gameId, visibility: r.visibility, source: r.source, status: r.status, players: r.players.length, maxPlayers: r.maxPlayers })),
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
  };
}

module.exports = { liveStats };
