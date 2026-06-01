const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');
const { calcSessionScore } = require('../utils/score');

// POST /api/sessions/start
router.post('/start', async (req, res) => {
  const { player_id } = req.body;
  if (!player_id) return res.status(400).json({ error: 'player_id requis' });

  try {
    const result = await pool.query(
      'INSERT INTO sessions (id, player_id) VALUES ($1, $2) RETURNING *',
      [uuidv4(), player_id]
    );
    res.json({ session: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/answer
// Le client envoie son choix (answer = true/false). Le serveur compare à la
// bonne réponse en base et calcule is_correct — l'answer n'est jamais exposé au client.
router.post('/:id/answer', async (req, res) => {
  const { id } = req.params;
  const { question_id, answer, response_time_ms } = req.body;

  if (!question_id || answer === undefined || response_time_ms === undefined) {
    return res.status(400).json({ error: 'question_id, answer, response_time_ms requis' });
  }

  try {
    const session = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
    if (!session.rows.length) return res.status(404).json({ error: 'Session introuvable' });

    const q = await pool.query('SELECT answer FROM questions WHERE id = $1', [question_id]);
    if (!q.rows.length) return res.status(404).json({ error: 'Question introuvable' });

    // answer peut être null (timeout) → toujours faux
    const isCorrect = answer === null ? false : answer === q.rows[0].answer;

    await pool.query(
      'INSERT INTO answers (id, session_id, question_id, is_correct, response_time_ms) VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), id, question_id, isCorrect, response_time_ms]
    );

    res.json({ is_correct: isCorrect, correct_answer: q.rows[0].answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/end
router.post('/:id/end', async (req, res) => {
  const { id } = req.params;

  try {
    const answersResult = await pool.query(
      'SELECT * FROM answers WHERE session_id = $1',
      [id]
    );
    const answers = answersResult.rows;

    const score = calcSessionScore(answers);
    const correct_count = answers.filter(a => a.is_correct).length;
    const correctAnswers = answers.filter(a => a.is_correct);
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
