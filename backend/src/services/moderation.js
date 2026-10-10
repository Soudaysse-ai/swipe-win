// Actions d'administration sur les joueurs, les résultats et le chat.
// Chaque action est inscrite au journal d'audit (et dans moderation_actions pour
// les sanctions) : aucune modification silencieuse des classements.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const hub = require('../realtime/hub');
const notifications = require('./notifications');
const authService = require('./authService');
const otp = require('./otpService');
const leaderboards = require('./leaderboards');
const { logAudit } = require('./audit');
const { levelForXp } = require('./progression');
const { bad, notFound } = require('../lib/errors');

const requireReason = (reason) => {
  const r = String(reason || '').trim();
  if (r.length < 3) throw bad('REASON_REQUIRED', 'Un motif est obligatoire');
  return r.slice(0, 500);
};

async function getUser(db, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId))) throw notFound('Joueur introuvable');
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw notFound('Joueur introuvable');
  return rows[0];
}

async function sanction(admin, userId, action, { reason, until = null, reportId = null }, ip) {
  const why = requireReason(reason);
  const result = await pool.tx(async (db) => {
    const u = await getUser(db, userId);
    if (u.status === 'deleted') throw bad('DELETED', 'Compte supprimé');
    let status = u.status;
    let suspendedUntil = u.suspended_until;
    if (action === 'suspend') {
      const d = until ? new Date(until) : null;
      if (d && (Number.isNaN(d.getTime()) || d <= new Date())) throw bad('BAD_DATE', 'Date de fin de suspension invalide');
      status = 'suspended'; suspendedUntil = d;
    } else if (action === 'ban') {
      status = 'banned'; suspendedUntil = null;
    } else if (action === 'reactivate') {
      if (u.status === 'active') throw bad('ALREADY_ACTIVE', 'Le compte est déjà actif');
      status = 'active'; suspendedUntil = null;
    } else if (action !== 'warn') {
      throw bad('BAD_ACTION', 'Action inconnue');
    }
    await db.query('UPDATE users SET status = $2, suspended_until = $3 WHERE id = $1', [userId, status, suspendedUntil]);
    if (status !== 'active') await db.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await db.query(
      `INSERT INTO moderation_actions (admin_id, user_id, action, reason, until, report_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [admin.id, userId, action, why, suspendedUntil, reportId]);
    await logAudit(admin.id, action.toUpperCase(), 'user', userId,
      { status: u.status, suspended_until: u.suspended_until }, { status, suspended_until: suspendedUntil }, { reason: why, ip }, db);
    return { status, suspendedUntil };
  });
  authService.invalidateUserCache(userId);
  if (result.status !== 'active') hub.disconnectUser(userId);
  if (action === 'warn') notifications.notify(userId, 'moderation', 'Avertissement de la modération', why);
  return result;
}

// Suppression / anonymisation : les statistiques agrégées sont conservées
// (sans identité), les données personnelles sont effacées.
async function anonymize(admin, userId, reason, ip) {
  const why = requireReason(reason);
  await pool.tx(async (db) => {
    const u = await getUser(db, userId);
    const tag = crypto.randomBytes(8).toString('hex');
    await db.query(
      `UPDATE users SET phone = $2, username = $3, password_hash = $4, status = 'deleted', deleted_at = NOW(),
              avatar = 'yas-01', phone_verified = false WHERE id = $1`,
      [userId, `del-${tag}`, `ancien_${tag.slice(0, 8)}`, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4)]);
    await db.query('UPDATE profiles SET bio = NULL WHERE user_id = $1', [userId]);
    if (u.legacy_player_id) await db.query('UPDATE players SET phone = $2, name = NULL WHERE id = $1', [u.legacy_player_id, `del-${tag}`]);
    await db.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await db.query('DELETE FROM friendships WHERE user_a = $1 OR user_b = $1', [userId]);
    await db.query(`UPDATE friend_requests SET status = 'cancelled' WHERE (from_user_id = $1 OR to_user_id = $1) AND status = 'pending'`, [userId]);
    await db.query('UPDATE chat_messages SET hidden_at = NOW(), hidden_by = $2 WHERE user_id = $1 AND hidden_at IS NULL', [userId, admin.id]);
    await db.query(`INSERT INTO moderation_actions (admin_id, user_id, action, reason) VALUES ($1,$2,'anonymize',$3)`, [admin.id, userId, why]);
    await logAudit(admin.id, 'ANONYMIZE', 'user', userId, { username: u.username }, null, { reason: why, ip }, db);
  });
  authService.invalidateUserCache(userId);
  hub.disconnectUser(userId);
  leaderboards.invalidate();
}

// Code de réinitialisation remis par le service client (quand le SMS n'est pas disponible).
async function resetCode(admin, userId, reason, ip) {
  const why = requireReason(reason);
  const u = await getUser(pool, userId);
  if (u.status === 'deleted') throw bad('DELETED', 'Compte supprimé');
  const code = await otp.createCode(u.phone, 'reset');
  await pool.query(`INSERT INTO moderation_actions (admin_id, user_id, action, reason) VALUES ($1,$2,'reset_password',$3)`, [admin.id, userId, why]);
  await logAudit(admin.id, 'RESET_CODE', 'user', userId, null, null, { reason: why, ip });
  return { code, expiresInMinutes: 10 };
}

// Correction manuelle de score (points de saison ou XP) — toujours journalisée.
async function adjustScore(admin, userId, { kind, amount, gameId, reason }, ip) {
  const why = requireReason(reason);
  const n = parseInt(amount, 10);
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 10000) throw bad('BAD_AMOUNT', 'Montant invalide');
  await pool.tx(async (db) => {
    await getUser(db, userId);
    if (kind === 'season_points') {
      const g = await db.query('SELECT id FROM games WHERE id = $1', [gameId]);
      if (!g.rows.length) throw bad('BAD_GAME', 'Jeu requis pour une correction de points');
      const season = await db.query('SELECT id FROM seasons WHERE is_active LIMIT 1');
      if (!season.rows.length) throw bad('NO_SEASON', 'Aucune saison active');
      await db.query(
        `INSERT INTO season_points (season_id, user_id, game_id, points, counted, reason, admin_id) VALUES ($1,$2,$3,$4,true,'admin_adjustment',$5)`,
        [season.rows[0].id, userId, gameId, n, admin.id]);
    } else if (kind === 'xp') {
      await db.query(
        `INSERT INTO xp_transactions (user_id, amount, reason, idempotency_key) VALUES ($1,$2,'admin_adjustment',$3)`,
        [userId, n, `admin:${crypto.randomUUID()}`]);
      await db.query('INSERT INTO player_global_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
      const { rows } = await db.query('UPDATE player_global_stats SET xp = GREATEST(0, xp + $2) WHERE user_id = $1 RETURNING xp', [userId, n]);
      await db.query('UPDATE player_global_stats SET level = $2 WHERE user_id = $1', [userId, levelForXp(Number(rows[0].xp))]);
    } else {
      throw bad('BAD_KIND', 'Type de correction inconnu');
    }
    await logAudit(admin.id, 'SCORE_ADJUST', 'user', userId, null, { kind, amount: n, gameId: gameId || null }, { reason: why, ip }, db);
  });
  leaderboards.invalidate();
}

// Examen d'un match suspect : validé (cleared) ou annulé (voided). L'annulation
// passe des écritures compensatoires — l'historique n'est jamais effacé.
async function reviewMatch(admin, matchId, decision, reason, ip) {
  const why = requireReason(reason);
  if (!['clear', 'void'].includes(decision)) throw bad('BAD_DECISION', 'Décision inconnue');
  await pool.tx(async (db) => {
    const { rows } = await db.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
    const m = rows[0];
    if (!m) throw notFound('Match introuvable');
    if (m.review_status === 'voided') throw bad('ALREADY_VOIDED', 'Match déjà annulé');
    const res = (await db.query('SELECT * FROM match_results WHERE match_id = $1', [matchId])).rows[0];
    if (decision === 'void' && res?.is_valid) {
      const players = (await db.query('SELECT * FROM match_players WHERE match_id = $1', [matchId])).rows;
      for (const p of players) {
        const pts = await db.query(`SELECT season_id, game_id, points FROM season_points WHERE match_id = $1 AND user_id = $2 AND reason = 'match'`, [matchId, p.user_id]);
        for (const sp of pts.rows) {
          if (sp.points) await db.query(
            `INSERT INTO season_points (season_id, user_id, game_id, match_id, points, counted, reason, admin_id) VALUES ($1,$2,$3,$4,$5,false,'void',$6)`,
            [sp.season_id, p.user_id, sp.game_id, matchId, -sp.points, admin.id]);
        }
        const xp = await db.query('SELECT COALESCE(SUM(amount), 0)::int AS xp FROM xp_transactions WHERE match_id = $1 AND user_id = $2', [matchId, p.user_id]);
        const lost = xp.rows[0].xp;
        if (lost) {
          await db.query(`INSERT INTO xp_transactions (user_id, match_id, amount, reason, idempotency_key) VALUES ($1,$2,$3,'void',$4)`,
            [p.user_id, matchId, -lost, `void:${matchId}:${p.user_id}`]);
          const g = await db.query('UPDATE player_global_stats SET xp = GREATEST(0, xp - $2) WHERE user_id = $1 RETURNING xp', [p.user_id, lost]);
          await db.query('UPDATE player_global_stats SET level = $2 WHERE user_id = $1', [p.user_id, levelForXp(Number(g.rows[0].xp))]);
        }
        const win = p.outcome === 'win' ? 1 : 0;
        const draw = p.outcome === 'draw' ? 1 : 0;
        const loss = !win && !draw ? 1 : 0;
        const delta = p.rating_after != null ? Number(p.rating_after) - Number(p.rating_before) : 0;
        const placeCol = !draw && p.placement >= 1 && p.placement <= 4 ? `place_${p.placement}` : null;
        await db.query(
          `UPDATE player_game_stats SET games_played = GREATEST(0, games_played - 1), wins = GREATEST(0, wins - $3),
                  losses = GREATEST(0, losses - $4), draws = GREATEST(0, draws - $5),
                  ${placeCol ? `${placeCol} = GREATEST(0, ${placeCol} - 1),` : ''} rating = rating - $6
            WHERE user_id = $1 AND game_id = $2`,
          [p.user_id, m.game_id, win, loss, draw, delta]);
        if (delta) await db.query(
          `INSERT INTO rating_transactions (user_id, game_id, match_id, rating_before, rating_after, reason, admin_id)
           SELECT $1::uuid, $2::varchar, $3::uuid, rating + $4::numeric, rating, 'void', $5::uuid FROM player_game_stats WHERE user_id = $1::uuid AND game_id = $2::varchar`,
          [p.user_id, m.game_id, matchId, delta, admin.id]);
        await db.query(`UPDATE player_global_stats SET matches_played = GREATEST(0, matches_played - 1), wins = GREATEST(0, wins - $2) WHERE user_id = $1`,
          [p.user_id, win]);
      }
      await db.query('UPDATE match_results SET is_valid = false WHERE match_id = $1', [matchId]);
      await db.query('UPDATE matches SET is_valid = false WHERE id = $1', [matchId]);
    }
    await db.query('UPDATE matches SET review_status = $2 WHERE id = $1', [matchId, decision === 'void' ? 'voided' : 'cleared']);
    await logAudit(admin.id, decision === 'void' ? 'VOID_MATCH' : 'CLEAR_MATCH', 'match', matchId,
      { review_status: m.review_status, is_valid: m.is_valid }, { review_status: decision === 'void' ? 'voided' : 'cleared' }, { reason: why, ip }, db);
  });
  leaderboards.invalidate();
}

async function hideMessage(admin, messageId, reason, ip) {
  const why = requireReason(reason);
  const { rows } = await pool.query(
    'UPDATE chat_messages SET hidden_at = NOW(), hidden_by = $2 WHERE id = $1 AND hidden_at IS NULL RETURNING id, room_id, user_id',
    [messageId, admin.id]);
  if (!rows[0]) throw notFound('Message introuvable ou déjà masqué');
  await pool.query(`INSERT INTO moderation_actions (admin_id, user_id, action, reason) VALUES ($1,$2,'hide_message',$3)`, [admin.id, rows[0].user_id, why]);
  await logAudit(admin.id, 'HIDE_MESSAGE', 'chat_message', messageId, null, null, { reason: why, ip });
  const rooms = require('../realtime/rooms');
  const room = rooms.getRoom(rows[0].room_id);
  if (room) hub.emitToUsers([...room.players.keys()], 'chat:hidden', { messageId, roomId: rows[0].room_id });
}

async function resolveReport(admin, reportId, { status, resolution, action, until }, ip) {
  if (!['resolved', 'dismissed'].includes(status)) throw bad('BAD_STATUS', 'Statut invalide');
  const { rows } = await pool.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  const r = rows[0];
  if (!r) throw notFound('Signalement introuvable');
  if (r.status !== 'open') throw bad('DONE', 'Signalement déjà traité');
  const why = requireReason(resolution);
  if (action && action !== 'none') {
    if (action === 'hide_message' && r.chat_message_id) await hideMessage(admin, r.chat_message_id, why, ip).catch(() => {});
    else await sanction(admin, r.reported_user_id, action, { reason: why, until, reportId }, ip);
  }
  await pool.query(`UPDATE reports SET status = $2, resolution = $3, handled_by = $4, handled_at = NOW() WHERE id = $1`,
    [reportId, status, why, admin.id]);
  await logAudit(admin.id, 'RESOLVE_REPORT', 'report', reportId, { status: 'open' }, { status, action: action || 'none' }, { reason: why, ip });
}

module.exports = { sanction, anonymize, resetCode, adjustScore, reviewMatch, hideMessage, resolveReport };
