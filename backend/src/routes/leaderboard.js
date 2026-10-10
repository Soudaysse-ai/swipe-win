const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/leaderboard — top 10 du quiz par score puis vitesse.
// Le numéro de téléphone n'est jamais exposé publiquement (audit S4).
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, COALESCE(u.username, p.name) AS name,
             MAX(s.score) AS best_score,
             MIN(s.avg_speed_ms) AS best_speed_ms,
             COUNT(s.id) AS sessions_count
      FROM players p
      JOIN sessions s ON s.player_id = p.id
      LEFT JOIN users u ON u.legacy_player_id = p.id
      WHERE s.ended_at IS NOT NULL
      GROUP BY p.id, p.name, u.username
      ORDER BY best_score DESC, best_speed_ms ASC
      LIMIT 10
    `);
    res.json({ leaderboard: result.rows });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erreur interne, réessayez.' });
  }
});

// GET /api/leaderboard/rank/:playerId — rang du joueur + total des joueurs classés
router.get('/rank/:playerId', async (req, res) => {
  const { playerId } = req.params;
  try {
    const result = await pool.query(`
      WITH ranked AS (
        SELECT p.id,
               MAX(s.score) AS best_score,
               MIN(s.avg_speed_ms) AS best_speed_ms,
               RANK() OVER (ORDER BY MAX(s.score) DESC, MIN(s.avg_speed_ms) ASC) AS rank
        FROM players p
        JOIN sessions s ON s.player_id = p.id
        WHERE s.ended_at IS NOT NULL
        GROUP BY p.id
      )
      SELECT
        (SELECT rank FROM ranked WHERE id = $1) AS rank,
        (SELECT best_score FROM ranked WHERE id = $1) AS best_score,
        (SELECT COUNT(*) FROM ranked) AS total_players
    `, [playerId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Erreur interne, réessayez.' });
  }
});

module.exports = router;
