// Statistiques du back-office. Toutes les valeurs sont calculées à partir des
// données réelles (aucune donnée fictive).
//
// Définitions (cahier des charges §16)
//  - Joueur actif : utilisateur ayant joué, rejoint/créé un salon, lancé une
//    recherche ou réalisé une interaction significative (invitation, tournoi,
//    consultation d'un jeu ou d'un classement) sur la période. Une simple
//    connexion ne suffit pas.
//  - Temps de jeu : somme des durées actives en match calculées par le serveur
//    (match_players.active_ms : déconnexions exclues).
//  - Partie terminée : match ayant un résultat officiel validé (match_results.is_valid).
//  - Victoire : 1re place (ou victoire 1v1) d'une partie terminée.
//  - Taux de victoire : victoires / parties terminées (minimum imposé selon le tableau).
//  - Joueur le plus actif : trois classements distincts (parties, temps, jours actifs).
// Les agrégations utilisent COUNT(DISTINCT ...) pour ne jamais compter deux fois
// un même match ou un même utilisateur.
const pool = require('../db/pool');
const { TZ } = require('../lib/time');
const { bad } = require('../lib/errors');
const { leagueFor } = require('./progression');
const { leagues } = require('./leaderboards');

const ACTIVE_EVENTS = ['match_started', 'match_completed', 'match_abandoned', 'room_joined', 'room_created',
  'matchmaking_started', 'friend_invited', 'invite_accepted', 'tournament_joined', 'leaderboard_viewed', 'game_opened'];
const GAMES = ['cards', 'connect', 'ludo', 'foot'];

// Période [from, to] en dates locales (Comores), bornes incluses. Défaut : 30 derniers jours.
function range(query = {}) {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const to = re.test(query.to || '') ? query.to : iso(today);
  let from = re.test(query.from || '') ? query.from : null;
  if (!from) { const d = new Date(`${to}T00:00:00`); d.setDate(d.getDate() - 29); from = iso(d); }
  if (from > to) throw bad('BAD_RANGE', 'La date de début doit précéder la date de fin');
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  const prevTo = new Date(Date.parse(`${from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(Date.parse(`${from}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  return { from, to, days, prevFrom, prevTo };
}

// Expressions SQL des bornes (timestamps) pour des paramètres $a (from) et $b (to).
const tsFrom = (p) => `(${p}::date::timestamp AT TIME ZONE '${TZ}')`;
const tsTo = (p) => `((${p}::date + 1)::timestamp AT TIME ZONE '${TZ}')`;
const localDay = (col) => `(${col} AT TIME ZONE '${TZ}')::date`;

async function activeUsers(from, to) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT user_id)::int AS n FROM analytics_events
      WHERE event_name = ANY($3) AND created_at >= ${tsFrom('$1')} AND created_at < ${tsTo('$2')}`,
    [from, to, ACTIVE_EVENTS]);
  return rows[0].n;
}

async function periodTotals(from, to) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE created_at >= ${tsFrom('$1')} AND created_at < ${tsTo('$2')}) AS new_users,
       (SELECT COUNT(*)::int FROM match_results WHERE is_valid AND processed_at >= ${tsFrom('$1')} AND processed_at < ${tsTo('$2')}) AS matches,
       (SELECT COALESCE(SUM(mp.active_ms), 0)::bigint FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id
         WHERE r.processed_at >= ${tsFrom('$1')} AND r.processed_at < ${tsTo('$2')}) AS play_time_ms,
       (SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::bigint FROM presence_sessions
         WHERE ended_at IS NOT NULL AND started_at >= ${tsFrom('$1')} AND started_at < ${tsTo('$2')}) AS avg_session_ms`,
    [from, to]);
  return { ...rows[0], active_users: await activeUsers(from, to) };
}

