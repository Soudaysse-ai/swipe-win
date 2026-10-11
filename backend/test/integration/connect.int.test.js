// Deux joueurs sur deux « appareils » (deux clients Socket.IO distincts)
// jouent une vraie partie de Yas Connect contre le vrai serveur.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, registerUser, connect, setGameConfig, sleep, pool } = require('../helpers/server');

let srv;
let alice; let bob;
let ca; let cb;

test.before(async () => {
  srv = await startServer();
  alice = await registerUser(srv.base, 'Alice');
  bob = await registerUser(srv.base, 'Bob');
  ca = connect(srv.base, alice.token);
  cb = connect(srv.base, bob.token);
  await Promise.all([ca.ready, cb.ready]);
});

test.after(async () => {
  ca?.close(); cb?.close();
  await stopServer(srv);
});

async function startConnectMatch() {
  const created = await ca.emit('room:create', { gameId: 'connect', visibility: 'private' });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.match(created.room.code, /^YAS-\d{6}$/);
  const joined = await cb.emit('room:join', { code: created.room.code });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  const startedA = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  const startedB = cb.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  assert.equal((await ca.emit('room:ready', { ready: true })).ok, true);
  assert.equal((await cb.emit('room:ready', { ready: true })).ok, true);
  const [sa, sb] = await Promise.all([startedA, startedB]);
  assert.equal(sa.matchId, sb.matchId);
  return { roomCode: created.room.code, matchId: sa.matchId, state: sa };
}

const clientOf = (userId) => (userId === alice.userId ? ca : cb);

async function drop(client, matchId, col, version, commandId = crypto.randomUUID()) {
  return client.emit('match:action', { matchId, commandId, version, action: { type: 'drop', col } });
}

test('partie complète : salon privé, coups validés, victoire, résultats officiels', async () => {
  const { matchId, state } = await startConnectMatch();
  let version = state.version;
  const first = state.view.turn;
  const second = first === alice.userId ? bob.userId : alice.userId;

  // Jouer hors de son tour est refusé par le serveur
  const refused = await drop(clientOf(second), matchId, 3, version);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'NOT_YOUR_TURN');

  // Une version périmée est refusée (désynchronisation)
  const stale = await drop(clientOf(first), matchId, 3, version - 1);
  assert.equal(stale.code, 'STALE_VERSION');

  // Coup + rejeu de la même commande : idempotent
  const cmd = crypto.randomUUID();
  const r1 = await drop(clientOf(first), matchId, 0, version, cmd);
  assert.equal(r1.ok, true);
  const r2 = await drop(clientOf(first), matchId, 0, version, cmd);
  assert.equal(r2.duplicate, true);
  version = r1.version;

  // Le premier joueur aligne 4 jetons verticalement en colonne 0
  const seq = [[second, 1], [first, 0], [second, 1], [first, 0], [second, 1]];
  for (const [u, col] of seq) {
    const r = await drop(clientOf(u), matchId, col, version);
    assert.equal(r.ok, true, JSON.stringify(r));
    version = r.version;
  }
  const endedA = ca.waitFor('match:ended', e => e.matchId === matchId);
  const endedB = cb.waitFor('match:ended', e => e.matchId === matchId);
  const win = await drop(clientOf(first), matchId, 0, version);
  assert.equal(win.ok, true);
  const [ea, eb] = await Promise.all([endedA, endedB]);
  const ended = first === alice.userId ? ea : eb;
  assert.equal(ended.isValid, true);
  assert.equal(ended.reason, 'connect_four');
  assert.equal(ended.placements.find(p => p.place === 1).userId, first);
  assert.ok(ended.you.xpGained >= 35, `XP gagnés : ${ended.you.xpGained}`); // 10 + 20 + 5 (+15 défi du jour)
  assert.equal(ended.you.ratingAfter, 1016);
  assert.equal(ended.you.seasonPoints, 30);

  // Aucun coup accepté après la fin
  const late = await drop(clientOf(second), matchId, 5, null);
  assert.equal(late.ok, false);

  // Vérifications en base : résultat officiel, coups enregistrés, cotes, XP
  const mr = await pool.query('SELECT * FROM match_results WHERE match_id = $1', [matchId]);
  assert.equal(mr.rows.length, 1);
  const events = await pool.query(`SELECT COUNT(*)::int AS n FROM match_events WHERE match_id = $1 AND type = 'action'`, [matchId]);
  assert.equal(events.rows[0].n, 7);
  const stats = await pool.query(`SELECT user_id, rating, wins, losses FROM player_game_stats WHERE game_id = 'connect' ORDER BY rating DESC`);
  assert.deepEqual(stats.rows.map(r => [r.user_id, Number(r.rating), r.wins, r.losses]), [[first, 1016, 1, 0], [second, 984, 0, 1]]);
  const loserXp = await pool.query('SELECT SUM(amount)::int AS xp FROM xp_transactions WHERE user_id = $1', [second]);
  assert.equal(loserXp.rows[0].xp, 15); // 10 partie terminée + 5 première partie du jour
});

