// Yas Penalty sur deux clients : décisions simultanées, secret des choix,
// fin anticipée, statistiques buteur / gardien en base.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, registerUser, connect, setGameConfig, pool } = require('../helpers/server');

let srv; let a; let b; let ca; let cb;

test.before(async () => {
  srv = await startServer();
  await setGameConfig('penalty', { revealMs: 0 });
  a = await registerUser(srv.base, 'Kassim');
  b = await registerUser(srv.base, 'Latifa');
  ca = connect(srv.base, a.token);
  cb = connect(srv.base, b.token);
  await Promise.all([ca.ready, cb.ready]);
});

test.after(async () => { ca.close(); cb.close(); await stopServer(srv); });

test('séance complète : le tireur de A marque toujours, B est toujours arrêté', async () => {
  const created = await ca.emit('room:create', { gameId: 'penalty' });
  await cb.emit('room:join', { code: created.room.code });
  const started = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  await ca.emit('room:ready'); await cb.emit('room:ready');
  let snap = await started;
  const matchId = snap.matchId;
  const ended = ca.waitFor('match:ended', e => e.matchId === matchId, { timeout: 15000 });
  const byUser = { [a.userId]: ca, [b.userId]: cb };
  let n = 0;
  while (snap.view.status === 'playing' && n < 30) {
    const k = snap.view.kick;
    const shooterIsA = k.shooter === a.userId;
    // A vise 1 et plonge 3 ; B vise 3 (toujours arrêté) et plonge 5
    const shot = shooterIsA ? 1 : 3;
    const dive = shooterIsA ? 5 : 3;
    const r1 = await byUser[k.shooter].emit('match:action', { matchId, commandId: `s${n}`, action: { type: 'choose', zone: shot } });
    assert.equal(r1.ok, true, JSON.stringify(r1));
    // Le gardien ne voit pas encore la zone du tireur
    const keeperView = (await byUser[k.keeper].emit('match:sync', { matchId })).snapshot.view;
    assert.equal(keeperView.kick.shooterLocked, true);
    assert.equal(keeperView.kick.myChoice, null);
    const next = byUser[k.shooter].waitFor('match:state', s => s.matchId === matchId && s.view.history.length === n + 1);
    const r2 = await byUser[k.keeper].emit('match:action', { matchId, commandId: `k${n}`, action: { type: 'choose', zone: dive } });
    assert.equal(r2.ok, true, JSON.stringify(r2));
    snap = await next;
    n++;
  }
  const e = await ended;
  assert.equal(e.placements[0].userId, a.userId);
  assert.equal(e.reason, 'early_finish');
  const stats = await pool.query(`SELECT user_id, extra FROM player_game_stats WHERE game_id = 'penalty'`);
  const ex = Object.fromEntries(stats.rows.map(r => [r.user_id, r.extra]));
  assert.ok(ex[a.userId].goals >= 3);
  assert.equal(ex[a.userId].saves, ex[b.userId].shots, 'chaque tir de B a été arrêté par A');
  assert.equal(ex[b.userId].goals || 0, 0);
});
