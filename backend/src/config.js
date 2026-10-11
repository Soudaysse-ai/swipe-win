require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET doit faire au moins 32 caractères en production');
}
// Les liens de réinitialisation envoyés par e-mail sont construits à partir d'APP_URL.
if (isProd && !/^https:\/\//.test(process.env.APP_URL || '')) {
  throw new Error('APP_URL (https://…) est obligatoire en production pour les liens envoyés par e-mail');
}

module.exports = {
  env,
  isProd,
  isTest: env === 'test',
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  adminTokenTtl: process.env.JWT_EXPIRES_IN || '12h',
  playerSessionDays: parseInt(process.env.PLAYER_SESSION_DAYS || '30', 10),
  // Liste blanche CORS, séparée par des virgules. Vide = toutes origines en dev uniquement.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Format des numéros acceptés (+269 + 7 chiffres). Par défaut : préfixe 4 (règle du site actuel).
  phoneRegex: new RegExp(process.env.PHONE_REGEX || '^\\+2694\\d{6}$'),
  // E-mails transactionnels (réinitialisation du mot de passe) via l'API Resend.
  mail: {
    // Jamais de vrai envoi pendant les tests (adresses fictives → rebonds, réputation du domaine).
    resendApiKey: env === 'test' ? '' : (process.env.RESEND_API_KEY || ''),
    from: process.env.MAIL_FROM || 'Défi Yas <no-reply@defi-yas.com>',
    replyTo: process.env.MAIL_REPLY_TO || '',
  },
  // URL publique de l'application (liens envoyés par e-mail).
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // E-mail obligatoire à l'inscription (facultatif par défaut).
  emailRequired: process.env.EMAIL_REQUIRED === 'true',
  resetTokenMinutes: parseInt(process.env.RESET_TOKEN_MINUTES || '30', 10),
};
