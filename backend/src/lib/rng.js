// Générateurs aléatoires. En production : crypto.randomInt (imprévisible).
// En test : générateur déterministe à graine, pour rejouer des scénarios.
const crypto = require('crypto');

const secureRng = {
  // entier dans [0, n)
  int: (n) => crypto.randomInt(n),
};

function seededRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (n) => Math.floor(next() * n) };
}

// Rng qui renvoie une séquence imposée (tests de règles précises : dés, etc.).
function scriptedRng(values, fallback = seededRng(7)) {
  const queue = [...values];
  return { int: (n) => (queue.length ? queue.shift() % n : fallback.int(n)), queue };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { secureRng, seededRng, scriptedRng, shuffle };
