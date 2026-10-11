// Tournois : création (back-office), inscriptions, génération des
// confrontations, suivi automatique des résultats, publication des gagnants.
//
// Formats :
//  - single_elimination : matchs de 2 à 4 joueurs (players_per_match), le
//    vainqueur de chaque match passe au tour suivant jusqu'à la finale.
//  - round_robin : jeux à 2 joueurs uniquement ; chacun affronte tout le monde,
//    3 pts la victoire, 1 pt le nul.
// Chaque confrontation crée un salon réservé ; le match démarre dès que tous
// les joueurs convoqués sont présents et prêts.
const pool = require('../db/pool');
const rooms = require('../realtime/rooms');
const runtime = require('../realtime/matchRuntime');
const notifications = require('./notifications');
const analytics = require('./analytics');
const { logAudit } = require('./audit');
const { getEngine } = require('../games');
const { bad, notFound, forbidden } = require('../lib/errors');

const STATUSES = ['draft', 'registration', 'in_progress', 'completed', 'cancelled'];

async function get(id, db = pool) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw notFound('Tournoi introuvable');
  const { rows } = await db.query('SELECT * FROM tournaments WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Tournoi introuvable');
  return rows[0];
}

function validateInput(input, gameEngine) {
  const pp = parseInt(input.playersPerMatch || 2, 10);
  if (!gameEngine) throw bad('BAD_GAME', 'Jeu inconnu');
  if (pp < gameEngine.minPlayers || pp > gameEngine.maxPlayers) throw bad('BAD_PPM', `Ce jeu se joue de ${gameEngine.minPlayers} à ${gameEngine.maxPlayers} joueurs`);
  if (!['single_elimination', 'round_robin'].includes(input.format)) throw bad('BAD_FORMAT', 'Format inconnu');
  if (input.format === 'round_robin' && pp !== 2) throw bad('BAD_FORMAT', 'Le format championnat (round robin) se joue en 1 contre 1');
  if (!input.name || String(input.name).trim().length < 3) throw bad('BAD_NAME', 'Nom requis');
  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) throw bad('BAD_DATES', 'Dates invalides');
  const max = parseInt(input.maxParticipants || 16, 10);
  if (max < 2 || max > 256) throw bad('BAD_MAX', 'Nombre de participants : 2 à 256');
  return { pp, starts, ends, max };
}

async function create(adminId, input) {
  const { pp, starts, ends, max } = validateInput(input, getEngine(input.gameId));
  const { rows } = await pool.query(
    `INSERT INTO tournaments (game_id, name, description, format, starts_at, ends_at, max_participants, players_per_match, rules, invite_only, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [input.gameId, String(input.name).trim(), input.description || null, input.format, starts, ends, max, pp,
      JSON.stringify(input.rules || {}), !!input.inviteOnly, adminId]);
  await logAudit(adminId, 'CREATE', 'tournament', rows[0].id, null, rows[0]);
  return rows[0];
}

async function update(adminId, id, input) {
  const t = await get(id);
  if (t.status !== 'draft' && t.status !== 'registration') throw bad('LOCKED', 'Tournoi déjà lancé');
  const merged = {
    gameId: input.gameId ?? t.game_id, name: input.name ?? t.name, format: input.format ?? t.format,
    startsAt: input.startsAt ?? t.starts_at, endsAt: input.endsAt ?? t.ends_at,
    maxParticipants: input.maxParticipants ?? t.max_participants, playersPerMatch: input.playersPerMatch ?? t.players_per_match,
  };
  const { pp, starts, ends, max } = validateInput(merged, getEngine(merged.gameId));
  const { rows } = await pool.query(
    `UPDATE tournaments SET game_id = $2, name = $3, description = $4, format = $5, starts_at = $6, ends_at = $7,
            max_participants = $8, players_per_match = $9, rules = $10, invite_only = $11
      WHERE id = $1 RETURNING *`,
    [id, merged.gameId, String(merged.name).trim(), input.description ?? t.description, merged.format, starts, ends, max, pp,
      JSON.stringify(input.rules ?? t.rules), input.inviteOnly ?? t.invite_only]);
  await logAudit(adminId, 'UPDATE', 'tournament', id, t, rows[0]);
  return rows[0];
}

async function openRegistration(adminId, id) {
  const t = await get(id);
  if (t.status !== 'draft') throw bad('BAD_STATUS', 'Seul un brouillon peut être publié');
  await pool.query(`UPDATE tournaments SET status = 'registration', published_at = NOW() WHERE id = $1`, [id]);
  await logAudit(adminId, 'PUBLISH', 'tournament', id, { status: t.status }, { status: 'registration' });
}

async function participantCount(id, db = pool) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM tournament_players WHERE tournament_id = $1 AND status <> 'withdrawn'`, [id]);
  return rows[0].n;
}

