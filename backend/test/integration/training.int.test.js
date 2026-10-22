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

test('Yas Foot contre un bot : tir à la fronde, trajectoire reçue, le bot répond', async () => {
  const started = ca.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  const res = await ca.emit('bot:start', { gameId: 'foot', level: 'normal' });
  assert.equal(res.ok, true, JSON.stringify(res));
  let snap = await started;
  assert.equal(snap.view.discs[alice.userId].length, 5);
  // Avant-match : le bot choisit seul ; Alice prend son équipe et sa formation.
  assert.equal(snap.view.phase, 'setup');
  const ready = await ca.emit('match:action', {
    matchId: res.matchId, commandId: crypto.randomUUID(), version: snap.version, action: { type: 'setup', team: 'km', formation: '1-2-2', ready: true },
  });
  assert.equal(ready.ok, true, JSON.stringify(ready));

  // Attendre son tour (le bot peut commencer), puis l'ouverture du tir.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    snap = (await ca.emit('match:sync', { matchId: res.matchId })).snapshot;
    if (snap.view.phase === 'play' && snap.view.turn === alice.userId && Date.now() >= snap.view.turnOpensAt) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(snap.view.turn, alice.userId);
  assert.equal(snap.view.teams[alice.userId], 'km');
  assert.ok(snap.view.teams[snap.players.find(p => p.isBot).userId] !== 'km');
  const myShot = ca.waitFor('game:event', e => e.matchId === res.matchId && e.type === 'shot' && e.payload.userId === alice.userId);
  const r = await ca.emit('match:action', {
    matchId: res.matchId, commandId: crypto.randomUUID(), version: snap.version, action: { type: 'shoot', disc: 4, dx: 0.7, dy: 0.1 },
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  const shot = await myShot;
  assert.ok(shot.payload.frames.length > 3);
  assert.equal(shot.payload.frames[0].length, 11);

  // Le bot joue à son tour, une fois l'animation terminée côté serveur. Si le tir
  // d'Alice a donné une belle passe, elle rejoue d'abord (jusqu'à ce que la main passe).
  const botShotP = ca.waitFor('game:event', e => e.matchId === res.matchId && e.type === 'shot' && e.payload.userId !== alice.userId, { timeout: 30_000 });
  let gotBot = false;
  botShotP.then(() => { gotBot = true; }, () => {});
  for (let k = 0; k < 4 && !gotBot; k++) {
    await new Promise(r => setTimeout(r, 300));
    const cur = (await ca.emit('match:sync', { matchId: res.matchId })).snapshot;
    if (cur.view.turn === alice.userId && Date.now() >= cur.view.turnOpensAt) {
      await ca.emit('match:action', {
        matchId: res.matchId, commandId: crypto.randomUUID(), version: cur.version, action: { type: 'shoot', disc: 0, dx: 0.2, dy: 0.9 },
      });
    } else await new Promise(r => setTimeout(r, 1500));
  }
  const botShot = await botShotP;
  assert.ok(botShot.payload.frames.length > 1);

  const ended = ca.waitFor('match:ended', e => e.matchId === res.matchId);
  await ca.emit('match:resign', { matchId: res.matchId });
  const end = await ended;
  assert.equal(end.training, true);
});

test('Yas Penalty retiré : absent de la liste, introuvable, plus jouable', async () => {
  const list = await api(srv.base, 'GET', '/api/games');
  assert.deepEqual(list.data.games.map(g => g.id).sort(), ['cards', 'connect', 'foot', 'ludo']);
  assert.equal((await api(srv.base, 'GET', '/api/games/penalty')).status, 404);
  const r = await ca.emit('bot:start', { gameId: 'penalty' });
  assert.equal(r.code, 'GAME_UNAVAILABLE');
  const room = await ca.emit('room:create', { gameId: 'penalty', visibility: 'private' });
  assert.equal(room.ok, false);
  const stats = await api(srv.base, 'GET', '/api/players/me/stats', { token: alice.token });
  assert.ok(!stats.data.games.some(g => g.gameId === 'penalty'));
});
