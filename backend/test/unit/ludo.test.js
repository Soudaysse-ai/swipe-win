const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../src/games/ludo/engine');
const { scriptedRng, seededRng } = require('../helpers/engine');

const CONFIG = { turnSeconds: 20, maxTimeouts: 3 };
const [A, B, C, D] = ['ua', 'ub', 'uc', 'ud'];
const { START, HOME } = engine._internals;

// dés : valeurs 1..6 → rng.int(6) doit renvoyer valeur-1
const dice = (...vals) => scriptedRng(vals.map(v => v - 1));
const ctx = (rng = seededRng(3), now = 1000) => ({ rng, now, config: CONFIG });

function start(n = 2, first = 0) {
  const players = [A, B, C, D].slice(0, n).map((u, seat) => ({ userId: u, seat }));
  return engine.init({ players, rng: scriptedRng([first]), now: 1000, config: CONFIG });
}

const roll = (s, u, v) => engine.apply(s, u, { type: 'roll' }, ctx(dice(v))).state;
const move = (s, u, token) => engine.apply(s, u, { type: 'move', token }, ctx()).state;

test('init : 4 pions en base, couleurs dans le sens horaire, premier joueur tiré au sort', () => {
  const s = start(4, 2);
  assert.equal(s.turn, C);
  assert.deepEqual(Object.values(s.colors), ['red', 'green', 'yellow', 'blue']);
  assert.ok(Object.values(s.tokens).every(t => t.every(p => p === -1)));
  const s2 = start(2);
  assert.deepEqual(Object.values(s2.colors), ['red', 'yellow']);
});