async function dashboard(query, live) {
  const r = range(query);
  const todayRange = range({});
  const today = todayRange.to;
  const d7 = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
  const d30 = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  const [totals, cur, prev, dau, wau, mau, popular, series, regs, dist, allMatches] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS users FROM users WHERE status <> \'deleted\''),
    periodTotals(r.from, r.to),
    periodTotals(r.prevFrom, r.prevTo),
    activeUsers(today, today),
    activeUsers(d7, today),
    activeUsers(d30, today),
    pool.query(
      `SELECT r.game_id, g.name, COUNT(*)::int AS n FROM match_results r JOIN games g ON g.id = r.game_id
        WHERE r.is_valid AND r.processed_at >= ${tsFrom('$1')} AND r.processed_at < ${tsTo('$2')}
        GROUP BY r.game_id, g.name ORDER BY n DESC LIMIT 1`, [r.from, r.to]),
    pool.query(
      `SELECT d::date AS day,
              (SELECT COUNT(DISTINCT user_id)::int FROM analytics_events a WHERE a.event_name = ANY($3)
                AND ${localDay('a.created_at')} = d::date) AS active,
              (SELECT COUNT(*)::int FROM match_results m WHERE m.is_valid AND ${localDay('m.processed_at')} = d::date) AS matches
         FROM generate_series($1::date, $2::date, INTERVAL '1 day') d ORDER BY d`, [r.from, r.to, ACTIVE_EVENTS]),
    pool.query(
      `SELECT d::date AS day, (SELECT COUNT(*)::int FROM users u WHERE ${localDay('u.created_at')} = d::date) AS registrations
         FROM generate_series($1::date, $2::date, INTERVAL '1 day') d ORDER BY d`, [r.from, r.to]),
    pool.query(
      `SELECT g.id AS game_id, g.name, COUNT(r.match_id)::int AS matches
         FROM games g LEFT JOIN match_results r ON r.game_id = g.id AND r.is_valid
              AND r.processed_at >= ${tsFrom('$1')} AND r.processed_at < ${tsTo('$2')}
        GROUP BY g.id, g.name, g.sort_order ORDER BY g.sort_order`, [r.from, r.to]),
    pool.query('SELECT COUNT(*)::int AS n FROM match_results WHERE is_valid'),
  ]);
  const pct = (a, b) => (Number(b) ? Math.round(((Number(a) - Number(b)) / Number(b)) * 1000) / 10 : null);
  return {
    range: r,
    kpis: {
      totalUsers: totals.rows[0].users,
      newUsers: cur.new_users, newUsersPrev: prev.new_users, newUsersChange: pct(cur.new_users, prev.new_users),
      activeToday: dau, active7d: wau, active30d: mau,
      activeUsers: cur.active_users, activeUsersPrev: prev.active_users, activeUsersChange: pct(cur.active_users, prev.active_users),
      onlineNow: live.onlineUsers, matchesInProgress: live.liveMatches,
      matchesCompleted: cur.matches, matchesCompletedPrev: prev.matches, matchesChange: pct(cur.matches, prev.matches),
      totalPlayTimeMs: Number(cur.play_time_ms), playTimePrevMs: Number(prev.play_time_ms), playTimeChange: pct(cur.play_time_ms, prev.play_time_ms),
      avgSessionMs: cur.avg_session_ms ? Number(cur.avg_session_ms) : null,
      mostPopularGame: popular.rows[0] || null,
      totalMatches: allMatches.rows[0].n,
    },
    series: series.rows.map((s, i) => ({ day: s.day, active: s.active, matches: s.matches, registrations: regs.rows[i]?.registrations || 0 })),
    gameDistribution: dist.rows,
  };
}

// ── Classements administratifs des joueurs ──────────────────────────────────
const TOP_METRICS = {
  matches: { label: 'Parties terminées', order: 'matches DESC' },
  playtime: { label: 'Temps de jeu', order: 'play_time_ms DESC' },
  wins: { label: 'Victoires', order: 'wins DESC, matches ASC' },
  points: { label: 'Points de saison', order: 'points DESC, wins DESC' },
  xp: { label: 'XP', order: 'xp DESC' },
  winrate: { label: 'Taux de victoire (≥ 20 parties)', order: 'win_rate DESC NULLS LAST, matches DESC', minMatches: 20 },
  regularity: { label: 'Jours actifs', order: 'active_days DESC, matches DESC' },
};