async function register(id, userId, { byAdmin = false } = {}) {
  await pool.tx(async (db) => {
    const t = (await db.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!t) throw notFound('Tournoi introuvable');
    if (t.status !== 'registration' && !(byAdmin && t.status === 'draft')) throw bad('CLOSED', 'Les inscriptions sont fermées');
    if (t.invite_only && !byAdmin) throw forbidden('Tournoi sur invitation uniquement');
    if (await participantCount(id, db) >= t.max_participants) throw bad('FULL', 'Le tournoi est complet');
    await db.query(
      `INSERT INTO tournament_players (tournament_id, user_id) VALUES ($1, $2)
       ON CONFLICT (tournament_id, user_id) DO UPDATE SET status = 'registered', registered_at = NOW()`, [id, userId]);
    analytics.track('tournament_joined', { userId, gameId: t.game_id, properties: { tournamentId: id, byAdmin } }, db);
  });
}

async function unregister(id, userId) {
  const t = await get(id);
  if (t.status !== 'registration' && t.status !== 'draft') throw bad('LOCKED', 'Le tournoi a commencé');
  await pool.query(`DELETE FROM tournament_players WHERE tournament_id = $1 AND user_id = $2`, [id, userId]);
}

// Répartit les joueurs en groupes de taille ≤ pp, le plus équilibrés possible.
// Un groupe d'un seul joueur est une exemption (bye).
function makeGroups(players, pp) {
  const n = players.length;
  if (n <= 1) return [players];
  const count = Math.ceil(n / pp);
  const groups = Array.from({ length: count }, () => []);
  // répartition « serpent » par tête de série
  players.forEach((p, i) => {
    const row = Math.floor(i / count);
    const col = row % 2 === 0 ? i % count : count - 1 - (i % count);
    groups[col].push(p);
  });
  return groups;
}

