// API joueur : jeux, accueil, profils, notifications.
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const profiles = require('../services/profiles');
const notifications = require('../services/notifications');
const friends = require('../services/friends');
const lb = require('../services/leaderboards');
const analytics = require('../services/analytics');
const chat = require('../services/chat');
const features = require('../services/features');
const rooms = require('../realtime/rooms');
const runtime = require('../realtime/matchRuntime');
const matchmaking = require('../realtime/matchmaking');
const { activityOf } = require('../realtime/socket');
const { getEngine } = require('../games');
const { requirePlayer, optionalPlayer } = require('../middleware/playerAuth');
const { validateUsername, normalizeUsername } = require('../services/authService');
const { isValidAvatar } = require('../services/avatars');
const { sanitize, filterText } = require('../services/contentFilter');
const bcrypt = require('bcryptjs');
const passwordReset = require('../services/passwordReset');
const { ah } = require('../lib/http');
const { bad, notFound, conflict } = require('../lib/errors');

// Joueurs actuellement occupés par jeu : salons, parties et files d'attente.
function playersOnlineByGame() {
  const counts = {};
  const seen = {};
  const add = (gameId, userId) => {
    seen[gameId] = seen[gameId] || new Set();
    seen[gameId].add(userId);
  };
  for (const r of rooms.allRooms()) r.players.forEach(p => add(r.gameId, p.userId));
  // Les bots des parties d'entraînement ne sont pas des joueurs : ils ne sont pas comptés.
  for (const m of runtime.liveMatches()) m.players.forEach(p => { if (!p.isBot) add(m.gameId, p.userId); });
  for (const [gameId, q] of matchmaking._internals.queues) q.forEach(e => add(gameId, e.userId));
  for (const [g, set] of Object.entries(seen)) counts[g] = set.size;
  return counts;
}

async function gamesList() {
  const { rows } = await pool.query(
    `SELECT id, name, description, min_players, max_players, rating_system, is_active, config
       FROM games ORDER BY sort_order`);
  const online = playersOnlineByGame();
  return rows.filter(g => getEngine(g.id)).map(g => ({
    id: g.id, name: g.name, description: g.description, minPlayers: g.min_players, maxPlayers: g.max_players,
    ratingSystem: g.rating_system, isActive: g.is_active, playersOnline: online[g.id] || 0, config: g.config,
  }));
}

router.get('/games', optionalPlayer, ah(async (_req, res) => {
  res.json({ games: await gamesList() });
}));

router.get('/games/:id', optionalPlayer, ah(async (req, res) => {
  const game = (await gamesList()).find(g => g.id === req.params.id);
  if (!game) throw notFound('Jeu introuvable');
  if (req.user) analytics.track('game_opened', { userId: req.user.userId, gameId: game.id });
  const top = await lb.getBoard({ gameId: game.id, period: 'season', limit: 3, userId: req.user?.userId });
  res.json({ game, top3: top.entries, me: top.me, publicRooms: rooms.listPublic(game.id) });
}));

// Fonctionnalités activées depuis le back-office (ex. « Swipe & gagne »).
router.get('/features', ah(async (_req, res) => {
  res.json({ features: await features.publicFeatures() });
}));

router.get('/chat/presets', (_req, res) => {
  res.json({ quick: chat.QUICK_MESSAGES, reactions: chat.REACTIONS });
});

// Accueil : tout ce qu'il faut pour l'écran principal en un appel.
router.get('/home', requirePlayer, ah(async (req, res) => {
  const userId = req.user.userId;
  const [me, games, friendList, notif, weekTop, tournaments] = await Promise.all([
    profiles.me(userId),
    gamesList(),
    friends.list(userId, activityOf),
    notifications.list(userId, { limit: 20 }),
    lb.getBoard({ period: 'week', limit: 3 }),
    pool.query(
      `SELECT t.id, t.name, t.game_id, t.status, t.starts_at, t.ends_at, t.max_participants,
              (SELECT COUNT(*)::int FROM tournament_players tp WHERE tp.tournament_id = t.id) AS participants
         FROM tournaments t WHERE t.status IN ('registration','in_progress') AND t.published_at IS NOT NULL
        ORDER BY t.starts_at LIMIT 5`),
  ]);
  const invites = notif.notifications.filter(n => n.type === 'invite' && !n.read_at && Date.now() - new Date(n.created_at) < 15 * 60_000);
  res.json({
    me, games,
    friendsOnline: friendList.filter(f => f.online),
    friendsCount: friendList.length,
    invites, unreadNotifications: notif.unread,
    tournaments: tournaments.rows,
    weekTop3: weekTop.entries,
    session: { matchId: runtime.userMatchId(userId), room: rooms.roomOf(userId), matchmaking: matchmaking.statusOf(userId) },
  });
}));

