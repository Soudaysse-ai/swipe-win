// Bots d'entraînement : ils ne jouent que des coups légaux, terminent leurs parties
// et ne s'appuient que sur la vue d'un joueur (aucune information cachée).
const test = require('node:test');
const assert = require('node:assert/strict');
const { getEngine } = require('../../src/games');
const bots = require('../../src/games/bots');
const { seededRng } = require('../../src/lib/rng');

const CONFIG = {
  connect: { turnSeconds: 20 },
  ludo: { turnSeconds: 20 },
  cards: { turnSeconds: 20 },
  penalty: { decisionSeconds: 10, revealMs: 2600 },
};

// Fait jouer une partie complète entre bots, avec le vrai moteur (qui lève une
// erreur au moindre coup illégal).
function simulate(gameId, levels, seed) {
  const engine = getEngine(gameId);
  const rng = seededRng(seed);
  const config = CONFIG[gameId];
  const players = levels.map((_, i) => ({ userId: `bot:${i + 1}`, seat: i }));
  let now = 1_000_000;
  let state = engine.init({ players, rng, now, config });
  for (let step = 0; step < 6000; step++) {
    const res = engine.result(state);
    if (res) return { res, steps: step };
    let acted = false;
    for (const [i, p] of players.entries()) {
      const d = bots.decide(gameId, engine.view(state, p.userId), p.userId, { level: levels[i], rng, now });
      if (!d) continue;
      if (d.notBefore && now < d.notBefore) now = d.notBefore;
      state = engine.apply(state, p.userId, d.action, { rng, now, config }).state;
      acted = true;
      break;
    }
    assert.ok(acted, `${gameId} : aucun bot ne joue à l'étape ${step} (partie bloquée)`);
    now += 400;
  }
  return assert.fail(`${gameId} : partie non terminée`);
}

const LEVEL_SETS = [['easy', 'hard'], ['normal', 'normal'], ['hard', 'easy']];

for (const gameId of ['connect', 'penalty']) {
  test(`${gameId} : parties complètes entre bots, à tous les niveaux`, () => {
    for (const [k, levels] of LEVEL_SETS.entries()) {
      for (let seed = 1; seed <= 6; seed++) {
        const { res } = simulate(gameId, levels, seed * 10 + k);
        assert.equal(res.placements.length, 2);
      }
    }
  });
}

for (const gameId of ['ludo', 'cards']) {
  test(`${gameId} : parties complètes entre bots, de 2 à 4 joueurs`, () => {
    for (const n of [2, 3, 4]) {
      for (let seed = 1; seed <= 4; seed++) {
        const levels = Array.from({ length: n }, (_, i) => bots.LEVELS[(i + seed) % 3]);
        const { res } = simulate(gameId, levels, seed * 7 + n);
        assert.equal(res.placements.length, n);
      }
    }
  });
}

test('connect : le bot gagne quand il le peut et bloque une menace', () => {
  const rng = seededRng(3);
  const empty = () => Array.from({ length: 6 }, () => Array(7).fill(null));
  const view = (board, colors = { 'bot:1': 'yellow', u: 'blue' }) => ({ board, colors, turn: 'bot:1', status: 'playing' });

  const win = empty();
  win[0][0] = 'yellow'; win[0][1] = 'yellow'; win[0][2] = 'yellow';
  win[1][0] = 'blue'; win[1][1] = 'blue'; win[1][2] = 'blue';
  for (const level of ['normal', 'hard']) {
    assert.deepEqual(bots.decide('connect', view(win), 'bot:1', { level, rng }).action, { type: 'drop', col: 3 });
  }

  const threat = empty();
  threat[0][4] = 'blue'; threat[0][5] = 'blue'; threat[0][6] = 'blue';
  threat[1][4] = 'yellow'; threat[1][5] = 'yellow';
  for (const level of ['normal', 'hard']) {
    assert.deepEqual(bots.decide('connect', view(threat), 'bot:1', { level, rng }).action, { type: 'drop', col: 3 });
  }
});

test('cards : pas de +4 illégal (bluff) au niveau normal ou difficile', () => {
  const rng = seededRng(5);
  const hand = [
    { id: 'W4-1', color: null, kind: 'wild4', value: null },
    { id: 'R3a', color: 'red', kind: 'number', value: 3 },
    { id: 'B5a', color: 'blue', kind: 'number', value: 5 },
  ];
  const view = {
    status: 'playing', players: ['bot:1', 'u'], forfeited: [], direction: 1, counts: { 'bot:1': 3, u: 1 },
    hand, playable: ['W4-1', 'R3a'], activeColor: 'red', turn: 'bot:1', phase: 'play', vulnerable: null,
  };
  for (const level of ['normal', 'hard']) {
    for (let i = 0; i < 20; i++) {
      assert.notEqual(bots.decide('cards', view, 'bot:1', { level, rng }).action.cardId, 'W4-1');
    }
  }
});

test('penalty : le bot attend l\'ouverture du tir et ne rejoue pas un choix verrouillé', () => {
  const rng = seededRng(9);
  const base = { status: 'playing', players: ['bot:1', 'u'], history: [] };
  const open = { ...base, kick: { myRole: 'keeper', myChoice: null, opensAt: 5000 } };
  const d = bots.decide('penalty', open, 'bot:1', { level: 'hard', rng });
  assert.equal(d.notBefore, 5000);
  assert.ok([1, 2, 3, 4, 5].includes(d.action.zone));
  assert.equal(bots.decide('penalty', { ...base, kick: { myRole: 'keeper', myChoice: 2, opensAt: 0 } }, 'bot:1', { level: 'hard', rng }), null);
});

test('bots : identités clairement distinctes des joueurs', () => {
  const list = bots.create(3, 'hard');
  assert.deepEqual(list.map(b => b.userId), ['bot:1', 'bot:2', 'bot:3']);
  assert.ok(list.every(b => b.isBot && b.username.startsWith('Bot ') && b.avatar === 'bot' && b.level === 'hard'));
  assert.equal(bots.isBotId('bot:2'), true);
  assert.equal(bots.isBotId('6f1c2d1e-0000-4000-8000-000000000000'), false);
});
