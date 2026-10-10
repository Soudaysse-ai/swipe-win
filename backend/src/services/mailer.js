// Envoi d'e-mails transactionnels via l'API Resend (https://resend.com/docs/api-reference/emails/send-email).
// Sans RESEND_API_KEY (développement, tests) : rien n'est envoyé, le message est
// écrit dans les logs et conservé dans `outbox` (lu par les tests).
const config = require('../config');
const { AppError } = require('../lib/errors');

const outbox = [];

async function send({ to, subject, html, text, idempotencyKey }) {
  if (!config.mail.resendApiKey) {
    if (config.isProd) {
      console.error('E-mail non envoyé : RESEND_API_KEY manquante');
      throw new AppError(503, 'MAIL_UNAVAILABLE', 'Service e-mail indisponible');
    }
    outbox.push({ to, subject, html, text, at: new Date() });
    if (outbox.length > 100) outbox.shift();
    if (!config.isTest) console.log(`[e-mail → ${to}] ${subject}\n${text}`);
    return { id: `dev-${outbox.length}` };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mail.resendApiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: config.mail.from,
      to: [to],
      subject,
      html,
      text,
      ...(config.mail.replyTo ? { reply_to: config.mail.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`Resend : échec ${res.status} ${detail.slice(0, 300)}`);
    throw new AppError(502, 'MAIL_FAILED', 'Envoi de l\'e-mail impossible, réessaie plus tard.');
  }
  return res.json();
}

module.exports = { send, outbox };
