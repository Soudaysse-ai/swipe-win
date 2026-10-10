// Back-office : permissions côté serveur, tableaux de bord sur données réelles,
// exports, modération journalisée, résultats suspects, tournoi complet.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startServer, stopServer, api, registerUser, connect, pool } = require('../helpers/server');

let srv;
const tokens = {};
const players = [];
const clients = [];

async function makeAdmin(role) {
  const email = `${role}@yas.km`;
  await pool.query(`INSERT INTO admins (email, password_hash, role, name) VALUES ($1, $2, $3, $3)`, [email, await bcrypt.hash('motdepasse-admin', 4), role]);
  const r = await api(srv.base, 'POST', '/api/admin/login', { body: { email, password: 'motdepasse-admin' } });
  assert.equal(r.status, 200);
  tokens[role] = r.data.token;
}

async function playConnect(ca, cb, winnerFirst = true) {
  const created = await ca.c.emit('room:create', { gameId: 'connect' });
  await cb.c.emit('room:join', { code: created.room.code });
  const st = ca.c.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
  await ca.c.emit('room:ready'); await cb.c.emit('room:ready');
  let s = await st;
  const matchId = s.matchId;
  const of = (u) => (u === ca.userId ? ca.c : cb.c);
  const ended = ca.c.waitFor('match:ended', e => e.matchId === matchId);
  const first = s.view.turn;
  const cols = [[first, 0], [null, 1], [first, 0], [null, 1], [first, 0], [null, 1], [first, 0]];
  for (const [u] of cols) {
    const who = u || (first === ca.userId ? cb.userId : ca.userId);
    const next = ca.c.waitFor('match:state', x => x.matchId === matchId && x.version === s.version + 1);
    const r = await of(who).emit('match:action', { matchId, version: s.version, action: { type: 'drop', col: u ? 0 : 1 } });
    assert.equal(r.ok, true, JSON.stringify(r));
    s = await next;
  }
  const e = await ended;
  await ca.c.emit('room:leave'); await cb.c.emit('room:leave');
  void winnerFirst;
  return e;
}

test.before(async () => {
  srv = await startServer();
  for (const role of ['super_admin', 'data_analyst', 'moderator', 'game_manager']) await makeAdmin(role);
  for (const name of ['Nadia', 'Omar', 'Para', 'Qadi']) {
    const u = await registerUser(srv.base, name);
    const c = connect(srv.base, u.token);
    await c.ready;
    players.push({ ...u, c });
    clients.push(c);
  }
});

test.after(async () => { clients.forEach(c => c.close()); await stopServer(srv); });

test('jeton joueur refusé sur le back-office ; permissions par rôle', async () => {
  const asPlayer = await api(srv.base, 'GET', '/api/admin/dashboard', { token: players[0].token });
  assert.equal(asPlayer.status, 401);
  assert.equal((await api(srv.base, 'GET', '/api/admin/dashboard')).status, 401);
  // Analyste : lecture et exports, pas de modération ni d'administration
  assert.equal((await api(srv.base, 'GET', '/api/admin/dashboard', { token: tokens.data_analyst })).status, 200);
  assert.equal((await api(srv.base, 'POST', `/api/admin/players/${players[0].userId}/ban`, { token: tokens.data_analyst, body: { reason: 'test' } })).status, 403);
  assert.equal((await api(srv.base, 'GET', '/api/admin/admins', { token: tokens.data_analyst })).status, 403);
  // Modérateur : pas d'export, pas de tournois, pas de téléphone
  assert.equal((await api(srv.base, 'GET', '/api/admin/players?format=csv', { token: tokens.moderator })).status, 403);
  assert.equal((await api(srv.base, 'POST', '/api/admin/tournaments', { token: tokens.moderator, body: {} })).status, 403);
  const det = await api(srv.base, 'GET', `/api/admin/players/${players[0].userId}`, { token: tokens.moderator });
  assert.equal(det.status, 200);
  assert.equal(det.data.player.phone, undefined);
  const detSuper = await api(srv.base, 'GET', `/api/admin/players/${players[0].userId}`, { token: tokens.super_admin });
  assert.equal(detSuper.data.player.phone, players[0].phone);
  // Seul le super admin gère les administrateurs
  assert.equal((await api(srv.base, 'GET', '/api/admin/admins', { token: tokens.super_admin })).status, 200);
});

