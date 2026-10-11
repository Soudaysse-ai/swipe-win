// « Jouer contre un bot » : un joueur seul lance une partie d'entraînement, le bot
// joue côté serveur, et la partie ne compte pour aucun classement.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, registerUser, connect, setGameConfig, pool } = require('../helpers/server');

let srv;
let alice; let ca;

test.before(async () => {
  srv = await startServer();
  alice = await registerUser(srv.base, 'Alice');
  ca = connect(srv.base, alice.token);
  await ca.ready;
});

test.after(async () => {
  ca?.close();
  await stopServer(srv);
});

// Joue les coups d'Alice (choisis par `move`) jusqu'à la fin de la partie.
async function playUntilEnd(matchId, move) {
  const ended = ca.waitFor('match:ended', e => e.matchId === matchId, { timeout: 60_000 });
  let done = false;
  ended.then(() => { done = true; }, () => { done = true; });
  let lastVersion = -1;
  while (!done) {
    const snap = (await ca.emit('match:sync', { matchId })).snapshot;
    if (!snap) break;
    if (snap.view && snap.version !== lastVersion) {
      const action = move(snap.view);
      if (action) {
        const r = await ca.emit('match:action', { matchId, commandId: crypto.randomUUID(), version: snap.version, action });
        if (r.ok) { lastVersion = snap.version; continue; }
        assert.ok(['STALE_VERSION', 'NOT_YOUR_TURN', 'NOT_OPEN', 'MATCH_NOT_FOUND', 'MATCH_OVER'].includes(r.code), JSON.stringify(r));
      }
    }
    await new Promise(r => setTimeout(r, 15));
  }
  return ended;
}

test('Yas Connect contre un bot : partie complète, aucun impact sur le classement', async () => {
  const started = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  const res = await ca.emit('bot:start', { gameId: 'connect', level: 'hard' });
  assert.equal(res.ok, true, JSON.stringify(res));
  const snap = await started;
  assert.equal(snap.matchId, res.matchId);
  assert.equal(snap.training, true);
  const bot = snap.players.find(p => p.isBot);
  assert.ok(bot && bot.username.startsWith('Bot ') && bot.avatar === 'bot');
  assert.equal(snap.players.length, 2);

  // Alice joue toujours la première colonne libre ; le bot répond seul.
  const end = await playUntilEnd(res.matchId, (v) => {
    if (v.status !== 'playing' || v.turn !== alice.userId) return null;
    const col = [0, 1, 2, 3, 4, 5, 6].find(c => v.board[5][c] === null);
    return { type: 'drop', col };
  });
  assert.equal(end.training, true);
  assert.equal(end.isValid, false);
  assert.equal(end.you, null);
  assert.deepEqual(end.bot, { opponents: 1, level: 'hard' });
  assert.ok(end.placements.some(p => p.isBot && p.username === bot.username));
  // Contre ce jeu naïf, le bot « Difficile » gagne.
  assert.equal(end.placements.find(p => p.place === 1).isBot, true);

  const m = (await pool.query('SELECT mode, bots, is_valid FROM matches WHERE id = $1', [res.matchId])).rows[0];
  assert.equal(m.mode, 'bot');
  assert.equal(m.is_valid, false);
  assert.equal(m.bots.length, 1);
  const mp = (await pool.query('SELECT user_id, outcome FROM match_players WHERE match_id = $1', [res.matchId])).rows;
  assert.deepEqual(mp, [{ user_id: alice.userId, outcome: 'loss' }]);
  for (const table of ['match_results', 'rating_transactions', 'xp_transactions', 'season_points']) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE match_id = $1`, [res.matchId]);
    assert.equal(rows[0].n, 0, `${table} ne doit rien contenir pour un entraînement`);
  }
  const stats = await pool.query('SELECT COUNT(*)::int AS n FROM player_game_stats WHERE user_id = $1', [alice.userId]);
  assert.equal(stats.rows[0].n, 0);

  // Historique : la partie apparaît comme un entraînement contre le bot.
  const hist = await api(srv.base, 'GET', '/api/players/me/matches', { token: alice.token });
  const h = hist.data.matches.find(x => x.matchId === res.matchId);
  assert.equal(h.training, true);
  assert.equal(h.opponents[0].isBot, true);
});

test('Yas Penalty contre un bot : choix simultanés et cachés, séance menée à son terme', async () => {
  await setGameConfig('penalty', { revealMs: 0 });
  const started = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  const res = await ca.emit('bot:start', { gameId: 'penalty', level: 'normal' });
  assert.equal(res.ok, true, JSON.stringify(res));
  await started;
  let n = 0;
  const end = await playUntilEnd(res.matchId, (v) => {
    if (v.status !== 'playing' || !v.kick || v.kick.myChoice != null) return null;
    n += 1;
    return { type: 'choose', zone: (n % 5) + 1 };
  });
  assert.equal(end.training, true);
  assert.equal(end.placements.length, 2);
  const shots = end.placements.reduce((t, p) => t + p.stats.shots, 0);
  assert.ok(shots >= 6, `séance trop courte : ${shots} tirs`);
});

test('Yas Ludo à 3 bots : abandonner arrête la partie aussitôt', async () => {
  const started = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  const res = await ca.emit('bot:start', { gameId: 'ludo', opponents: 3, level: 'easy' });
  assert.equal(res.ok, true, JSON.stringify(res));
  const snap = await started;
  assert.equal(snap.players.filter(p => p.isBot).length, 3);
  assert.equal(new Set(snap.players.map(p => p.username)).size, 4);
  // Les bots ne gonflent pas le compteur « en jeu » affiché aux joueurs.
  const games = await api(srv.base, 'GET', '/api/games');
  assert.equal(games.data.games.find(g => g.id === 'ludo').playersOnline, 1);
  const ended = ca.waitFor('match:ended', e => e.matchId === res.matchId);
  assert.equal((await ca.emit('match:resign', { matchId: res.matchId })).ok, true);
  const end = await ended;
  assert.equal(end.reason, 'resign');
  assert.equal(end.placements.find(p => p.userId === alice.userId).place, 4);
});

test('bot:start : refusé pendant une partie, nombre de bots borné par le jeu', async () => {
  const started = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  const res = await ca.emit('bot:start', { gameId: 'cards', opponents: 9 });
  assert.equal(res.ok, true, JSON.stringify(res));
  const snap = await started;
  assert.equal(snap.players.length, 4); // borné à 3 bots

  const again = await ca.emit('bot:start', { gameId: 'connect' });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'IN_MATCH');

  const ended = ca.waitFor('match:ended', e => e.matchId === res.matchId);
  await ca.emit('match:resign', { matchId: res.matchId });
  await ended;

  const unknown = await ca.emit('bot:start', { gameId: 'echecs' });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'GAME_UNAVAILABLE');
});
