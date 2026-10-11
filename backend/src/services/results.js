// Traitement officiel d'une fin de match. Appelé UNIQUEMENT par le runtime
// serveur, à partir du résultat calculé par le moteur de jeu : le navigateur ne
// peut jamais soumettre un résultat.
//
// Transactionnel (tout ou rien) et idempotent : la ligne match_results sert de
// verrou — un second appel pour le même match ne fait rien.
const pool = require('../db/pool');
const { TZ, localDate } = require('../lib/time');
const P = require('./progression');
const R = require('./rating');
const { evaluateBadges } = require('./badges');
const notifications = require('./notifications');

const COLLUSION_WINDOW_HOURS = 24;
const COLLUSION_MIN_MATCHES = 6;

async function activeSeasonId(db) {
  const { rows } = await db.query('SELECT id FROM seasons WHERE is_active LIMIT 1');
  return rows[0]?.id || null;
}

async function lockStats(db, gameId, userIds) {
  for (const u of userIds) {
    await db.query(
      `INSERT INTO player_game_stats (user_id, game_id, rating_mu, rating_sigma)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [u, gameId, R.OS.MU, R.OS.SIGMA]
    );
    await db.query('INSERT INTO player_global_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [u]);
  }
  const sorted = [...userIds].sort();
  const { rows } = await db.query(
    'SELECT * FROM player_game_stats WHERE game_id = $1 AND user_id = ANY($2::uuid[]) ORDER BY user_id FOR UPDATE',
    [gameId, sorted]
  );
  const g = await db.query(
    'SELECT * FROM player_global_stats WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE', [sorted]);
  return {
    game: Object.fromEntries(rows.map(r => [r.user_id, r])),
    global: Object.fromEntries(g.rows.map(r => [r.user_id, r])),
  };
}

function computeRatings(ratingSystem, placements, stats, isDraw) {
  const out = {};
  if (ratingSystem === 'elo' && placements.length === 2) {
    const [a, b] = placements;
    const ra = Number(stats[a.userId].rating);
    const rb = Number(stats[b.userId].rating);
    const scoreA = isDraw ? 0.5 : (a.place < b.place ? 1 : 0);
    const r = R.elo(ra, rb, scoreA);
    out[a.userId] = { before: ra, after: r.a };
    out[b.userId] = { before: rb, after: r.b };
    return out;
  }
  const input = placements.map(p => ({
    mu: stats[p.userId].rating_mu ?? R.OS.MU,
    sigma: stats[p.userId].rating_sigma ?? R.OS.SIGMA,
    rank: p.place,
  }));
  const res = R.plackettLuce(input);
  placements.forEach((p, i) => {
    out[p.userId] = {
      before: Number(stats[p.userId].rating),
      after: R.osDisplay(res[i].mu),
      muBefore: input[i].mu, muAfter: res[i].mu,
      sigmaBefore: input[i].sigma, sigmaAfter: res[i].sigma,
    };
  });
  return out;
}

// Ajoute les compteurs numériques de stats (ex. buts, arrêts) dans extra.
function mergeExtra(extra, add) {
  const e = { ...(extra || {}) };
  for (const [k, v] of Object.entries(add || {})) {
    if (typeof v === 'number' && k !== 'moves') e[k] = (e[k] || 0) + v;
  }
  return e;
}

async function grantXp(db, userId, matchId, amount, reason, key) {
  const { rows } = await db.query(
    `INSERT INTO xp_transactions (user_id, match_id, amount, reason, idempotency_key)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING amount`,
    [userId, matchId, amount, reason, key]
  );
  return rows.length ? amount : 0;
}

async function detectCollusion(db, match, placements) {
  if (placements.length !== 2) return [];
  const [a, b] = placements.map(p => p.userId);
  const { rows } = await db.query(
    `SELECT mr.placements FROM match_results mr
       JOIN match_players x ON x.match_id = mr.match_id AND x.user_id = $1
       JOIN match_players y ON y.match_id = mr.match_id AND y.user_id = $2
      WHERE mr.is_valid AND mr.processed_at > NOW() - make_interval(hours => $3)
        AND (SELECT COUNT(*) FROM match_players z WHERE z.match_id = mr.match_id) = 2`,
    [a, b, COLLUSION_WINDOW_HOURS]
  );
  if (rows.length < COLLUSION_MIN_MATCHES) return [];
  const winners = rows.map(r => (r.placements.find(p => p.place === 1 && p.outcome === 'win') || {}).userId);
  const counts = {};
  winners.forEach(w => { if (w) counts[w] = (counts[w] || 0) + 1; });
  const top = Math.max(0, ...Object.values(counts));
  if (top / rows.length >= 0.9) {
    return [{ type: 'suspected_collusion', detail: `${rows.length} matchs entre les mêmes joueurs en ${COLLUSION_WINDOW_HOURS} h, ${top} gagnés par le même joueur` }];
  }
  return [];
}

/**
 * @param {object} p
 * @param {string} p.matchId
 * @param {string} p.gameId
 * @param {Array<{userId, place, outcome, stats}>} p.placements
 * @param {boolean} p.isDraw
 * @param {boolean} p.isValid   false = match non comptabilisé (trop court, annulé)
 * @param {number} p.durationMs
 * @param {object} p.activeMs   { userId: temps de jeu effectif (hors déconnexions) }
 * @returns {Promise<null | { perPlayer: object }>} null si déjà traité
 */
async function processMatchResult(p) {
  const today = localDate();
  const summary = await pool.tx(async (db) => {
    const ins = await db.query(
      `INSERT INTO match_results (match_id, game_id, is_valid, is_draw, placements, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (match_id) DO NOTHING RETURNING match_id`,
      [p.matchId, p.gameId, p.isValid, p.isDraw, JSON.stringify(p.placements.map(({ userId, place, outcome }) => ({ userId, place, outcome }))), p.durationMs]
    );
    if (!ins.rows.length) return null; // déjà traité

    for (const pl of p.placements) {
      await db.query(
        `UPDATE match_players SET placement = $3, outcome = $4, score = $5, stats = $6, active_ms = $7
          WHERE match_id = $1 AND user_id = $2`,
        [p.matchId, pl.userId, pl.place, pl.outcome, pl.stats?.score ?? null, JSON.stringify(pl.stats || {}), p.activeMs?.[pl.userId] || 0]
      );
    }

    const perPlayer = Object.fromEntries(p.placements.map(pl => [pl.userId, {
      outcome: pl.outcome, place: pl.place, xpGained: 0, seasonPoints: 0, counted: false, badges: [],
    }]));

    if (!p.isValid) return { perPlayer, valid: false };

    const game = (await db.query('SELECT * FROM games WHERE id = $1', [p.gameId])).rows[0];
    const userIds = p.placements.map(pl => pl.userId);
    const { game: stats, global } = await lockStats(db, p.gameId, userIds);
    const ratings = computeRatings(game.rating_system, p.placements, stats, p.isDraw);
    const seasonId = await activeSeasonId(db);
    const challenge = P.dailyChallenge(today);

    for (const pl of p.placements) {
      const u = pl.userId;
      const s = stats[u];
      const r = ratings[u];
      const isWin = !p.isDraw && pl.place === 1;
      const isLoss = !p.isDraw && !isWin; // en multijoueur, toute place hors 1re compte comme défaite
      const streak = isWin ? s.current_streak + 1 : 0;
      const placeCol = pl.place >= 1 && pl.place <= 4 ? `place_${pl.place}` : null;
      const ratingChanged = Math.abs(r.after - r.before) > 1e-9;

      await db.query(
        `UPDATE player_game_stats SET
           games_played = games_played + 1,
           wins = wins + $3, losses = losses + $4, draws = draws + $5,
           ${placeCol ? `${placeCol} = ${placeCol} + ${p.isDraw ? 0 : 1},` : ''}
           current_streak = $6, best_streak = GREATEST(best_streak, $6),
           total_duration_ms = total_duration_ms + $7,
           total_moves = total_moves + $8,
           rating = $9, rating_mu = COALESCE($10, rating_mu), rating_sigma = COALESCE($11, rating_sigma),
           peak_rating = GREATEST(peak_rating, $9),
           rating_updated_at = CASE WHEN $12 THEN NOW() ELSE rating_updated_at END,
           extra = $13, last_played_at = NOW()
         WHERE user_id = $1 AND game_id = $2`,
        [u, p.gameId, isWin ? 1 : 0, isLoss ? 1 : 0,
          p.isDraw ? 1 : 0, streak, p.durationMs, pl.stats?.moves || 0, r.after.toFixed(2),
          r.muAfter ?? null, r.sigmaAfter ?? null, ratingChanged, JSON.stringify(mergeExtra(s.extra, pl.stats))]
      );
      await db.query(
        `INSERT INTO rating_transactions (user_id, game_id, match_id, rating_before, rating_after, mu_before, mu_after, sigma_before, sigma_after)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [u, p.gameId, p.matchId, r.before.toFixed(2), r.after.toFixed(2), r.muBefore ?? null, r.muAfter ?? null, r.sigmaBefore ?? null, r.sigmaAfter ?? null]
      );
      await db.query('UPDATE match_players SET rating_before = $3, rating_after = $4 WHERE match_id = $1 AND user_id = $2',
        [p.matchId, u, r.before.toFixed(2), r.after.toFixed(2)]);

      // XP
      let xp = 0;
      xp += await grantXp(db, u, p.matchId, P.XP.MATCH_COMPLETED, 'match_completed', `match:${p.matchId}:${u}`);
      if (isWin) xp += await grantXp(db, u, p.matchId, P.XP.WIN_BONUS, 'win', `win:${p.matchId}:${u}`);
      if (p.isDraw) xp += await grantXp(db, u, p.matchId, P.XP.DRAW_BONUS, 'draw', `draw:${p.matchId}:${u}`);
      xp += await grantXp(db, u, p.matchId, P.XP.FIRST_MATCH_OF_DAY, 'first_match_of_day', `first:${u}:${today}`);
      let challengeDone = false;
      if (isWin && challenge.gameId === p.gameId) {
        const got = await grantXp(db, u, p.matchId, P.XP.DAILY_CHALLENGE, 'daily_challenge', `challenge:${u}:${today}`);
        xp += got;
        challengeDone = got > 0;
      }

      const g = global[u];
      const levelBefore = P.levelForXp(Number(g.xp));
      const newXp = Number(g.xp) + xp;
      const levelAfter = P.levelForXp(newXp);
      await db.query(
        `UPDATE player_global_stats SET xp = $2, level = $3, matches_played = matches_played + 1,
           wins = wins + $4, play_time_ms = play_time_ms + $5,
           active_days = active_days + CASE WHEN last_active_date IS DISTINCT FROM $6::date THEN 1 ELSE 0 END,
           last_active_date = $6::date, updated_at = NOW()
         WHERE user_id = $1`,
        [u, newXp, levelAfter, isWin ? 1 : 0, p.activeMs?.[u] || 0, today]
      );

      // Points de saison (plafond : 10 matchs comptabilisés par jeu et par jour)
      let points = 0;
      let counted = false;
      if (seasonId) {
        const base = P.seasonPointsFor({ placement: pl.place, isDraw: p.isDraw, playerCount: p.placements.length });
        const { rows } = await db.query(
          `SELECT COUNT(*)::int AS n FROM season_points
            WHERE user_id = $1 AND game_id = $2 AND counted AND reason = 'match'
              AND (created_at AT TIME ZONE $3)::date = $4::date`,
          [u, p.gameId, TZ, today]
        );
        counted = rows[0].n < P.SEASON_DAILY_CAP_PER_GAME;
        points = counted ? base : 0;
        await db.query(
          `INSERT INTO season_points (season_id, user_id, game_id, match_id, placement, points, counted)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [seasonId, u, p.gameId, p.matchId, pl.place, points, counted]
        );
      }

      await db.query(
        `INSERT INTO daily_user_stats (stat_date, user_id, matches, wins, play_time_ms) VALUES ($1,$2,1,$3,$4)
         ON CONFLICT (stat_date, user_id) DO UPDATE SET matches = daily_user_stats.matches + 1,
           wins = daily_user_stats.wins + EXCLUDED.wins, play_time_ms = daily_user_stats.play_time_ms + EXCLUDED.play_time_ms`,
        [today, u, isWin ? 1 : 0, p.activeMs?.[u] || 0]
      );

      Object.assign(perPlayer[u], {
        xpGained: xp, levelBefore, levelAfter, xpTotal: newXp,
        ratingBefore: Math.round(r.before), ratingAfter: Math.round(r.after),
        seasonPoints: points, counted, challengeDone,
      });
    }

    await db.query(
      `INSERT INTO daily_game_stats (stat_date, game_id, matches_completed, play_time_ms) VALUES ($1,$2,1,$3)
       ON CONFLICT (stat_date, game_id) DO UPDATE SET matches_completed = daily_game_stats.matches_completed + 1,
         play_time_ms = daily_game_stats.play_time_ms + EXCLUDED.play_time_ms`,
      [today, p.gameId, p.durationMs]
    );

    // Badges
    for (const pl of p.placements) {
      perPlayer[pl.userId].badges = await evaluateBadges(db, pl.userId, { matchId: p.matchId, gameId: p.gameId, placement: pl, isDraw: p.isDraw });
    }

    // Détection de matchs arrangés → examen par un administrateur
    const flags = await detectCollusion(db, { id: p.matchId }, p.placements);
    if (flags.length) {
      await db.query(
        `UPDATE matches SET flags = flags || $2::jsonb, review_status = 'pending' WHERE id = $1`,
        [p.matchId, JSON.stringify(flags)]
      );
    }

    return { perPlayer, valid: true };
  });

  if (summary?.valid) {
    for (const [userId, s] of Object.entries(summary.perPlayer)) {
      if (s.levelAfter > s.levelBefore) {
        notifications.notify(userId, 'level_up', `Niveau ${s.levelAfter} atteint !`, 'Continue comme ça 🎉', { level: s.levelAfter });
      }
      for (const b of s.badges) {
        notifications.notify(userId, 'badge', `Nouveau badge : ${b.name}`, b.description, { badgeId: b.id });
      }
    }
  }
  return summary;
}

// Partie d'entraînement contre des bots : on complète seulement la ligne du joueur
// (historique de ses parties). Aucune ligne match_results : ni XP, ni cote, ni points
// de saison, ni badges, ni statistiques de jeu.
async function recordTraining({ matchId, placements, activeMs }) {
  for (const pl of placements) {
    await pool.query(
      `UPDATE match_players SET placement = $3, outcome = $4, score = $5, stats = $6, active_ms = $7
        WHERE match_id = $1 AND user_id = $2`,
      [matchId, pl.userId, pl.place, pl.outcome, pl.stats?.score ?? null, JSON.stringify(pl.stats || {}), activeMs?.[pl.userId] || 0]
    );
  }
}

// Enregistre un match annulé (aucune victoire, aucun point).
async function recordCancelled(gameId) {
  await pool.query(
    `INSERT INTO daily_game_stats (stat_date, game_id, matches_cancelled) VALUES ($1,$2,1)
     ON CONFLICT (stat_date, game_id) DO UPDATE SET matches_cancelled = daily_game_stats.matches_cancelled + 1`,
    [localDate(), gameId]
  );
}

// Rattrapage : matchs terminés dont le traitement des résultats a échoué
// (panne base de données au mauvais moment). Idempotent.
async function reprocessPending() {
  const { rows } = await pool.query(
    `SELECT m.id, m.game_id, m.result, m.is_valid FROM matches m
      LEFT JOIN match_results r ON r.match_id = m.id
     WHERE m.status = 'COMPLETED' AND m.result IS NOT NULL AND r.match_id IS NULL AND m.mode <> 'bot'`);
  for (const m of rows) {
    try {
      await processMatchResult({
        matchId: m.id, gameId: m.game_id, placements: m.result.placements, isDraw: m.result.isDraw,
        isValid: m.is_valid, durationMs: m.result.durationMs || 0, activeMs: m.result.activeMs || {},
      });
    } catch (err) {
      console.error(`retraitement du match ${m.id} impossible`, err.message);
    }
  }
  return rows.length;
}

module.exports = { processMatchResult, recordTraining, recordCancelled, reprocessPending, computeRatings, mergeExtra };
