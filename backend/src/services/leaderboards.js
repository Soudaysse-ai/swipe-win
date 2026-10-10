// Classements publics.
//  - Global (« Tous les jeux ») : somme des points de saison des 4 jeux.
//  - Par jeu : cote compétitive du jeu.
// Départage déterministe : 1) score ou cote, 2) victoires, 3) taux de victoire
// (minimum de matchs), 4) date d'atteinte du score (le plus ancien d'abord).
const pool = require('../db/pool');
const { TZ, localDate } = require('../lib/time');
const { leagueFor } = require('./progression');

const MIN_MATCHES_WINRATE = 10;
const PERIODS = ['week', 'month', 'season', 'all'];
const PENALTY_MIN_SHOTS = 10;

async function periodBounds(period) {
  if (period === 'week') {
    const { rows } = await pool.query(`SELECT (date_trunc('week', NOW() AT TIME ZONE $1) AT TIME ZONE $1) AS from_ts`, [TZ]);
    return { from: rows[0].from_ts, seasonId: null };
  }
  if (period === 'month') {
    const { rows } = await pool.query(`SELECT (date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1) AS from_ts`, [TZ]);
    return { from: rows[0].from_ts, seasonId: null };
  }
  if (period === 'season') {
    const { rows } = await pool.query('SELECT id, starts_at FROM seasons WHERE is_active LIMIT 1');
    return { from: rows[0]?.starts_at || new Date(0), seasonId: rows[0]?.id || -1 };
  }
  return { from: new Date(0), seasonId: null };
}

let leaguesCache = { at: 0, byGame: {} };
async function leagues() {
  if (Date.now() - leaguesCache.at < 60_000) return leaguesCache.byGame;
  const { rows } = await pool.query('SELECT * FROM leagues ORDER BY sort_order');
  const byGame = {};
  for (const l of rows) (byGame[l.game_id] = byGame[l.game_id] || []).push(l);
  leaguesCache = { at: Date.now(), byGame };
  return byGame;
}
function clearLeaguesCache() { leaguesCache.at = 0; }

async function previousRanks(board, period) {
  const { rows } = await pool.query(
    `SELECT user_id, rank FROM leaderboard_entries
      WHERE board = $1 AND period = $2
        AND snapshot_date = (SELECT MAX(snapshot_date) FROM leaderboard_entries WHERE board = $1 AND period = $2 AND snapshot_date < $3::date)`,
    [board, period, localDate()]);
  return Object.fromEntries(rows.map(r => [r.user_id, r.rank]));
}

// Petit cache (15 s) : les classements sont recalculés à la volée, ce cache
// évite de refaire le calcul à chaque affichage de l'accueil.
const rowsCache = new Map();
async function cached(key, fn) {
  const hit = rowsCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.rows;
  const rows = await fn();
  rowsCache.set(key, { at: Date.now(), rows });
  return rows;
}
// Invalide le cache après chaque résultat validé (classements à jour immédiatement).
function invalidate() { rowsCache.clear(); }

async function globalRows(period) {
  return cached(`global:${period}`, () => computeGlobalRows(period));
}

async function computeGlobalRows(period) {
  const { from, seasonId } = await periodBounds(period);
  const { rows } = await pool.query(
    `WITH sp AS (
       SELECT user_id, SUM(points)::int AS points, MAX(created_at) FILTER (WHERE points > 0) AS reached_at
         FROM season_points
        WHERE created_at >= $1 AND ($2::int IS NULL OR season_id = $2)
        GROUP BY user_id
     ), w AS (
       SELECT mp.user_id, COUNT(*) FILTER (WHERE mp.outcome = 'win')::int AS wins, COUNT(*)::int AS matches
         FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id
        WHERE r.is_valid AND r.processed_at >= $1
        GROUP BY mp.user_id
     ), best AS (
       SELECT user_id, game_id, rating FROM (
         SELECT user_id, game_id, rating, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY rating DESC) AS rn
           FROM player_game_stats WHERE games_played > 0) x WHERE rn = 1
     )
     SELECT u.id AS user_id, u.username, u.avatar, COALESCE(g.level, 1) AS level,
            sp.points AS value, COALESCE(w.wins, 0) AS wins, COALESCE(w.matches, 0) AS matches,
            CASE WHEN COALESCE(w.matches, 0) >= $3 THEN w.wins::float / w.matches END AS win_rate,
            sp.reached_at, best.game_id AS best_game, best.rating AS best_rating
       FROM sp JOIN users u ON u.id = sp.user_id
       LEFT JOIN w ON w.user_id = sp.user_id
       LEFT JOIN best ON best.user_id = sp.user_id
       LEFT JOIN player_global_stats g ON g.user_id = sp.user_id
      WHERE u.status IN ('active','suspended') AND sp.points > 0
      ORDER BY sp.points DESC, wins DESC, win_rate DESC NULLS LAST, sp.reached_at ASC NULLS LAST, u.created_at ASC`,
    [from, seasonId, MIN_MATCHES_WINRATE]);
  const lg = await leagues();
  return rows.map((r, i) => ({
    rank: i + 1, userId: r.user_id, username: r.username, avatar: r.avatar, level: r.level,
    value: r.value, wins: r.wins, matches: r.matches, winRate: r.win_rate,
    league: r.best_game ? leagueFor(Number(r.best_rating), lg[r.best_game]) : 'Bronze',
  }));
}

