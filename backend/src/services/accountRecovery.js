// Mot de passe oublié à partir du numéro de téléphone.
//  - Compte avec e-mail : le lien part tout de suite ; on affiche l'adresse masquée.
//  - Compte sans e-mail : le joueur dépose une demande (numéro + adresse où
//    recevoir le lien). Un agent vérifie son identité (rappel du numéro Yas) puis,
//    depuis le back-office, enregistre l'adresse sur le compte et envoie le lien.
//    Personne ne peut donc rattacher son adresse au compte d'un autre sans contrôle.
const pool = require('../db/pool');
const config = require('../config');
const passwordReset = require('./passwordReset');
const { normalizePhone } = require('./authService');
const { logAudit } = require('./audit');
const { bad, conflict, notFound } = require('../lib/errors');

async function findByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const { rows } = await pool.query(
    `SELECT id, username, email, status FROM users WHERE phone = $1 AND status IN ('active','suspended')`, [phone]);
  return rows[0] || null;
}

// Renvoie la marche à suivre : 'email' (lien envoyé), 'request' (pas d'e-mail
// utilisable : demande au service client) ou 'none' (aucun compte).
async function forgotByPhone(rawPhone, { ip } = {}) {
  const user = await findByPhone(rawPhone);
  if (!user) return { method: 'none' };
  if (user.email && await passwordReset.emailLink(user, { ip })) {
    return { method: 'email', emailHint: passwordReset.maskEmail(user.email), expiresInMinutes: config.resetTokenMinutes };
  }
  return { method: 'request', hasEmail: !!user.email };
}

async function createRequest({ phone, email: rawEmail, note }, { ip } = {}) {
  const user = await findByPhone(phone);
  if (!user) throw notFound('Aucun compte Défi Yas avec ce numéro');
  const email = passwordReset.normalizeEmail(rawEmail);
  const text = String(note || '').trim().slice(0, 300) || null;
  const recent = await pool.query(
    `SELECT COUNT(*)::int AS n FROM recovery_requests WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [user.id]);
  if (recent.rows[0].n >= 3) throw bad('TOO_MANY_REQUESTS', 'Ta demande est déjà enregistrée : le service client te recontacte.');
  // Une seule demande en attente par compte : une nouvelle demande la met à jour.
  await pool.query(
    `INSERT INTO recovery_requests (user_id, email, note, requested_ip) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) WHERE status = 'pending'
     DO UPDATE SET email = EXCLUDED.email, note = EXCLUDED.note, requested_ip = EXCLUDED.requested_ip, updated_at = NOW()`,
    [user.id, email, text, ip || null]);
  return { ok: true };
}

const STATUSES = ['pending', 'sent', 'rejected'];

async function list(status = 'pending') {
  const st = STATUSES.includes(status) ? status : 'pending';
  const { rows } = await pool.query(
    `SELECT r.id, r.email, r.note, r.status, r.created_at, r.updated_at, r.handled_at, r.admin_note,
            u.id AS user_id, u.username, u.avatar, u.phone, u.email AS current_email, u.created_at AS user_created_at,
            u.status AS user_status, a.email AS handled_by_email
       FROM recovery_requests r JOIN users u ON u.id = r.user_id LEFT JOIN admins a ON a.id = r.handled_by
      WHERE r.status = $1 ORDER BY r.created_at ${st === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`, [st]);
  const pending = await pool.query(`SELECT COUNT(*)::int AS n FROM recovery_requests WHERE status = 'pending'`);
  return { requests: rows, pending: pending.rows[0].n };
}

async function lockPending(db, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw notFound('Demande introuvable');
  const { rows } = await db.query(
    `SELECT r.*, u.username, u.email AS current_email, u.status AS user_status
       FROM recovery_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1 FOR UPDATE OF r`, [id]);
  const r = rows[0];
  if (!r) throw notFound('Demande introuvable');
  if (r.status !== 'pending') throw conflict('ALREADY_HANDLED', 'Cette demande a déjà été traitée');
  return r;
}

// Identité vérifiée par l'agent : l'adresse devient celle du compte et le lien part.
// Si l'e-mail ne peut pas partir, le lien est renvoyé à l'agent pour le transmettre.
async function approve(admin, id, ip) {
  const out = await pool.tx(async (db) => {
    const r = await lockPending(db, id);
    if (r.user_status === 'deleted' || r.user_status === 'banned') throw bad('ACCOUNT_CLOSED', 'Ce compte est fermé');
    const taken = await db.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2', [r.email, r.user_id]);
    if (taken.rows.length) throw conflict('EMAIL_TAKEN', 'Cette adresse est déjà utilisée par un autre compte');
    await db.query('UPDATE users SET email = $2 WHERE id = $1', [r.user_id, r.email]);
    const link = await passwordReset.createLink(db, r.user_id, { adminId: admin.id });
    await db.query(`UPDATE recovery_requests SET status = 'sent', handled_by = $2, handled_at = NOW(), updated_at = NOW() WHERE id = $1`, [r.id, admin.id]);
    await logAudit(admin.id, 'RECOVERY_SENT', 'user', r.user_id, { email: r.current_email }, { email: r.email }, { ip }, db);
    return { user: { id: r.user_id, username: r.username, email: r.email }, link };
  });
  try {
    await passwordReset.sendLink(out.user, out.link);
    return { emailed: true, email: out.user.email, expiresInMinutes: config.resetTokenMinutes };
  } catch (err) {
    console.error('récupération : e-mail non envoyé', err.message);
    return { emailed: false, email: out.user.email, link: out.link, expiresInMinutes: config.resetTokenMinutes };
  }
}

async function reject(admin, id, note, ip) {
  const why = String(note || '').trim().slice(0, 300);
  if (why.length < 3) throw bad('REASON_REQUIRED', 'Un motif est obligatoire');
  await pool.tx(async (db) => {
    const r = await lockPending(db, id);
    await db.query(
      `UPDATE recovery_requests SET status = 'rejected', handled_by = $2, handled_at = NOW(), admin_note = $3, updated_at = NOW() WHERE id = $1`,
      [r.id, admin.id, why]);
    await logAudit(admin.id, 'RECOVERY_REJECTED', 'user', r.user_id, null, null, { reason: why, ip }, db);
  });
  return { ok: true };
}

module.exports = { forgotByPhone, createRequest, list, approve, reject };
