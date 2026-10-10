const express = require('express');
const router = express.Router();
const tournaments = require('../services/tournaments');
const { requirePlayer, optionalPlayer } = require('../middleware/playerAuth');
const { ah } = require('../lib/http');

router.get('/', optionalPlayer, ah(async (req, res) => {
  res.json({ tournaments: await tournaments.listPublic(req.user?.userId) });
}));

router.get('/:id', optionalPlayer, ah(async (req, res) => {
  res.json({ tournament: await tournaments.detail(req.params.id, req.user?.userId) });
}));

router.post('/:id/join', requirePlayer, ah(async (req, res) => {
  await tournaments.register(req.params.id, req.user.userId);
  res.json({ ok: true });
}));

router.delete('/:id/join', requirePlayer, ah(async (req, res) => {
  await tournaments.unregister(req.params.id, req.user.userId);
  res.json({ ok: true });
}));

module.exports = router;