router.get('/players/me', requirePlayer, ah(async (req, res) => {
  res.json({ player: await profiles.me(req.user.userId) });
}));

router.get('/players/me/stats', requirePlayer, ah(async (req, res) => {
  res.json({ progress: await profiles.globalSummary(req.user.userId), games: await profiles.gameStats(req.user.userId) });
}));

router.get('/players/me/matches', requirePlayer, ah(async (req, res) => {
  res.json({ matches: await profiles.matchHistory(req.user.userId, req.query) });
}));

router.patch('/players/me', requirePlayer, ah(async (req, res) => {
  const { avatar, username, bio, showStats, allowInvites, email, currentPassword } = req.body || {};
  const userId = req.user.userId;
  if (email !== undefined) {
    // Changer l'adresse de récupération exige le mot de passe actuel.
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!(await bcrypt.compare(String(currentPassword || ''), rows[0].password_hash))) {
      throw bad('PASSWORD_WRONG', 'Mot de passe actuel incorrect');
    }
    const value = String(email || '').trim() ? passwordReset.normalizeEmail(email) : null;
    if (!value && require('../config').emailRequired) throw bad('EMAIL_REQUIRED', 'Adresse e-mail requise');
    if (value) {
      const taken = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2', [value, userId]);
      if (taken.rows.length) throw conflict('EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée');
    }
    await pool.query('UPDATE users SET email = $2 WHERE id = $1', [userId, value]);
  }
  if (avatar !== undefined) {
    if (!isValidAvatar(avatar)) throw bad('AVATAR_INVALID', 'Avatar invalide');
    await pool.query('UPDATE users SET avatar = $2 WHERE id = $1', [userId, avatar]);
  }
  if (username !== undefined) {
    const name = normalizeUsername(username);
    validateUsername(name);
    const taken = await pool.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2', [name, userId]);
    if (taken.rows.length) throw conflict('USERNAME_TAKEN', 'Ce pseudonyme est déjà pris');
    await pool.query('UPDATE users SET username = $2 WHERE id = $1', [userId, name]);
  }
  if (bio !== undefined) {
    const clean = filterText(sanitize(bio, 160)).text;
    await pool.query('UPDATE profiles SET bio = $2, updated_at = NOW() WHERE user_id = $1', [userId, clean || null]);
  }
  if (typeof showStats === 'boolean') await pool.query('UPDATE profiles SET show_stats = $2 WHERE user_id = $1', [userId, showStats]);
  if (typeof allowInvites === 'boolean') await pool.query('UPDATE profiles SET allow_invites = $2 WHERE user_id = $1', [userId, allowInvites]);
  require('../services/authService').invalidateUserCache(userId);
  res.json({ player: await profiles.me(userId) });
}));

router.get('/players/:id/public', optionalPlayer, ah(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('Joueur introuvable');
  res.json({ player: await profiles.publicProfile(req.params.id, req.user?.userId) });
}));

router.get('/players/:id/matches', optionalPlayer, ah(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('Joueur introuvable');
  const p = await profiles.publicProfile(req.params.id, req.user?.userId);
  if (p.statsHidden) return res.json({ matches: [] });
  res.json({ matches: await profiles.matchHistory(req.params.id, { ...req.query, limit: Math.min(parseInt(req.query.limit, 10) || 10, 20) }) });
}));

router.get('/notifications', requirePlayer, ah(async (req, res) => {
  res.json(await notifications.list(req.user.userId));
}));

router.post('/notifications/read', requirePlayer, ah(async (req, res) => {
  const ids = req.body?.ids === 'all' ? 'all' : (Array.isArray(req.body?.ids) ? req.body.ids.filter(i => /^[0-9a-f-]{36}$/i.test(i)) : []);
  await notifications.markRead(req.user.userId, ids);
  res.json({ ok: true });
}));

module.exports = router;
