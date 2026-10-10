require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET doit faire au moins 32 caractères en production');
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
  otp: {
    // OTP obligatoire à l'inscription : à activer dès qu'un fournisseur SMS est branché.
    required: process.env.OTP_REQUIRED === 'true',
    provider: process.env.SMS_PROVIDER || 'console', // console | http
    apiUrl: process.env.SMS_API_URL || '',
    apiKey: process.env.SMS_API_KEY || '',
    sender: process.env.SMS_SENDER || 'DefiYas',
    ttlMinutes: 10,
    maxAttempts: 5,
  },
  redisUrl: process.env.REDIS_URL || '',
};
