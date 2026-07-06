const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/questions/random?count=15
// Ne sert que les questions du thème actif (setting active_theme).
// Les thèmes ne sont jamais mélangés ; défaut : coupe_du_monde.
router.get('/random', async (req, res) => {
  const count = parseInt(req.query.count) || 15;
  try {
    const themeRow = await pool.query("SELECT value FROM settings WHERE key = 'active_theme'");
    const theme = themeRow.rows.length ? themeRow.rows[0].value : 'coupe_du_monde';

    const result = await pool.query(
      'SELECT id, text_fr, text_ar, category, difficulty, image_url FROM questions WHERE is_active = true AND category = $2 ORDER BY RANDOM() LIMIT $1',
      [count, theme]
    );
    res.json({ questions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
