// Amis, demandes d'amis, blocages et invitations à jouer.
const pool = require('../db/pool');
const hub = require('../realtime/hub');
const notifications = require('./notifications');
const analytics = require('./analytics');
const { bad, notFound, forbidden } = require('../lib/errors');

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

async function areFriends(a, b, db = pool) {
  const [x, y] = pair(a, b);
  const { rows } = await db.query('SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2', [x, y]);
  return rows.length > 0;
}

async function isBlocked(a, b, db = pool) {
  const { rows } = await db.query(
    'SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [a, b]);
  return rows.length > 0;
}

async function friendIds(userId) {
  const { rows } = await pool.query(
    'SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS id FROM friendships WHERE user_a = $1 OR user_b = $1', [userId]);
  return rows.map(r => r.id);
}

async function search(userId, q) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, COALESCE(g.level, 1) AS level,
            EXISTS (SELECT 1 FROM friendships f WHERE (f.user_a = u.id AND f.user_b = $1) OR (f.user_b = u.id AND f.user_a = $1)) AS is_friend,
            (SELECT CASE WHEN r.from_user_id = $1 THEN 'outgoing' ELSE 'incoming' END FROM friend_requests r
              WHERE r.status = 'pending' AND ((r.from_user_id = $1 AND r.to_user_id = u.id) OR (r.to_user_id = $1 AND r.from_user_id = u.id)) LIMIT 1) AS pending
       FROM users u LEFT JOIN player_global_stats g ON g.user_id = u.id
      WHERE u.id <> $1 AND u.status IN ('active','suspended') AND u.username ILIKE $2
        AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
      ORDER BY LENGTH(u.username), u.username LIMIT 20`,
    [userId, `${term.replace(/[%_\\]/g, '\\$&')}%`]);
  return rows.map(r => ({ ...r, online: hub.isOnline(r.id) }));
}

async function sendRequest(fromId, toId) {
  if (fromId === toId) throw bad('SELF', 'Tu ne peux pas t\'ajouter toi-même');
  const target = await pool.query(`SELECT id, username FROM users WHERE id = $1 AND status IN ('active','suspended')`, [toId]);
  if (!target.rows.length) throw notFound('Joueur introuvable');
  if (await isBlocked(fromId, toId)) throw forbidden('Impossible d\'envoyer une demande à ce joueur');
  if (await areFriends(fromId, toId)) throw bad('ALREADY_FRIENDS', 'Vous êtes déjà amis');
  const reverse = await pool.query(
    `SELECT id FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`, [toId, fromId]);
  if (reverse.rows.length) return respond(fromId, reverse.rows[0].id, true);
  const existing = await pool.query(
    `SELECT id FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`, [fromId, toId]);
  if (existing.rows.length) return { status: 'pending', requestId: existing.rows[0].id };
  const { rows } = await pool.query(
    'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING id', [fromId, toId]);
  const from = (await pool.query('SELECT username, avatar FROM users WHERE id = $1', [fromId])).rows[0];
  await notifications.notify(toId, 'friend_request', `${from.username} veut devenir ton ami`, null,
    { requestId: rows[0].id, fromUserId: fromId, username: from.username, avatar: from.avatar });
  hub.emitToUser(toId, 'friend:request', { requestId: rows[0].id, fromUserId: fromId, username: from.username, avatar: from.avatar });
  return { status: 'pending', requestId: rows[0].id };
}

async function respond(userId, requestId, accept) {
  return pool.tx(async (db) => {
    const { rows } = await db.query(
      `SELECT * FROM friend_requests WHERE id = $1 AND to_user_id = $2 AND status = 'pending' FOR UPDATE`, [requestId, userId]);
    const r = rows[0];
    if (!r) throw notFound('Demande introuvable');
    await db.query(`UPDATE friend_requests SET status = $2, responded_at = NOW() WHERE id = $1`, [requestId, accept ? 'accepted' : 'declined']);
    if (!accept) return { status: 'declined' };
    const [a, b] = pair(r.from_user_id, r.to_user_id);
    await db.query('INSERT INTO friendships (user_a, user_b) VALUES ($1, $2) ON CONFLICT DO NOTHING', [a, b]);
    const me = (await db.query('SELECT username FROM users WHERE id = $1', [userId])).rows[0];
    setImmediate(() => {
      notifications.notify(r.from_user_id, 'friend_accepted', `${me.username} a accepté ta demande d'ami`, null, { userId });
      hub.emitToUser(r.from_user_id, 'friend:accepted', { userId, username: me.username });
    });
    return { status: 'accepted' };
  });
}

