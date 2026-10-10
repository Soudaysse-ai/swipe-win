// Back-office « Centre de contrôle Yas » — /api/admin
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');
const config = require('../../config');
const auth = require('../../middleware/auth');
const { ah, clientIp } = require('../../lib/http');
const { limiter } = require('../../lib/rateLimit');
const { unauthorized } = require('../../lib/errors');

router.post('/login', limiter({ name: 'admin-login', max: 10, windowMs: 60_000 }), ah(async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM admins WHERE LOWER(email) = LOWER($1)', [String(email || '')]);
  const admin = rows[0];
  const ok = await bcrypt.compare(String(password || ''), admin?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!admin || !ok || !admin.is_active) throw unauthorized('Identifiants invalides');
  const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role, typ: 'admin' }, config.jwtSecret, { expiresIn: config.adminTokenTtl });
  await pool.query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);
  await pool.query(
    `INSERT INTO audit_logs (admin_id, action, entity, entity_id, ip) VALUES ($1, 'LOGIN', 'admin', $1, $2)`,
    [admin.id, clientIp(req)]);
  const { permissionsForRole } = require('../../services/permissions');
  res.json({ token, admin: { id: admin.id, email: admin.email, role: admin.role, name: admin.name, permissions: [...await permissionsForRole(admin.role)] } });
}));

router.get('/me', auth(), (req, res) => {
  const { id, email, role, name, permissions } = req.admin;
  res.json({ admin: { id, email, role, name, permissions: [...permissions] } });
});

router.use('/quiz', require('./quiz'));

module.exports = router;
