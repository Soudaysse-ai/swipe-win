// Réinitialisation du mot de passe par lien envoyé par e-mail.
//  - Jeton aléatoire de 256 bits, seul son SHA-256 est stocké ; usage unique ;
//    validité RESET_TOKEN_MINUTES (30 min par défaut) ; une nouvelle demande
//    annule les liens précédents.
//  - La demande répond toujours de la même façon, que l'adresse existe ou non
//    (pas de divulgation des comptes).
//  - Après réinitialisation, toutes les sessions du joueur sont fermées.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const config = require('../config');
const mailer = require('./mailer');
const { bad, AppError } = require('../lib/errors');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw bad('EMAIL_INVALID', 'Adresse e-mail invalide');
  return email;
}

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function resetEmail(username, link) {
  const minutes = config.resetTokenMinutes;
  const subject = 'Choisis ton nouveau mot de passe Défi Yas';
  const text = [
    `Salut ${username} !`,
    '',
    'Tu as demandé un nouveau mot de passe pour ton compte Défi Yas. Choisis-le en un clic :',
    link,
    '',
    `Ce lien est valable ${minutes} minutes et ne fonctionne qu'une seule fois.`,
    'Tu n\'es pas à l\'origine de cette demande ? Ignore simplement cet e-mail : ton mot de passe actuel reste valable.',
    '',
    'À tout de suite sur Défi Yas !',
    'L\'équipe Yas Comores',
  ].join('\n');
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#F2F5F9;font-family:Figtree,Arial,sans-serif;color:#00377D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:24px;overflow:hidden">
<tr><td style="background:#FFD100;padding:22px 28px;font-size:24px;font-weight:800;font-style:italic;color:#00377D">Défi Yas</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:22px;font-weight:800;font-style:italic">Salut ${escapeHtml(username)} !</p>
<p style="margin:0 0 22px;font-size:16px;line-height:1.5">Tu as demandé un nouveau mot de passe pour ton compte Défi Yas. Choisis-le en un clic :</p>
<p style="margin:0 0 22px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#00377D;color:#ffffff;text-decoration:none;font-size:17px;font-weight:500;padding:14px 26px;border-radius:28px">Choisir mon mot de passe &rarr;</a></p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#575758">Ce lien est valable ${minutes} minutes et ne fonctionne qu'une seule fois.</p>
<p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#575758">Tu n'es pas à l'origine de cette demande ? Ignore simplement cet e-mail : ton mot de passe actuel reste valable.</p>
<p style="margin:0;font-size:16px">À tout de suite sur Défi Yas !<br><span style="color:#575758;font-size:14px">L'équipe Yas Comores</span></p>
</td></tr></table>
<p style="font-size:12px;color:#868687;margin:16px 0 0">Le bouton ne marche pas ? Copie ce lien dans ton navigateur :<br>${escapeHtml(link)}</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

// Crée un jeton (annule les précédents) et renvoie le lien.
async function createLink(db, userId, { ip = null, adminId = null } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip, created_by_admin)
     VALUES ($1, $2, NOW() + make_interval(mins => $3), $4, $5)`,
    [userId, hash(token), config.resetTokenMinutes, ip, adminId]);
  return `${config.appUrl}/reset?token=${token}`;
}

async function sendLink(user, link) {
  const mail = resetEmail(user.username, link);
  await mailer.send({ to: user.email, ...mail });
}

// Demande publique : aucune information sur l'existence du compte n'est renvoyée.
async function requestReset(rawEmail, { ip } = {}) {
  const email = normalizeEmail(rawEmail);
  const { rows } = await pool.query(
    `SELECT id, username, email, status FROM users WHERE LOWER(email) = $1 AND status IN ('active','suspended')`, [email]);
  const user = rows[0];
  if (!user) return;
  const recent = await pool.query(
    `SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`, [user.id]);
  if (recent.rows[0].n >= 5) return; // silencieux : pas de bombardement d'e-mails
  const link = await createLink(pool, user.id, { ip });
  try {
    await sendLink(user, link);
  } catch (err) {
    console.error('réinitialisation : e-mail non envoyé', err.message);
  }
}

async function resetPassword(token, newPassword, validatePassword) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw bad('TOKEN_INVALID', 'Lien invalide ou expiré');
  validatePassword(newPassword);
  const userId = await pool.tx(async (db) => {
    const { rows } = await db.query(
      `SELECT t.id, t.user_id, u.status FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW() FOR UPDATE OF t`, [hash(token)]);
    const t = rows[0];
    if (!t || t.status === 'deleted') throw bad('TOKEN_INVALID', 'Lien invalide ou expiré. Demande un nouveau lien.');
    await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [t.user_id]);
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [t.user_id, await bcrypt.hash(newPassword, 10)]);
    await db.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [t.user_id]);
    return t.user_id;
  });
  return userId;
}

// Utilisé par le back-office : e-mail si le joueur en a un, sinon lien à transmettre.
async function adminLink(userId, adminId) {
  const { rows } = await pool.query('SELECT id, username, email, status FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user || user.status === 'deleted') throw new AppError(404, 'NOT_FOUND', 'Joueur introuvable');
  const link = await createLink(pool, user.id, { adminId });
  if (user.email) {
    await sendLink(user, link);
    return { emailed: true, email: user.email, expiresInMinutes: config.resetTokenMinutes };
  }
  return { emailed: false, link, expiresInMinutes: config.resetTokenMinutes };
}

module.exports = { normalizeEmail, requestReset, resetPassword, adminLink, resetEmail, _hash: hash };