async function topPlayers(query = {}) {
  const r = range(query);
  const metric = TOP_METRICS[query.metric] ? query.metric : 'matches';
  const gameId = GAMES.includes(query.gameId) ? query.gameId : null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(query.pageSize, 10) || 25));
  const search = String(query.q || '').trim();
  const sortable = ['matches', 'wins', 'play_time_ms', 'points', 'xp', 'win_rate', 'active_days', 'username'];
  const sort = sortable.includes(query.sort) ? `${query.sort} ${query.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST` : TOP_METRICS[metric].order;
  const min = TOP_METRICS[metric].minMatches || 0;
  const params = [r.from, r.to, gameId, search ? `%${search.replace(/[%_\\]/g, '\\$&')}%` : null, min];
  const base = `
    WITH mp AS (
      SELECT p.user_id, COUNT(DISTINCT p.match_id)::int AS matches,
             COUNT(DISTINCT p.match_id) FILTER (WHERE p.outcome = 'win')::int AS wins,
             COALESCE(SUM(p.active_ms), 0)::bigint AS play_time_ms,
             COUNT(DISTINCT ${localDay('r.processed_at')})::int AS active_days
        FROM match_players p JOIN match_results r ON r.match_id = p.match_id
       WHERE r.is_valid AND r.processed_at >= ${tsFrom('$1')} AND r.processed_at < ${tsTo('$2')}
         AND ($3::text IS NULL OR r.game_id = $3)
       GROUP BY p.user_id
    ), sp AS (
      SELECT user_id, SUM(points)::int AS points FROM season_points
       WHERE created_at >= ${tsFrom('$1')} AND created_at < ${tsTo('$2')} AND ($3::text IS NULL OR game_id = $3)
       GROUP BY user_id
    )
    SELECT u.id AS user_id, u.username, u.avatar, u.status, u.created_at, u.last_seen_at,
           COALESCE(mp.matches, 0) AS matches, COALESCE(mp.wins, 0) AS wins,
           COALESCE(mp.play_time_ms, 0)::bigint AS play_time_ms, COALESCE(mp.active_days, 0) AS active_days,
           COALESCE(sp.points, 0) AS points, COALESCE(g.xp, 0)::bigint AS xp, COALESCE(g.level, 1) AS level,
           CASE WHEN COALESCE(mp.matches, 0) >= GREATEST($5, 1) THEN mp.wins::float / mp.matches END AS win_rate
      FROM users u
      LEFT JOIN mp ON mp.user_id = u.id
      LEFT JOIN sp ON sp.user_id = u.id
      LEFT JOIN player_global_stats g ON g.user_id = u.id
     WHERE u.status <> 'deleted' AND ($4::text IS NULL OR u.username ILIKE $4)
       AND (COALESCE(mp.matches, 0) > 0 OR COALESCE(sp.points, 0) <> 0 OR '${metric}' = 'xp')
       AND COALESCE(mp.matches, 0) >= $5`;
  const [rows, count] = await Promise.all([
    pool.query(`${base} ORDER BY ${sort}, u.created_at ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params),
    pool.query(`SELECT COUNT(*)::int AS n FROM (${base}) x`, params),
  ]);
  return {
    metric, metricLabel: TOP_METRICS[metric].label, range: r, gameId, page, pageSize, total: count.rows[0].n,
    rows: rows.rows.map((row, i) => ({ rank: (page - 1) * pageSize + i + 1, ...row, play_time_ms: Number(row.play_time_ms), xp: Number(row.xp) })),
  };
}

// ── Tableaux de bord par jeu ────────────────────────────────────────────────
async function gameAnalytics(gameId, query = {}, live = {}) {
  if (!GAMES.includes(gameId)) throw bad('BAD_GAME', 'Jeu inconnu');
  const r = range(query);
  const p = [gameId, r.from, r.to];
  const inRange = `r.processed_at >= ${tsFrom('$2')} AND r.processed_at < ${tsTo('$3')}`;
  const [overview, top, mostActive, mostWins, bestRate, daily, lg, ratings] = await Promise.all([
    pool.query(
      `SELECT (SELECT COUNT(*)::int FROM player_game_stats WHERE game_id = $1 AND games_played > 0) AS total_players,
              (SELECT COUNT(DISTINCT mp.user_id)::int FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id
                WHERE r.game_id = $1 AND r.is_valid AND ${inRange}) AS active_players,
              COUNT(*) FILTER (WHERE r.is_valid)::int AS matches,
              COUNT(*) FILTER (WHERE NOT r.is_valid)::int AS invalid_matches,
              COUNT(*) FILTER (WHERE r.is_valid AND r.is_draw)::int AS draws,
              AVG(r.duration_ms) FILTER (WHERE r.is_valid)::bigint AS avg_duration_ms
         FROM match_results r WHERE r.game_id = $1 AND ${inRange}`, p),
    pool.query(
      `SELECT s.user_id, u.username, u.avatar, s.rating, s.games_played, s.wins,
              CASE WHEN s.games_played > 0 THEN s.wins::float / s.games_played END AS win_rate, s.extra
         FROM player_game_stats s JOIN users u ON u.id = s.user_id
        WHERE s.game_id = $1 AND s.games_played > 0 AND u.status <> 'deleted'
        ORDER BY s.rating DESC, s.wins DESC, s.rating_updated_at ASC LIMIT 100`, [gameId]),
    pool.query(
      `SELECT mp.user_id, u.username, COUNT(DISTINCT mp.match_id)::int AS matches
         FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id JOIN users u ON u.id = mp.user_id
        WHERE r.game_id = $1 AND r.is_valid AND ${inRange} GROUP BY mp.user_id, u.username ORDER BY matches DESC LIMIT 1`, p),
    pool.query(
      `SELECT mp.user_id, u.username, COUNT(DISTINCT mp.match_id)::int AS wins
         FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id JOIN users u ON u.id = mp.user_id
        WHERE r.game_id = $1 AND r.is_valid AND mp.outcome = 'win' AND ${inRange} GROUP BY mp.user_id, u.username ORDER BY wins DESC LIMIT 1`, p),
    pool.query(
      `SELECT s.user_id, u.username, s.wins::float / s.games_played AS win_rate, s.games_played
         FROM player_game_stats s JOIN users u ON u.id = s.user_id
        WHERE s.game_id = $1 AND s.games_played >= 20 ORDER BY win_rate DESC, s.games_played DESC LIMIT 1`, [gameId]),
    pool.query(
      `SELECT d::date AS day, (SELECT COUNT(*)::int FROM match_results r WHERE r.game_id = $1 AND r.is_valid
                AND ${localDay('r.processed_at')} = d::date) AS matches
         FROM generate_series($2::date, $3::date, INTERVAL '1 day') d ORDER BY d`, p),
    leagues(),
    pool.query('SELECT rating FROM player_game_stats WHERE game_id = $1 AND games_played > 0', [gameId]),
  ]);
  const leagueDist = {};
  for (const l of (lg[gameId] || [])) leagueDist[l.name] = 0;
  for (const row of ratings.rows) {
    const name = leagueFor(Number(row.rating), lg[gameId]);
    leagueDist[name] = (leagueDist[name] || 0) + 1;
  }
  const o = overview.rows[0];
  const out = {
    gameId, range: r,
    totals: {
      totalPlayers: o.total_players, activePlayers: o.active_players, matches: o.matches, invalidMatches: o.invalid_matches,
      draws: o.draws, avgDurationMs: o.avg_duration_ms ? Number(o.avg_duration_ms) : null, inProgress: live.byGame?.[gameId] || 0,
    },
    number1: top.rows[0] || null,
    mostActive: mostActive.rows[0] || null,
    mostWins: mostWins.rows[0] || null,
    bestWinRate: bestRate.rows[0] || null,
    top100: top.rows.map((x, i) => ({ rank: i + 1, ...x, rating: Math.round(Number(x.rating)), league: leagueFor(Number(x.rating), lg[gameId]) })),
    leagueDistribution: Object.entries(leagueDist).map(([league, players]) => ({ league, players })),
    daily: daily.rows,
    specific: await gameSpecific(gameId, p, inRange),
  };
  return out;
}

async function gameSpecific(gameId, p, inRange) {
  if (gameId === 'connect') {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE mp.outcome = 'win')::int AS wins, COUNT(*) FILTER (WHERE mp.outcome = 'loss')::int AS losses,
              COUNT(DISTINCT r.match_id) FILTER (WHERE r.is_draw)::int AS draws,
              ROUND(AVG((SELECT SUM((x.stats->>'moves')::int) FROM match_players x WHERE x.match_id = r.match_id)), 1) AS avg_moves
         FROM match_results r JOIN match_players mp ON mp.match_id = r.match_id
        WHERE r.game_id = $1 AND r.is_valid AND ${inRange}`, p);
    return rows[0];
  }
  if (gameId === 'ludo' || gameId === 'cards') {
    const [sizes, places] = await Promise.all([
      pool.query(
        `SELECT n AS players, COUNT(*)::int AS matches FROM (
           SELECT r.match_id, COUNT(mp.user_id) AS n FROM match_results r JOIN match_players mp ON mp.match_id = r.match_id
            WHERE r.game_id = $1 AND r.is_valid AND ${inRange} GROUP BY r.match_id) x GROUP BY n ORDER BY n`, p),
      pool.query(
        `SELECT mp.placement AS place, COUNT(*)::int AS n FROM match_results r JOIN match_players mp ON mp.match_id = r.match_id
          WHERE r.game_id = $1 AND r.is_valid AND ${inRange} GROUP BY mp.placement ORDER BY mp.placement`, p),
    ]);
    return { bySize: sizes.rows, placements: places.rows };
  }
  return {};
}

