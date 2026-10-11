// Yas Ludo à 4 joueurs sur 4 clients : tours dans l'ordre, dés serveur,
// synchronisation de tous les écrans, abandons et classement multijoueur.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, registerUser, connect, pool } = require('../helpers/server');

let srv;
const users = [];
const clients = [];

test.before(async () => {
  srv = await startServer();
  for (const name of ['Amina', 'Bacar', 'Chadia', 'Djamal']) {
    const u = await registerUser(srv.base, name);
    users.push(u);
    const c = connect(srv.base, u.token);
    await c.ready;
    clients.push(c);
  }
});

test.after(async () => {
  clients.forEach(c => c.close());
  await stopServer(srv);
});

const clientOf = (userId) => clients[users.findIndex(u => u.userId === userId)];

test('partie de Ludo à 4 : tours, dés serveur, abandons, classement', async () => {
  const created = await clients[0].emit('room:create', { gameId: 'ludo', visibility: 'public', maxPlayers: 4 });
  assert.equal(created.ok, true);
  assert.equal(created.room.maxPlayers, 4);
  const list = await clients[1].emit('room:list', { gameId: 'ludo' });
  assert.ok(list.rooms.some(r => r.code === created.room.code), 'salon public listé');
  for (const c of clients.slice(1)) assert.equal((await c.emit('room:join', { code: created.room.code })).ok, true);
  const started = clients.map(c => c.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view));
  for (const c of clients) await c.emit('room:ready', { ready: true });
  const snaps = await Promise.all(started);
  const matchId = snaps[0].matchId;
  assert.ok(snaps.every(s => s.matchId === matchId));
  assert.deepEqual(Object.values(snaps[0].view.colors).sort(), ['blue', 'green', 'red', 'yellow']);

  // 80 actions jouées par le bon joueur à chaque fois
  let state = snaps[0];
  const diceSeen = new Set();
  const turnOrder = [];
  for (let i = 0; i < 80; i++) {
    const v = state.view;
    const actor = clientOf(v.turn);
    if (turnOrder[turnOrder.length - 1] !== v.turn) turnOrder.push(v.turn);
    const action = v.phase === 'roll' ? { type: 'roll' } : { type: 'move', token: v.movable[0] };
    const next = actor.waitFor('match:state', s => s.matchId === matchId && s.version === state.version + 1);
    const r = await actor.emit('match:action', { matchId, commandId: `c${i}`, version: state.version, action });
    assert.equal(r.ok, true, JSON.stringify(r));
    state = await next;
    if (action.type === 'roll') {
      const ev = actor.received.filter(x => x.event === 'game:event' && x.payload.type === 'dice_rolled').pop();
      diceSeen.add(ev.payload.payload.value);
    }
  }
  assert.ok([...diceSeen].every(d => d >= 1 && d <= 6));
  // Rotation dans le sens horaire (ordre des sièges)
  const seats = state.view.players;
  for (let i = 1; i < turnOrder.length; i++) {
    const prev = seats.indexOf(turnOrder[i - 1]);
    assert.equal(seats.indexOf(turnOrder[i]), (prev + 1) % 4, 'ordre horaire');
  }
  // Tous les clients voient la même version
  await new Promise(r => setTimeout(r, 100));
  const versions = clients.map(c => c.last('match:state').version);
  assert.ok(versions.every(x => x === versions[0]), `versions : ${versions}`);

  // Un joueur qui n'est pas au trait ne peut pas jouer
  const notTurn = users.find(u => u.userId !== state.view.turn);
  const refused = await clientOf(notTurn.userId).emit('match:action', { matchId, commandId: 'x', version: state.version, action: { type: 'roll' } });
  assert.equal(refused.code, 'NOT_YOUR_TURN');

  // Trois abandons : le dernier joueur restant gagne, les autres sont classés à l'envers
  const resigners = users.slice(0, 3);
  const winner = users[3];
  const ended = clientOf(winner.userId).waitFor('match:ended', e => e.matchId === matchId);
  for (const u of resigners) {
    const r = await clientOf(u.userId).emit('match:resign', { matchId });
    assert.equal(r.ok, true);
  }
  const e = await ended;
  assert.equal(e.isValid, true, 'tous ont joué : partie validée');
  assert.deepEqual(e.placements.map(p => p.userId), [winner.userId, resigners[2].userId, resigners[1].userId, resigners[0].userId]);
  assert.equal(e.you.seasonPoints, 30);

  // Cote multijoueur (OpenSkill) : décroissante avec la place
  const ratings = await pool.query(
    `SELECT user_id, rating, place_1, place_2, place_3, place_4 FROM player_game_stats WHERE game_id = 'ludo'`);
  const byUser = Object.fromEntries(ratings.rows.map(r => [r.user_id, r]));
  const order = e.placements.map(p => Number(byUser[p.userId].rating));
  assert.ok(order[0] > order[1] && order[1] > order[2] && order[2] > order[3], `cotes : ${order}`);
  assert.equal(byUser[resigners[0].userId].place_4, 1);
  const pts = await pool.query(`SELECT user_id, points FROM season_points WHERE match_id = $1`, [matchId]);
  const ptsBy = Object.fromEntries(pts.rows.map(r => [r.user_id, r.points]));
  assert.deepEqual(e.placements.map(p => ptsBy[p.userId]), [30, 15, 8, 3]);
});
