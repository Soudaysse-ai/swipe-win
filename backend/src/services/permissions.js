const pool = require('../db/pool');

const cache = new Map(); // role -> { at, perms:Set }
const TTL = 30_000;

async function permissionsForRole(role) {
  const hit = cache.get(role);
  if (hit && Date.now() - hit.at < TTL) return hit.perms;
  const { rows } = await pool.query('SELECT permission_id FROM role_permissions WHERE role_id = $1', [role]);
  const perms = new Set(rows.map(r => r.permission_id));
  cache.set(role, { at: Date.now(), perms });
  return perms;
}

function clearCache() { cache.clear(); }

module.exports = { permissionsForRole, clearCache };
