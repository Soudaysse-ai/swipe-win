const express = require('express');
const router = express.Router();
const lb = require('../services/leaderboards');
const analytics = require('../services/analytics');
const { optionalPlayer, requirePlayer } = require('../middleware/playerAuth');
const { ah } = require('../lib/http');
const { getEngine } = require('../games');
const { notFound } = require('../lib/errors');

function params(req) {
  return {
    period: lb.PERIODS.includes(req.query.period) ? req.query.period : 'season',
    limit: req.query.limit,
    board: 'rating',
  };
}

router.get('/global', optionalPlayer, ah(async (req, res) => {
  const p = params(req);
  if (req.user) analytics.track('leaderboard_viewed', { userId: req.user.userId, properties: { board: 'global', period: p.period } });
  res.json(await lb.getBoard({ ...p, gameId: null, userId: req.user?.userId }));
}));

router.get('/:gameId', optionalPlayer, ah(async (req, res) => {
  if (!getEngine(req.params.gameId)) throw notFound('Jeu inconnu');
  const p = params(req);
  if (req.user) analytics.track('leaderboard_viewed', { userId: req.user.userId, gameId: req.params.gameId, properties: { period: p.period, board: p.board } });
  res.json(await lb.getBoard({ ...p, gameId: req.params.gameId, userId: req.user?.userId }));
}));

router.get('/:gameId/me', requirePlayer, ah(async (req, res) => {
  const gameId = req.params.gameId === 'global' ? null : req.params.gameId;
  if (gameId && !getEngine(gameId)) throw notFound('Jeu inconnu');
  const board = await lb.getBoard({ ...params(req), gameId, userId: req.user.userId, limit: 1 });
  res.json({ me: board.me, total: board.total });
}));

module.exports = router;
