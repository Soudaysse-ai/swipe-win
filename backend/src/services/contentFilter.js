// Filtrage de contenu pour le chat et les pseudonymes.
// Liste volontairement courte et extensible (BLOCKED_WORDS en variable d'env,
// séparés par des virgules). La comparaison ignore accents, casse et
// substitutions courantes (0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s).
const BASE_WORDS = [
  'connard', 'connasse', 'salope', 'pute', 'putain', 'encule', 'enculé', 'batard', 'bâtard',
  'merde', 'nique', 'niquer', 'ntm', 'fdp', 'pd', 'tg', 'ta gueule', 'abruti', 'débile', 'debile',
  'con', 'conne', 'bouffon', 'negro', 'nègre', 'negre', 'fuck', 'shit', 'bitch', 'asshole', 'dick',
  'nazi', 'hitler', 'porn', 'porno', 'sexe', 'sex',
];

const extra = (process.env.BLOCKED_WORDS || '').split(',').map(w => w.trim()).filter(Boolean);

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/5/g, 's').replace(/@/g, 'a').replace(/\$/g, 's');
}

const WORDS = [...new Set([...BASE_WORDS, ...extra].map(normalize))];
const PATTERNS = WORDS.map(w => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z])`, 'i'));

function containsBlocked(text) {
  const n = normalize(text);
  return PATTERNS.some(p => p.test(n));
}

// Remplace chaque mot interdit par des étoiles ; renvoie { text, filtered }.
function filterText(text) {
  const tokens = text.split(/(\s+)/);
  let filtered = false;
  const out = tokens.map(tok => {
    if (/^\s+$/.test(tok) || !tok) return tok;
    if (containsBlocked(tok)) { filtered = true; return '*'.repeat(Math.min(tok.length, 8)); }
    return tok;
  }).join('');
  // Expressions de plusieurs mots
  if (!filtered && containsBlocked(text)) return { text: '***', filtered: true };
  return { text: out, filtered };
}

// Supprime les caractères de contrôle et réduit les espaces.
function sanitize(text, maxLen) {
  return String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

module.exports = { filterText, containsBlocked, sanitize, normalize };
