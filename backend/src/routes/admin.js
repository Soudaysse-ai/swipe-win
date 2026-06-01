const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// ── Auth ────────────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: 'Identifiants invalides' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ token, admin: { id: admin.id, email: admin.email, role: admin.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard stats ─────────────────────────────────────────────────────────

router.get('/dashboard/stats', auth(), async (req, res) => {
  try {
    const [players, todaySessions, weekSessions, monthSessions, avgScore, todayAnswers, dailySessions] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM players'),
      pool.query("SELECT COUNT(*) FROM sessions WHERE DATE(started_at) = CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM sessions WHERE started_at >= NOW() - INTERVAL '7 days'"),
      pool.query("SELECT COUNT(*) FROM sessions WHERE started_at >= NOW() - INTERVAL '30 days'"),
      pool.query('SELECT ROUND(AVG(score),1) AS avg FROM sessions WHERE ended_at IS NOT NULL'),
      pool.query("SELECT COUNT(*) FROM answers WHERE DATE(answered_at) = CURRENT_DATE"),
      pool.query(`
        SELECT DATE(started_at) AS day, COUNT(*) AS count
        FROM sessions
        WHERE started_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
      `),
    ]);

    res.json({
      total_players: parseInt(players.rows[0].count),
      sessions_today: parseInt(todaySessions.rows[0].count),
      sessions_week: parseInt(weekSessions.rows[0].count),
      sessions_month: parseInt(monthSessions.rows[0].count),
      avg_score: parseFloat(avgScore.rows[0].avg) || 0,
      answers_today: parseInt(todayAnswers.rows[0].count),
      daily_sessions: dailySessions.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Leaderboards ─────────────────────────────────────────────────────────────

router.get('/leaderboard/score', auth(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.phone,
             MAX(s.score) AS best_score,
             SUM(s.correct_count) AS total_correct,
             MIN(s.avg_speed_ms) AS best_speed_ms,
             MAX(s.ended_at) AS last_session
      FROM players p
      JOIN sessions s ON s.player_id = p.id
      WHERE s.ended_at IS NOT NULL
      GROUP BY p.id, p.name, p.phone
      ORDER BY best_score DESC, best_speed_ms ASC
    `);
    res.json({ leaderboard: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leaderboard/speed', auth(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.phone,
             MIN(s.avg_speed_ms) AS best_speed_ms,
             MAX(s.score) AS best_score,
             COUNT(s.id) AS sessions_count
      FROM players p
      JOIN sessions s ON s.player_id = p.id
      WHERE s.ended_at IS NOT NULL AND s.avg_speed_ms > 0
      GROUP BY p.id, p.name, p.phone
      ORDER BY best_speed_ms ASC
    `);
    res.json({ leaderboard: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get('/sessions', auth(), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const result = await pool.query(`
      SELECT s.*, p.name AS player_name, p.phone AS player_phone
      FROM sessions s
      JOIN players p ON p.id = s.player_id
      ORDER BY s.started_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const total = await pool.query('SELECT COUNT(*) FROM sessions');
    res.json({ sessions: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Players ───────────────────────────────────────────────────────────────────

router.get('/players', auth(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, COUNT(s.id) AS sessions_count, MAX(s.score) AS best_score
      FROM players p
      LEFT JOIN sessions s ON s.player_id = p.id
      GROUP BY p.id
      ORDER BY p.subscribed_at DESC
    `);
    res.json({ players: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/players/:id', auth(), async (req, res) => {
  const { id } = req.params;
  try {
    const player = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    if (!player.rows.length) return res.status(404).json({ error: 'Joueur introuvable' });

    const sessions = await pool.query(
      'SELECT * FROM sessions WHERE player_id = $1 ORDER BY started_at DESC',
      [id]
    );

    res.json({ player: player.rows[0], sessions: sessions.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Prizes ────────────────────────────────────────────────────────────────────

router.get('/prizes', auth(), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM prizes ORDER BY tier, label');
    res.json({ prizes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Réglage global : activer/désactiver la distribution de lots
router.get('/settings/prizes-enabled', auth(), async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'prizes_enabled'");
    const enabled = !r.rows.length || r.rows[0].value !== 'false';
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/prizes-enabled', auth(), async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (booléen) requis' });
  try {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('prizes_enabled', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [enabled ? 'true' : 'false']
    );
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/prizes', auth(), async (req, res) => {
  const { label, description, image_url, tier, quantity } = req.body;
  if (!label) return res.status(400).json({ error: 'Label requis' });
  try {
    const result = await pool.query(
      `INSERT INTO prizes (id, label, description, image_url, tier, quantity, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [uuidv4(), label, description, image_url, tier || 'daily', quantity || 1, req.admin.id]
    );
    await logAudit(req.admin.id, 'CREATE', 'prize', result.rows[0].id, null, result.rows[0]);
    res.status(201).json({ prize: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/prizes/:id', auth(), async (req, res) => {
  const { id } = req.params;
  const { label, description, image_url, tier, quantity, is_active } = req.body;
  try {
    const old = await pool.query('SELECT * FROM prizes WHERE id = $1', [id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Lot introuvable' });

    const result = await pool.query(
      `UPDATE prizes SET
         label = COALESCE($1, label),
         description = COALESCE($2, description),
         image_url = COALESCE($3, image_url),
         tier = COALESCE($4, tier),
         quantity = COALESCE($5, quantity),
         is_active = COALESCE($6, is_active),
         updated_at = NOW(),
         updated_by = $7
       WHERE id = $8 RETURNING *`,
      [label, description, image_url, tier, quantity, is_active, req.admin.id, id]
    );
    await logAudit(req.admin.id, 'UPDATE', 'prize', id, old.rows[0], result.rows[0]);
    res.json({ prize: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/prizes/:id', auth('superadmin'), async (req, res) => {
  const { id } = req.params;
  try {
    const old = await pool.query('SELECT * FROM prizes WHERE id = $1', [id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Lot introuvable' });
    await pool.query('DELETE FROM prizes WHERE id = $1', [id]);
    await logAudit(req.admin.id, 'DELETE', 'prize', id, old.rows[0], null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Questions ─────────────────────────────────────────────────────────────────

router.get('/questions', auth(), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM questions ORDER BY id');
    res.json({ questions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/questions', auth(), async (req, res) => {
  const { id, text_fr, text_ar, answer, category, difficulty, image_url } = req.body;
  if (!id || !text_fr || answer === undefined) return res.status(400).json({ error: 'id, text_fr, answer requis' });
  try {
    const result = await pool.query(
      `INSERT INTO questions (id, text_fr, text_ar, answer, category, difficulty, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, text_fr, text_ar, answer, category || 'coupe_du_monde', difficulty || 'medium', image_url || null]
    );
    res.status(201).json({ question: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import en masse (upsert) — body: { questions: [...] }
router.post('/questions/bulk', auth(), async (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Un tableau "questions" non vide est requis' });
  }
  const client = await pool.connect();
  const errors = [];
  let inserted = 0, updated = 0;
  try {
    await client.query('BEGIN');
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i] || {};
      const id = (q.id || '').toString().trim();
      const text_fr = (q.text_fr || '').toString().trim();
      // accepte true/false, "true"/"false", "vrai"/"faux", 1/0
      let answer = q.answer;
      if (typeof answer === 'string') {
        const a = answer.trim().toLowerCase();
        answer = ['true', 'vrai', '1', 'oui', 'yes'].includes(a) ? true
               : ['false', 'faux', '0', 'non', 'no'].includes(a) ? false : undefined;
      }
      if (!id || !text_fr || typeof answer !== 'boolean') {
        errors.push({ line: i + 1, error: 'id, text_fr et answer (vrai/faux) requis' });
        continue;
      }
      const difficulty = ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium';
      const category = (q.category || 'coupe_du_monde').toString().trim();
      const image_url = q.image_url ? q.image_url.toString().trim() : null;
      const r = await client.query(
        `INSERT INTO questions (id, text_fr, text_ar, answer, category, difficulty, image_url, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7, true)
         ON CONFLICT (id) DO UPDATE SET
           text_fr = EXCLUDED.text_fr,
           text_ar = EXCLUDED.text_ar,
           answer = EXCLUDED.answer,
           category = EXCLUDED.category,
           difficulty = EXCLUDED.difficulty,
           image_url = COALESCE(EXCLUDED.image_url, questions.image_url)
         RETURNING (xmax = 0) AS inserted`,
        [id, text_fr, q.text_ar || null, answer, category, difficulty, image_url]
      );
      if (r.rows[0].inserted) inserted++; else updated++;
    }
    await client.query('COMMIT');
    res.json({ inserted, updated, errors, total: questions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put('/questions/:id', auth(), async (req, res) => {
  const { id } = req.params;
  const { text_fr, text_ar, answer, category, difficulty, is_active, image_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE questions SET
         text_fr = COALESCE($1, text_fr),
         text_ar = COALESCE($2, text_ar),
         answer = COALESCE($3, answer),
         category = COALESCE($4, category),
         difficulty = COALESCE($5, difficulty),
         is_active = COALESCE($6, is_active),
         image_url = COALESCE($7, image_url)
       WHERE id = $8 RETURNING *`,
      [text_fr, text_ar, answer, category, difficulty, is_active, image_url, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Question introuvable' });
    res.json({ question: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/questions/:id', auth('superadmin'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE questions SET is_active = false WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Audit log helper ──────────────────────────────────────────────────────────

async function logAudit(adminId, action, entity, entityId, oldData, newData) {
  await pool.query(
    `INSERT INTO audit_logs (id, admin_id, action, entity, entity_id, old_data, new_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uuidv4(), adminId, action, entity, entityId,
     oldData ? JSON.stringify(oldData) : null,
     newData ? JSON.stringify(newData) : null]
  );
}

module.exports = router;
