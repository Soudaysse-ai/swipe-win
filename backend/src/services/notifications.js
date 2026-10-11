// Notifications in-app : stockées en base et poussées en temps réel si le
// joueur est connecté (l'émetteur est branché par le hub Socket.IO).
const pool = require('../db/pool');

let emitter = null;
function setEmitter(fn) { emitter = fn; }

async function notify(userId, type, title, body = null, data = {}) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, type, title, body, JSON.stringify(data)]
    );
    if (emitter) emitter(userId, 'notification:new', rows[0]);
    return rows[0];
  } catch (err) {
    console.error('notification non enregistrée', err.message);
    return null;
  }
}

async function list(userId, { limit = 30 } = {}) {
  const { rows } = await pool.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
  const unread = await pool.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return { notifications: rows, unread: unread.rows[0].n };
}

async function markRead(userId, ids) {
  if (ids === 'all') {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  } else {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, ids]);
  }
}

module.exports = { notify, list, markRead, setEmitter };
