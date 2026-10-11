const pool = require('../db/pool');

// Journal d'audit : toute action administrative sensible (corrections de score,
// suspensions, réglages…) y est inscrite. Aucune modification silencieuse.
async function logAudit(adminId, action, entity, entityId, oldData, newData, { reason = null, ip = null } = {}, db = pool) {
  await db.query(
    `INSERT INTO audit_logs (admin_id, action, entity, entity_id, old_data, new_data, reason, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [adminId, action, entity, entityId == null ? null : String(entityId),
     oldData ? JSON.stringify(oldData) : null,
     newData ? JSON.stringify(newData) : null, reason, ip]
  );
}

module.exports = { logAudit };
