// Test de charge indicatif : N paires de joueurs (vrais clients Socket.IO)
// enchaînent des parties de Yas Connect pendant D secondes contre un serveur
// lancé sur la base de test. Mesure la latence d'acquittement des coups.
//
//   PAIRS=100 DURATION=30 node scripts/loadtest.js
//
// ⚠️ Résultat valable uniquement pour la machine qui exécute le test (serveur,
// base et clients sur le même hôte). Ne pas en déduire une capacité de
// production sans test sur l'infrastructure cible.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://defiyas:defiyas@localhost:5432/defiyas_test';
process.env.MATCH_COUNTDOWN_MS = '0';
process.env.DISABLE_JOBS = 'true';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX || '20';
const { io } = require('socket.io-client');
const pool = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');

const PAIRS = parseInt(process.env.PAIRS || '50', 10);
const DURATION = parseInt(process.env.DURATION || '20', 10) * 1000;

const latencies = [];
let errors = 0;
let matches = 0;
let moves = 0;
const stuck = [];

const emit = (s, ev, p) => new Promise((resolve) => {
  const t0 = performance.now();
  s.timeout(10000).emit(ev, p, (err, res) => {
    if (ev === 'match:action') latencies.push(performance.now() - t0);
    if (err || !res?.ok) errors++;
    resolve(res || {});
  });
});

async function register(base, i) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: `+2694${String(100000 + i)}`, password: 'motdepasse123', username: `charge${i}`, acceptTerms: true }),
  });
  return (await res.json()).token;
}

function client(base, token) {
  const s = io(base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
  s.states = [];
  s.on('match:state', st => s.states.push(st));
  return new Promise(r => s.on('connect', () => r(s)));
}

async function pairLoop(a, b, until) {
  while (Date.now() < until) {
    const created = await emit(a, 'room:create', { gameId: 'connect' });
    await emit(b, 'room:join', { code: created.room?.code });
    const started = new Promise((r) => {
      const f = (st) => { if (st.status === 'IN_PROGRESS' && st.view && st.version === 1) { a.off('match:state', f); clearTimeout(t); r(st); } };
      const t = setTimeout(() => { a.off('match:state', f); r(null); }, 10000);
      a.on('match:state', f);
    });
    const r1 = await emit(a, 'room:ready', {}); const r2 = await emit(b, 'room:ready', {});
    let st = await started;
    if (!st) { stuck.push({ created: created.ok, r1: r1.code, r2: r2.code }); await emit(a, 'room:leave', {}); await emit(b, 'room:leave', {}); continue; }
    // jeu simple : chaque joueur remplit sa propre colonne (victoire au 7e coup)
    const first = st.view.turn;
    const order = [[first, 0], [null, 1], [first, 0], [null, 1], [first, 0], [null, 1], [first, 0]];
    for (const [u, col] of order) {
      const who = u ? (a.uid === u ? a : b) : (a.uid === first ? b : a);
      const res = await emit(who, 'match:action', { matchId: st.matchId, version: st.version, action: { type: 'drop', col } });
      moves++;
      st = { ...st, version: res.version ?? st.version + 1 };
    }
    matches++;
    await emit(a, 'room:leave', {}); await emit(b, 'room:leave', {});
  }
}

(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, { log: () => {} });
  const { start } = require('../src/index');
  const srv = await start({ port: 0, migrate: false });
  const base = `http://localhost:${srv.port}`;
  console.log(`Serveur prêt, création de ${PAIRS * 2} joueurs…`);
  const tokens = await Promise.all(Array.from({ length: PAIRS * 2 }, (_, i) => register(base, i)));
  const sockets = await Promise.all(tokens.map(t => client(base, t)));
  const me = await Promise.all(tokens.map(t => fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json())));
  sockets.forEach((s, i) => { s.uid = me[i].user.id; });
  console.log(`${sockets.length} clients connectés. Jeu pendant ${DURATION / 1000} s…`);
  const t0 = Date.now();
  const until = t0 + DURATION;
  await Promise.all(Array.from({ length: PAIRS }, (_, i) => pairLoop(sockets[2 * i], sockets[2 * i + 1], until)));
  const elapsed = (Date.now() - t0) / 1000;
  latencies.sort((x, y) => x - y);
  const q = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]?.toFixed(1);
  const results = await pool.query('SELECT COUNT(*)::int AS n FROM match_results');
  console.log(JSON.stringify({
    clients: sockets.length, durationS: elapsed.toFixed(1), matchesPlayed: matches, matchResultsInDb: results.rows[0].n,
    moves, movesPerSecond: (moves / elapsed).toFixed(1), errors, startFailures: stuck.length, firstFailure: stuck[0] || null,
    ackLatencyMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: latencies[latencies.length - 1]?.toFixed(1) },
  }, null, 2));
  sockets.forEach(s => s.close());
  await srv.close();
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