test('classements et profils mis à jour automatiquement', async () => {
  const global = await api(srv.base, 'GET', '/api/leaderboards/global?period=season', { token: alice.token });
  assert.equal(global.status, 200);
  assert.equal(global.data.entries.length, 1); // le perdant a 0 point en 1v1
  assert.equal(global.data.entries[0].value, 30);
  const board = await api(srv.base, 'GET', '/api/leaderboards/connect?period=week', { token: bob.token });
  assert.equal(board.data.entries.length, 2);
  assert.equal(board.data.entries[0].rating, 1016);
  assert.ok(board.data.me);
  const me = await api(srv.base, 'GET', '/api/players/me', { token: alice.token });
  const connectStats = me.data.player.games.find(g => g.gameId === 'connect');
  assert.equal(connectStats.played, 1);
  assert.ok(me.data.player.progress.xp >= 15);
  const pub = await api(srv.base, 'GET', `/api/players/${alice.userId}/public`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.player.phone, undefined); // jamais de téléphone en public
  assert.equal(JSON.stringify(pub.data).includes(alice.phone), false);
});

test('revanche dans le même salon', async () => {
  const startedA = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.version === 1);
  await ca.emit('room:ready', { ready: true });
  await cb.emit('room:ready', { ready: true });
  const s = await startedA;
  assert.ok(s.matchId);
  // On termine proprement cette partie par abandon pour la suite des tests
  const ended = ca.waitFor('match:ended', e => e.matchId === s.matchId);
  await cb.emit('match:resign', { matchId: s.matchId });
  const e = await ended;
  assert.equal(e.isValid, false, 'un abandon immédiat ne doit pas compter');
  assert.equal(e.you.xpGained, 0);
});

test('déconnexion puis reconnexion : la partie est restaurée', async () => {
  await setGameConfig('connect', { reconnectSeconds: 30 });
  const startedA = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.version === 1);
  await ca.emit('room:ready', { ready: true });
  await cb.emit('room:ready', { ready: true });
  const s = await startedA;
  const discEvt = ca.waitFor('player:disconnected', e => e.userId === bob.userId);
  cb.close();
  const d = await discEvt;
  assert.equal(d.graceSeconds, 30);
  const statusRow = await pool.query('SELECT status FROM matches WHERE id = $1', [s.matchId]);
  assert.equal(statusRow.rows[0].status, 'RECONNECTING');

  const back = ca.waitFor('player:reconnected', e => e.userId === bob.userId);
  cb = connect(srv.base, bob.token);
  const restore = cb.waitFor('session:restore');
  await cb.ready;
  const r = await restore;
  assert.equal(r.matchId, s.matchId);
  await back;
  const snap = await cb.emit('match:sync', { matchId: s.matchId });
  assert.equal(snap.snapshot.status, 'IN_PROGRESS');
  assert.equal(snap.snapshot.matchId, s.matchId);
  // fin de la partie
  const ended = ca.waitFor('match:ended', e => e.matchId === s.matchId);
  await ca.emit('match:resign', { matchId: s.matchId });
  await ended;
});

test('non-retour après le délai de grâce : forfait', async () => {
  await setGameConfig('connect', { reconnectSeconds: 1 });
  const startedA = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.version === 1);
  await ca.emit('room:ready', { ready: true });
  await cb.emit('room:ready', { ready: true });
  const s = await startedA;
  const ended = ca.waitFor('match:ended', e => e.matchId === s.matchId, { timeout: 6000 });
  cb.close();
  const e = await ended;
  assert.equal(e.reason, 'forfeit');
  assert.equal(e.placements.find(p => p.place === 1).userId, alice.userId);
  await setGameConfig('connect', { reconnectSeconds: 60 });
  cb = connect(srv.base, bob.token);
  await cb.ready;
});

