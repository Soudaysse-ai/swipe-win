// Yas Cards à 3 joueurs sur 3 clients : partie complète jusqu'à la victoire,
// confidentialité des mains, événements privés de pioche.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, registerUser, connect, pool } = require('../helpers/server');

let srv;
const users = [];
const clients = [];

test.before(async () => {
  srv = await startServer();
  for (const name of ['Fahad', 'Hadja', 'Ismael']) {
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

const idx = (userId) => users.findIndex(u => u.userId === userId);

test('partie complète de Yas Cards à 3 joueurs', async () => {
  const created = await clients[0].emit('room:create', { gameId: 'cards', maxPlayers: 3 });
  for (const c of clients.slice(1)) await c.emit('room:join', { code: created.room.code });
  const started = clients.map(c => c.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view));
  for (const c of clients) await c.emit('room:ready', { ready: true });
  const snaps = await Promise.all(started);
  const matchId = snaps[0].matchId;

  // Chaque joueur ne voit que sa main
  const hands = snaps.map(s => s.view.hand.map(c => c.id));
  assert.ok(hands.every(h => h.length === 7));
  const all = hands.flat();
  assert.equal(new Set(all).size, 21, 'aucune carte en double');
  for (const s of snaps) {
    assert.equal(s.view.drawPile, undefined);
    assert.deepEqual(Object.values(s.view.counts), [7, 7, 7]);
  }
  assert.equal(snaps[0].view.top.kind, 'number');

  const ended = clients[0].waitFor('match:ended', e => e.matchId === matchId, { timeout: 60000 });
  let latest = snaps.map(s => s);
  let actions = 0;
  let finished = false;
  ended.then(() => { finished = true; });
  while (!finished && actions < 1500) {
    const any = latest[0];
    const turn = any.view.turn;
    if (!turn) break;
    const i = idx(turn);
    const v = latest[i].view;
    let action;
    if (v.phase === 'challenge') action = { type: 'accept' };
    else if (v.playable.length) {
      const card = v.hand.find(c => c.id === v.playable[0]);
      action = { type: 'play', cardId: card.id, color: 'red', declareLastCard: v.hand.length === 2 };
    } else if (v.phase === 'drawn') action = { type: 'pass' };
    else action = { type: 'draw' };
    const next = clients.map(c => c.waitFor('match:state', s => s.matchId === matchId && s.version > latest[0].version, { timeout: 5000 }));
    const r = await clients[i].emit('match:action', { matchId, commandId: `a${actions}`, version: v.version ?? latest[i].version, action });
    assert.equal(r.ok, true, `${JSON.stringify(action)} → ${JSON.stringify(r)}`);
    latest = await Promise.all(next);
    actions++;
    // les trois clients voient la même carte du dessus et les mêmes compteurs
    const tops = latest.map(s => s.view.top.id);
    assert.ok(tops.every(t => t === tops[0]));
    for (const s of latest) assert.equal(Object.values(s.view.counts).reduce((a, b) => a + b, 0) + s.view.drawPileCount + 0 > 0, true);
  }
  const e = await ended;
  assert.equal(e.isValid, true);
  assert.equal(e.placements[0].place, 1);
  assert.equal(e.placements[0].stats.cardsLeft, 0);
  for (let k = 1; k < e.placements.length; k++) {
    const a = e.placements[k - 1].stats; const b = e.placements[k].stats;
    if (k > 1) assert.ok(a.cardsLeft < b.cardsLeft || (a.cardsLeft === b.cardsLeft && a.handValue <= b.handValue), 'classement par cartes puis valeur');
  }
  // Les pioches privées ne sont envoyées qu'au joueur concerné
  for (let k = 0; k < 3; k++) {
    const mine = clients[k].received.filter(x => x.event === 'game:event' && x.payload.type === 'you_drew');
    for (const m of mine) for (const c of m.payload.payload.cards) {
      for (let j = 0; j < 3; j++) if (j !== k) {
        const leaked = clients[j].received.some(x => x.event === 'game:event' && x.payload.type === 'you_drew' && x.payload.payload.cards.some(cc => cc.id === c.id) && x.payload.version === m.payload.version);
        assert.equal(leaked, false);
      }
    }
  }
  const stats = await pool.query(`SELECT COUNT(*)::int AS n FROM player_game_stats WHERE game_id = 'cards' AND games_played = 1`);
  assert.equal(stats.rows[0].n, 3);
});
