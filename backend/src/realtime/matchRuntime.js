// Runtime multijoueur : le serveur est l'autorité unique sur l'état des parties.
//
// Pour chaque action :
//  1. le joueur envoie une commande (commandId unique + numéro de version attendu) ;
//  2. le joueur est authentifié (socket) et l'action validée par le moteur du jeu ;
//  3. le nouvel état et l'événement sont enregistrés en base (match_events, matches.state) ;
//  4. le nouvel état est diffusé aux participants (chaque joueur reçoit SA vue).
//
// Toutes les opérations d'un même match (actions, chronomètres, déconnexions)
// passent par une file séquentielle : pas de course possible entre deux actions.
const crypto = require('crypto');
const pool = require('../db/pool');
const hub = require('./hub');
const { getEngine } = require('../games');
const { EngineError } = require('../games/engineError');
const { secureRng } = require('../lib/rng');
const results = require('../services/results');
const analytics = require('../services/analytics');
const leaderboards = require('../services/leaderboards');
const bots = require('../games/bots');

const COUNTDOWN_MS = () => parseInt(process.env.MATCH_COUNTDOWN_MS || '3000', 10);
// Temps de réflexion simulé des bots (1 = normal ; 0 en test pour des parties rapides).
const BOT_THINK_SCALE = () => Number(process.env.BOT_THINK_SCALE ?? 1);
// Fins de partie « anormales » : la partie n'est validée que si les joueurs ont réellement joué.
const ABNORMAL_END = new Set(['timeout', 'forfeit', 'resign', 'disconnect', 'timeouts_limit']);

const live = new Map();        // matchId -> LiveMatch
const userMatch = new Map();   // userId -> matchId
const hooks = { ended: [] };
const gameCache = new Map();

async function loadGame(gameId) {
  const hit = gameCache.get(gameId);
  if (hit && Date.now() - hit.at < 60_000) return hit.game;
  const { rows } = await pool.query(
    `SELECT g.*, v.version AS rules_version FROM games g
       LEFT JOIN game_rules_versions v ON v.game_id = g.id AND v.is_current
      WHERE g.id = $1`, [gameId]);
  if (!rows[0]) return null;
  gameCache.set(gameId, { at: Date.now(), game: rows[0] });
  return rows[0];
}

function clearGameCache() { gameCache.clear(); }

function onMatchEnded(fn) { hooks.ended.push(fn); }

function enqueue(m, fn) {
  const run = m.queue.then(fn);
  m.queue = run.catch((err) => {
    if (err?.stale) { console.warn(`match ${m.id}: état modifié par une autre instance, resynchronisé`); return; }
    console.error(`match ${m.id}:`, err); hub.countError();
  });
  return run;
}

const player = (m, userId) => m.players.find(p => p.userId === userId);
const humans = (m) => m.players.filter(p => !p.isBot);
const humanIds = (m) => humans(m).map(p => p.userId);
const ctx = (m) => ({ rng: secureRng, now: Date.now(), config: m.config });

function publicPlayers(m) {
  return m.players.map(p => ({
    userId: p.userId, username: p.username, avatar: p.avatar, seat: p.seat,
    connected: p.connected, forfeited: !!p.forfeited, isBot: !!p.isBot,
  }));
}

function snapshotFor(m, userId) {
  return {
    matchId: m.id, gameId: m.gameId, roomId: m.roomId, version: m.version, status: m.status,
    mode: m.mode, training: m.mode === 'bot',
    players: publicPlayers(m), startedAt: m.startedAt, startsAt: m.startsAt || null,
    view: m.state ? m.engine.view(m.state, userId) : null,
    serverNow: Date.now(),
    reconnectSeconds: m.config.reconnectSeconds || 60,
  };
}

function broadcastState(m) {
  for (const p of humans(m)) hub.emitToUser(p.userId, 'match:state', snapshotFor(m, p.userId));
}

function broadcastEvents(m, events) {
  for (const ev of events || []) {
    const msg = { matchId: m.id, version: m.version, type: ev.type, payload: ev.payload || {} };
    if (ev.to) { if (!bots.isBotId(ev.to)) hub.emitToUser(ev.to, 'game:event', msg); } else hub.emitToUsers(humanIds(m), 'game:event', msg);
  }
}

