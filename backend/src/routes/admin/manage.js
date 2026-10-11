// Back-office : tournois, modération, administrateurs, journal d'audit, configuration des jeux.
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const auth = require('../../middleware/auth');
const tournaments = require('../../services/tournaments');
const moderation = require('../../services/moderation');
const exporter = require('../../services/exporter');
const runtime = require('../../realtime/matchRuntime');
const { clearCache: clearPermissions } = require('../../services/permissions');
const { clearLeaguesCache, invalidate } = require('../../services/leaderboards');
const { logAudit } = require('../../services/audit');
const { ah, clientIp } = require('../../lib/http');
const { bad, notFound, forbidden } = require('../../lib/errors');

// ── Tournois ────────────────────────────────────────────────────────────────
router.get('/tournaments', auth('tournaments.manage'), ah(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, (SELECT COUNT(*)::int FROM tournament_players p WHERE p.tournament_id = t.id AND p.status <> 'withdrawn') AS participants
       FROM tournaments t ORDER BY t.created_at DESC`);
  res.json({ tournaments: rows });
}));
router.get('/tournaments/:id', auth('tournaments.manage'), ah(async (req, res) => {
  res.json({ tournament: await tournaments.detail(req.params.id, null, { admin: true }) });
}));
router.post('/tournaments', auth('tournaments.manage'), ah(async (req, res) => {
  res.status(201).json({ tournament: await tournaments.create(req.admin.id, req.body || {}) });
}));
router.put('/tournaments/:id', auth('tournaments.manage'), ah(async (req, res) => {
  res.json({ tournament: await tournaments.update(req.admin.id, req.params.id, req.body || {}) });
}));
router.post('/tournaments/:id/open', auth('tournaments.manage'), ah(async (req, res) => {
  await tournaments.openRegistration(req.admin.id, req.params.id); res.json({ ok: true });
}));
router.post('/tournaments/:id/participants', auth('tournaments.manage'), ah(async (req, res) => {
  const { rows } = await pool.query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND status = 'active'`, [String(req.body?.username || '')]);
  if (!rows[0]) throw notFound('Joueur introuvable');
  await tournaments.register(req.params.id, rows[0].id, { byAdmin: true });
  await logAudit(req.admin.id, 'ADD_PARTICIPANT', 'tournament', req.params.id, null, { userId: rows[0].id }, { ip: clientIp(req) });
  res.json({ ok: true });
}));
router.delete('/tournaments/:id/participants/:userId', auth('tournaments.manage'), ah(async (req, res) => {
  await tournaments.unregister(req.params.id, req.params.userId);
  await logAudit(req.admin.id, 'REMOVE_PARTICIPANT', 'tournament', req.params.id, { userId: req.params.userId }, null, { ip: clientIp(req) });
  res.json({ ok: true });
}));
router.post('/tournaments/:id/start', auth('tournaments.manage'), ah(async (req, res) => {
  await tournaments.start(req.admin.id, req.params.id); res.json({ ok: true });
}));
router.post('/tournaments/:id/matches/:tmId/winner', auth('tournaments.manage'), ah(async (req, res) => {
  await tournaments.setMatchWinner(req.admin.id, req.params.tmId, req.body?.winnerId || null, req.body?.reason);
  res.json({ ok: true });
}));
router.post('/tournaments/:id/publish', auth('tournaments.manage'), ah(async (req, res) => {
  await tournaments.publishResults(req.admin.id, req.params.id); res.json({ ok: true });
}));
router.post('/tournaments/:id/cancel', auth('tournaments.manage'), ah(async (req, res) => {
  await tournaments.cancel(req.admin.id, req.params.id, req.body?.reason); res.json({ ok: true });
}));

