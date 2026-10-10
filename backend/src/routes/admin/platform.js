// Back-office : tableaux de bord, joueurs, classements, résultats suspects, temps réel.
const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const auth = require('../../middleware/auth');
const stats = require('../../services/adminStats');
const lb = require('../../services/leaderboards');
const profiles = require('../../services/profiles');
const moderation = require('../../services/moderation');
const exporter = require('../../services/exporter');
const runtime = require('../../realtime/matchRuntime');
const { liveStats } = require('../../services/live');
const { logAudit } = require('../../services/audit');
const { levelForXp } = require('../../services/progression');
const { ah, clientIp } = require('../../lib/http');
const { bad, notFound, forbidden } = require('../../lib/errors');

const fmtMs = (ms) => (ms == null ? '' : Math.round(Number(ms) / 60000));
const wantsExport = (req) => ['csv', 'xlsx'].includes(req.query.format);
const assertExport = (req) => { if (!req.admin.permissions.has('exports')) throw forbidden('Permission « exports » requise'); };

router.get('/dashboard', auth('dashboard.view'), ah(async (req, res) => {
  res.json(await stats.dashboard(req.query, liveStats()));
}));

router.get('/realtime', auth('dashboard.view'), (req, res) => res.json(liveStats()));

router.get('/engagement', auth('analytics.view'), ah(async (req, res) => {
  res.json(await stats.engagement(req.query));
}));

router.get('/games/analytics', auth('analytics.view'), ah(async (req, res) => {
  const live = liveStats();
  const out = {};
  for (const g of stats.GAMES) out[g] = (await stats.gameAnalytics(g, req.query, live)).totals;
  res.json({ games: out });
}));

router.get('/games/:gameId/analytics', auth('analytics.view'), ah(async (req, res) => {
  const data = await stats.gameAnalytics(req.params.gameId, req.query, liveStats());
  if (wantsExport(req)) {
    assertExport(req);
    return exporter.send(res, req.query.format, `top100_${req.params.gameId}`, [
      { key: 'rank', label: 'Rang' }, { key: 'username', label: 'Pseudonyme' }, { key: 'rating', label: 'Cote' },
      { key: 'league', label: 'Ligue' }, { key: 'games_played', label: 'Parties' }, { key: 'wins', label: 'Victoires' },
      { key: 'win_rate', label: 'Taux de victoire', value: r => (r.win_rate == null ? '' : Math.round(r.win_rate * 1000) / 10) },
    ], data.top100);
  }
  res.json(data);
}));

// Classements administratifs (parties, temps, victoires, points, XP, taux, régularité)
router.get('/players/top', auth('players.view'), ah(async (req, res) => {
  if (wantsExport(req)) {
    assertExport(req);
    const data = await stats.topPlayers({ ...req.query, page: 1, pageSize: 500 });
    return exporter.send(res, req.query.format, `joueurs_${data.metric}`, [
      { key: 'rank', label: 'Rang' }, { key: 'username', label: 'Pseudonyme' }, { key: 'matches', label: 'Parties' },
      { key: 'wins', label: 'Victoires' }, { key: 'win_rate', label: 'Taux de victoire (%)', value: r => (r.win_rate == null ? '' : Math.round(r.win_rate * 1000) / 10) },
      { key: 'play_time_ms', label: 'Temps de jeu (min)', value: r => fmtMs(r.play_time_ms) }, { key: 'points', label: 'Points de saison' },
      { key: 'xp', label: 'XP' }, { key: 'level', label: 'Niveau' }, { key: 'active_days', label: 'Jours actifs' },
      { key: 'created_at', label: 'Inscription' }, { key: 'status', label: 'Statut' },
    ], data.rows);
  }
  res.json(await stats.topPlayers(req.query));
}));

