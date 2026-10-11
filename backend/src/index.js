const config = require('./config');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { errorMiddleware } = require('./lib/http');
const { limiter } = require('./lib/rateLimit');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cors({ origin: require('./lib/cors').origin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  // Limite globale par adresse IP, volontairement large : sur les réseaux mobiles,
  // de nombreux abonnés partagent la même IP publique (CGNAT). Les routes
  // sensibles ont en plus leurs propres limites.
  app.use('/api', limiter({ name: 'api', max: 3000, windowMs: 60_000 }));
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Plateforme Défi Yas 2.0
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api', require('./routes/player'));
  app.use('/api/rooms', require('./routes/rooms'));
  app.use('/api/leaderboards', require('./routes/leaderboards'));
  app.use('/api', require('./routes/social'));
  app.use('/api/tournaments', require('./routes/tournaments'));
  app.use('/api/admin', require('./routes/admin'));

  // Quiz « Swipe & Win » (fonctionnalité historique conservée)
  app.use('/api/sessions', require('./routes/sessions'));
  app.use('/api/questions', require('./routes/questions'));
  app.use('/api/prizes', require('./routes/prizes'));
  app.use('/api/leaderboard', require('./routes/leaderboard'));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue', code: 'NOT_FOUND' }));
  app.use(errorMiddleware);
  return app;
}

async function start({ port = config.port, migrate = true } = {}) {
  const pool = require('./db/pool');
  if (migrate) await require('./db/migrate').migrate(pool, { log: () => {} });
  const app = createApp();
  const server = http.createServer(app);
  const io = require('./realtime/socket').attach(server);
  const rooms = require('./realtime/rooms');
  const runtime = require('./realtime/matchRuntime');
  const matchmaking = require('./realtime/matchmaking');
  const jobs = require('./services/jobs');
  await rooms.closeStaleRooms();
  const restored = await runtime.restore();
  if (restored) console.log(`♻️  ${restored} partie(s) restaurée(s) après redémarrage`);
  await require('./services/tournaments').reopenRooms();
  matchmaking.start();
  jobs.start();
  await new Promise(resolve => server.listen(port, resolve));
  const close = async () => {
    jobs.stop();
    matchmaking.stop();
    runtime.shutdown();
    rooms.shutdown();
    await require('./realtime/hub').closeAllPresence();
    io.close();
    await new Promise(resolve => server.close(resolve));
  };
  return { app, server, io, close, port: server.address().port };
}

if (require.main === module) {
  start()
    .then(({ port }) => console.log(`🚀 Défi Yas API sur http://localhost:${port}`))
    .catch((err) => { console.error('Démarrage impossible', err); process.exit(1); });
}

module.exports = { createApp, start };
