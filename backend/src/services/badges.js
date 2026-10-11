// Attribution des badges (évaluée dans la transaction de fin de match).
async function evaluateBadges(db, userId, { matchId, gameId, placement, isDraw }) {
  // Requêtes séquentielles : un client de transaction n'exécute qu'une requête à la fois.
  const g = await db.query('SELECT xp, level, matches_played, wins FROM player_global_stats WHERE user_id = $1', [userId]);
  const games = await db.query('SELECT game_id, games_played, best_streak FROM player_game_stats WHERE user_id = $1', [userId]);
  const defs = await db.query('SELECT * FROM badges ORDER BY sort_order');
  const gs = g.rows[0] || { level: 1, matches_played: 0, wins: 0 };
  const played = games.rows.filter(r => r.games_played > 0).length;
  const bestStreak = Math.max(0, ...games.rows.map(r => r.best_streak));
  const won = !isDraw && placement.place === 1;
  const st = placement.stats || {};

  const earned = [];
  for (const b of defs.rows) {
    const c = b.criteria || {};
    let ok = false;
    if (c.wins) ok = gs.wins >= c.wins;
    else if (c.matches) ok = gs.matches_played >= c.matches;
    else if (c.streak) ok = bestStreak >= c.streak;
    else if (c.allGames) ok = played >= 4;
    else if (c.level) ok = gs.level >= c.level;
    else if (c.connectQuickWin) ok = gameId === 'connect' && won && st.moves > 0 && st.moves <= c.connectQuickWin;
    if (!ok) continue;
    const ins = await db.query(
      `INSERT INTO player_badges (user_id, badge_id, match_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING badge_id`,
      [userId, b.id, matchId]
    );
    if (ins.rows.length) earned.push({ id: b.id, name: b.name, description: b.description, icon: b.icon });
  }
  return earned;
}

module.exports = { evaluateBadges };