// Calendrier « méthode du cercle » pour le round robin.
function roundRobinRounds(players) {
  const list = [...players];
  if (list.length % 2) list.push(null);
  const rounds = [];
  const n = list.length;
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]; const b = list[n - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

async function openMatchRoom(t, tm) {
  const room = await rooms.createRoom({
    gameId: t.game_id, hostId: null, visibility: 'private', source: 'tournament',
    maxPlayers: tm.player_ids.length, tournamentMatchId: tm.id,
  });
  room.allowed = tm.player_ids;
  await pool.query(`UPDATE tournament_matches SET room_id = $2, status = 'ready' WHERE id = $1`, [tm.id, room.id]);
  for (const u of tm.player_ids) {
    await notifications.notify(u, 'tournament_match', `${t.name} : ton match est prêt`, `Tour ${tm.round} — rejoins le salon ${room.code}`,
      { tournamentId: t.id, roomCode: room.code, roomId: room.id, gameId: t.game_id });
  }
  return room;
}

async function createRound(t, round, groups) {
  const created = [];
  for (let i = 0; i < groups.length; i++) {
    const ids = groups[i];
    const bye = ids.length < 2;
    const { rows } = await pool.query(
      `INSERT INTO tournament_matches (tournament_id, round, position, player_ids, status, winner_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [t.id, round, i + 1, ids, bye ? 'bye' : 'pending', bye ? ids[0] : null]);
    created.push(rows[0]);
  }
  for (const tm of created) if (tm.status === 'pending') await openMatchRoom(t, tm);
  return created;
}

async function start(adminId, id) {
  const t = await get(id);
  if (t.status !== 'registration' && t.status !== 'draft') throw bad('BAD_STATUS', 'Tournoi déjà lancé ou terminé');
  // têtes de série : cote du jeu décroissante
  const { rows } = await pool.query(
    `SELECT tp.user_id FROM tournament_players tp
       LEFT JOIN player_game_stats s ON s.user_id = tp.user_id AND s.game_id = $2
      WHERE tp.tournament_id = $1 AND tp.status = 'registered'
      ORDER BY COALESCE(s.rating, 1000) DESC, tp.registered_at`, [id, t.game_id]);
  const players = rows.map(r => r.user_id);
  if (players.length < 2) throw bad('NOT_ENOUGH', 'Au moins 2 participants sont nécessaires');
  for (let i = 0; i < players.length; i++) {
    await pool.query('UPDATE tournament_players SET seed = $3 WHERE tournament_id = $1 AND user_id = $2', [id, players[i], i + 1]);
  }
  await pool.query(`UPDATE tournaments SET status = 'in_progress', published_at = COALESCE(published_at, NOW()) WHERE id = $1`, [id]);
  const fresh = await get(id);
  if (t.format === 'round_robin') {
    const rounds = roundRobinRounds(players);
    await pool.query(`UPDATE tournaments SET rules = rules || $2::jsonb WHERE id = $1`,
      [id, JSON.stringify({ schedule: rounds })]);
    await createRound(fresh, 1, rounds[0]);
  } else {
    await createRound(fresh, 1, makeGroups(players, t.players_per_match));
  }
  await logAudit(adminId, 'START', 'tournament', id, { status: t.status }, { status: 'in_progress', participants: players.length });
  await maybeAdvance(id);
}

// Vérifie si le tour courant est terminé et crée le suivant (ou clôt le tournoi).
async function maybeAdvance(id) {
  const t = await get(id);
  if (t.status !== 'in_progress') return;
  const { rows } = await pool.query(
    'SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY round, position', [id]);
  const lastRound = Math.max(...rows.map(r => r.round));
  const current = rows.filter(r => r.round === lastRound);
  if (current.some(r => !['completed', 'bye'].includes(r.status))) return;

  if (t.format === 'round_robin') {
    const schedule = t.rules?.schedule || [];
    if (lastRound < schedule.length) return void await createRound(t, lastRound + 1, schedule[lastRound]);
    return finalize(t, rows);
  }
  const winners = current.map(r => r.winner_id).filter(Boolean);
  if (winners.length <= 1) return finalize(t, rows);
  await createRound(t, lastRound + 1, makeGroups(winners, t.players_per_match));
  await maybeAdvance(id);
}

async function finalize(t, matches) {
  const standings = new Map();
  const ensure = (u) => { if (!standings.has(u)) standings.set(u, { userId: u, points: 0, wins: 0, best: 0 }); return standings.get(u); };
  const { rows: players } = await pool.query('SELECT user_id FROM tournament_players WHERE tournament_id = $1 AND status <> \'withdrawn\'', [t.id]);
  players.forEach(p => ensure(p.user_id));
  for (const m of matches) {
    for (const u of m.player_ids) {
      const s = ensure(u);
      s.best = Math.max(s.best, m.round);
      if (t.format === 'round_robin' && m.status === 'completed') {
        if (m.winner_id === u) { s.points += 3; s.wins += 1; } else if (!m.winner_id) s.points += 1;
      } else if (m.winner_id === u && m.status === 'completed') s.wins += 1;
    }
  }
  let ordered;
  if (t.format === 'round_robin') {
    ordered = [...standings.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
  } else {
    const maxRound = Math.max(...matches.map(m => m.round));
    const champion = matches.find(m => m.round === maxRound)?.winner_id;
    ordered = [...standings.values()].sort((a, b) =>
      (b.userId === champion) - (a.userId === champion) || b.best - a.best || b.wins - a.wins);
  }
  let rank = 0; let prevKey = null;
  await pool.tx(async (db) => {
    await db.query('DELETE FROM tournament_results WHERE tournament_id = $1', [t.id]);
    ordered.forEach((s, i) => {
      const key = t.format === 'round_robin' ? `${s.points}:${s.wins}` : `${i === 0 ? 'champ' : s.best}`;
      if (key !== prevKey) rank = i + 1;
      prevKey = key;
      s.rank = rank;
    });
    for (const s of ordered) {
      await db.query('INSERT INTO tournament_results (tournament_id, user_id, rank, points, wins) VALUES ($1,$2,$3,$4,$5)',
        [t.id, s.userId, s.rank, s.points, s.wins]);
    }
    await db.query(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [t.id]);
  });
}

// Publication des gagnants : notification à tous les participants.
async function publishResults(adminId, id) {
  const t = await get(id);
  if (t.status !== 'completed') throw bad('NOT_COMPLETED', 'Le tournoi n\'est pas terminé');
  const { rows } = await pool.query(
    `SELECT r.rank, u.username FROM tournament_results r JOIN users u ON u.id = r.user_id
      WHERE r.tournament_id = $1 ORDER BY r.rank LIMIT 3`, [id]);
  await pool.query(`UPDATE tournaments SET rules = rules || $2::jsonb WHERE id = $1`,
    [id, JSON.stringify({ resultsPublishedAt: new Date().toISOString() })]);
  const podium = rows.map(r => `${r.rank}. ${r.username}`).join(' · ');
  const { rows: players } = await pool.query('SELECT user_id FROM tournament_players WHERE tournament_id = $1', [id]);
  for (const p of players) await notifications.notify(p.user_id, 'tournament_results', `${t.name} : résultats`, podium, { tournamentId: id });
  await logAudit(adminId, 'PUBLISH_RESULTS', 'tournament', id, null, { podium });
}

// Résultat d'un match de tournoi (appelé à la fin du match).
async function onMatchFinished({ match, result, isValid, cancelled }) {
  if (!match.tournamentMatchId) return;
  const { rows } = await pool.query('SELECT * FROM tournament_matches WHERE id = $1', [match.tournamentMatchId]);
  const tm = rows[0];
  if (!tm || tm.status === 'completed') return;
  const t = await get(tm.tournament_id);
  const winner = !cancelled && result && !result.isDraw ? result.placements.find(p => p.place === 1)?.userId : null;
  if (!winner && t.format === 'single_elimination') {
    // nul ou match annulé en élimination directe : on rejoue
    await pool.query(`UPDATE tournament_matches SET status = 'pending', match_id = $2 WHERE id = $1`, [tm.id, match.id]);
    await openMatchRoom(t, tm);
    return;
  }
  await pool.query(`UPDATE tournament_matches SET status = 'completed', winner_id = $2, match_id = $3 WHERE id = $1`,
    [tm.id, winner, match.id]);
  if (t.format === 'single_elimination') {
    await pool.query(`UPDATE tournament_players SET status = 'eliminated' WHERE tournament_id = $1 AND user_id = ANY($2::uuid[]) AND user_id <> $3`,
      [t.id, tm.player_ids, winner]);
  }
  await maybeAdvance(t.id);
  void isValid;
}

runtime.onMatchEnded((evt) => onMatchFinished(evt));

// Décision manuelle d'un administrateur (forfait, joueur absent) — journalisée.
async function setMatchWinner(adminId, tournamentMatchId, winnerId, reason) {
  const { rows } = await pool.query('SELECT * FROM tournament_matches WHERE id = $1', [tournamentMatchId]);
  const tm = rows[0];
  if (!tm) throw notFound('Confrontation introuvable');
  if (tm.status === 'completed') throw bad('DONE', 'Confrontation déjà terminée');
  if (winnerId && !tm.player_ids.includes(winnerId)) throw bad('BAD_WINNER', 'Ce joueur ne participe pas à cette confrontation');
  if (!reason) throw bad('REASON_REQUIRED', 'Un motif est obligatoire');
  const live = tm.match_id ? runtime.getLive(tm.match_id) : null;
  if (live) throw bad('LIVE', 'Un match est en cours pour cette confrontation');
  await pool.query(`UPDATE tournament_matches SET status = 'completed', winner_id = $2 WHERE id = $1`, [tm.id, winnerId || null]);
  await logAudit(adminId, 'SET_WINNER', 'tournament_match', tm.id, { status: tm.status, winner: tm.winner_id }, { winner: winnerId }, { reason });
  const t = await get(tm.tournament_id);
  if (t.format === 'single_elimination') {
    await pool.query(`UPDATE tournament_players SET status = 'eliminated' WHERE tournament_id = $1 AND user_id = ANY($2::uuid[]) AND user_id IS DISTINCT FROM $3`,
      [t.id, tm.player_ids, winnerId || null]);
  }
  await maybeAdvance(t.id);
}

async function cancel(adminId, id, reason) {
  const t = await get(id);
  if (t.status === 'completed' || t.status === 'cancelled') throw bad('BAD_STATUS', 'Tournoi déjà terminé');
  await pool.query(`UPDATE tournaments SET status = 'cancelled' WHERE id = $1`, [id]);
  await logAudit(adminId, 'CANCEL', 'tournament', id, { status: t.status }, { status: 'cancelled' }, { reason });
}

// Au démarrage du serveur, rouvre les salons des confrontations en attente.
async function reopenRooms() {
  const { rows } = await pool.query(
    `SELECT tm.*, t.game_id, t.name FROM tournament_matches tm JOIN tournaments t ON t.id = tm.tournament_id
      WHERE t.status = 'in_progress' AND tm.status IN ('pending','ready','in_progress')`);
  for (const tm of rows) {
    if (tm.match_id && runtime.getLive(tm.match_id)) continue;
    await openMatchRoom({ id: tm.tournament_id, game_id: tm.game_id, name: tm.name }, tm).catch(err => console.error('tournoi', err.message));
  }
}

async function bracket(id, viewerId = null) {
  const { rows } = await pool.query(
    `SELECT tm.id, tm.round, tm.position, tm.status, tm.winner_id, tm.match_id, tm.room_id, gr.code AS room_code,
            (SELECT json_agg(json_build_object('userId', u.id, 'username', u.username, 'avatar', u.avatar))
               FROM unnest(tm.player_ids) pid JOIN users u ON u.id = pid) AS players
       FROM tournament_matches tm LEFT JOIN game_rooms gr ON gr.id = tm.room_id
      WHERE tm.tournament_id = $1 ORDER BY tm.round, tm.position`, [id]);
  return rows.map(r => ({
    ...r,
    room_code: r.players?.some(p => p.userId === viewerId) && r.status === 'ready' ? r.room_code : null,
  }));
}

async function listPublic(userId = null) {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.description, t.game_id, t.format, t.status, t.starts_at, t.ends_at, t.max_participants,
            t.players_per_match, t.invite_only,
            (SELECT COUNT(*)::int FROM tournament_players tp WHERE tp.tournament_id = t.id AND tp.status <> 'withdrawn') AS participants,
            EXISTS (SELECT 1 FROM tournament_players tp WHERE tp.tournament_id = t.id AND tp.user_id = $1) AS registered
       FROM tournaments t
      WHERE t.published_at IS NOT NULL AND t.status IN ('registration','in_progress','completed')
      ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'registration' THEN 1 ELSE 2 END, t.starts_at DESC
      LIMIT 50`, [userId]);
  return rows;
}

async function detail(id, userId = null, { admin = false } = {}) {
  const t = await get(id);
  if (!admin && !t.published_at) throw notFound('Tournoi introuvable');
  const [players, results] = await Promise.all([
    pool.query(
      `SELECT u.id, u.username, u.avatar, tp.seed, tp.status FROM tournament_players tp JOIN users u ON u.id = tp.user_id
        WHERE tp.tournament_id = $1 ORDER BY tp.seed NULLS LAST, tp.registered_at`, [id]),
    pool.query(
      `SELECT r.rank, r.points, r.wins, u.id, u.username, u.avatar FROM tournament_results r JOIN users u ON u.id = r.user_id
        WHERE r.tournament_id = $1 ORDER BY r.rank`, [id]),
  ]);
  const { schedule, ...rules } = t.rules || {};
  return {
    ...t, rules, roundsPlanned: schedule ? schedule.length : null,
    participants: players.rows, registered: players.rows.some(p => p.id === userId),
    matches: await bracket(id, admin ? null : userId),
    results: results.rows,
  };
}

module.exports = {
  STATUSES, create, update, openRegistration, register, unregister, start, maybeAdvance, publishResults,
  setMatchWinner, cancel, reopenRooms, listPublic, detail, onMatchFinished, _internals: { makeGroups, roundRobinRounds },
};
