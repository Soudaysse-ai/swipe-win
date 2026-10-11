// Profils joueurs (privé et public) et historique des matchs.
const pool = require('../db/pool');
const P = require('./progression');
const { leagues, globalRows } = require('./leaderboards');
const { notFound } = require('../lib/errors');
const { getEngine } = require('../games');

async function gameStats(userId) {
  const [stats, games, lg] = await Promise.all([
    pool.query('SELECT * FROM player_game_stats WHERE user_id = $1', [userId]),
    pool.query('SELECT id, name FROM games ORDER BY sort_order'),
    leagues(),
  ]);
  const byGame = Object.fromEntries(stats.rows.map(r => [r.game_id, r]));
  return games.rows.filter(g => getEngine(g.id)).map((g) => {
    const s = byGame[g.id];
    const rating = s ? Number(s.rating) : 1000;
    return {
      gameId: g.id, name: g.name,
      played: s?.games_played || 0, wins: s?.wins || 0, losses: s?.losses || 0, draws: s?.draws || 0,
      places: [s?.place_1 || 0, s?.place_2 || 0, s?.place_3 || 0, s?.place_4 || 0],
      winRate: s?.games_played ? s.wins / s.games_played : null,
      currentStreak: s?.current_streak || 0, bestStreak: s?.best_streak || 0,
      avgDurationMs: s?.games_played ? Math.round(Number(s.total_duration_ms) / s.games_played) : null,
      avgMoves: s?.games_played ? Math.round(s.total_moves / s.games_played) : null,
      rating: Math.round(rating), peakRating: Math.round(Number(s?.peak_rating || 1000)),
      league: P.leagueFor(rating, lg[g.id]),
      extra: s?.extra || {},
    };
  });
}

async function badges(userId) {
  const { rows } = await pool.query(
    `SELECT b.id, b.name, b.description, b.icon, pb.awarded_at,
            (pb.user_id IS NOT NULL) AS earned
       FROM badges b LEFT JOIN player_badges pb ON pb.badge_id = b.id AND pb.user_id = $1
      WHERE NOT b.retired OR pb.user_id IS NOT NULL
      ORDER BY b.sort_order`, [userId]);
  return rows;
}

async function globalSummary(userId) {
  const { rows } = await pool.query('SELECT * FROM player_global_stats WHERE user_id = $1', [userId]);
  const g = rows[0] || { xp: 0, matches_played: 0, wins: 0, play_time_ms: 0, active_days: 0 };
  const season = await globalRows('season');
  const me = season.find(e => e.userId === userId);
  return {
    ...P.levelProgress(Number(g.xp)),
    matches: g.matches_played, wins: g.wins, playTimeMs: Number(g.play_time_ms), activeDays: g.active_days,
    seasonPoints: me?.value || 0, globalRank: me?.rank || null, rankedPlayers: season.length,
    league: me?.league || 'Bronze',
  };
}

async function me(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, u.phone, u.email, u.created_at, u.legacy_player_id,
            p.bio, p.show_stats, p.allow_invites
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`, [userId]);
  if (!rows[0]) throw notFound('Joueur introuvable');
  const u = rows[0];
  return {
    id: u.id, username: u.username, avatar: u.avatar, phone: u.phone, email: u.email,
    createdAt: u.created_at, bio: u.bio, settings: { showStats: u.show_stats !== false, allowInvites: u.allow_invites !== false },
    legacyLinked: !!u.legacy_player_id,
    progress: await globalSummary(userId),
    games: await gameStats(userId),
    badges: await badges(userId),
    challenge: P.dailyChallenge(require('../lib/time').localDate()),
  };
}

async function publicProfile(userId, viewerId = null) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.avatar, u.created_at, u.status, p.bio, p.show_stats
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`, [userId]);
  const u = rows[0];
  if (!u || u.status === 'deleted' || u.status === 'banned') throw notFound('Joueur introuvable');
  const showStats = u.show_stats !== false || viewerId === userId;
  // Jamais de numéro de téléphone ni de donnée privée dans le profil public.
  return {
    id: u.id, username: u.username, avatar: u.avatar, createdAt: u.created_at, bio: u.bio,
    progress: await globalSummary(userId),
    games: showStats ? await gameStats(userId) : null,
    badges: (await badges(userId)).filter(b => b.earned),
    statsHidden: !showStats,
  };
}

async function matchHistory(userId, { gameId = null, limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT m.id, m.game_id, m.status, m.started_at, m.ended_at, m.end_reason, m.is_valid, m.mode, m.bots,
            me.placement, me.outcome, me.rating_before, me.rating_after, me.stats,
            (SELECT json_agg(json_build_object('userId', u.id, 'username', u.username, 'avatar', u.avatar,
                     'placement', o.placement, 'outcome', o.outcome) ORDER BY o.seat)
               FROM match_players o JOIN users u ON u.id = o.user_id
              WHERE o.match_id = m.id AND o.user_id <> $1) AS opponents
       FROM match_players me JOIN matches m ON m.id = me.match_id
      WHERE me.user_id = $1 AND m.status IN ('COMPLETED','CANCELLED') AND ($2::text IS NULL OR m.game_id = $2)
      ORDER BY m.ended_at DESC NULLS LAST LIMIT $3 OFFSET $4`,
    [userId, gameId, Math.min(parseInt(limit, 10) || 20, 100), parseInt(offset, 10) || 0]);
  return rows.map(r => ({
    matchId: r.id, gameId: r.game_id, status: r.status, startedAt: r.started_at, endedAt: r.ended_at,
    endReason: r.end_reason, isValid: r.is_valid, placement: r.placement, outcome: r.outcome,
    ratingDelta: r.rating_after != null ? Math.round(Number(r.rating_after) - Number(r.rating_before)) : null,
    stats: r.stats, training: r.mode === 'bot',
    opponents: [
      ...(r.opponents || []),
      ...(r.bots || []).map(b => ({ userId: b.userId, username: b.username, avatar: b.avatar, isBot: true })),
    ],
  }));
}

module.exports = { me, publicProfile, matchHistory, gameStats, globalSummary, badges };
