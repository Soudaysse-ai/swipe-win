// Authentification et autorisations du back-office.
// Toutes les vérifications de permissions sont faites côté serveur.
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const config = require('../config');
const { permissionsForRole } = require('../services/permissions');

async function loadAdmin(req) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return { status: 401, error: 'Token manquant' };
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return { status: 401, error: 'Token invalide ou expiré' };
  }
  if (payload.typ !== 'admin') return { status: 401, error: 'Token invalide ou expiré' };
  const { rows } = await pool.query('SELECT id, email, role, name, is_active FROM admins WHERE id = $1', [payload.id]);
  const admin = rows[0];
  if (!admin || !admin.is_active) return { status: 401, error: 'Compte administrateur inactif' };
  const perms = await permissionsForRole(admin.role);
  return { admin: { ...admin, permissions: perms } };
}

// auth()                → tout administrateur actif
// auth('superadmin')    → rôle super_admin (compatibilité avec les anciennes routes)
// auth('perm.a', ...)   → toutes les permissions listées
function authMiddleware(...required) {
  return (req, res, next) => {
    loadAdmin(req).then(({ status, error, admin }) => {
      if (!admin) return res.status(status).json({ error });
      req.admin = admin;
      for (const r of required) {
        if (r === 'superadmin') {
          if (admin.role !== 'super_admin') return res.status(403).json({ error: 'Accès réservé aux super admins' });
        } else if (!admin.permissions.has(r)) {
          return res.status(403).json({ error: 'Permission insuffisante', permission: r });
        }
      }
      next();
    }).catch(next);
  };
}

module.exports = authMiddleware;