test('dé généré par le serveur entre 1 et 6', () => {
  let s = start(2);
  const seen = new Set();
  const rng = seededRng(11);
  for (let i = 0; i < 200; i++) {
    const out = engine.apply({ ...s, phase: 'roll', turn: A, sixes: 0 }, A, { type: 'roll' }, { rng, now: 1, config: CONFIG });
    seen.add(out.state.dice ?? out.events.find(e => e.type === 'dice_rolled').payload.value);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
});

test('il faut un 6 pour sortir de la base ; sinon le tour passe', () => {
  let s = start(2);
  s = roll(s, A, 4);
  assert.equal(s.turn, B, 'aucun pion déplaçable → tour suivant');
  s = roll(s, B, 6);
  assert.equal(s.phase, 'move');
  assert.deepEqual(s.movable, [0, 1, 2, 3]);
  s = move(s, B, 2);
  assert.equal(s.tokens[B][2], 0);
  assert.equal(s.turn, B, 'un 6 donne un lancer supplémentaire');
  assert.equal(s.phase, 'roll');
});

test('déplacement normal puis passage de tour', () => {
  let s = start(2);
  s = roll(s, A, 6); s = move(s, A, 0);
  s = roll(s, A, 3);
  assert.deepEqual(s.movable, [0]);
  s = move(s, A, 0);
  assert.equal(s.tokens[A][0], 3);
  assert.equal(s.turn, B);
});

test('trois 6 consécutifs : le troisième est annulé et le tour se termine', () => {
  let s = start(2);
  s = roll(s, A, 6); s = move(s, A, 0);
  s = roll(s, A, 6); s = move(s, A, 0);
  const before = structuredClone(s.tokens);
  s = roll(s, A, 6);
  assert.equal(s.turn, B);
  assert.deepEqual(s.tokens, before, 'aucun mouvement pour le 3e six');
});

test('capture : le pion adverse retourne à sa base et le joueur rejoue', () => {
  let s = start(2);
  // A (rouge, départ 0) en progression 10 = case 10 ; B (jaune, départ 26) en progression 38 = case (26+38)%52 = 12
  s.tokens[A][0] = 10;
  s.tokens[B][1] = 38;
  s = roll(s, A, 2);
  s = move(s, A, 0);
  assert.equal(s.tokens[A][0], 12);
  assert.equal(s.tokens[B][1], -1);
  assert.equal(s.turn, A, 'lancer supplémentaire après capture');
  assert.equal(s.stats[A].captures, 1);
});

test('pas de capture sur une case protégée (étoile ou départ)', () => {
  let s = start(2);
  s.tokens[A][0] = 5;           // case 5
  s.tokens[B][0] = 34;          // (26+34)%52 = 8 → étoile
  s = roll(s, A, 3);
  s = move(s, A, 0);
  assert.equal(s.tokens[A][0], 8);
  assert.equal(s.tokens[B][0], 34, 'pion protégé');
  assert.equal(s.turn, B);
  // case de départ du jaune (26) : pas de capture non plus
  let t = start(2);
  t.tokens[A][0] = 24; t.tokens[B][0] = 0; // B sur sa case de départ (26)
  t = roll(t, A, 2); t = move(t, A, 0);
  assert.equal(t.tokens[B][0], 0);
});

test('arrivée au nombre exact uniquement', () => {
  let s = start(2);
  s.tokens[A] = [54, HOME, HOME, -1];
  s = roll(s, A, 3);
  assert.equal(s.turn, B, '54 + 3 dépasse la case finale');
  s = start(2);
  s.tokens[A] = [54, -1, -1, -1];
  s = roll(s, A, 2); s = move(s, A, 0);
  assert.equal(s.tokens[A][0], HOME);
  assert.deepEqual(engine._internals.movableTokens(s, A, 6), [1, 2, 3], 'un pion arrivé ne bouge plus');
});

test('fin de partie à 2 : premier arrivé gagne, l\'autre est classé dernier', () => {
  let s = start(2);
  s.tokens[A] = [HOME, HOME, HOME, 55];
  s = roll(s, A, 1); s = move(s, A, 3);
  assert.equal(s.status, 'finished');
  const r = engine.result(s);
  assert.deepEqual(r.placements.map(p => [p.userId, p.place, p.outcome]), [[A, 1, 'win'], [B, 2, 'loss']]);
});

test('à 3 joueurs, les autres continuent pour les places suivantes', () => {
  let s = start(3);
  s.tokens[A] = [HOME, HOME, HOME, 55];
  s = roll(s, A, 1); s = move(s, A, 3);
  assert.equal(s.status, 'playing');
  assert.deepEqual(s.finished, [A]);
  assert.equal(s.turn, B);
  s.tokens[C] = [HOME, HOME, HOME, 50];
  s = roll(s, B, 2); // B n'a pas de pion sorti → tour de C
  s = roll(s, C, 6); s = move(s, C, 3);
  const r = engine.result(s);
  assert.deepEqual(r.placements.map(p => p.userId), [A, C, B]);
});

test('chronomètre : coup automatique déterministe (capture prioritaire)', () => {
  let s = start(2);
  s.tokens[A] = [10, 3, -1, -1];
  s.tokens[B][0] = 38; // case 12
  s = roll(s, A, 2);
  assert.deepEqual(s.movable, [0, 1]);
  assert.equal(engine._internals.autoChoice(s, A), 0, 'la capture est choisie');
  const out = engine.timeout(s, ctx()).state;
  assert.equal(out.tokens[A][0], 12);
  assert.equal(out.tokens[B][0], -1);
  assert.equal(out.timeouts[A], 1);
});

test('chronomètre : sinon sortir un pion sur 6, sinon le plus avancé', () => {
  let s = start(2);
  s.tokens[A] = [10, 20, -1, -1];
  s = roll(s, A, 6);
  assert.equal(engine._internals.autoChoice(s, A), 2);
  let t = start(2);
  t.tokens[A] = [10, 20, -1, -1];
  t = roll(t, A, 4);
  assert.equal(engine._internals.autoChoice(t, A), 1);
});

test('expiration en phase de lancer : le serveur lance et joue', () => {
  let s = start(2);
  s.tokens[A] = [5, -1, -1, -1];
  const out = engine.timeout(s, ctx(dice(3))).state;
  assert.equal(out.tokens[A][0], 8);
  assert.equal(out.turn, B);
});

test('expirations répétées : forfait', () => {
  let s = start(3);
  const c = ctx(seededRng(5));
  for (let i = 0; i < 3; i++) {
    s.turn = A; s.phase = 'roll';
    s = engine.timeout(s, c).state;
  }
  assert.ok(s.forfeited.includes(A));
  assert.equal(s.status, 'playing', 'les deux autres continuent');
  assert.ok(s.tokens[A].every(p => p === -1));
});

test('forfait à 2 joueurs : fin immédiate, l\'abandon est dernier', () => {
  const s = engine.forfeit(start(2), A, ctx()).state;
  assert.equal(s.status, 'finished');
  assert.deepEqual(engine.result(s).placements.map(p => p.userId), [B, A]);
});

test('actions illégales refusées', () => {
  let s = start(2);
  assert.throws(() => engine.apply(s, B, { type: 'roll' }, ctx()), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => engine.apply(s, A, { type: 'move', token: 0 }, ctx()), { code: 'BAD_PHASE' });
  s = roll(s, A, 6);
  assert.throws(() => engine.apply(s, A, { type: 'roll' }, ctx()), { code: 'BAD_PHASE' });
  assert.throws(() => engine.apply(s, A, { type: 'move', token: 7 }, ctx()), { code: 'ILLEGAL_MOVE' });
});

test('cases absolues : départs des 4 couleurs', () => {
  assert.equal(engine._internals.absolute('green', 0), START.green);
  assert.equal(engine._internals.absolute('blue', 20), (39 + 20) % 52);
  assert.equal(engine._internals.absolute('red', 51), null, 'couloir d\'arrivée hors parcours');
});

test('le dernier lancer reste visible après la fin du tour', () => {
  const players = [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }];
  let s = engine.init({ players, rng: scriptedRng([0]), now: 0, config: CONFIG });
  assert.equal(engine.view(s).lastRoll, null);
  // a lance un 3 sans pion sorti : le tour passe à b, mais le 3 reste affichable
  s = engine.apply(s, 'a', { type: 'roll' }, { rng: scriptedRng([2]), now: 1, config: CONFIG }).state;
  const v = engine.view(s);
  assert.equal(v.turn, 'b');
  assert.deepEqual(v.lastRoll, { userId: 'a', value: 3, seq: 1 });
});
