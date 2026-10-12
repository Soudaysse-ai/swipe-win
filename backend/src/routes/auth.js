// Authentification des joueurs Défi Yas.
// Remplace l'ancienne connexion « numéro seul » de Swipe & Win (audit S1).
const express = require('express');
const router = express.Router();
const config = require('../config');
const auth = require('../services/authService');
const passwordReset = require('../services/passwordReset');
const recovery = require('../services/accountRecovery');
const profiles = require('../services/profiles');
const { requirePlayer } = require('../middleware/playerAuth');
const { ah, clientIp } = require('../lib/http');
const { limiter } = require('../lib/rateLimit');
const { bad } = require('../lib/errors');
const { AVATARS } = require('../services/avatars');

// Clé = IP + numéro : limite le bourrinage d'un compte sans bloquer tous les
// abonnés derrière une même IP mobile partagée.
const byPhone = (req) => `${req.ip}:${String(req.body?.phone || '').replace(/\D/g, '')}`;
const authLimiter = limiter({ name: 'auth', max: 10, windowMs: 60_000, key: byPhone });
const forgotLimiter = limiter({ name: 'forgot', max: 3, windowMs: 60_000, key: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}` });
const ipLimiter = limiter({ name: 'auth-ip', max: 200, windowMs: 60_000 });
const forgotPhoneLimiter = limiter({ name: 'forgot-phone', max: 3, windowMs: 60_000, key: byPhone });
const recoveryLimiter = limiter({ name: 'recovery', max: 10, windowMs: 3600_000 });

const meta = (req) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

function sessionPayload({ user, session }) {
  return {
    token: session.token, expiresAt: session.expiresAt,
    user: { id: user.id, username: user.username, avatar: user.avatar },
  };
}

// Paramètres publics nécessaires à l'écran d'inscription.
router.get('/config', (_req, res) => {
  res.json({ emailRequired: config.emailRequired, avatars: AVATARS, phonePrefix: '+269', resetTokenMinutes: config.resetTokenMinutes });
});

router.post('/register', ipLimiter, authLimiter, ah(async (req, res) => {
  let out;
  try {
    out = await auth.register(req.body || {}, meta(req));
  } catch (err) {
    // Trace des refus (code seulement, aucune donnée personnelle) pour comprendre
    // les inscriptions qui échouent.
    if (err.status && err.status < 500 && !config.isTest) console.info(`inscription refusée : ${err.code}`);
    throw err;
  }
  res.status(201).json(sessionPayload(out));
}));

router.post('/login', ipLimiter, authLimiter, ah(async (req, res) => {
  const out = await auth.login(req.body || {}, meta(req));
  res.json(sessionPayload(out));
}));

router.post('/logout', requirePlayer, ah(async (req, res) => {
  await auth.logout(req.user.sessionId);
  res.json({ ok: true });
}));

router.get('/me', requirePlayer, ah(async (req, res) => {
  res.json({ user: await profiles.me(req.user.userId) });
}));

// Mot de passe oublié à partir du numéro : lien envoyé à l'e-mail du compte s'il
// en a un, sinon demande de récupération auprès du service client.
router.post('/password/forgot-phone', ipLimiter, forgotPhoneLimiter, ah(async (req, res) => {
  res.json(await recovery.forgotByPhone(req.body?.phone, { ip: clientIp(req) }));
}));

router.post('/recovery', ipLimiter, recoveryLimiter, ah(async (req, res) => {
  res.status(201).json(await recovery.createRequest(req.body || {}, { ip: clientIp(req) }));
}));

// Mot de passe oublié : envoie un lien par e-mail (réponse identique que le compte existe ou non).
router.post('/password/forgot', ipLimiter, forgotLimiter, ah(async (req, res) => {
  const email = passwordReset.normalizeEmail(req.body?.email);
  // Traitement en arrière-plan : le temps de réponse ne révèle pas si l'adresse existe.
  passwordReset.requestReset(email, { ip: clientIp(req) }).catch(err => console.error('mot de passe oublié', err.message));
  res.json({ ok: true });
}));

router.post('/password/reset', ipLimiter, ah(async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token) throw bad('TOKEN_REQUIRED', 'Lien invalide');
  await auth.resetPassword({ token, newPassword });
  res.json({ ok: true });
}));

// Ancienne route Swipe & Win : remplacée par /register + /login.
router.post('/subscribe', (_req, res) => {
  res.status(410).json({ error: 'Connecte-toi avec ton compte Défi Yas (numéro + mot de passe).', code: 'USE_ACCOUNT' });
});

module.exports = router;
