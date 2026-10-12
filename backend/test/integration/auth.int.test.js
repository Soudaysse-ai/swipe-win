// Comptes : inscription sans OTP, e-mail facultatif, réinitialisation du mot de
// passe par lien e-mail (Resend en production, boîte d'envoi simulée en test).
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startServer, stopServer, api, sleep, pool } = require('../helpers/server');
const mailer = require('../../src/services/mailer');

let srv;
const phone = (n) => `+2694${String(700000 + n)}`;

async function waitMail(to) {
  for (let i = 0; i < 50; i++) {
    const m = [...mailer.outbox].reverse().find(x => x.to === to);
    if (m) return m;
    await sleep(20);
  }
  return null;
}
const tokenOf = (mail) => /token=([A-Za-z0-9_-]+)/.exec(mail.text)[1];

test.before(async () => { srv = await startServer(); });
test.after(async () => { await stopServer(srv); });

test('inscription sans code SMS, avec e-mail facultatif', async () => {
  const cfg = await api(srv.base, 'GET', '/api/auth/config');
  assert.equal(cfg.data.otpRequired, undefined);
  assert.equal(cfg.data.emailRequired, false);
  const noMail = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(1), password: 'motdepasse123', username: 'SansMail', acceptTerms: true } });
  assert.equal(noMail.status, 201);
  const withMail = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(2), email: 'Awa@Example.km', password: 'motdepasse123', username: 'Awa', acceptTerms: true } });
  assert.equal(withMail.status, 201);
  const stored = await pool.query('SELECT email FROM users WHERE username = $1', ['Awa']);
  assert.equal(stored.rows[0].email, 'awa@example.km', 'adresse normalisée');
  const dup = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(3), email: 'awa@example.km', password: 'motdepasse123', username: 'Awa2', acceptTerms: true } });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, 'EMAIL_TAKEN');
  const bad = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(4), email: 'pas-une-adresse', password: 'motdepasse123', username: 'Bad', acceptTerms: true } });
  assert.equal(bad.data.code, 'EMAIL_INVALID');
  assert.equal((await api(srv.base, 'POST', '/api/auth/otp/request', { body: { phone: phone(1) } })).status, 404, 'route OTP supprimée');
});

test('mot de passe oublié : e-mail, lien à usage unique, sessions fermées', async () => {
  const login = await api(srv.base, 'POST', '/api/auth/login', { body: { phone: phone(2), password: 'motdepasse123' } });
  const oldToken = login.data.token;
  const r = await api(srv.base, 'POST', '/api/auth/password/forgot', { body: { email: 'AWA@example.km' } });
  assert.equal(r.status, 200);
  const mail = await waitMail('awa@example.km');
  assert.ok(mail, 'e-mail envoyé');
  assert.match(mail.subject, /mot de passe/);
  assert.ok(mail.html.includes('Salut Awa'));
  assert.ok(mail.text.includes('/reset?token='));
  const token = tokenOf(mail);
  const stored = await pool.query('SELECT token_hash FROM password_reset_tokens');
  assert.ok(stored.rows.every(x => x.token_hash !== token), 'le jeton en clair n\'est jamais stocké');

  const weak = await api(srv.base, 'POST', '/api/auth/password/reset', { body: { token, newPassword: 'court' } });
  assert.equal(weak.data.code, 'PASSWORD_WEAK');
  const ok = await api(srv.base, 'POST', '/api/auth/password/reset', { body: { token, newPassword: 'nouveau-mdp-456' } });
  assert.equal(ok.status, 200);
  assert.equal((await api(srv.base, 'GET', '/api/auth/me', { token: oldToken })).status, 401, 'anciennes sessions révoquées');
  assert.equal((await api(srv.base, 'POST', '/api/auth/login', { body: { phone: phone(2), password: 'motdepasse123' } })).status, 401);
  assert.equal((await api(srv.base, 'POST', '/api/auth/login', { body: { phone: phone(2), password: 'nouveau-mdp-456' } })).status, 200);
  const reuse = await api(srv.base, 'POST', '/api/auth/password/reset', { body: { token, newPassword: 'encore-un-autre' } });
  assert.equal(reuse.data.code, 'TOKEN_INVALID', 'lien à usage unique');
});