test('tableaux de bord sur données réelles + exports CSV / Excel', async () => {
  const [a, b] = players;
  const e = await playConnect(a, b);
  assert.equal(e.isValid, true, JSON.stringify(e));
  const dash = await api(srv.base, 'GET', '/api/admin/dashboard', { token: tokens.data_analyst });
  assert.equal(dash.data.kpis.totalUsers, 4);
  assert.equal(dash.data.kpis.matchesCompleted, 1);
  assert.equal(dash.data.kpis.activeToday, 2, 'les deux joueurs de la partie sont actifs');
  assert.equal(dash.data.kpis.mostPopularGame.game_id, 'connect');
  assert.ok(dash.data.kpis.totalPlayTimeMs >= 0);
  const top = await api(srv.base, 'GET', '/api/admin/players/top?metric=wins', { token: tokens.data_analyst });
  assert.equal(top.data.rows[0].wins, 1);
  const game = await api(srv.base, 'GET', '/api/admin/games/connect/analytics', { token: tokens.data_analyst });
  assert.equal(game.data.totals.matches, 1);
  assert.equal(game.data.top100.length, 2);
  assert.equal(game.data.specific.avg_moves, '7.0');
  const eng = await api(srv.base, 'GET', '/api/admin/engagement', { token: tokens.data_analyst });
  assert.equal(eng.status, 200);
  assert.equal(eng.data.dau, 2);
  const csv = await fetch(`${srv.base}/api/admin/players/top?metric=matches&format=csv`, { headers: { Authorization: `Bearer ${tokens.data_analyst}` } });
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.ok(text.replace(/^\uFEFF/, '').startsWith('Rang;Pseudonyme'), JSON.stringify(text.slice(0, 60)));
  const xlsx = await fetch(`${srv.base}/api/admin/leaderboards?gameId=connect&format=xlsx`, { headers: { Authorization: `Bearer ${tokens.data_analyst}` } });
  assert.equal(xlsx.status, 200);
  const buf = Buffer.from(await xlsx.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), 'PK', 'fichier xlsx (zip)');
  const rt = await api(srv.base, 'GET', '/api/admin/realtime', { token: tokens.data_analyst });
  assert.equal(rt.data.onlineUsers, 4);
});

test('suspension : déconnexion immédiate, connexion refusée, audit', async () => {
  const target = players[3];
  const disc = new Promise(r => target.c.socket.once('disconnect', r));
  const s = await api(srv.base, 'POST', `/api/admin/players/${target.userId}/suspend`, { token: tokens.moderator, body: { reason: 'Insultes répétées', until: new Date(Date.now() + 86400000).toISOString() } });
  assert.equal(s.status, 200);
  await disc;
  const login = await api(srv.base, 'POST', '/api/auth/login', { body: { phone: target.phone, password: 'motdepasse123' } });
  assert.equal(login.status, 403);
  assert.equal(login.data.code, 'SUSPENDED');
  const audit = await api(srv.base, 'GET', '/api/admin/audit?entity=user', { token: tokens.data_analyst });
  assert.ok(audit.data.logs.some(l => l.action === 'SUSPEND' && l.reason === 'Insultes répétées'));
  const noReason = await api(srv.base, 'POST', `/api/admin/players/${target.userId}/reactivate`, { token: tokens.moderator, body: {} });
  assert.equal(noReason.status, 400, 'motif obligatoire');
  assert.equal((await api(srv.base, 'POST', `/api/admin/players/${target.userId}/reactivate`, { token: tokens.moderator, body: { reason: 'Fin de sanction' } })).status, 200);
  // ses sessions ont été révoquées : il doit se reconnecter
  const again = await api(srv.base, 'POST', '/api/auth/login', { body: { phone: target.phone, password: 'motdepasse123' } });
  assert.equal(again.status, 200);
  target.token = again.data.token;
  target.c = connect(srv.base, target.token);
  clients.push(target.c);
  await target.c.ready;
});

test('correction de score journalisée et annulation d\'un match suspect', async () => {
  const [a, , c] = players;
  const before = await api(srv.base, 'GET', '/api/leaderboards/global', { token: a.token });
  const adj = await api(srv.base, 'POST', `/api/admin/players/${c.userId}/adjust`, { token: tokens.super_admin, body: { kind: 'season_points', amount: 5, gameId: 'connect', reason: 'Bug corrigé' } });
  assert.equal(adj.status, 200);
  const after = await api(srv.base, 'GET', '/api/leaderboards/global', { token: a.token });
  assert.equal(after.data.entries.length, before.data.entries.length + 1);
  const { rows } = await pool.query(`SELECT match_id FROM match_results LIMIT 1`);
  const matchId = rows[0].match_id;
  const v = await api(srv.base, 'POST', `/api/admin/matches/${matchId}/review`, { token: tokens.moderator, body: { decision: 'void', reason: 'Match arrangé' } });
  assert.equal(v.status, 200);
  const stats = await pool.query(`SELECT SUM(games_played)::int AS n, SUM(wins)::int AS w FROM player_game_stats WHERE game_id = 'connect'`);
  assert.deepEqual(stats.rows[0], { n: 0, w: 0 });
  const pts = await pool.query(`SELECT SUM(points)::int AS p FROM season_points WHERE match_id = $1`, [matchId]);
  assert.equal(pts.rows[0].p, 0, 'écriture compensatoire');
  const ratings = await pool.query(`SELECT rating FROM player_game_stats WHERE game_id = 'connect'`);
  assert.ok(ratings.rows.every(r => Number(r.rating) === 1000));
  const again = await api(srv.base, 'POST', `/api/admin/matches/${matchId}/review`, { token: tokens.moderator, body: { decision: 'void', reason: 'x2' } });
  assert.equal(again.status, 400);
});

