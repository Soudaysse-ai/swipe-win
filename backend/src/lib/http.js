const { AppError } = require('./errors');

// Enveloppe un handler async pour transmettre les erreurs à Express.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Erreurs métier → message clair ; erreurs inattendues → message générique
// (le détail ne part que dans les logs serveur, cf. audit S7).
function errorMiddleware(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide', code: 'BAD_JSON' });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: 'Erreur interne, réessayez.', code: 'INTERNAL' });
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
}

module.exports = { ah, errorMiddleware, clientIp };
