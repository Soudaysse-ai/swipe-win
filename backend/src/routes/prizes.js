const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/prizes/active
router.get('/active', async (req, res) => {
  try {
    const setting = await pool.query("SELECT value FROM settings WHERE key = 'prizes_enabled'");
    const enabled = !setting.rows.length || setting.rows[0].value !== 'false';
    if (!enabled) return res.json({ prizes: [], enabled: false });

    const result = await pool.query(
      'SELECT id, label, description, image_url, tier, quantity FROM prizes WHERE is_active = true ORDER BY tier'
    );
    res.json({ prizes: result.rows, enabled: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