async function setStatus(m, status) {
  if (m.status === status) return;
  m.status = status;
  await pool.query('UPDATE matches SET status = $2 WHERE id = $1', [m.id, status]);
}

function computeStatus(m) {
  if (m.status === 'COMPLETED' || m.status === 'CANCELLED' || m.status === 'READY') return m.status;
  return m.players.some(p => !p.connected && !p.forfeited) ? 'RECONNECTING' : 'IN_PROGRESS';
}

// Enregistre l'événement + le nouvel état, puis met à jour la mémoire et diffuse.
async function commit(m, out, evt) {
  const nextVersion = m.version + 1;
  const status = computeStatus(m);
  try {
    await pool.tx(async (db) => {
      await db.query(
        `INSERT INTO match_events (match_id, seq, user_id, type, payload, command_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [m.id, nextVersion, evt.userId || null, evt.type, JSON.stringify({ ...evt.payload, events: (out.events || []).filter(e => !e.to).map(e => e.type) }), evt.commandId || null]
      );
      await db.query('UPDATE matches SET state = $2, state_version = $3, status = $4 WHERE id = $1',
        [m.id, JSON.stringify(out.state), nextVersion, status]);
    });
  } catch (err) {
    // Une autre instance (ex. ancienne version pendant un déploiement) a fait avancer
    // la partie : on recharge l'état officiel au lieu de rester désynchronisé.
    if (err.code === '23505' && /match_events/.test(err.constraint || '')) {
      await resync(m);
      throw Object.assign(new Error('STALE_MATCH'), { stale: true });
    }
    throw err;
  }
  m.state = out.state;
  m.version = nextVersion;
  m.status = status;
  m.lastCommitAt = Date.now();
  broadcastEvents(m, out.events);
  broadcastState(m);
  const res = m.engine.result(m.state) || trainingAbandon(m, evt);
  if (res) await finish(m, res);
  else { schedule(m); scheduleBots(m); }
}

// Recharge l'état officiel d'une partie depuis la base (après un conflit d'écriture).
async function resync(m) {
  clearTimeout(m.timer);
  clearTimeout(m.botTimer);
  const { rows } = await pool.query('SELECT state, state_version, status FROM matches WHERE id = $1', [m.id]);
  const row = rows[0];
  if (!row || row.status === 'COMPLETED' || row.status === 'CANCELLED') { cleanup(m); return; }
  m.state = row.state;
  m.version = row.state_version;
  broadcastState(m);
  schedule(m);
  scheduleBots(m);
}

// Entraînement à plusieurs bots : si le joueur abandonne (ou ne revient pas), la
// partie s'arrête aussitôt au lieu de laisser les bots finir entre eux.
function trainingAbandon(m, evt) {
  if (m.mode !== 'bot' || humans(m).some(p => !p.forfeited)) return null;
  const botCount = m.players.filter(p => p.isBot).length;
  return {
    isDraw: false, reason: evt.type === 'resign' ? 'resign' : 'forfeit',
    placements: m.players.map(p => (p.isBot
      ? { userId: p.userId, place: 1, outcome: 'win', stats: {} }
      : { userId: p.userId, place: botCount + 1, outcome: 'loss', stats: {} })),
  };
}

function schedule(m) {
  clearTimeout(m.timer);
  if (m.status === 'COMPLETED' || m.status === 'CANCELLED' || !m.state) return;
  const dl = m.engine.deadline(m.state);
  if (!dl) return;
  const delay = Math.max(0, dl.at - Date.now());
  m.timer = setTimeout(() => enqueue(m, () => onDeadline(m, dl)), delay);
}

async function onDeadline(m, dl) {
  if (m.status === 'COMPLETED' || m.status === 'CANCELLED') return;
  const cur = m.engine.deadline(m.state);
  if (!cur || cur.at !== dl.at) return schedule(m);
  if (Date.now() < cur.at) return schedule(m);
  // Tolérance réseau : si le joueur concerné a subi une coupure reconnue par le
  // serveur pendant ce tour, on lui accorde un court délai supplémentaire (une fois par tour).
  const tol = (m.config.networkToleranceSeconds || 0) * 1000;
  if (tol && m.toleranceVersion !== m.version) {
    const hit = cur.userIds.some((u) => {
      const p = player(m, u);
      return p && (!p.connected || (p.lastDisconnectAt && p.lastDisconnectAt >= m.lastCommitAt));
    });
    if (hit) {
      m.toleranceVersion = m.version;
      clearTimeout(m.timer);
      m.timer = setTimeout(() => enqueue(m, () => onDeadline(m, dl)), tol);
      return;
    }
  }
  const out = m.engine.timeout(m.state, ctx(m));
  await commit(m, out, { type: 'timeout', payload: { userIds: cur.userIds } });
}

// Parties d'entraînement : programme la prochaine action d'un bot. Le bot décide
// à partir de SA vue (comme un joueur), après un court temps de réflexion simulé.
function botDecision(m, p, now) {
  return bots.decide(m.gameId, m.engine.view(m.state, p.userId), p.userId, { level: p.level, rng: secureRng, now });
}

function scheduleBots(m) {
  clearTimeout(m.botTimer);
  m.botTimer = null;
  if (m.mode !== 'bot' || !m.state || m.status === 'COMPLETED' || m.status === 'CANCELLED') return;
  const now = Date.now();
  let next = null;
  for (const p of m.players) {
    if (!p.isBot || p.forfeited) continue;
    const d = botDecision(m, p, now);
    if (!d) continue;
    const [min, max] = d.think || [600, 1200];
    const at = Math.max(now, d.notBefore || 0) + Math.round((min + secureRng.int(max - min + 1)) * BOT_THINK_SCALE());
    if (!next || at < next.at) next = { at, botId: p.userId };
  }
  if (!next) return;
  const version = m.version;
  m.botTimer = setTimeout(() => enqueue(m, () => botAct(m, next.botId, version)), Math.max(0, next.at - now));
}

async function botAct(m, botId, version) {
  // Une action a eu lieu entre-temps : le commit a déjà reprogrammé les bots.
  if (m.version !== version || !m.state || m.status === 'COMPLETED' || m.status === 'CANCELLED') return;
  const p = player(m, botId);
  if (!p || p.forfeited) return;
  const now = Date.now();
  const d = botDecision(m, p, now);
  if (!d || (d.notBefore && now < d.notBefore)) { scheduleBots(m); return; }
  let out;
  try {
    out = m.engine.apply(m.state, botId, d.action, ctx(m));
  } catch (err) {
    if (!(err instanceof EngineError)) throw err;
    // Ne devrait jamais arriver : le chronomètre du tour prend alors le relais.
    console.error(`match ${m.id} : action du bot ${botId} refusée (${err.code})`);
    return;
  }
  await commit(m, out, { type: 'action', payload: { action: d.action, bot: botId } });
}

async function startPlay(m) {
  if (m.status !== 'READY') return;
  const c = ctx(m);
  m.state = m.engine.init({ players: m.players.map(p => ({ userId: p.userId, seat: p.seat })), ...c });
  m.startedAt = c.now;
  m.status = computeStatus({ ...m, status: 'IN_PROGRESS' });
  await pool.tx(async (db) => {
    await db.query(
      `UPDATE matches SET status = $2, started_at = to_timestamp($3 / 1000.0), state = $4, state_version = 1 WHERE id = $1`,
      [m.id, m.status, c.now, JSON.stringify(m.state)]);
    await db.query(
      `INSERT INTO match_events (match_id, seq, type, payload) VALUES ($1, 1, 'match_started', $2)`,
      [m.id, JSON.stringify({ players: m.players.map(p => p.userId) })]);
  });
  m.version = 1;
  m.lastCommitAt = Date.now();
  broadcastState(m);
  schedule(m);
  scheduleBots(m);
  for (const p of humans(m)) analytics.track('match_started', { userId: p.userId, gameId: m.gameId, matchId: m.id, properties: { mode: m.mode, players: m.players.length } });
}

/**
 * Crée un match pour des joueurs réunis dans un salon. Le match passe par un
 * compte à rebours (READY) puis démarre (IN_PROGRESS).
 * users : [{ userId, username, avatar, isBot?, level? }] dans l'ordre des sièges.
 * Partie d'entraînement (mode 'bot') : les bots ne sont pas des comptes joueurs ;
 * ils sont enregistrés dans matches.bots, jamais dans match_players.
 */
async function createMatch({ gameId, roomId = null, users, mode = 'room', tournamentMatchId = null }) {
  const game = await loadGame(gameId);
  const engine = getEngine(gameId);
  if (!game || !engine || !game.is_active) throw new EngineError('GAME_UNAVAILABLE', 'Ce jeu n\'est pas disponible');
  if (users.length < engine.minPlayers || users.length > engine.maxPlayers) {
    throw new EngineError('BAD_PLAYER_COUNT', `Ce jeu se joue de ${engine.minPlayers} à ${engine.maxPlayers} joueurs`);
  }
  for (const u of users) {
    if (!u.isBot && userMatch.has(u.userId)) throw new EngineError('ALREADY_IN_MATCH', `${u.username} est déjà en partie`);
  }
  const seated = users.map((u, i) => ({ ...u, seat: i }));
  const botList = seated.filter(u => u.isBot)
    .map(({ userId, username, avatar, seat, level }) => ({ userId, username, avatar, seat, level }));
  const id = crypto.randomUUID();
  await pool.tx(async (db) => {
    await db.query(
      `INSERT INTO matches (id, game_id, room_id, rules_version, status, mode, tournament_match_id, bots)
       VALUES ($1,$2,$3,$4,'READY',$5,$6,$7)`,
      [id, gameId, roomId, game.rules_version || engine.rulesVersion, mode, tournamentMatchId,
        botList.length ? JSON.stringify(botList) : null]);
    for (const u of seated) {
      if (u.isBot) continue;
      await db.query('INSERT INTO match_players (match_id, user_id, seat) VALUES ($1,$2,$3)', [id, u.userId, u.seat]);
    }
  });
  const countdown = COUNTDOWN_MS();
  const m = {
    id, gameId, roomId, mode, tournamentMatchId, engine, config: game.config || {},
    state: null, version: 0, status: 'READY', startsAt: Date.now() + countdown, startedAt: null,
    players: seated.map((u) => {
      const online = u.isBot || hub.isOnline(u.userId);
      return {
        userId: u.userId, username: u.username, avatar: u.avatar, seat: u.seat,
        isBot: !!u.isBot, level: u.isBot ? u.level : undefined,
        connected: online, disconnectedAt: online ? null : Date.now(),
        disconnectedMs: 0, disconnects: 0, graceTimer: null,
      };
    }),
    commands: new Set(), queue: Promise.resolve(), timer: null, botTimer: null, lastCommitAt: Date.now(),
  };
  live.set(id, m);
  for (const uid of humanIds(m)) userMatch.set(uid, id);
  hub.emitToUsers(humanIds(m), 'match:starting', { matchId: id, gameId, roomId, startsAt: m.startsAt });
  broadcastState(m);
  m.timer = setTimeout(() => enqueue(m, () => startPlay(m)), countdown);
  // Un joueur hors ligne au lancement dispose du même délai de grâce.
  for (const p of humans(m)) if (!p.connected) startGrace(m, p);
  return m;
}

async function handleAction(userId, msg = {}) {
  const m = live.get(msg.matchId);
  if (!m) return { ok: false, code: 'MATCH_NOT_FOUND', message: 'Partie introuvable ou terminée' };
  return enqueue(m, async () => {
    const p = player(m, userId);
    if (!p) return { ok: false, code: 'NOT_PLAYER', message: 'Vous ne jouez pas dans cette partie' };
    if (m.status === 'COMPLETED' || m.status === 'CANCELLED') return { ok: false, code: 'MATCH_OVER', message: 'La partie est terminée' };
    if (m.status === 'READY' || !m.state) return { ok: false, code: 'NOT_STARTED', message: 'La partie n\'a pas encore commencé' };
    if (p.forfeited) return { ok: false, code: 'FORFEITED', message: 'Vous avez quitté cette partie' };
    const key = msg.commandId ? `${userId}:${msg.commandId}` : null;
    if (key && m.commands.has(key)) return { ok: true, duplicate: true, version: m.version };
    // Les actions indépendantes de l'état du plateau (ex. choix d'avant-match) ne sont
    // pas refusées quand l'adversaire a joué entre-temps.
    const versionFree = (m.engine.versionFreeActions || []).includes(msg.action?.type);
    if (msg.version != null && msg.version !== m.version && !versionFree) {
      hub.emitToUser(userId, 'match:state', snapshotFor(m, userId));
      return { ok: false, code: 'STALE_VERSION', message: 'État désynchronisé, resynchronisation…', version: m.version };
    }
    let out;
    try {
      out = m.engine.apply(m.state, userId, msg.action, ctx(m));
    } catch (err) {
      if (err instanceof EngineError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }
    try {
      await commit(m, out, { type: 'action', userId, payload: { action: msg.action }, commandId: msg.commandId });
    } catch (err) {
      if (err.stale) return { ok: false, code: 'STALE_VERSION', message: 'État désynchronisé, resynchronisation…', version: m.version };
      throw err;
    }
    if (key) {
      m.commands.add(key);
      if (m.commands.size > 1000) m.commands.delete(m.commands.values().next().value);
    }
    return { ok: true, version: m.version };
  });
}

function startGrace(m, p) {
  clearTimeout(p.graceTimer);
  const ms = (m.config.reconnectSeconds || 60) * 1000;
  p.graceTimer = setTimeout(() => enqueue(m, () => onGraceExpired(m, p.userId)), ms);
}

async function onGraceExpired(m, userId) {
  const p = player(m, userId);
  if (!p || p.connected || p.forfeited || m.status === 'COMPLETED' || m.status === 'CANCELLED') return;
  if (m.status === 'READY' || !m.state) {
    // Joueur jamais revenu avant le coup d'envoi : partie annulée.
    return cancelLocked(m, 'player_absent');
  }
  p.forfeited = true;
  const out = m.engine.forfeit(m.state, userId, ctx(m));
  hub.emitToUsers(humanIds(m), 'player:forfeited', { matchId: m.id, userId, reason: 'disconnect' });
  await commit(m, out, { type: 'forfeit', userId, payload: { reason: 'disconnect' } });
}

// Appelé quand toutes les connexions d'un joueur sont fermées.
function disconnect(userId) {
  const m = live.get(userMatch.get(userId));
  if (!m) return null;
  return enqueue(m, async () => {
    const p = player(m, userId);
    if (!p || !p.connected || p.forfeited) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    p.lastDisconnectAt = p.disconnectedAt;
    p.disconnects += 1;
    pool.query('UPDATE match_players SET disconnects = disconnects + 1 WHERE match_id = $1 AND user_id = $2', [m.id, userId]).catch(() => {});
    await setStatus(m, computeStatus(m));
    const graceSeconds = m.config.reconnectSeconds || 60;
    hub.emitToUsers(humanIds(m).filter(u => u !== userId), 'player:disconnected',
      { matchId: m.id, userId, graceSeconds, until: Date.now() + graceSeconds * 1000 });
    broadcastState(m);
    startGrace(m, p);
  });
}

// Appelé à chaque nouvelle connexion : restaure la partie en cours éventuelle.
function reconnect(userId) {
  const m = live.get(userMatch.get(userId));
  if (!m) return null;
  return enqueue(m, async () => {
    const p = player(m, userId);
    if (!p) return;
    if (!p.connected) {
      p.connected = true;
      p.disconnectedMs += Date.now() - (p.disconnectedAt || Date.now());
      p.disconnectedAt = null;
      clearTimeout(p.graceTimer);
      pool.query('UPDATE match_players SET disconnected_ms = $3 WHERE match_id = $1 AND user_id = $2', [m.id, userId, p.disconnectedMs]).catch(() => {});
      await setStatus(m, computeStatus(m));
      hub.emitToUsers(humanIds(m).filter(u => u !== userId), 'player:reconnected', { matchId: m.id, userId });
      broadcastState(m);
    } else {
      hub.emitToUser(userId, 'match:state', snapshotFor(m, userId));
    }
  });
}

function resign(userId, matchId) {
  const m = live.get(matchId);
  if (!m) return Promise.resolve({ ok: false, code: 'MATCH_NOT_FOUND' });
  return enqueue(m, async () => {
    const p = player(m, userId);
    if (!p || p.forfeited) return { ok: false, code: 'NOT_PLAYER' };
    if (m.status === 'COMPLETED' || m.status === 'CANCELLED') return { ok: false, code: 'MATCH_OVER' };
    if (!m.state) {
      await cancelLocked(m, 'resigned_before_start');
      return { ok: true };
    }
    p.forfeited = true;
    const out = m.engine.forfeit(m.state, userId, ctx(m));
    await commit(m, out, { type: 'resign', userId, payload: {} });
    return { ok: true };
  });
}

function activeMsOf(m, p, endedAt) {
  const total = endedAt - (m.startedAt || endedAt);
  const offline = p.disconnectedMs + (p.connected || !p.disconnectedAt ? 0 : endedAt - p.disconnectedAt);
  return Math.max(0, total - offline);
}

async function finish(m, res) {
  clearTimeout(m.timer);
  clearTimeout(m.botTimer);
  for (const p of m.players) clearTimeout(p.graceTimer);
  const endedAt = Date.now();
  // Entraînement contre des bots : jamais comptabilisé (ni XP, ni cote, ni points, ni badges).
  const training = m.mode === 'bot';
  const minActions = m.config.minActionsForValid ?? 2;
  const engaged = m.players.filter(p => m.engine.actionsCount(m.state, p.userId) >= minActions).length;
  const isValid = !training && (!ABNORMAL_END.has(res.reason) || (m.players.length > 2 ? engaged >= 2 : engaged === 2));
  const activeMs = Object.fromEntries(m.players.map(p => [p.userId, activeMsOf(m, p, endedAt)]));
  const durationMs = endedAt - (m.startedAt || endedAt);
  m.status = 'COMPLETED';
  await pool.query(
    `UPDATE matches SET status = 'COMPLETED', ended_at = to_timestamp($2 / 1000.0), result = $3, end_reason = $4, is_valid = $5
      WHERE id = $1`,
    [m.id, endedAt, JSON.stringify({ ...res, activeMs, durationMs }), res.reason, isValid]);

  let summary = null;
  if (training) {
    await results.recordTraining({
      matchId: m.id, placements: res.placements.filter(pl => !bots.isBotId(pl.userId)), activeMs,
    }).catch(err => console.error(`historique de l'entraînement ${m.id} non enregistré`, err));
  } else {
    try {
      summary = await results.processMatchResult({
        matchId: m.id, gameId: m.gameId, placements: res.placements, isDraw: res.isDraw,
        isValid, durationMs, activeMs,
      });
    } catch (err) {
      console.error(`résultats du match ${m.id} non traités (seront retraités au redémarrage)`, err);
    }
    leaderboards.invalidate();
  }

  const byUser = Object.fromEntries(m.players.map(p => [p.userId, p]));
  const placements = res.placements.map(pl => ({
    ...pl, username: byUser[pl.userId]?.username, avatar: byUser[pl.userId]?.avatar, isBot: !!byUser[pl.userId]?.isBot,
    ratingBefore: summary?.perPlayer?.[pl.userId]?.ratingBefore ?? null,
    ratingAfter: summary?.perPlayer?.[pl.userId]?.ratingAfter ?? null,
  }));
  const botPlayers = m.players.filter(p => p.isBot);
  const bot = training ? { opponents: botPlayers.length, level: botPlayers[0]?.level || 'normal' } : null;
  for (const p of humans(m)) {
    hub.emitToUser(p.userId, 'match:ended', {
      matchId: m.id, gameId: m.gameId, roomId: m.roomId, isDraw: res.isDraw, reason: res.reason, isValid,
      training, bot, placements, you: summary?.perPlayer?.[p.userId] || null, durationMs,
    });
    analytics.track(isValid ? 'match_completed' : 'match_abandoned', {
      userId: p.userId, gameId: m.gameId, matchId: m.id,
      properties: { placement: res.placements.find(x => x.userId === p.userId)?.place, reason: res.reason, durationMs, mode: m.mode },
    });
  }
  cleanup(m);
  for (const fn of hooks.ended) {
    try { await fn({ match: m, result: res, isValid, summary }); } catch (err) { console.error('hook fin de match', err); }
  }
}

async function cancelLocked(m, reason) {
  clearTimeout(m.timer);
  clearTimeout(m.botTimer);
  for (const p of m.players) clearTimeout(p.graceTimer);
  m.status = 'CANCELLED';
  await pool.query(
    `UPDATE matches SET status = 'CANCELLED', ended_at = NOW(), end_reason = $2, is_valid = false WHERE id = $1`, [m.id, reason]);
  if (m.mode !== 'bot') await results.recordCancelled(m.gameId).catch(() => {});
  for (const p of humans(m)) {
    hub.emitToUser(p.userId, 'match:ended', {
      matchId: m.id, gameId: m.gameId, roomId: m.roomId, cancelled: true, reason, placements: [], training: m.mode === 'bot',
    });
    analytics.track('match_abandoned', { userId: p.userId, gameId: m.gameId, matchId: m.id, properties: { reason, cancelled: true } });
  }
  cleanup(m);
  for (const fn of hooks.ended) {
    try { await fn({ match: m, result: null, cancelled: true }); } catch (err) { console.error('hook fin de match', err); }
  }
}

function cancel(matchId, reason = 'admin') {
  const m = live.get(matchId);
  if (!m) return Promise.resolve(false);
  return enqueue(m, async () => { await cancelLocked(m, reason); return true; });
}

function cleanup(m) {
  live.delete(m.id);
  for (const p of m.players) if (userMatch.get(p.userId) === m.id) userMatch.delete(p.userId);
}

// Au démarrage du serveur : restaure les parties interrompues par un redémarrage.
// Les joueurs sont considérés déconnectés (délai de grâce) et le tour en cours
// repart avec un chronomètre complet : l'interruption n'est pas de leur fait.
async function restore() {
  const { rows } = await pool.query(
    `SELECT m.*, json_agg(json_build_object('userId', mp.user_id, 'seat', mp.seat, 'username', u.username,
              'avatar', u.avatar, 'disconnectedMs', mp.disconnected_ms) ORDER BY mp.seat) AS players
       FROM matches m JOIN match_players mp ON mp.match_id = m.id JOIN users u ON u.id = mp.user_id
      WHERE m.status IN ('READY','IN_PROGRESS','RECONNECTING')
      GROUP BY m.id`);
  let restored = 0;
  for (const row of rows) {
    const engine = getEngine(row.game_id);
    const game = await loadGame(row.game_id);
    if (!engine || !row.state || !engine.resume) {
      await pool.query(`UPDATE matches SET status = 'CANCELLED', ended_at = NOW(), end_reason = 'server_restart', is_valid = false WHERE id = $1`, [row.id]);
      continue;
    }
    const now = Date.now();
    const m = {
      id: row.id, gameId: row.game_id, roomId: null, mode: row.mode, tournamentMatchId: row.tournament_match_id,
      engine, config: game.config || {}, state: engine.resume(row.state, { now, config: game.config || {} }),
      version: row.state_version, status: 'RECONNECTING', startedAt: new Date(row.started_at).getTime(),
      players: [
        ...row.players.map(p => ({
          ...p, connected: false, disconnectedAt: now, disconnectedMs: Number(p.disconnectedMs) || 0, disconnects: 0, graceTimer: null,
          forfeited: false,
        })),
        ...(row.bots || []).map(b => ({
          ...b, isBot: true, connected: true, disconnectedAt: null, disconnectedMs: 0, disconnects: 0, graceTimer: null, forfeited: false,
        })),
      ].sort((a, b) => a.seat - b.seat),
      commands: new Set(), queue: Promise.resolve(), timer: null, botTimer: null, lastCommitAt: now,
    };
    live.set(m.id, m);
    for (const p of humans(m)) { userMatch.set(p.userId, m.id); startGrace(m, p); }
    schedule(m);
    scheduleBots(m);
    restored++;
  }
  await results.reprocessPending();
  return restored;
}

function userMatchId(userId) { return userMatch.get(userId) || null; }
function getLive(matchId) { return live.get(matchId) || null; }
function liveMatches() { return [...live.values()]; }
function snapshot(matchId, userId) {
  const m = live.get(matchId);
  return m && player(m, userId) ? snapshotFor(m, userId) : null;
}

// Arrêt propre (tests / redémarrage) : coupe les minuteurs sans toucher à la base.
function shutdown() {
  for (const m of live.values()) {
    clearTimeout(m.timer);
    clearTimeout(m.botTimer);
    for (const p of m.players) clearTimeout(p.graceTimer);
  }
  live.clear();
  userMatch.clear();
}

module.exports = {
  createMatch, handleAction, disconnect, reconnect, resign, cancel, restore, onMatchEnded,
  userMatchId, getLive, liveMatches, snapshot, shutdown, clearGameCache, loadGame,
};