// ── Modération ──────────────────────────────────────────────────────────────
router.get('/reports', auth('reports.manage'), ah(async (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const { rows } = await pool.query(
    `SELECT r.*, ru.username AS reporter, tu.username AS reported, tu.status AS reported_status, c.body AS message, a.email AS handled_by_email,
            (SELECT COUNT(*)::int FROM reports x WHERE x.reported_user_id = r.reported_user_id) AS total_reports_on_user
       FROM reports r JOIN users ru ON ru.id = r.reporter_id JOIN users tu ON tu.id = r.reported_user_id
       LEFT JOIN chat_messages c ON c.id = r.chat_message_id LEFT JOIN admins a ON a.id = r.handled_by
      WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 300`, [status]);
  res.json({ reports: rows });
}));
router.post('/reports/:id/resolve', auth('reports.manage'), ah(async (req, res) => {
  const action = req.body?.action;
  if (action === 'ban' && !req.admin.permissions.has('players.ban')) throw forbidden('Permission « players.ban » requise');
  if (['suspend', 'warn', 'reactivate'].includes(action) && !req.admin.permissions.has('players.moderate')) throw forbidden('Permission « players.moderate » requise');
  await moderation.resolveReport(req.admin, req.params.id, req.body || {}, clientIp(req));
  res.json({ ok: true });
}));
router.get('/chat', auth('chat.moderate'), ah(async (req, res) => {
  const userId = /^[0-9a-f-]{36}$/i.test(req.query.userId || '') ? req.query.userId : null;
  const q = String(req.query.q || '').trim();
  const { rows } = await pool.query(
    `SELECT c.id, c.room_id, c.match_id, c.kind, c.body, c.filtered, c.hidden_at, c.created_at, u.id AS user_id, u.username
       FROM chat_messages c JOIN users u ON u.id = c.user_id
      WHERE ($1::uuid IS NULL OR c.user_id = $1) AND ($2::text IS NULL OR c.body ILIKE $2) AND ($3::boolean IS NOT TRUE OR c.filtered)
      ORDER BY c.created_at DESC LIMIT 300`,
    [userId, q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : null, req.query.filtered === 'true']);
  res.json({ messages: rows });
}));
router.post('/chat/:id/hide', auth('chat.moderate'), ah(async (req, res) => {
  await moderation.hideMessage(req.admin, req.params.id, req.body?.reason, clientIp(req));
  res.json({ ok: true });
}));