test('chronomètre serveur : le joueur qui ne joue pas perd au temps', async () => {
  await setGameConfig('connect', { turnSeconds: 1, networkToleranceSeconds: 0 });
  // Bob a été retiré du salon (déconnecté à la fin du match) : nouveau salon
  await ca.emit('room:leave');
  const { matchId, state } = await startConnectMatch();
  const ended = ca.waitFor('match:ended', e => e.matchId === matchId, { timeout: 5000 });
  const e = await ended;
  assert.equal(e.reason, 'timeout');
  assert.notEqual(e.placements.find(p => p.place === 1).userId, state.view.turn);
  await setGameConfig('connect', { turnSeconds: 20, networkToleranceSeconds: 3 });
});

test('salon complet et code inconnu refusés', async () => {
  const carol = await registerUser(srv.base, 'Carol');
  const cc = connect(srv.base, carol.token);
  await cc.ready;
  const room = await api(srv.base, 'GET', '/api/rooms/mine', { token: alice.token });
  const full = await cc.emit('room:join', { code: room.data.room.code });
  assert.equal(full.ok, false);
  assert.equal(full.code, 'ROOM_FULL');
  const unknown = await cc.emit('room:join', { code: 'YAS-000000' });
  assert.equal(unknown.code, 'ROOM_NOT_FOUND');
  cc.close();
});

test('matchmaking : deux joueurs en file, confirmation, partie lancée', async () => {
  await ca.emit('room:leave');
  await cb.emit('room:leave');
  const foundA = ca.waitFor('matchmaking:found');
  const foundB = cb.waitFor('matchmaking:found');
  assert.equal((await ca.emit('matchmaking:join', { gameId: 'connect' })).ok, true);
  assert.equal((await cb.emit('matchmaking:join', { gameId: 'connect' })).ok, true);
  const [fa, fb] = await Promise.all([foundA, foundB]);
  assert.equal(fa.proposalId, fb.proposalId);
  assert.equal(fa.players.length, 2);
  const started = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS');
  await ca.emit('matchmaking:accept', { proposalId: fa.proposalId });
  await cb.emit('matchmaking:accept', { proposalId: fb.proposalId });
  const s = await started;
  assert.equal(s.gameId, 'connect');
  const ended = ca.waitFor('match:ended', e => e.matchId === s.matchId);
  await ca.emit('match:resign', { matchId: s.matchId });
  await ended;
});

test('matchmaking : un refus remet l\'autre joueur en file', async () => {
  await ca.emit('room:leave');
  await cb.emit('room:leave');
  const foundA = ca.waitFor('matchmaking:found');
  await ca.emit('matchmaking:join', { gameId: 'connect' });
  await cb.emit('matchmaking:join', { gameId: 'connect' });
  const fa = await foundA;
  const cancelled = ca.waitFor('matchmaking:cancelled');
  await cb.emit('matchmaking:decline', { proposalId: fa.proposalId });
  const c = await cancelled;
  assert.equal(c.requeued, true);
  await sleep(50);
  const status = ca.last('matchmaking:status');
  assert.equal(status.state, 'searching');
  await ca.emit('matchmaking:leave');
});

test('chat du salon : filtrage des insultes et messages rapides', async () => {
  const created = await ca.emit('room:create', { gameId: 'connect' });
  await cb.emit('room:join', { code: created.room.code });
  const got = cb.waitFor('chat:message', m => m.kind === 'text');
  const sent = await ca.emit('chat:send', { roomId: created.room.id, kind: 'text', text: 'salut espèce de connard' });
  assert.equal(sent.ok, true);
  const msg = await got;
  assert.equal(msg.filtered, true);
  assert.equal(msg.body.includes('connard'), false);
  const quick = await cb.emit('chat:send', { roomId: created.room.id, kind: 'quick', quickId: 'gg' });
  assert.equal(quick.message.body, 'Bien joué !');
  const bad = await cb.emit('chat:send', { roomId: created.room.id, kind: 'reaction', emoji: '💩' });
  assert.equal(bad.ok, false);
});
