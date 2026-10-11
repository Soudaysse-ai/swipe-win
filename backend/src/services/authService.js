const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const config = require('../config');
const passwordReset = require('./passwordReset');
const analytics = require('./analytics');
const { containsBlocked } = require('./contentFilter');
const { isValidAvatar } = require('./avatars');
const { bad, unauthorized, forbidden, conflict, AppError } = require('../lib/errors');

const USERNAME_RE = /^[A-Za-z0-9_\-.]{3,20}$/;

// Accepte les saisies courantes : « 412 34 56 », « +269 412 34 56 », « 00269 4123456 », « 2694123456 ».
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length > 7 && digits.startsWith('269')) digits = digits.slice(3);
  const phone = `+269${digits}`;
  if (!config.phoneRegex.test(phone)) throw bad('PHONE_INVALID', 'Numéro invalide : 7 chiffres commençant par 4 (ex. 412 34 56)');
  return phone;
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw bad('PASSWORD_WEAK', 'Le mot de passe doit contenir au moins 8 caractères');
  if (pw.length > 100) throw bad('PASSWORD_LONG', 'Mot de passe trop long');
}

function validateUsername(name) {
  if (!USERNAME_RE.test(name || '')) {
    throw bad('USERNAME_INVALID', 'Pseudonyme : 3 à 20 caractères (lettres, chiffres, _ - .)');
  }
  if (containsBlocked(name)) throw bad('USERNAME_FORBIDDEN', 'Ce pseudonyme n\'est pas autorisé');
}

async function createSession(db, userId, meta = {}) {
  const { rows } = await db.query(
    `INSERT INTO auth_sessions (user_id, expires_at, user_agent, ip)
     VALUES ($1, NOW() + make_interval(days => $2), $3, $4) RETURNING id, expires_at`,
    [userId, config.playerSessionDays, (meta.userAgent || '').slice(0, 300), meta.ip || null]
  );
  const s = rows[0];
  const token = jwt.sign({ sub: userId, sid: s.id, typ: 'player' }, config.jwtSecret, {
    expiresIn: `${config.playerSessionDays}d`,
  });
  return { token, sessionId: s.id, expiresAt: s.expires_at };
}

async function register(input, meta = {}) {
  const phone = normalizePhone(input.phone);
  validatePassword(input.password);
  const username = String(input.username || '').trim();
  validateUsername(username);
  const avatar = input.avatar || 'yas-01';
  if (!isValidAvatar(avatar)) throw bad('AVATAR_INVALID', 'Avatar invalide');
  if (input.acceptTerms !== true) throw bad('TERMS_REQUIRED', 'Vous devez accepter les conditions d\'utilisation');
  const rawEmail = String(input.email || '').trim();
  if (!rawEmail && config.emailRequired) throw bad('EMAIL_REQUIRED', 'Adresse e-mail requise');
  const email = rawEmail ? passwordReset.normalizeEmail(rawEmail) : null;

  const result = await pool.tx(async (db) => {
    const exists = await db.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
    if (exists.rows.length) throw conflict('PHONE_TAKEN', 'Un compte existe déjà avec ce numéro');
    const nameTaken = await db.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (nameTaken.rows.length) throw conflict('USERNAME_TAKEN', 'Ce pseudonyme est déjà pris');
    if (email) {
      const mailTaken = await db.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [email]);
      if (mailTaken.rows.length) throw conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée');
    }

    // Migration douce des anciens profils Swipe & Win : même numéro → compte lié.
    const legacy = await db.query(
      'SELECT p.id FROM players p WHERE p.phone = $1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.legacy_player_id = p.id)',
      [phone]
    );
    const hash = await bcrypt.hash(input.password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (phone, email, password_hash, username, avatar, legacy_player_id, terms_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [phone, email, hash, username, avatar, legacy.rows[0]?.id || null]
    );
    const user = rows[0];
    await db.query('INSERT INTO profiles (user_id) VALUES ($1)', [user.id]);
    await db.query('INSERT INTO player_global_stats (user_id) VALUES ($1)', [user.id]);
    const session = await createSession(db, user.id, meta);
    return { user, session };
  }).catch((err) => {
    // Deux inscriptions simultanées : l'index unique tranche.
    if (err.code === '23505') {
      if (/email/.test(err.constraint || '')) throw conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée');
      if (/username/.test(err.constraint || '')) throw conflict('USERNAME_TAKEN', 'Ce pseudonyme est déjà pris');
      throw conflict('PHONE_TAKEN', 'Un compte existe déjà avec ce numéro');
    }
    throw err;
  });
  analytics.track('user_registered', { userId: result.user.id, properties: { legacy: !!result.user.legacy_player_id } });
  return result;
}

function assertCanPlay(user) {
  if (user.status === 'banned') throw forbidden('Ce compte a été banni.');
  if (user.status === 'deleted') throw unauthorized('Compte supprimé');
  if (user.status === 'suspended' && (!user.suspended_until || new Date(user.suspended_until) > new Date())) {
    const until = user.suspended_until ? new Date(user.suspended_until).toISOString() : null;
    throw new AppError(403, 'SUSPENDED', 'Ce compte est suspendu.', { until });
  }
}

async function login({ phone: rawPhone, password }, meta = {}) {
  const phone = normalizePhone(rawPhone);
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  const user = rows[0];
  // Comparaison effectuée même si l'utilisateur n'existe pas (temps constant approximatif).
  const ok = await bcrypt.compare(String(password || ''), user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!user || !ok) throw unauthorized('Numéro ou mot de passe incorrect');
  if (user.status === 'suspended' && user.suspended_until && new Date(user.suspended_until) <= new Date()) {
    await pool.query("UPDATE users SET status = 'active', suspended_until = NULL WHERE id = $1", [user.id]);
    user.status = 'active';
  }
  assertCanPlay(user);
  const session = await createSession(pool, user.id, meta);
  await pool.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]);
  analytics.track('user_logged_in', { userId: user.id });
  return { user, session };
}

async function logout(sessionId) {
  await pool.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
  cache.delete(sessionId);
}

async function resetPassword({ token, newPassword }) {
  await passwordReset.resetPassword(token, newPassword, validatePassword);
  cache.clear();
}

// ── Vérification des jetons (HTTP + WebSocket) ──────────────────────────────
// Petit cache (10 s) pour limiter les requêtes ; invalidé à la déconnexion /
// suspension. La session est revérifiée en base (protection contre les jetons volés révoqués).
const cache = new Map();
const CACHE_MS = 10_000;

async function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Session expirée, reconnectez-vous');
  }
  if (payload.typ !== 'player' || !payload.sid) throw unauthorized('Jeton invalide');
  const hit = cache.get(payload.sid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.auth;
  const { rows } = await pool.query(
    `SELECT s.id AS sid, s.revoked_at, s.expires_at, u.*
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.user_id = $2`,
    [payload.sid, payload.sub]
  );
  const row = rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) throw unauthorized('Session expirée, reconnectez-vous');
  assertCanPlay(row);
  const auth = { userId: row.id, sessionId: row.sid, username: row.username, avatar: row.avatar };
  cache.set(payload.sid, { at: Date.now(), auth });
  if (!hit) pool.query('UPDATE auth_sessions SET last_used_at = NOW() WHERE id = $1', [row.sid]).catch(() => {});
  return auth;
}

function invalidateUserCache(userId) {
  for (const [sid, v] of cache) if (v.auth.userId === userId) cache.delete(sid);
}

module.exports = {
  register, login, logout, resetPassword, verifyToken, normalizePhone, validateUsername,
  validatePassword, invalidateUserCache, assertCanPlay,
};