// board : 'rating' (défaut) | 'scorers' | 'keepers' (Yas Penalty)
async function gameRows(gameId, period, board = 'rating') {
  return cached(`game:${gameId}:${period}:${board}`, () => computeGameRows(gameId, period, board));
}

async function computeGameRows(gameId, period, board) {
  const { from } = await periodBounds(period);
  const activeFilter = period === 'all' || period === 'season' ? '' :
    `AND EXISTS (SELECT 1 FROM match_players mp JOIN match_results r ON r.match_id = mp.match_id
                  WHERE mp.user_id = s.user_id AND r.game_id = s.game_id AND r.is_valid AND r.processed_at >= $2)`;
  let valueExpr = 's.rating';
  let order = 's.rating DESC, s.wins DESC, win_rate DESC NULLS LAST, s.rating_updated_at ASC';
  let extraWhere = '';
  if (gameId === 'penalty' && board === 'scorers') {
    valueExpr = "COALESCE((s.extra->>'goals')::int, 0)";
    order = `${valueExpr} DESC, (COALESCE((s.extra->>'goals')::float, 0) / NULLIF((s.extra->>'shots')::float, 0)) DESC NULLS LAST, s.rating DESC`;
    extraWhere = `AND COALESCE((s.extra->>'shots')::int, 0) >= ${PENALTY_MIN_SHOTS}`;
  } else if (gameId === 'penalty' && board === 'keepers') {
    valueExpr = "ROUND(100.0 * COALESCE((s.extra->>'saves')::float, 0) / NULLIF((s.extra->>'shotsFaced')::float, 0))";
    order = `(COALESCE((s.extra->>'saves')::float, 0) / NULLIF((s.extra->>'shotsFaced')::float, 0)) DESC NULLS LAST, COALESCE((s.extra->>'saves')::int, 0) DESC, s.rating DESC`;
    extraWhere = `AND COALESCE((s.extra->>'shotsFaced')::int, 0) >= ${PENALTY_MIN_SHOTS}`;
  }
  const params = [gameId];
  if (activeFilter) params.push(from);
  params.push(MIN_MATCHES_WINRATE);
  const minIdx = params.length;
  const { rows } = await pool.query(
    `SELECT s.user_id, u.username, u.avatar, COALESCE(g.level, 1) AS level, ${valueExpr} AS value,
            s.rating, s.wins, s.games_played AS matches, s.extra,
            CASE WHEN s.games_played >= $${minIdx} THEN s.wins::float / s.games_played END AS win_rate
       FROM player_game_stats s JOIN users u ON u.id = s.user_id
       LEFT JOIN player_global_stats g ON g.user_id = s.user_id
      WHERE s.game_id = $1 AND s.games_played > 0 AND u.status IN ('active','suspended') ${extraWhere} ${activeFilter}
      ORDER BY ${order}, u.created_at ASC`,
    params);
  const lg = (await leagues())[gameId];
  return rows.map((r, i) => ({
    rank: i + 1, userId: r.user_id, username: r.username, avatar: r.avatar, level: r.level,
    value: Math.round(Number(r.value)), rating: Math.round(Number(r.rating)), wins: r.wins, matches: r.matches,
    winRate: r.win_rate, league: leagueFor(Number(r.rating), lg), extra: r.extra,
  }));
}

function boardKey(gameId, board = 'rating') {
  return gameId ? `game:${gameId}${board !== 'rating' ? `:${board}` : ''}` : 'global';
}

/**
 * Renvoie { entries (top N), me (position personnelle), total }.
 */
async function getBoard({ gameId = null, period = 'season', board = 'rating', limit = 100, userId = null }) {
  if (!PERIODS.includes(period)) period = 'season';
  const all = gameId ? await gameRows(gameId, period, board) : await globalRows(period);
  const prev = await previousRanks(boardKey(gameId, board), period);
  const withChange = all.map(e => ({ ...e, rankChange: prev[e.userId] ? prev[e.userId] - e.rank : null }));
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
  return {
    gameId, period, board, total: all.length,
    entries: withChange.slice(0, lim),
    me: userId ? withChange.find(e => e.userId === userId) || null : null,
  };
}

// Instantané quotidien des rangs (sert à afficher l'évolution du rang).
async function snapshot() {
  const today = localDate();
  const games = (await pool.query('SELECT id FROM games')).rows.map(r => r.id);
  const boards = [{ gameId: null }, ...games.map(g => ({ gameId: g }))];
  for (const period of PERIODS) {
    for (const b of boards) {
      const key = boardKey(b.gameId);
      const exists = await pool.query(
        'SELECT 1 FROM leaderboard_entries WHERE board = $1 AND period = $2 AND snapshot_date = $3 LIMIT 1', [key, period, today]);
      if (exists.rows.length) continue;
      const rows = b.gameId ? await gameRows(b.gameId, period) : await globalRows(period);
      const top = rows.slice(0, 500);
      if (!top.length) continue;
      const values = [];
      const params = [];
      top.forEach((e, i) => {
        params.push(key, period, e.userId, e.rank, e.value, today);
        const o = i * 6;
        values.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`);
      });
      await pool.query(
        `INSERT INTO leaderboard_entries (board, period, user_id, rank, value, snapshot_date) VALUES ${values.join(',')}
         ON CONFLICT DO NOTHING`, params);
    }
  }
}

module.exports = { invalidate, getBoard, globalRows, gameRows, snapshot, periodBounds, leagues, clearLeaguesCache, PERIODS, MIN_MATCHES_WINRATE };
