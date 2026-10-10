// Yas Connect — 7 colonnes × 6 lignes, aligner 4 jetons. Deux joueurs.
const { EngineError } = require('../engineError');

const COLS = 7;
const ROWS = 6;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]]; // horizontal, vertical, diag ↗, diag ↘ (en (dr, dc))

function init({ players, rng, now, config }) {
  if (players.length !== 2) throw new EngineError('BAD_PLAYERS', 'Yas Connect se joue à 2');
  const order = [...players].sort((a, b) => a.seat - b.seat).map(p => p.userId);
  const first = rng.int(2);
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)), // board[row][col], row 0 = bas
    players: order,                          // index 0 = jaune, 1 = bleu
    colors: { [order[0]]: 'yellow', [order[1]]: 'blue' },
    turn: order[first],
    moves: [],                                // [{ userId, col, row }]
    turnStartedAt: now,
    turnDeadline: now + config.turnSeconds * 1000,
    winner: null,
    winLine: null,
    status: 'playing',                        // playing | finished
    endReason: null,
  };
}

function view(state) {
  // Aucune information cachée dans Yas Connect.
  return {
    board: state.board, colors: state.colors, players: state.players, turn: state.turn,
    lastMove: state.moves[state.moves.length - 1] || null, moveCount: state.moves.length,
    turnDeadline: state.turnDeadline, winner: state.winner, winLine: state.winLine,
    status: state.status, endReason: state.endReason,
  };
}

function findWinLine(board, row, col) {
  const color = board[row][col];
  for (const [dr, dc] of DIRS) {
    const line = [[row, col]];
    for (const sign of [1, -1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) {
        line.push([r, c]);
        r += dr * sign; c += dc * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  return null;
}

function opponent(state, userId) {
  return state.players.find(p => p !== userId);
}

function apply(state, userId, action, { now, config }) {
  if (state.status !== 'playing') throw new EngineError('GAME_OVER', 'La partie est terminée');
  if (!state.players.includes(userId)) throw new EngineError('NOT_PLAYER', 'Vous ne jouez pas dans cette partie');
  if (action?.type !== 'drop') throw new EngineError('BAD_ACTION', 'Action inconnue');
  if (state.turn !== userId) throw new EngineError('NOT_YOUR_TURN', 'Ce n\'est pas votre tour');
  const col = action.col;
  if (!Number.isInteger(col) || col < 0 || col >= COLS) throw new EngineError('BAD_COLUMN', 'Colonne invalide');
  const row = state.board.findIndex(r => r[col] === null);
  if (row === -1) throw new EngineError('COLUMN_FULL', 'Cette colonne est pleine');

  const s = structuredClone(state);
  s.board[row][col] = s.colors[userId];
  s.moves.push({ userId, col, row });
  const events = [{ type: 'disc_dropped', payload: { userId, col, row, color: s.colors[userId] } }];

  const line = findWinLine(s.board, row, col);
  if (line) {
    s.status = 'finished';
    s.winner = userId;
    s.winLine = line;
    s.endReason = 'connect_four';
    s.turn = null;
    s.turnDeadline = null;
    events.push({ type: 'game_won', payload: { userId, line } });
  } else if (s.moves.length === ROWS * COLS) {
    s.status = 'finished';
    s.endReason = 'board_full';
    s.turn = null;
    s.turnDeadline = null;
    events.push({ type: 'game_draw', payload: {} });
  } else {
    s.turn = opponent(s, userId);
    s.turnStartedAt = now;
    s.turnDeadline = now + config.turnSeconds * 1000;
  }
  return { state: s, events };
}

function deadline(state) {
  if (state.status !== 'playing') return null;
  return { at: state.turnDeadline, userIds: [state.turn] };
}

// Chronomètre expiré : le joueur dont c'est le tour perd par forfait.
function timeout(state, ctx) {
  if (state.status !== 'playing') return { state, events: [] };
  return forfeit(state, state.turn, ctx, 'timeout');
}

function forfeit(state, userId, _ctx, reason = 'forfeit') {
  if (state.status !== 'playing') return { state, events: [] };
  const s = structuredClone(state);
  s.status = 'finished';
  s.winner = opponent(s, userId);
  s.endReason = reason;
  s.turn = null;
  s.turnDeadline = null;
  return { state: s, events: [{ type: reason === 'timeout' ? 'turn_timeout' : 'player_forfeit', payload: { userId } }] };
}

// Reprise après redémarrage du serveur : le tour en cours repart à zéro.
function resume(state, { now, config }) {
  if (state.status !== 'playing') return state;
  return { ...state, turnStartedAt: now, turnDeadline: now + config.turnSeconds * 1000 };
}

function result(state) {
  if (state.status !== 'finished') return null;
  const movesOf = (u) => state.moves.filter(m => m.userId === u).length;
  if (!state.winner) {
    return {
      isDraw: true, reason: state.endReason,
      placements: state.players.map(u => ({ userId: u, place: 1, outcome: 'draw', stats: { moves: movesOf(u) } })),
    };
  }
  const loser = opponent(state, state.winner);
  return {
    isDraw: false, reason: state.endReason,
    placements: [
      { userId: state.winner, place: 1, outcome: 'win', stats: { moves: movesOf(state.winner) } },
      { userId: loser, place: 2, outcome: 'loss', stats: { moves: movesOf(loser) } },
    ],
  };
}

function actionsCount(state, userId) {
  return state.moves.filter(m => m.userId === userId).length;
}

module.exports = {
  id: 'connect', rulesVersion: '1.0.0', minPlayers: 2, maxPlayers: 2,
  init, view, apply, deadline, timeout, forfeit, result, actionsCount, resume,
  _internals: { findWinLine, COLS, ROWS },
};
