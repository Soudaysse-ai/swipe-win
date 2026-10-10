const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../src/games/connect/engine');
const { ctx, scriptedRng } = require('../helpers/engine');

const CONFIG = { turnSeconds: 20 };
const A = 'user-a';
const B = 'user-b';

function start(firstIndex = 0) {
  const c = ctx({ config: CONFIG, rng: scriptedRng([firstIndex]) });
  const state = engine.init({ players: [{ userId: A, seat: 0 }, { userId: B, seat: 1 }], ...c });
  return { state, c: ctx({ config: CONFIG }) };
}

// Joue une suite de colonnes en alternant à partir du joueur au trait.
function playCols(state, cols, c) {
  for (const col of cols) state = engine.apply(state, state.turn, { type: 'drop', col }, c).state;
  return state;
}

test('init : couleurs distinctes, premier joueur tiré au sort, plateau vide', () => {
  const { state } = start(1);
  assert.equal(state.turn, B);
  assert.notEqual(state.colors[A], state.colors[B]);
  assert.equal(state.board.length, 6);
  assert.ok(state.board.every(r => r.length === 7 && r.every(c => c === null)));
  assert.equal(state.turnDeadline, 1_000_000 + 20_000);
});

test('le jeton tombe dans la case libre la plus basse', () => {
  let { state, c } = start(0);
  state = playCols(state, [3, 3], c);
  assert.equal(state.board[0][3], 'yellow');
  assert.equal(state.board[1][3], 'blue');
});

test('refuse de jouer hors de son tour', () => {
  const { state, c } = start(0);
  assert.throws(() => engine.apply(state, B, { type: 'drop', col: 0 }, c), { code: 'NOT_YOUR_TURN' });
});

test('refuse une colonne pleine et une colonne invalide', () => {
  let { state, c } = start(0);
  state = playCols(state, [0, 0, 0, 0, 0, 0], c);
  assert.throws(() => engine.apply(state, state.turn, { type: 'drop', col: 0 }, c), { code: 'COLUMN_FULL' });
  assert.throws(() => engine.apply(state, state.turn, { type: 'drop', col: 7 }, c), { code: 'BAD_COLUMN' });
  assert.throws(() => engine.apply(state, state.turn, { type: 'drop', col: '2' }, c), { code: 'BAD_COLUMN' });
});

test('refuse un joueur étranger à la partie', () => {
  const { state, c } = start(0);
  assert.throws(() => engine.apply(state, 'intrus', { type: 'drop', col: 0 }, c), { code: 'NOT_PLAYER' });
});

test('victoire horizontale', () => {
  let { state, c } = start(0);
  state = playCols(state, [0, 0, 1, 1, 2, 2, 3], c);
  assert.equal(state.status, 'finished');
  assert.equal(state.winner, A);
  assert.deepEqual(state.winLine, [[0, 0], [0, 1], [0, 2], [0, 3]]);
  const r = engine.result(state);
  assert.equal(r.isDraw, false);
  assert.deepEqual(r.placements.map(p => [p.userId, p.place, p.outcome]), [[A, 1, 'win'], [B, 2, 'loss']]);
});

test('victoire verticale', () => {
  let { state, c } = start(0);
  state = playCols(state, [4, 5, 4, 5, 4, 5, 4], c);
  assert.equal(state.winner, A);
  assert.equal(state.winLine.length, 4);
  assert.ok(state.winLine.every(([, col]) => col === 4));
});

test('victoire diagonale ascendante', () => {
  let { state, c } = start(0);
  // A : (0,0) (1,1) (2,2) (3,3)
  state = playCols(state, [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3], c);
  assert.equal(state.winner, A);
  assert.deepEqual(state.winLine, [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test('victoire diagonale descendante', () => {
  let { state, c } = start(0);
  // A : (3,0) (2,1) (1,2) (0,3)
  state = playCols(state, [3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0], c);
  assert.equal(state.winner, A);
  assert.deepEqual(state.winLine, [[3, 0], [2, 1], [1, 2], [0, 3]]);
});

test('aucun coup accepté après la fin de partie', () => {
  let { state, c } = start(0);
  state = playCols(state, [0, 0, 1, 1, 2, 2, 3], c);
  assert.throws(() => engine.apply(state, B, { type: 'drop', col: 5 }, c), { code: 'GAME_OVER' });
});

test('match nul quand la grille est pleine sans alignement', () => {
  // Recherche d'une partie complète sans alignement (DFS sur l'ordre des colonnes).
  const { state: initial, c } = start(0);
  function dfs(state) {
    if (state.status === 'finished') return state.winner ? null : state;
    for (let col = 0; col < 7; col++) {
      let next;
      try { next = engine.apply(state, state.turn, { type: 'drop', col }, c).state; } catch { continue; }
      if (next.winner) continue;
      const done = dfs(next);
      if (done) return done;
    }
    return null;
  }
  const final = dfs(initial);
  assert.ok(final, 'une partie nulle doit exister');
  assert.equal(final.moves.length, 42);
  const r = engine.result(final);
  assert.equal(r.isDraw, true);
  assert.ok(r.placements.every(p => p.outcome === 'draw'));
});

test('timeout : le joueur au trait perd par forfait', () => {
  const { state, c } = start(1);
  const dl = engine.deadline(state);
  assert.deepEqual(dl.userIds, [B]);
  const out = engine.timeout(state, c).state;
  assert.equal(out.status, 'finished');
  assert.equal(out.winner, A);
  assert.equal(out.endReason, 'timeout');
  assert.equal(engine.deadline(out), null);
});

test('le chronomètre repart à chaque coup', () => {
  let { state } = start(0);
  state = engine.apply(state, A, { type: 'drop', col: 0 }, ctx({ now: 2_000_000, config: CONFIG })).state;
  assert.equal(state.turnDeadline, 2_000_000 + 20_000);
});

test('chaque coup est enregistré', () => {
  let { state, c } = start(0);
  state = playCols(state, [2, 3, 4], c);
  assert.deepEqual(state.moves.map(m => m.col), [2, 3, 4]);
  assert.equal(engine.actionsCount(state, A), 2);
  assert.equal(engine.actionsCount(state, B), 1);
});
