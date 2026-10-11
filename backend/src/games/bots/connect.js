// Bot Yas Connect : recherche negamax (élagage alpha-bêta) sur la grille visible.
// Facile : 1 coup d'avance et quelques coups au hasard ; Normal : 3 ; Difficile : 5.
const { COLS, ROWS } = require('../connect/engine')._internals;

const DEPTH = { easy: 1, normal: 3, hard: 5 };
const RANDOM_MOVE = { easy: 0.3, normal: 0.05, hard: 0 };
const ORDER = [3, 2, 4, 1, 5, 0, 6]; // le centre d'abord : meilleur élagage
const WIN = 1_000_000;

function dropRow(board, col) {
  for (let r = 0; r < ROWS; r++) if (board[r][col] === null) return r;
  return -1;
}

function isWin(board, row, col, color) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const sign of [1, -1]) {
      let r = row + dr * sign; let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) { n++; r += dr * sign; c += dc * sign; }
    }
    if (n >= 4) return true;
  }
  return false;
}

function scoreWindow(cells, me, opp) {
  let mine = 0; let theirs = 0; let empty = 0;
  for (const c of cells) {
    if (c === me) mine++;
    else if (c === opp) theirs++;
    else empty++;
  }
  if (mine && theirs) return 0;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -8;
  if (theirs === 2 && empty === 2) return -2;
  return 0;
}

// Évaluation statique : contrôle du centre + alignements ouverts.
function evaluate(board, me, opp) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) {
    if (board[r][3] === me) s += 3;
    else if (board[r][3] === opp) s -= 3;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const er = r + dr * 3; const ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        s += scoreWindow([0, 1, 2, 3].map(k => board[r + dr * k][c + dc * k]), me, opp);
      }
    }
  }
  return s;
}

function negamax(board, depth, alpha, beta, me, opp, empties) {
  if (depth === 0 || empties === 0) return evaluate(board, me, opp);
  let best = -Infinity;
  for (const col of ORDER) {
    const row = dropRow(board, col);
    if (row < 0) continue;
    board[row][col] = me;
    const score = isWin(board, row, col, me) ? WIN + depth
      : empties === 1 ? 0
        : -negamax(board, depth - 1, -beta, -alpha, opp, me, empties - 1);
    board[row][col] = null;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? 0 : best;
}

function chooseColumn(view, botId, { level = 'normal', rng }) {
  const board = view.board.map(r => [...r]);
  const me = view.colors[botId];
  const opp = me === 'yellow' ? 'blue' : 'yellow';
  const legal = ORDER.filter(c => dropRow(board, c) >= 0);
  if (!legal.length) return null;
  if (rng.int(1000) < (RANDOM_MOVE[level] ?? 0) * 1000) return legal[rng.int(legal.length)];
  const empties = board.flat().filter(c => c === null).length;
  const depth = DEPTH[level] || DEPTH.normal;
  let best = -Infinity; let choices = [];
  for (const col of legal) {
    const row = dropRow(board, col);
    board[row][col] = me;
    const score = isWin(board, row, col, me) ? WIN + depth
      : empties === 1 ? 0
        : -negamax(board, depth - 1, -Infinity, Infinity, opp, me, empties - 1);
    board[row][col] = null;
    if (score > best) { best = score; choices = [col]; } else if (score === best) choices.push(col);
  }
  return choices[rng.int(choices.length)];
}

function decide(view, botId, opts) {
  if (view.status !== 'playing' || view.turn !== botId) return null;
  const col = chooseColumn(view, botId, opts);
  return col == null ? null : { action: { type: 'drop', col }, think: [700, 1600] };
}

module.exports = { decide, _internals: { chooseColumn, evaluate } };
