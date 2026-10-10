// Authentification des joueurs Défi Yas.
// Remplace l'ancienne connexion « numéro seul » de Swipe & Win (audit S1).
const express = require('express');
const router = express.Router();
const config = require('../config');
const auth = require('../services/authService');
const otp = require('../services/otpService');
const profiles = require('../services/profiles');
const { requirePlayer } = require('../middleware/playerAuth');
const { ah, clientIp } = require('../lib/http');
const { limiter } = require('../lib/rateLimit');
const { bad } = require('../lib/errors');
const { AVATARS } = require('../services/avatars');

const authLimiter = limiter({ name: 'auth', max: 10, windowMs: 60_000 });
const otpLimiter = limiter({ name: 'otp', max: 3, windowMs: 60_000 });

const meta = (req) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

function sessionPayload({ user, session }) {
  return {
    token: session.token, expiresAt: session.expiresAt,
    user: { id: user.id, username: user.username, avatar: user.avatar },
  };
}

// Paramètres publics nécessaires à l'écran d'inscription.
router.get('/config', (_req, res) => {
  res.json({ otpRequired: config.otp.required, smsAvailable: otp.smsConfigured() || !config.isProd, avatars: AVATARS, phonePrefix: '+269' });
});

router.post('/otp/request', otpLimiter, ah(async (req, res) => {
  const phone = auth.normalizePhone(req.body.phone);
  const purpose = req.body.purpose === 'reset' ? 'reset' : 'register';
  await otp.requestCode(phone, purpose);
  res.json({ ok: true });
}));

router.post('/register', authLimiter, ah(async (req, res) => {
  const out = await auth.register(req.body || {}, meta(req));
  res.status(201).json(sessionPayload(out));
}));

router.post('/login', authLimiter, ah(async (req, res) => {
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

router.post('/password/reset', authLimiter, ah(async (req, res) => {
  const { phone, code, newPassword } = req.body || {};
  if (!code) throw bad('CODE_REQUIRED', 'Code requis');
  await auth.resetPassword({ phone, code, newPassword });
  res.json({ ok: true });
}));

// Ancienne route Swipe & Win : remplacée par /register + /login.
router.post('/subscribe', (_req, res) => {
  res.status(410).json({ error: 'Connecte-toi avec ton compte Défi Yas (numéro + mot de passe).', code: 'USE_ACCOUNT' });
});

module.exports = router;
