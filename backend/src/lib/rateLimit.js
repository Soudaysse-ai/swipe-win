// Limiteur de fréquence en mémoire (fenêtre glissante simple).
// Suffisant pour une instance unique ; à brancher sur Redis pour plusieurs instances.
const { AppError } = require('./errors');

const buckets = new Map();

function hit(key, max, windowMs, now = Date.now(), { force = false } = {}) {
  if (!force && process.env.DISABLE_RATE_LIMIT === 'true') return true;
  let b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count <= max;
}

function reset() { buckets.clear(); }

// Nettoyage périodique des fenêtres expirées.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > 3600_000) buckets.delete(k);
}, 600_000).unref();

function limiter({ name, max, windowMs, key = (req) => req.ip }) {
  return (req, _res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === 'true') return next();
    if (!hit(`${name}:${key(req)}`, max, windowMs)) {
      return next(new AppError(429, 'RATE_LIMITED', 'Trop de tentatives, réessayez dans un instant.'));
    }
    next();
  };
}

module.exports = { hit, limiter, reset };
