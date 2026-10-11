// API REST des salons (en complément des événements WebSocket).
const express = require('express');
const router = express.Router();
const rooms = require('../realtime/rooms');
const { requirePlayer } = require('../middleware/playerAuth');
const { ah } = require('../lib/http');
const { notFound } = require('../lib/errors');

router.use(requirePlayer);

router.get('/', ah(async (req, res) => {
  res.json({ rooms: rooms.listPublic(req.query.gameId || null) }); // salons publics ouverts
}));

router.get('/mine', ah(async (req, res) => {
  res.json({ room: rooms.roomOf(req.user.userId) });
}));

router.post('/', ah(async (req, res) => {
  const { gameId, visibility, maxPlayers } = req.body || {};
  const room = await rooms.createRoom({
    gameId, hostId: req.user.userId, visibility: visibility === 'public' ? 'public' : 'private', maxPlayers,
  });
  rooms.broadcast(room);
  res.status(201).json({ room: rooms.publicRoom(room) });
}));

router.get('/:code', ah(async (req, res) => {
  const room = rooms.getByCode(req.params.code);
  if (!room) throw notFound('Salon introuvable');
  res.json({ room: rooms.publicRoom(room) });
}));

router.post('/:code/join', ah(async (req, res) => {
  const room = await rooms.join(req.user.userId, { code: req.params.code });
  res.json({ room: rooms.publicRoom(room) });
}));

router.post('/leave', ah(async (req, res) => {
  await rooms.leave(req.user.userId);
  res.json({ ok: true });
}));

module.exports = router;
