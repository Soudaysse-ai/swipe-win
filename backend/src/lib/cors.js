// Origines autorisées (CORS) pour l'API HTTP et Socket.IO.
// CORS_ORIGINS accepte des adresses exactes et des motifs avec « * » limité à un
// seul segment de nom de domaine, ex. https://defi-yas-*.vercel.app pour les aperçus.
// L'authentification passe par un jeton dans l'en-tête Authorization (pas de cookie).
const config = require('../config');

function toMatcher(entry) {
  if (!entry.includes('*')) return (o) => o === entry;
  const re = new RegExp(`^${entry.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')}$`, 'i');
  return (o) => re.test(o);
}

const matchers = config.corsOrigins.map(toMatcher);

function isAllowed(origin) {
  if (!origin) return true; // requêtes sans origine (santé, outils serveur)
  if (!matchers.length) return !config.isProd;
  return matchers.some(m => m(origin));
}

// Signature attendue par le module cors et par Socket.IO.
function origin(o, cb) { cb(null, isAllowed(o)); }

module.exports = { isAllowed, origin, _toMatcher: toMatcher };