// ── Engagement ──────────────────────────────────────────────────────────────
async function engagement(query = {}) {
  const r = range(query);
  const [dau, wau, mau, ret, perPlayer, invites, reactivated, cohorts, sessions] = await Promise.all([
    activeUsers(r.to, r.to),
    activeUsers(new Date(Date.parse(`${r.to}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10), r.to),
    activeUsers(new Date(Date.parse(`${r.to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10), r.to),
    pool.query(
      `SELECT day_offset, SUM(retained_users)::int AS retained, SUM(cohort_size)::int AS size
         FROM retention_cohorts WHERE cohort_date BETWEEN $1::date AND $2::date GROUP BY day_offset`, [r.from, r.to]),
    pool.query(
      `SELECT COUNT(DISTINCT mp.match_id)::float / NULLIF(COUNT(DISTINCT mp.user_id), 0) AS avg_matches
         FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id
        WHERE r.is_valid AND r.processed_at >= ${tsFrom('$1')} AND r.processed_at < ${tsTo('$2')}`, [r.from, r.to]),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE event_name = 'friend_invited')::int AS sent,
              COUNT(*) FILTER (WHERE event_name = 'invite_accepted')::int AS accepted
         FROM analytics_events WHERE created_at >= ${tsFrom('$1')} AND created_at < ${tsTo('$2')}`, [r.from, r.to]),
    // Réactivés : actifs sur la période après au moins 14 jours sans activité.
    pool.query(
      `WITH firsts AS (
         SELECT user_id, MIN(created_at) AS first_in FROM analytics_events
          WHERE event_name = ANY($3) AND created_at >= ${tsFrom('$1')} AND created_at < ${tsTo('$2')} GROUP BY user_id)
       SELECT COUNT(*)::int AS n FROM firsts f
        WHERE EXISTS (SELECT 1 FROM analytics_events a WHERE a.user_id = f.user_id AND a.event_name = ANY($3) AND a.created_at < f.first_in - INTERVAL '14 days')
          AND NOT EXISTS (SELECT 1 FROM analytics_events a WHERE a.user_id = f.user_id AND a.event_name = ANY($3)
                           AND a.created_at < f.first_in AND a.created_at >= f.first_in - INTERVAL '14 days')`, [r.from, r.to, ACTIVE_EVENTS]),
    pool.query(
      `SELECT cohort_date, day_offset, cohort_size, retained_users FROM retention_cohorts
        WHERE cohort_date BETWEEN $1::date AND $2::date ORDER BY cohort_date DESC, day_offset`, [r.from, r.to]),
    pool.query(
      `SELECT COUNT(*)::float / NULLIF(COUNT(DISTINCT user_id), 0) AS sessions_per_player,
              AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::bigint AS avg_ms
         FROM presence_sessions WHERE ended_at IS NOT NULL AND started_at >= ${tsFrom('$1')} AND started_at < ${tsTo('$2')}`, [r.from, r.to]),
  ]);
  const retention = {};
  for (const row of ret.rows) retention[`d${row.day_offset}`] = row.size ? row.retained / row.size : null;
  const cohortMap = {};
  for (const c of cohorts.rows) {
    const k = c.cohort_date.toISOString?.().slice(0, 10) || String(c.cohort_date);
    cohortMap[k] = cohortMap[k] || { cohortDate: k, size: c.cohort_size };
    cohortMap[k][`d${c.day_offset}`] = c.cohort_size ? c.retained_users / c.cohort_size : null;
  }
  const dauSeries = await pool.query(
    `SELECT d::date AS day, (SELECT COUNT(DISTINCT user_id)::int FROM analytics_events a WHERE a.event_name = ANY($3)
              AND ${localDay('a.created_at')} = d::date) AS dau
       FROM generate_series($1::date, $2::date, INTERVAL '1 day') d ORDER BY d`, [r.from, r.to, ACTIVE_EVENTS]);
  return {
    range: r, dau, wau, mau, stickiness: mau ? dau / mau : null,
    retention: { d1: retention.d1 ?? null, d7: retention.d7 ?? null, d30: retention.d30 ?? null },
    avgMatchesPerPlayer: perPlayer.rows[0].avg_matches,
    sessionsPerPlayer: sessions.rows[0].sessions_per_player,
    avgSessionMs: sessions.rows[0].avg_ms ? Number(sessions.rows[0].avg_ms) : null,
    invitationsSent: invites.rows[0].sent, invitationsAccepted: invites.rows[0].accepted,
    reactivatedPlayers: reactivated.rows[0].n,
    cohorts: Object.values(cohortMap),
    dauSeries: dauSeries.rows,
  };
}

module.exports = { range, dashboard, topPlayers, gameAnalytics, engagement, TOP_METRICS, ACTIVE_EVENTS, GAMES };