async function cancelRequest(userId, requestId) {
  await pool.query(`UPDATE friend_requests SET status = 'cancelled', responded_at = NOW()
                     WHERE id = $1 AND from_user_id = $2 AND status = 'pending'`, [requestId, userId]);
}

async function remove(userId, friendId) {
  const [a, b] = pair(userId, friendId);
  await pool.query('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [a, b]);
}

async function list(userId, activityOf = () => null) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, u.last_seen_at, COALESCE(g.level, 1) AS level, p.allow_invites
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
       LEFT JOIN player_global_stats g ON g.user_id = u.id
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE (f.user_a = $1 OR f.user_b = $1) AND u.status <> 'deleted'
      ORDER BY u.username`, [userId]);
  return rows.map(r => ({ ...r, online: hub.isOnline(r.id), activity: activityOf(r.id) }))
    .sort((x, y) => Number(y.online) - Number(x.online));
}

async function requests(userId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.created_at, r.from_user_id, r.to_user_id,
            CASE WHEN r.to_user_id = $1 THEN 'incoming' ELSE 'outgoing' END AS direction,
            u.id AS user_id, u.username, u.avatar
       FROM friend_requests r
       JOIN users u ON u.id = CASE WHEN r.to_user_id = $1 THEN r.from_user_id ELSE r.to_user_id END
      WHERE r.status = 'pending' AND (r.to_user_id = $1 OR r.from_user_id = $1)
      ORDER BY r.created_at DESC`, [userId]);
  return rows;
}

async function block(userId, targetId) {
  if (userId === targetId) throw bad('SELF', 'Action impossible');
  await pool.tx(async (db) => {
    await db.query('INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, targetId]);
    const [a, b] = pair(userId, targetId);
    await db.query('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [a, b]);
    await db.query(`UPDATE friend_requests SET status = 'cancelled', responded_at = NOW()
                     WHERE status = 'pending' AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))`,
      [userId, targetId]);
  });
}

async function unblock(userId, targetId) {
  await pool.query('DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2', [userId, targetId]);
}

async function blockedList(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, b.created_at FROM blocked_users b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`, [userId]);
  return rows;
}

// Utilisateurs qui ont bloqué `userId` (pour ne pas leur livrer ses messages).
async function blockersOf(userId) {
  const { rows } = await pool.query('SELECT blocker_id FROM blocked_users WHERE blocked_id = $1', [userId]);
  return new Set(rows.map(r => r.blocker_id));
}

/**
 * Invite un ami dans un salon privé (créé si besoin) du jeu choisi.
 * rooms est injecté pour éviter une dépendance circulaire.
 */
async function invite(rooms, from, friendId, gameId) {
  if (!(await areFriends(from.userId, friendId))) throw forbidden('Tu ne peux inviter que tes amis');
  const pref = await pool.query('SELECT allow_invites FROM profiles WHERE user_id = $1', [friendId]);
  if (pref.rows[0] && pref.rows[0].allow_invites === false) throw forbidden('Ce joueur n\'accepte pas les invitations');
  let room = rooms.roomOf(from.userId);
  if (!room || room.gameId !== gameId || room.status !== 'open') {
    const created = await rooms.createRoom({ gameId, hostId: from.userId, visibility: 'private', source: 'invite' });
    room = rooms.publicRoom(created);
  }
  if (room.players.length >= room.maxPlayers) throw bad('ROOM_FULL', 'Ton salon est complet');
  const payload = { roomId: room.id, roomCode: room.code, gameId, fromUserId: from.userId, username: from.username, avatar: from.avatar };
  await notifications.notify(friendId, 'invite', `${from.username} t'invite à jouer`, null, payload);
  hub.emitToUser(friendId, 'friend:invite', payload);
  analytics.track('friend_invited', { userId: from.userId, gameId, properties: { friendId, roomId: room.id } });
  return room;
}

module.exports = {
  areFriends, isBlocked, friendIds, search, sendRequest, respond, cancelRequest, remove, list, requests,
  block, unblock, blockedList, blockersOf, invite,
};
