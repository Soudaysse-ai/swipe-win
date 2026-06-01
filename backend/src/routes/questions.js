const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/questions/random?count=15
router.get('/random', async (req, res) => {
  const count = parseInt(req.query.count) || 15;
  try {
    const result = await pool.query(
      'SELECT id, text_fr, text_ar, category, difficulty, image_url FROM questions WHERE is_active = true ORDER BY RANDOM() LIMIT $1',
      [count]
    );
    res.json({ questions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
