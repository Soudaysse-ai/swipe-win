// Démarre un vrai serveur Défi Yas sur une base PostgreSQL de test, et fournit
// des clients HTTP / Socket.IO pour simuler plusieurs joueurs sur plusieurs appareils.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://defiyas:defiyas@localhost:5432/defiyas_test';
process.env.MATCH_COUNTDOWN_MS = process.env.MATCH_COUNTDOWN_MS || '0';
process.env.DISABLE_JOBS = 'true';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.MATCHMAKING_TICK_MS = '100';
process.env.MATCHMAKING_CONFIRM_MS = '3000';
process.env.ROOM_GRACE_MS = '500';
process.env.BOT_THINK_SCALE = process.env.BOT_THINK_SCALE || '0';

const { io: ioClient } = require('socket.io-client');
const pool = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');

let phoneCounter = 0;

async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, { log: () => {} });
}

async function startServer() {
  await resetDb();
  const { start } = require('../../src/index');
  const srv = await start({ port: 0, migrate: false });
  srv.base = `http://localhost:${srv.port}`;
  return srv;
}

async function stopServer(srv) {
  await srv.close();
  await pool.end();
}

async function api(base, method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function registerUser(base, name) {
  phoneCounter += 1;
  const phone = `+2694${String(100000 + phoneCounter)}`;
  const res = await api(base, 'POST', '/api/auth/register', {
    body: { phone, password: 'motdepasse123', username: name, avatar: 'yas-02', acceptTerms: true },
  });
  if (res.status !== 201) throw new Error(`inscription ${name} : ${res.status} ${JSON.stringify(res.data)}`);
  return { ...res.data, phone, name, userId: res.data.user.id };
}

// Client Socket.IO avec mémoire des événements reçus.
function connect(base, token) {
  const socket = ioClient(base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
  const received = [];
  const waiters = [];
  socket.onAny((event, payload) => {
    received.push({ event, payload });
    for (const w of [...waiters]) {
      if (w.event === event && w.pred(payload)) {
        waiters.splice(waiters.indexOf(w), 1);
        clearTimeout(w.timer);
        w.resolve(payload);
      }
    }
  });
  const client = {
    socket, received,
    ready: new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    }),
    emit: (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve)),
    // Attend un événement (y compris déjà reçu si `past` est vrai).
    waitFor: (event, pred = () => true, { timeout = 5000, past = false } = {}) => {
      if (past) {
        const hit = [...received].reverse().find(r => r.event === event && pred(r.payload));
        if (hit) return Promise.resolve(hit.payload);
      }
      return new Promise((resolve, reject) => {
        const w = { event, pred, resolve };
        w.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(new Error(`timeout en attendant ${event}`));
        }, timeout);
        waiters.push(w);
      });
    },
    last: (event) => [...received].reverse().find(r => r.event === event)?.payload,
    close: () => socket.close(),
  };
  return client;
}

async function setGameConfig(gameId, patch) {
  await pool.query(`UPDATE games SET config = config || $2::jsonb WHERE id = $1`, [gameId, JSON.stringify(patch)]);
  require('../../src/realtime/matchRuntime').clearGameCache();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { startServer, stopServer, api, registerUser, connect, setGameConfig, sleep, pool, resetDb };