// ── Administrateurs ─────────────────────────────────────────────────────────
router.get('/roles', auth(), ah(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.label, COALESCE(json_agg(rp.permission_id ORDER BY rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '[]') AS permissions
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id GROUP BY r.id, r.label ORDER BY r.id`);
  const perms = await pool.query('SELECT * FROM permissions ORDER BY id');
  res.json({ roles: rows, permissions: perms.rows });
}));
router.get('/admins', auth('admins.manage'), ah(async (_req, res) => {
  const { rows } = await pool.query('SELECT id, email, name, role, is_active, created_at, last_login_at FROM admins ORDER BY created_at');
  res.json({ admins: rows });
}));
router.post('/admins', auth('admins.manage'), ah(async (req, res) => {
  const { email, name, role, password } = req.body || {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ''))) throw bad('BAD_EMAIL', 'E-mail invalide');
  if (!password || String(password).length < 10) throw bad('WEAK', 'Mot de passe : 10 caractères minimum');
  const r = await pool.query('SELECT 1 FROM roles WHERE id = $1', [role]);
  if (!r.rows.length) throw bad('BAD_ROLE', 'Rôle inconnu');
  const exists = await pool.query('SELECT 1 FROM admins WHERE LOWER(email) = LOWER($1)', [email]);
  if (exists.rows.length) throw bad('EXISTS', 'Un administrateur existe déjà avec cet e-mail');
  const { rows } = await pool.query(
    `INSERT INTO admins (email, name, role, password_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role, is_active`,
    [email.trim(), name || null, role, await bcrypt.hash(password, 10), req.admin.id]);
  await logAudit(req.admin.id, 'CREATE', 'admin', rows[0].id, null, rows[0], { ip: clientIp(req) });
  res.status(201).json({ admin: rows[0] });
}));
router.put('/admins/:id', auth('admins.manage'), ah(async (req, res) => {
  const { rows } = await pool.query('SELECT id, email, role, is_active, name FROM admins WHERE id = $1', [req.params.id]);
  const target = rows[0];
  if (!target) throw notFound('Administrateur introuvable');
  const role = req.body.role ?? target.role;
  const active = typeof req.body.isActive === 'boolean' ? req.body.isActive : target.is_active;
  if (target.id === req.admin.id && (role !== target.role || !active)) throw bad('SELF', 'Tu ne peux pas modifier ton propre rôle ni te désactiver');
  if (target.role === 'super_admin' && (role !== 'super_admin' || !active)) {
    const others = await pool.query(`SELECT COUNT(*)::int AS n FROM admins WHERE role = 'super_admin' AND is_active AND id <> $1`, [target.id]);
    if (!others.rows[0].n) throw bad('LAST_SUPER', 'Il doit rester au moins un Super Admin actif');
  }
  const r = await pool.query('SELECT 1 FROM roles WHERE id = $1', [role]);
  if (!r.rows.length) throw bad('BAD_ROLE', 'Rôle inconnu');
  const params = [target.id, role, active, req.body.name ?? target.name];
  let sql = 'UPDATE admins SET role = $2, is_active = $3, name = $4';
  if (req.body.password) {
    if (String(req.body.password).length < 10) throw bad('WEAK', 'Mot de passe : 10 caractères minimum');
    params.push(await bcrypt.hash(req.body.password, 10));
    sql += `, password_hash = $${params.length}`;
  }
  const out = await pool.query(`${sql} WHERE id = $1 RETURNING id, email, name, role, is_active`, params);
  await logAudit(req.admin.id, 'UPDATE', 'admin', target.id, target, { ...out.rows[0], passwordChanged: !!req.body.password }, { ip: clientIp(req) });
  clearPermissions();
  res.json({ admin: out.rows[0] });
}));

// ── Journal d'audit ─────────────────────────────────────────────────────────
router.get('/audit', auth('audit.view'), ah(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const entity = req.query.entity ? String(req.query.entity) : null;
  const action = req.query.action ? String(req.query.action) : null;
  const q = `FROM audit_logs l LEFT JOIN admins a ON a.id = l.admin_id
             WHERE ($1::text IS NULL OR l.entity = $1) AND ($2::text IS NULL OR l.action = $2)`;
  const [rows, count] = await Promise.all([
    pool.query(`SELECT l.*, a.email AS admin_email ${q} ORDER BY l.created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`, [entity, action]),
    pool.query(`SELECT COUNT(*)::int AS n ${q}`, [entity, action]),
  ]);
  if (['csv', 'xlsx'].includes(req.query.format)) {
    if (!req.admin.permissions.has('exports')) throw forbidden('Permission « exports » requise');
    const all = await pool.query(`SELECT l.*, a.email AS admin_email ${q} ORDER BY l.created_at DESC LIMIT 20000`, [entity, action]);
    return exporter.send(res, req.query.format, 'audit', [
      { key: 'created_at', label: 'Date' }, { key: 'admin_email', label: 'Administrateur' }, { key: 'action', label: 'Action' },
      { key: 'entity', label: 'Objet' }, { key: 'entity_id', label: 'Identifiant' }, { key: 'reason', label: 'Motif' },
      { key: 'old_data', label: 'Avant' }, { key: 'new_data', label: 'Après' }, { key: 'ip', label: 'IP' },
    ], all.rows);
  }
  res.json({ logs: rows.rows, total: count.rows[0].n, page });
}));

// ── Configuration des jeux et ligues ───────────────────────────────────────
const CONFIG_KEYS = {
  turnSeconds: [5, 120], decisionSeconds: [3, 60], reconnectSeconds: [10, 600], networkToleranceSeconds: [0, 30],
  maxTimeouts: [1, 20], minActionsForValid: [0, 20], maxShotsPerPlayer: [5, 50],
};
router.get('/games', auth('games.manage'), ah(async (_req, res) => {
  const [games, lgs] = await Promise.all([
    pool.query('SELECT g.*, v.version AS rules_version FROM games g LEFT JOIN game_rules_versions v ON v.game_id = g.id AND v.is_current ORDER BY g.sort_order'),
    pool.query('SELECT * FROM leagues ORDER BY game_id, sort_order'),
  ]);
  res.json({ games: games.rows, leagues: lgs.rows });
}));
router.put('/games/:id', auth('games.manage'), ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM games WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Jeu introuvable');
  const config = { ...rows[0].config };
  for (const [k, v] of Object.entries(req.body?.config || {})) {
    if (!CONFIG_KEYS[k] || !(k in config)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < CONFIG_KEYS[k][0] || n > CONFIG_KEYS[k][1]) throw bad('BAD_CONFIG', `${k} : valeur hors limites`);
    config[k] = n;
  }
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : rows[0].is_active;
  const out = await pool.query('UPDATE games SET config = $2, is_active = $3 WHERE id = $1 RETURNING *', [req.params.id, JSON.stringify(config), isActive]);
  await logAudit(req.admin.id, 'UPDATE', 'game', req.params.id, { config: rows[0].config, is_active: rows[0].is_active }, { config, is_active: isActive }, { ip: clientIp(req) });
  runtime.clearGameCache();
  res.json({ game: out.rows[0] });
}));
router.put('/games/:id/leagues', auth('games.manage'), ah(async (req, res) => {
  const list = Array.isArray(req.body?.leagues) ? req.body.leagues : [];
  if (!list.length) throw bad('BAD_LEAGUES', 'Seuils requis');
  const sorted = [...list].sort((a, b) => a.minRating - b.minRating);
  const old = await pool.query('SELECT name, min_rating FROM leagues WHERE game_id = $1 ORDER BY sort_order', [req.params.id]);
  await pool.tx(async (db) => {
    for (const l of sorted) {
      if (!Number.isFinite(Number(l.minRating))) throw bad('BAD_LEAGUES', 'Seuil invalide');
      await db.query('UPDATE leagues SET min_rating = $3 WHERE game_id = $1 AND name = $2', [req.params.id, l.name, Math.round(l.minRating)]);
    }
    await logAudit(req.admin.id, 'UPDATE_LEAGUES', 'game', req.params.id, old.rows, sorted, { ip: clientIp(req) }, db);
  });
  clearLeaguesCache();
  invalidate();
  res.json({ ok: true });
}));

module.exports = router;
