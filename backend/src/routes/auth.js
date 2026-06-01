const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

// POST /api/auth/subscribe — inscription/login par numéro de téléphone
router.post('/subscribe', async (req, res) => {
  const { phone, name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Numéro requis' });

  try {
    let result = await pool.query('SELECT * FROM players WHERE phone = $1', [phone]);
    let player;

    if (result.rows.length === 0) {
      const insert = await pool.query(
        'INSERT INTO players (id, phone, name) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), phone, name || null]
      );
      player = insert.rows[0];
    } else {
      player = result.rows[0];
      if (name && !player.name) {
        await pool.query('UPDATE players SET name = $1 WHERE id = $2', [name, player.id]);
        player.name = name;
      }
    }

    res.json({ player });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
