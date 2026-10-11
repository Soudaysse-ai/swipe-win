// Quiz « Swipe & Win » (fonctionnalité historique). Désormais rattaché au
// compte Défi Yas : le joueur est identifié par son jeton, plus par un
// player_id envoyé par le navigateur (audit S1/S2).
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');
const { calcSessionScore } = require('../utils/score');
const { requirePlayer } = require('../middleware/playerAuth');

const MAX_RESPONSE_MS = 30_000;

// Retrouve (ou crée) la fiche « players » historique liée au compte.
async function legacyPlayerFor(userId) {
  return pool.tx(async (db) => {
    const { rows } = await db.query('SELECT id, phone, username, legacy_player_id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const u = rows[0];
    if (u.legacy_player_id) return u.legacy_player_id;
    const existing = await db.query('SELECT id FROM players WHERE phone = $1', [u.phone]);
    const playerId = existing.rows[0]?.id || (await db.query(
      'INSERT INTO players (id, phone, name) VALUES ($1, $2, $3) RETURNING id', [uuidv4(), u.phone, u.username]
    )).rows[0].id;
    await db.query('UPDATE users SET legacy_player_id = $1 WHERE id = $2', [playerId, userId]);
    return playerId;
  });
}

async function ownedSession(sessionId, userId) {
  const { rows } = await pool.query(
    `SELECT s.* FROM sessions s JOIN users u ON u.legacy_player_id = s.player_id
      WHERE s.id = $1 AND u.id = $2`, [sessionId, userId]);
  return rows[0] || null;
}

// GET /api/sessions/game-status — le jeu est-il en pause ?
router.get('/game-status', async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'game_paused'");
    const paused = r.rows.length && r.rows[0].value === 'true';
    res.json({ paused });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erreur interne, réessayez.' });
  }
});

// POST /api/sessions/start
router.post('/start', requirePlayer, async (req, res) => {
  try {
    const paused = await pool.query("SELECT value FROM settings WHERE key = 'game_paused'");
    if (paused.rows.length && paused.rows[0].value === 'true') {
      return res.status(403).json({ error: 'Le jeu est actuellement en pause', paused: true });
    }
    const playerId = await legacyPlayerFor(req.user.userId);
    const result = await pool.query(
      'INSERT INTO sessions (id, player_id) VALUES ($1, $2) RETURNING *',
      [uuidv4(), playerId]
    );
    res.json({ session: result.rows[0], player_id: playerId });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erreur interne, réessayez.' });
  }
});

// POST /api/sessions/:id/answer
// Le serveur compare le choix à la bonne réponse en base ; une seule réponse
// par question et par session (audit S3).
router.post('/:id/answer', requirePlayer, async (req, res) => {
  const { id } = req.params;
  const { question_id, answer } = req.body;
  const response_time_ms = Math.min(MAX_RESPONSE_MS, Math.max(0, parseInt(req.body.response_time_ms, 10) || MAX_RESPONSE_MS));

  if (!question_id || answer === undefined) {
    return res.status(400).json({ error: 'question_id, answer, response_time_ms requis' });
  }

  try {
    const session = await ownedSession(id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (session.ended_at) return res.status(409).json({ error: 'Session terminée' });

    const q = await pool.query('SELECT answer FROM questions WHERE id = $1', [question_id]);
    if (!q.rows.length) return res.status(404).json({ error: 'Question introuvable' });

    const already = await pool.query('SELECT is_correct FROM answers WHERE session_id = $1 AND question_id = $2', [id, question_id]);
    if (already.rows.length) {
      return res.json({ is_correct: already.rows[0].is_correct, correct_answer: q.rows[0].answer, duplicate: true });
    }

    // answer peut être null (timeout) → toujours faux
    const isCorrect = answer === null ? false : answer === q.rows[0].answer;

    await pool.query(
      'INSERT INTO answers (id, session_id, question_id, is_correct, response_time_ms) VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), id, question_id, isCorrect, response_time_ms]
    );

    res.json({ is_correct: isCorrect, correct_answer: q.rows[0].answer });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erreur interne, réessayez.' });
  }
});

// POST /api/sessions/:id/end
router.post('/:id/end', requirePlayer, async (req, res) => {
  const { id } = req.params;

  try {
    const session = await ownedSession(id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (session.ended_at) return res.json({ session });

    const answersResult = await pool.query(
      'SELECT * FROM answers WHERE session_id = $1 ORDER BY answered_at',
      [id]
    );
    const answers = answersResult.rows;

    const score = calcSessionScore(answers);
    const correctAnswers = answers.filter(a => a.is_correct);
    const correct_count = new Set(correctAnswers.map(a => a.question_id)).size;
    const total_time_ms = answers.reduce((s, a) => s + a.response_time_ms, 0);
    const avg_speed_ms = correctAnswers.length
      ? Math.round(correctAnswers.reduce((s, a) => s + a.response_time_ms, 0) / correctAnswers.length)
      : 0;

    const result = await pool.query(
      `UPDATE sessions
       SET ended_at = NOW(), score = $1, correct_count = $2, total_time_ms = $3, avg_speed_ms = $4
       WHERE id = $5
       RETURNING *`,
      [score, correct_count, total_time_ms, avg_speed_ms, id]
    );

    res.json({ session: result.rows[0] });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erreur interne, réessayez.' });
  }
});

module.exports = router;
