// Codes OTP par SMS. Fournisseurs :
//  - console : le code est écrit dans les logs serveur (développement / tests).
//  - http    : POST JSON { to, from, message } vers SMS_API_URL avec SMS_API_KEY.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const config = require('../config');
const { bad, AppError } = require('../lib/errors');

const lastCodes = new Map(); // dev/test uniquement : dernier code par téléphone

async function sendSms(to, message) {
  if (config.otp.provider === 'http') {
    if (!config.otp.apiUrl) throw new AppError(503, 'SMS_UNAVAILABLE', 'Service SMS non configuré');
    const res = await fetch(config.otp.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.otp.apiKey}` },
      body: JSON.stringify({ to, from: config.otp.sender, message }),
    });
    if (!res.ok) throw new AppError(502, 'SMS_FAILED', 'Envoi du SMS impossible, réessayez.');
    return;
  }
  if (config.isProd) console.warn('OTP : fournisseur "console" utilisé en production');
  console.log(`[SMS → ${to}] ${message}`);
}

function smsConfigured() {
  return config.otp.provider === 'http' && !!config.otp.apiUrl;
}

async function createCode(phone, purpose, db = pool) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const hash = await bcrypt.hash(code, 8);
  await db.query(
    `INSERT INTO otp_codes (phone, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))`,
    [phone, purpose, hash, config.otp.ttlMinutes]
  );
  if (!config.isProd) lastCodes.set(`${phone}:${purpose}`, code);
  return code;
}

async function requestCode(phone, purpose) {
  const recent = await pool.query(
    `SELECT COUNT(*)::int AS n FROM otp_codes WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [phone]
  );
  if (recent.rows[0].n >= 5) throw new AppError(429, 'OTP_LIMIT', 'Trop de codes demandés. Réessayez plus tard.');
  const code = await createCode(phone, purpose);
  await sendSms(phone, `Défi Yas : ton code est ${code}. Il expire dans ${config.otp.ttlMinutes} min. Ne le partage avec personne.`);
}

// Vérifie et consomme le code (usage unique). Lève une erreur sinon.
async function verifyCode(phone, purpose, code, db = pool) {
  if (!/^\d{6}$/.test(String(code || ''))) throw bad('OTP_INVALID', 'Code invalide');
  const { rows } = await db.query(
    `SELECT * FROM otp_codes WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL
       AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [phone, purpose]
  );
  const row = rows[0];
  if (!row) throw bad('OTP_EXPIRED', 'Code expiré, demandez-en un nouveau');
  if (row.attempts >= config.otp.maxAttempts) throw bad('OTP_LOCKED', 'Trop d\'essais, demandez un nouveau code');
  const ok = await bcrypt.compare(String(code), row.code_hash);
  if (!ok) {
    await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw bad('OTP_INVALID', 'Code incorrect');
  }
  await db.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1', [row.id]);
}

module.exports = { requestCode, verifyCode, createCode, smsConfigured, _lastCodes: lastCodes };
