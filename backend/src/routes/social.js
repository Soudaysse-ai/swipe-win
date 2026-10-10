// Amis, blocages, signalements.
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const friends = require('../services/friends');
const rooms = require('../realtime/rooms');
const { activityOf } = require('../realtime/socket');
const { requirePlayer } = require('../middleware/playerAuth');
const { ah } = require('../lib/http');
const { bad } = require('../lib/errors');
const { sanitize } = require('../services/contentFilter');

router.use(requirePlayer);

router.get('/friends', ah(async (req, res) => {
  res.json({ friends: await friends.list(req.user.userId, activityOf) });
}));
router.get('/friends/search', ah(async (req, res) => {
  res.json({ users: await friends.search(req.user.userId, req.query.q) });
}));
router.get('/friends/requests', ah(async (req, res) => {
  res.json({ requests: await friends.requests(req.user.userId) });
}));
router.post('/friends/requests', ah(async (req, res) => {
  res.status(201).json(await friends.sendRequest(req.user.userId, req.body.userId));
}));
router.post('/friends/requests/:id/accept', ah(async (req, res) => {
  res.json(await friends.respond(req.user.userId, req.params.id, true));
}));
router.post('/friends/requests/:id/decline', ah(async (req, res) => {
  res.json(await friends.respond(req.user.userId, req.params.id, false));
}));
router.delete('/friends/requests/:id', ah(async (req, res) => {
  await friends.cancelRequest(req.user.userId, req.params.id);
  res.json({ ok: true });
}));
router.delete('/friends/:id', ah(async (req, res) => {
  await friends.remove(req.user.userId, req.params.id);
  res.json({ ok: true });
}));
router.post('/friends/:id/invite', ah(async (req, res) => {
  const room = await friends.invite(rooms, req.user, req.params.id, req.body.gameId);
  res.json({ room });
}));

router.get('/blocks', ah(async (req, res) => {
  res.json({ blocked: await friends.blockedList(req.user.userId) });
}));
router.post('/blocks/:id', ah(async (req, res) => {
  await friends.block(req.user.userId, req.params.id);
  res.json({ ok: true });
}));
router.delete('/blocks/:id', ah(async (req, res) => {
  await friends.unblock(req.user.userId, req.params.id);
  res.json({ ok: true });
}));

const REASONS = ['insult', 'spam', 'cheating', 'inappropriate_name', 'other'];
router.post('/reports', ah(async (req, res) => {
  const { userId, reason, details, chatMessageId, matchId } = req.body || {};
  if (!userId || userId === req.user.userId) throw bad('BAD_TARGET', 'Joueur invalide');
  if (!REASONS.includes(reason)) throw bad('BAD_REASON', 'Motif invalide');
  const recent = await pool.query(
    `SELECT COUNT(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`, [req.user.userId]);
  if (recent.rows[0].n >= 10) throw bad('REPORT_LIMIT', 'Trop de signalements, réessayez plus tard');
  const { rows } = await pool.query(
    `INSERT INTO reports (reporter_id, reported_user_id, chat_message_id, match_id, reason, details)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [req.user.userId, userId, chatMessageId || null, matchId || null, reason, sanitize(details, 500) || null]);
  res.status(201).json({ id: rows[0].id });
}));

module.exports = router;
