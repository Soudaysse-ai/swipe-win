// Chat des salons : messages texte filtrés, messages rapides prédéfinis et
// réactions. Limitation de fréquence, blocage et modération administrateur.
const pool = require('../db/pool');
const hub = require('../realtime/hub');
const { hit } = require('../lib/rateLimit');
const { filterText, sanitize } = require('./contentFilter');
const { blockersOf } = require('./friends');
const { AppError } = require('../lib/errors');

const QUICK_MESSAGES = {
  hello: 'Salut 👋', gl: 'Bonne chance !', gg: 'Bien joué !', wow: 'Impressionnant !',
  oops: 'Oups !', thanks: 'Merci !', hurry: 'Allez, on joue !', rematch: 'Revanche ?',
};
const REACTIONS = ['👍', '😂', '😮', '😅', '🔥', '👏', '🎉', '💪'];
const MAX_LEN = 200;

/**
 * members : liste des userId autorisés à lire le salon (fournie par l'appelant).
 */
async function send({ userId, username, avatar }, { roomId, matchId = null, kind = 'text', text, quickId, emoji }, members) {
  if (!members.includes(userId)) throw new AppError(403, 'NOT_MEMBER', 'Tu ne fais pas partie de ce salon');
  const limit = kind === 'reaction' ? 12 : 6;
  if (!hit(`chat:${userId}`, limit, 10_000)) throw new AppError(429, 'CHAT_RATE', 'Doucement ! Attends quelques secondes.');

  let body;
  let filtered = false;
  if (kind === 'quick') {
    body = QUICK_MESSAGES[quickId];
    if (!body) throw new AppError(400, 'BAD_QUICK', 'Message inconnu');
  } else if (kind === 'reaction') {
    if (!REACTIONS.includes(emoji)) throw new AppError(400, 'BAD_REACTION', 'Réaction inconnue');
    body = emoji;
  } else {
    const clean = sanitize(text, MAX_LEN);
    if (!clean) throw new AppError(400, 'EMPTY', 'Message vide');
    ({ text: body, filtered } = filterText(clean));
  }

  const { rows } = await pool.query(
    `INSERT INTO chat_messages (room_id, match_id, user_id, kind, body, filtered) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, created_at`, [roomId, matchId, userId, kind, body, filtered]);
  const message = { id: rows[0].id, roomId, matchId, userId, username, avatar, kind, body, filtered, createdAt: rows[0].created_at };
  const blockers = await blockersOf(userId);
  hub.emitToUsers(members.filter(m => !blockers.has(m)), 'chat:message', message);
  return message;
}

async function history(roomId, viewerId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT c.id, c.room_id AS "roomId", c.match_id AS "matchId", c.user_id AS "userId", u.username, u.avatar,
            c.kind, c.body, c.filtered, c.created_at AS "createdAt"
       FROM chat_messages c JOIN users u ON u.id = c.user_id
      WHERE c.room_id = $1 AND c.hidden_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.blocker_id = $2 AND b.blocked_id = c.user_id)
      ORDER BY c.created_at DESC LIMIT $3`, [roomId, viewerId, limit]);
  return rows.reverse();
}

module.exports = { send, history, QUICK_MESSAGES, REACTIONS };