// Gestion des utilisateurs
router.get('/players', auth('players.view'), ah(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const q = String(req.query.q || '').trim();
  const canPrivate = req.admin.permissions.has('players.view_private');
  const status = ['active', 'suspended', 'banned', 'deleted'].includes(req.query.status) ? req.query.status : null;
  const sortMap = { created_at: 'u.created_at', last_seen_at: 'u.last_seen_at', username: 'LOWER(u.username)', xp: 'g.xp', matches: 'g.matches_played' };
  const sort = `${sortMap[req.query.sort] || 'u.created_at'} ${req.query.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`;
  const like = q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : null;
  const where = `WHERE ($1::text IS NULL OR u.username ILIKE $1 ${canPrivate ? 'OR u.phone ILIKE $1' : ''})
                   AND ($2::text IS NULL OR u.status = $2)
                   AND ($3::date IS NULL OR u.created_at >= $3::date) AND ($4::date IS NULL OR u.created_at < $4::date + 1)`;
  const params = [like, status, /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null, /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : null];
  const select = `SELECT u.id, u.username, u.avatar, u.status, u.created_at, u.last_seen_at, ${canPrivate ? 'u.phone,' : ''}
                         COALESCE(g.xp, 0)::int AS xp, COALESCE(g.level, 1) AS level, COALESCE(g.matches_played, 0) AS matches,
                         COALESCE(g.wins, 0) AS wins, COALESCE(g.play_time_ms, 0)::bigint AS play_time_ms,
                         (SELECT COUNT(*)::int FROM reports r WHERE r.reported_user_id = u.id AND r.status = 'open') AS open_reports
                    FROM users u LEFT JOIN player_global_stats g ON g.user_id = u.id ${where}`;
  if (wantsExport(req)) {
    assertExport(req);
    const { rows } = await pool.query(`${select} ORDER BY ${sort} LIMIT 50000`, params);
    await logAudit(req.admin.id, 'EXPORT', 'players', null, null, { count: rows.length, private: canPrivate }, { ip: clientIp(req) });
    return exporter.send(res, req.query.format, 'utilisateurs', [
      { key: 'id', label: 'Identifiant' }, { key: 'username', label: 'Pseudonyme' }, ...(canPrivate ? [{ key: 'phone', label: 'Téléphone' }] : []),
      { key: 'status', label: 'Statut' }, { key: 'created_at', label: 'Inscription' }, { key: 'last_seen_at', label: 'Dernière activité' },
      { key: 'level', label: 'Niveau' }, { key: 'xp', label: 'XP' }, { key: 'matches', label: 'Parties' }, { key: 'wins', label: 'Victoires' },
      { key: 'play_time_ms', label: 'Temps de jeu (min)', value: r => fmtMs(r.play_time_ms) },
    ], rows);
  }
  const [rows, count] = await Promise.all([
    pool.query(`${select} ORDER BY ${sort} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params),
    pool.query(`SELECT COUNT(*)::int AS n FROM users u ${where}`, params),
  ]);
  res.json({ rows: rows.rows.map(r => ({ ...r, play_time_ms: Number(r.play_time_ms) })), total: count.rows[0].n, page, pageSize });
}));

router.get('/players/:id', auth('players.view'), ah(async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Joueur introuvable');
  const canPrivate = req.admin.permissions.has('players.view_private');
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, u.status, u.suspended_until, u.created_at, u.last_seen_at, u.phone, u.phone_verified,
            u.legacy_player_id, g.xp, g.level, g.matches_played, g.wins, g.play_time_ms, g.active_days
       FROM users u LEFT JOIN player_global_stats g ON g.user_id = u.id WHERE u.id = $1`, [id]);
  const u = rows[0];
  if (!u) throw notFound('Joueur introuvable');
  if (!canPrivate) delete u.phone;
  const [games, history, reports, actions, season, legacy] = await Promise.all([
    profiles.gameStats(id),
    profiles.matchHistory(id, { limit: 50 }),
    pool.query(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at, r.resolution, ru.username AS reporter, c.body AS message
         FROM reports r JOIN users ru ON ru.id = r.reporter_id LEFT JOIN chat_messages c ON c.id = r.chat_message_id
        WHERE r.reported_user_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [id]),
    pool.query(
      `SELECT m.action, m.reason, m.until, m.created_at, a.email AS admin FROM moderation_actions m JOIN admins a ON a.id = m.admin_id
        WHERE m.user_id = $1 ORDER BY m.created_at DESC LIMIT 50`, [id]),
    pool.query(`SELECT COALESCE(SUM(points), 0)::int AS points FROM season_points sp JOIN seasons s ON s.id = sp.season_id AND s.is_active WHERE sp.user_id = $1`, [id]),
    u.legacy_player_id ? pool.query('SELECT COUNT(*)::int AS sessions, MAX(score) AS best FROM sessions WHERE player_id = $1 AND ended_at IS NOT NULL', [u.legacy_player_id]) : null,
  ]);
  res.json({
    player: { ...u, xp: Number(u.xp || 0), play_time_ms: Number(u.play_time_ms || 0), level: u.level || levelForXp(0), seasonPoints: season.rows[0].points },
    games, history, reports: reports.rows, moderation: actions.rows,
    legacyQuiz: legacy ? legacy.rows[0] : null, canViewPrivate: canPrivate,
  });
}));

router.post('/players/:id/suspend', auth('players.moderate'), ah(async (req, res) => {
  res.json(await moderation.sanction(req.admin, req.params.id, 'suspend', req.body, clientIp(req)));
}));
router.post('/players/:id/reactivate', auth('players.moderate'), ah(async (req, res) => {
  res.json(await moderation.sanction(req.admin, req.params.id, 'reactivate', req.body, clientIp(req)));
}));
router.post('/players/:id/warn', auth('players.moderate'), ah(async (req, res) => {
  res.json(await moderation.sanction(req.admin, req.params.id, 'warn', req.body, clientIp(req)));
}));
router.post('/players/:id/ban', auth('players.ban'), ah(async (req, res) => {
  res.json(await moderation.sanction(req.admin, req.params.id, 'ban', req.body, clientIp(req)));
}));
router.post('/players/:id/anonymize', auth('players.anonymize'), ah(async (req, res) => {
  await moderation.anonymize(req.admin, req.params.id, req.body.reason, clientIp(req));
  res.json({ ok: true });
}));
router.post('/players/:id/reset-code', auth('players.moderate'), ah(async (req, res) => {
  res.json(await moderation.resetCode(req.admin, req.params.id, req.body.reason, clientIp(req)));
}));
router.post('/players/:id/adjust', auth('leaderboards.correct'), ah(async (req, res) => {
  await moderation.adjustScore(req.admin, req.params.id, req.body || {}, clientIp(req));
  res.json({ ok: true });
}));

// Classements (administration)
router.get('/leaderboards', auth('leaderboards.view'), ah(async (req, res) => {
  const gameId = stats.GAMES.includes(req.query.gameId) ? req.query.gameId : null;
  const period = lb.PERIODS.includes(req.query.period) ? req.query.period : 'season';
  const board = ['scorers', 'keepers'].includes(req.query.board) ? req.query.board : 'rating';
  const rows = gameId ? await lb.gameRows(gameId, period, board) : await lb.globalRows(period);
  if (wantsExport(req)) {
    assertExport(req);
    return exporter.send(res, req.query.format, `classement_${gameId || 'global'}_${period}`, [
      { key: 'rank', label: 'Rang' }, { key: 'username', label: 'Pseudonyme' }, { key: 'value', label: gameId ? 'Cote / valeur' : 'Points' },
      { key: 'league', label: 'Ligue' }, { key: 'wins', label: 'Victoires' }, { key: 'matches', label: 'Parties' },
      { key: 'winRate', label: 'Taux de victoire (%)', value: r => (r.winRate == null ? '' : Math.round(r.winRate * 1000) / 10) },
    ], rows);
  }
  const limit = Math.min(1000, parseInt(req.query.limit, 10) || 100);
  res.json({ gameId, period, board, total: rows.length, entries: rows.slice(0, limit) });
}));

router.post('/leaderboards/recalculate', auth('leaderboards.recalculate'), ah(async (req, res) => {
  // Recalcule les agrégats globaux depuis les grands livres (XP, parties, victoires).
  const out = await pool.tx(async (db) => {
    const r = await db.query(
      `UPDATE player_global_stats g SET
          xp = GREATEST(0, COALESCE((SELECT SUM(amount) FROM xp_transactions x WHERE x.user_id = g.user_id), 0)),
          matches_played = (SELECT COUNT(*) FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id WHERE mp.user_id = g.user_id AND r.is_valid),
          wins = (SELECT COUNT(*) FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id WHERE mp.user_id = g.user_id AND r.is_valid AND mp.outcome = 'win'),
          updated_at = NOW()
       RETURNING user_id, xp`);
    for (const row of r.rows) await db.query('UPDATE player_global_stats SET level = $2 WHERE user_id = $1', [row.user_id, levelForXp(Number(row.xp))]);
    await logAudit(req.admin.id, 'RECALCULATE', 'leaderboards', null, null, { players: r.rows.length }, { reason: req.body?.reason || null, ip: clientIp(req) }, db);
    return r.rows.length;
  });
  lb.invalidate();
  await lb.snapshot().catch(() => {});
  res.json({ ok: true, players: out });
}));

router.get('/seasons', auth('leaderboards.view'), ah(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, (SELECT COUNT(DISTINCT user_id)::int FROM season_points sp WHERE sp.season_id = s.id) AS players,
            (SELECT json_agg(x) FROM (SELECT u.username, SUM(sp.points)::int AS points FROM season_points sp JOIN users u ON u.id = sp.user_id
               WHERE sp.season_id = s.id GROUP BY u.username ORDER BY points DESC LIMIT 3) x) AS podium
       FROM seasons s ORDER BY s.starts_at DESC`);
  res.json({ seasons: rows });
}));

router.post('/seasons', auth('seasons.manage'), ah(async (req, res) => {
  const { name, startsAt, endsAt } = req.body || {};
  if (!name || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) throw bad('BAD_SEASON', 'Nom et dates valides requis');
  const row = await pool.tx(async (db) => {
    const prev = await db.query('UPDATE seasons SET is_active = false WHERE is_active RETURNING *');
    const { rows } = await db.query('INSERT INTO seasons (name, starts_at, ends_at, is_active) VALUES ($1,$2,$3,true) RETURNING *', [name, startsAt, endsAt]);
    await logAudit(req.admin.id, 'NEW_SEASON', 'season', rows[0].id, prev.rows[0] || null, rows[0], { ip: clientIp(req) }, db);
    return rows[0];
  });
  lb.invalidate();
  res.status(201).json({ season: row });
}));

// Résultats suspects
router.get('/matches/review', auth('matches.review'), ah(async (req, res) => {
  const status = ['pending', 'cleared', 'voided'].includes(req.query.status) ? req.query.status : 'pending';
  const { rows } = await pool.query(
    `SELECT m.id, m.game_id, m.ended_at, m.flags, m.review_status, m.end_reason,
            (SELECT json_agg(json_build_object('userId', u.id, 'username', u.username, 'outcome', mp.outcome, 'placement', mp.placement))
               FROM match_players mp JOIN users u ON u.id = mp.user_id WHERE mp.match_id = m.id) AS players
       FROM matches m WHERE m.review_status = $1 ORDER BY m.ended_at DESC LIMIT 200`, [status]);
  res.json({ matches: rows });
}));

router.get('/matches/:id', auth('matches.review'), ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Match introuvable');
  const [players, events] = await Promise.all([
    pool.query(`SELECT mp.*, u.username FROM match_players mp JOIN users u ON u.id = mp.user_id WHERE mp.match_id = $1 ORDER BY mp.seat`, [req.params.id]),
    pool.query(`SELECT e.seq, e.type, e.payload, e.created_at, u.username FROM match_events e LEFT JOIN users u ON u.id = e.user_id
                 WHERE e.match_id = $1 ORDER BY e.seq LIMIT 2000`, [req.params.id]),
  ]);
  const { state, ...match } = rows[0];
  res.json({ match, players: players.rows, events: events.rows, live: !!runtime.getLive(req.params.id) });
}));

router.post('/matches/:id/review', auth('matches.review'), ah(async (req, res) => {
  await moderation.reviewMatch(req.admin, req.params.id, req.body?.decision, req.body?.reason, clientIp(req));
  res.json({ ok: true });
}));

router.post('/matches/:id/cancel', auth('games.manage'), ah(async (req, res) => {
  if (!String(req.body?.reason || '').trim()) throw bad('REASON_REQUIRED', 'Un motif est obligatoire');
  const ok = await runtime.cancel(req.params.id, 'admin');
  if (!ok) throw notFound('Match en cours introuvable');
  await logAudit(req.admin.id, 'CANCEL_MATCH', 'match', req.params.id, null, null, { reason: req.body.reason, ip: clientIp(req) });
  res.json({ ok: true });
}));

module.exports = router;