test('adresse inconnue : même réponse, aucun e-mail', async () => {
  const before = mailer.outbox.length;
  const r = await api(srv.base, 'POST', '/api/auth/password/forgot', { body: { email: 'inconnu@example.km' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
  await sleep(150);
  assert.equal(mailer.outbox.length, before);
  assert.equal((await api(srv.base, 'POST', '/api/auth/password/forgot', { body: { email: 'nimporte' } })).status, 400);
});

test('lien expiré refusé ; une nouvelle demande annule l\'ancien lien', async () => {
  await api(srv.base, 'POST', '/api/auth/password/forgot', { body: { email: 'awa@example.km' } });
  const first = tokenOf(await waitMail('awa@example.km'));
  mailer.outbox.length = 0;
  await api(srv.base, 'POST', '/api/auth/password/forgot', { body: { email: 'awa@example.km' } });
  const second = tokenOf(await waitMail('awa@example.km'));
  assert.notEqual(first, second);
  assert.equal((await api(srv.base, 'POST', '/api/auth/password/reset', { body: { token: first, newPassword: 'motdepasse-x1' } })).data.code, 'TOKEN_INVALID');
  await pool.query(`UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE used_at IS NULL`);
  assert.equal((await api(srv.base, 'POST', '/api/auth/password/reset', { body: { token: second, newPassword: 'motdepasse-x2' } })).data.code, 'TOKEN_INVALID');
});

test('profil : ajouter ou changer son e-mail exige le mot de passe actuel', async () => {
  const login = await api(srv.base, 'POST', '/api/auth/login', { body: { phone: phone(1), password: 'motdepasse123' } });
  const t = login.data.token;
  const wrong = await api(srv.base, 'PATCH', '/api/players/me', { token: t, body: { email: 'sans@example.km', currentPassword: 'faux' } });
  assert.equal(wrong.data.code, 'PASSWORD_WRONG');
  const taken = await api(srv.base, 'PATCH', '/api/players/me', { token: t, body: { email: 'awa@example.km', currentPassword: 'motdepasse123' } });
  assert.equal(taken.data.code, 'EMAIL_TAKEN');
  const ok = await api(srv.base, 'PATCH', '/api/players/me', { token: t, body: { email: 'sans@example.km', currentPassword: 'motdepasse123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.player.email, 'sans@example.km');
});

test('service client : lien envoyé par e-mail, ou remis à l\'administrateur sans e-mail', async () => {
  await pool.query(`INSERT INTO admins (email, password_hash, role) VALUES ('mod@yas.km', $1, 'moderator')`, [await bcrypt.hash('motdepasse-admin', 4)]);
  const admin = (await api(srv.base, 'POST', '/api/admin/login', { body: { email: 'mod@yas.km', password: 'motdepasse-admin' } })).data.token;
  await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(9), password: 'motdepasse123', username: 'SansAdresse', acceptTerms: true } });
  const ids = await pool.query(`SELECT id, username FROM users WHERE username IN ('Awa', 'SansAdresse')`);
  const by = Object.fromEntries(ids.rows.map(r => [r.username, r.id]));
  mailer.outbox.length = 0;
  const emailed = await api(srv.base, 'POST', `/api/admin/players/${by.Awa}/reset-link`, { token: admin, body: { reason: 'Appel au service client' } });
  assert.equal(emailed.data.emailed, true);
  assert.equal(emailed.data.link, undefined, 'le lien n\'est pas montré quand il part par e-mail');
  assert.ok(await waitMail('awa@example.km'));
  const manual = await api(srv.base, 'POST', `/api/admin/players/${by.SansAdresse}/reset-link`, { token: admin, body: { reason: 'Appel au service client' } });
  assert.equal(manual.data.emailed, false);
  assert.match(manual.data.link, /\/reset\?token=/);
  const reset = await api(srv.base, 'POST', '/api/auth/password/reset', { body: { token: manual.data.link.split('token=')[1], newPassword: 'via-service-client' } });
  assert.equal(reset.status, 200);
  const audit = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'RESET_LINK'`);
  assert.equal(audit.rows[0].n, 2);
});

test('inscription : pseudos accentués et espaces acceptés, numéros non Yas expliqués', async () => {
  const ok = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(20), password: 'motdepasse123', username: '  Moussa   Saïd ', acceptTerms: true } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.username, 'Moussa Saïd', 'espaces en trop retirés');
  const accent = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(21), password: 'motdepasse123', username: 'Élodie_97', acceptTerms: true } });
  assert.equal(accent.status, 201);
  const same = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(22), password: 'motdepasse123', username: 'moussa saïd', acceptTerms: true } });
  assert.equal(same.data.code, 'USERNAME_TAKEN', 'unicité sans tenir compte de la casse');
  for (const bad of ['ab', 'a'.repeat(21), 'émoji 🎮', 'nom@mail']) {
    const r = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(23), password: 'motdepasse123', username: bad, acceptTerms: true } });
    assert.equal(r.data.code, 'USERNAME_INVALID', bad);
  }
  const telma = await api(srv.base, 'POST', '/api/auth/register', { body: { phone: '+269 332 12 34', password: 'motdepasse123', username: 'Telma', acceptTerms: true } });
  assert.equal(telma.data.code, 'PHONE_INVALID');
  assert.match(telma.data.error, /numéros Yas/);
});

test('oubli par numéro : lien vers l\'e-mail du compte, adresse masquée', async () => {
  await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(30), email: 'mariama.test@example.km', password: 'motdepasse123', username: 'AvecMail', acceptTerms: true } });
  mailer.outbox.length = 0;
  const r = await api(srv.base, 'POST', '/api/auth/password/forgot-phone', { body: { phone: '470 00 30' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.method, 'email');
  assert.equal(r.data.emailHint, 'ma•••t@ex•••.km');
  assert.ok(await waitMail('mariama.test@example.km'));
  const none = await api(srv.base, 'POST', '/api/auth/password/forgot-phone', { body: { phone: '+2694999999' } });
  assert.deepEqual(none.data, { method: 'none' });
  const bad = await api(srv.base, 'POST', '/api/auth/password/forgot-phone', { body: { phone: '123' } });
  assert.equal(bad.data.code, 'PHONE_INVALID');
});

test('compte sans e-mail : demande vérifiée par le service client, puis lien envoyé', async () => {
  await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(40), password: 'motdepasse123', username: 'Oublieux', acceptTerms: true } });
  const r = await api(srv.base, 'POST', '/api/auth/password/forgot-phone', { body: { phone: phone(40) } });
  assert.deepEqual(r.data, { method: 'request', hasEmail: false });
  const unknown = await api(srv.base, 'POST', '/api/auth/recovery', { body: { phone: '+2694999998', email: 'x@example.km' } });
  assert.equal(unknown.status, 404);
  const first = await api(srv.base, 'POST', '/api/auth/recovery', { body: { phone: phone(40), email: 'premier@example.km' } });
  assert.equal(first.status, 201);
  const again = await api(srv.base, 'POST', '/api/auth/recovery', { body: { phone: phone(40), email: 'oublieux@example.km', note: 'Je joue surtout à Ludo' } });
  assert.equal(again.status, 201);
  const rows = await pool.query(`SELECT r.email, r.note FROM recovery_requests r JOIN users u ON u.id = r.user_id WHERE u.username = 'Oublieux'`);
  assert.equal(rows.rows.length, 1, 'une seule demande en attente, mise à jour');
  assert.equal(rows.rows[0].email, 'oublieux@example.km');
  const stillNoMail = await pool.query(`SELECT email FROM users WHERE username = 'Oublieux'`);
  assert.equal(stillNoMail.rows[0].email, null, 'aucune adresse rattachée sans vérification');

  const admin = (await api(srv.base, 'POST', '/api/admin/login', { body: { email: 'mod@yas.km', password: 'motdepasse-admin' } })).data.token;
  assert.equal((await api(srv.base, 'GET', '/api/admin/recovery')).status, 401);
  const list = await api(srv.base, 'GET', '/api/admin/recovery', { token: admin });
  assert.equal(list.data.pending, 1);
  const req = list.data.requests[0];
  assert.equal(req.username, 'Oublieux');
  assert.equal(req.phone, phone(40));
  mailer.outbox.length = 0;
  const sent = await api(srv.base, 'POST', `/api/admin/recovery/${req.id}/approve`, { token: admin });
  assert.equal(sent.data.emailed, true);
  const mail = await waitMail('oublieux@example.km');
  assert.ok(mail);
  const reset = await api(srv.base, 'POST', '/api/auth/password/reset', { body: { token: tokenOf(mail), newPassword: 'retrouve-123' } });
  assert.equal(reset.status, 200);
  assert.equal((await api(srv.base, 'POST', '/api/auth/login', { body: { phone: phone(40), password: 'retrouve-123' } })).status, 200);
  const user = await pool.query(`SELECT email FROM users WHERE username = 'Oublieux'`);
  assert.equal(user.rows[0].email, 'oublieux@example.km', 'adresse enregistrée pour la prochaine fois');
  assert.equal((await api(srv.base, 'POST', `/api/admin/recovery/${req.id}/approve`, { token: admin })).data.code, 'ALREADY_HANDLED');
  // La prochaine fois, le lien part directement.
  const next = await api(srv.base, 'POST', '/api/auth/password/forgot-phone', { body: { phone: phone(40) } });
  assert.equal(next.data.method, 'email');

  // Refus : motif obligatoire, journalisé.
  await api(srv.base, 'POST', '/api/auth/register', { body: { phone: phone(41), password: 'motdepasse123', username: 'Douteux', acceptTerms: true } });
  await api(srv.base, 'POST', '/api/auth/recovery', { body: { phone: phone(41), email: 'douteux@example.km' } });
  const pending = (await api(srv.base, 'GET', '/api/admin/recovery', { token: admin })).data.requests[0];
  assert.equal((await api(srv.base, 'POST', `/api/admin/recovery/${pending.id}/reject`, { token: admin, body: {} })).data.code, 'REASON_REQUIRED');
  assert.equal((await api(srv.base, 'POST', `/api/admin/recovery/${pending.id}/reject`, { token: admin, body: { reason: 'Numéro injoignable' } })).status, 200);
  const audit = await pool.query(`SELECT action FROM audit_logs WHERE action LIKE 'RECOVERY_%' ORDER BY created_at`);
  assert.deepEqual(audit.rows.map(a => a.action), ['RECOVERY_SENT', 'RECOVERY_REJECTED']);
  assert.equal((await api(srv.base, 'GET', '/api/admin/recovery?status=rejected', { token: admin })).data.requests[0].admin_note, 'Numéro injoignable');
});