test('signalement depuis le jeu puis traitement par un modérateur', async () => {
  const [a, b] = players;
  const r = await api(srv.base, 'POST', '/api/reports', { token: a.token, body: { userId: b.userId, reason: 'insult', details: 'propos insultants' } });
  assert.equal(r.status, 201);
  const list = await api(srv.base, 'GET', '/api/admin/reports', { token: tokens.moderator });
  assert.equal(list.data.reports.length, 1);
  const res = await api(srv.base, 'POST', `/api/admin/reports/${r.data.id}/resolve`, { token: tokens.moderator, body: { status: 'resolved', action: 'warn', resolution: 'Avertissement envoyé' } });
  assert.equal(res.status, 200);
  const notif = await api(srv.base, 'GET', '/api/notifications', { token: b.token });
  assert.ok(notif.data.notifications.some(n => n.type === 'moderation'));
});

test('tournoi à 4 en élimination directe joué jusqu\'au bout', async () => {
  const now = Date.now();
  const t = await api(srv.base, 'POST', '/api/admin/tournaments', { token: tokens.game_manager, body: {
    gameId: 'connect', name: 'Yas Connect League', format: 'single_elimination', startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + 7 * 86400000).toISOString(), maxParticipants: 8, playersPerMatch: 2,
  } });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  const id = t.data.tournament.id;
  assert.equal((await api(srv.base, 'POST', `/api/admin/tournaments/${id}/open`, { token: tokens.game_manager })).status, 200);
  for (const p of players) assert.equal((await api(srv.base, 'POST', `/api/tournaments/${id}/join`, { token: p.token })).status, 200);
  assert.equal((await api(srv.base, 'POST', `/api/admin/tournaments/${id}/start`, { token: tokens.game_manager })).status, 200);

  async function playRound(round) {
    const d = await api(srv.base, 'GET', `/api/admin/tournaments/${id}`, { token: tokens.game_manager });
    const matches = d.data.tournament.matches.filter(m => m.round === round);
    for (const m of matches) {
      const [p1, p2] = m.players.map(x => players.find(p => p.userId === x.userId));
      const view = await api(srv.base, 'GET', `/api/tournaments/${id}`, { token: p1.token });
      const code = view.data.tournament.matches.find(x => x.id === m.id).room_code;
      assert.match(code, /^YAS-/);
      // un joueur étranger ne peut pas entrer
      const intruder = players.find(p => p !== p1 && p !== p2);
      const no = await intruder.c.emit('room:join', { code });
      assert.equal(no.code, 'ROOM_RESERVED');
      const st = p1.c.waitFor('match:state', s => s.status === 'IN_PROGRESS' && s.view);
      await p1.c.emit('room:join', { code }); await p2.c.emit('room:join', { code });
      await p1.c.emit('room:ready'); await p2.c.emit('room:ready');
      let s = await st;
      const ended = p1.c.waitFor('match:ended', e => e.matchId === s.matchId);
      const of = (u) => players.find(p => p.userId === u).c;
      const first = s.view.turn; const second = first === p1.userId ? p2.userId : p1.userId;
      for (const [u, col] of [[first, 0], [second, 1], [first, 0], [second, 1], [first, 0], [second, 1], [first, 0]]) {
        const next = p1.c.waitFor('match:state', x => x.matchId === s.matchId && x.version === s.version + 1);
        await of(u).emit('match:action', { matchId: s.matchId, version: s.version, action: { type: 'drop', col } });
        s = await next;
      }
      await ended;
    }
  }
  await playRound(1);
  await new Promise(r => setTimeout(r, 200));
  await playRound(2);
  await new Promise(r => setTimeout(r, 200));
  const done = await api(srv.base, 'GET', `/api/tournaments/${id}`, { token: players[0].token });
  assert.equal(done.data.tournament.status, 'completed');
  assert.equal(done.data.tournament.results[0].rank, 1);
  assert.equal(done.data.tournament.results.length, 4);
  assert.equal((await api(srv.base, 'POST', `/api/admin/tournaments/${id}/publish`, { token: tokens.game_manager })).status, 200);
  const champ = done.data.tournament.results[0].id;
  const n = await api(srv.base, 'GET', '/api/notifications', { token: players.find(p => p.userId === champ).token });
  assert.ok(n.data.notifications.some(x => x.type === 'tournament_results'));
});

test('gestion des administrateurs : création, garde-fou du dernier super admin', async () => {
  const c = await api(srv.base, 'POST', '/api/admin/admins', { token: tokens.super_admin, body: { email: 'mkt@yas.km', name: 'Marketing', role: 'marketing_manager', password: 'motdepasse-long' } });
  assert.equal(c.status, 201);
  const me = await api(srv.base, 'GET', '/api/admin/me', { token: tokens.super_admin });
  const self = await api(srv.base, 'PUT', `/api/admin/admins/${me.data.admin.id}`, { token: tokens.super_admin, body: { role: 'moderator' } });
  assert.equal(self.status, 400);
  const login = await api(srv.base, 'POST', '/api/admin/login', { body: { email: 'mkt@yas.km', password: 'motdepasse-long' } });
  assert.ok(login.data.admin.permissions.includes('tournaments.manage'));
  assert.ok(!login.data.admin.permissions.includes('players.ban'));
});
