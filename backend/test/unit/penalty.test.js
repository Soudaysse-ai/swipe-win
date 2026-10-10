const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../src/games/penalty/engine');
const { scriptedRng } = require('../helpers/engine');

const CONFIG = { decisionSeconds: 10, maxShotsPerPlayer: 20, maxTimeouts: 6 };
const A = 'ua';
const B = 'ub';
const { REVEAL_MS } = engine._internals;

function start(first = 0) {
  return engine.init({ players: [{ userId: A, seat: 0 }, { userId: B, seat: 1 }], rng: scriptedRng([first]), now: 0, config: CONFIG });
}

// Joue un tir complet : le tireur vise `shot`, le gardien plonge `dive`.
function kick(s, shot, dive) {
  const now = s.kick.opensAt;
  const c = { now, config: CONFIG };
  s = engine.apply(s, s.kick.shooter, { type: 'choose', zone: shot }, c).state;
  return engine.apply(s, s.kick.keeper, { type: 'choose', zone: dive }, c).state;
}
const goal = (s) => kick(s, 1, 2);
const save = (s) => kick(s, 3, 3);

test('le serveur tire au sort le premier tireur ; les rôles alternent', () => {
  let s = start(1);
  assert.equal(s.kick.shooter, B);
  s = goal(s);
  assert.equal(s.kick.shooter, A);
  assert.equal(s.kick.keeper, B);
  s = goal(s);
  assert.equal(s.kick.shooter, B);
});

test('choix simultanés : verrouillés et cachés à l\'adversaire', () => {
  let s = start(0);
  s = engine.apply(s, A, { type: 'choose', zone: 4 }, { now: 0, config: CONFIG }).state;
  const vb = engine.view(s, B);
  assert.equal(vb.kick.shooterLocked, true);
  assert.equal(vb.kick.myChoice, null, 'le gardien ne voit pas la zone du tireur');
  assert.equal(JSON.stringify(vb).includes('"shot":4'), false);
  assert.equal(engine.view(s, A).kick.myChoice, 4);
  assert.throws(() => engine.apply(s, A, { type: 'choose', zone: 2 }, { now: 0, config: CONFIG }), { code: 'LOCKED' });
  assert.throws(() => engine.apply(s, B, { type: 'choose', zone: 9 }, { now: 0, config: CONFIG }), { code: 'BAD_ZONE' });
});

test('calcul : même zone = arrêt, zones différentes = but', () => {
  let s = start(0);
  s = kick(s, 2, 2);
  assert.equal(s.history[0].outcome, 'saved');
  assert.equal(s.score[A], 0);
  s = kick(s, 5, 1);
  assert.equal(s.history[1].outcome, 'goal');
  assert.equal(s.score[B], 1);
});

test('révélation : la décision suivante n\'ouvre qu\'après l\'animation', () => {
  let s = start(0);
  s = goal(s);
  assert.equal(s.kick.opensAt, REVEAL_MS);
  assert.throws(() => engine.apply(s, s.kick.shooter, { type: 'choose', zone: 1 }, { now: 100, config: CONFIG }), { code: 'NOT_OPEN' });
});

test('chronomètre : tireur absent = tir manqué ; gardien absent = but ; les deux absents = manqué', () => {
  const c = (s) => ({ now: s.kick.deadline, config: CONFIG });
  let s = start(0);
  s = engine.apply(s, B, { type: 'choose', zone: 1 }, { now: 0, config: CONFIG }).state; // seul le gardien choisit
  s = engine.timeout(s, c(s)).state;
  assert.equal(s.history[0].outcome, 'missed');
  s = engine.apply(s, s.kick.shooter, { type: 'choose', zone: 4 }, { now: s.kick.opensAt, config: CONFIG }).state; // seul le tireur choisit
  s = engine.timeout(s, c(s)).state;
  assert.equal(s.history[1].outcome, 'goal');
  s = engine.timeout(s, c(s)).state; // personne ne choisit
  assert.equal(s.history[2].outcome, 'missed');
  assert.deepEqual(engine.deadline(s).userIds.sort(), [A, B].sort());
});

test('fin anticipée quand l\'un ne peut plus rattraper l\'autre', () => {
  let s = start(0); // A tire en premier
  // A marque 3 fois, B rate 3 fois → 3-0 après 6 tirs, B ne peut faire que 2 de plus
  for (let i = 0; i < 3; i++) { s = goal(s); s = save(s); }
  assert.equal(s.status, 'finished');
  assert.equal(s.winner, A);
  assert.equal(s.endReason, 'early_finish');
  assert.equal(s.history.length, 6);
});

test('mort subite après égalité à 5 tirs chacun', () => {
  let s = start(0);
  for (let i = 0; i < 10; i++) s = goal(s); // 5-5
  assert.equal(s.status, 'playing');
  assert.equal(engine.view(s, A).suddenDeath, true);
  s = goal(s); // A marque
  assert.equal(s.status, 'playing', 'B doit pouvoir répondre');
  s = save(s); // B rate
  assert.equal(s.winner, A);
  assert.equal(s.endReason, 'sudden_death');
});

test('limite de 20 tirs chacun : match nul', () => {
  let s = start(0);
  for (let i = 0; i < 40; i++) s = goal(s);
  assert.equal(s.status, 'finished');
  assert.equal(s.winner, null);
  const r = engine.result(s);
  assert.equal(r.isDraw, true);
  assert.ok(r.placements.every(p => p.outcome === 'draw'));
});

test('statistiques : buts, tirs, arrêts, tirs subis', () => {
  let s = start(0);
  s = goal(s); s = save(s); s = goal(s); s = save(s); s = goal(s); s = save(s);
  const r = engine.result(s);
  const a = r.placements.find(p => p.userId === A).stats;
  const b = r.placements.find(p => p.userId === B).stats;
  assert.deepEqual([a.goals, a.shots, a.saves, a.shotsFaced], [3, 3, 3, 3]);
  assert.deepEqual([b.goals, b.shots, b.saves, b.shotsFaced], [0, 3, 0, 3]);
});

test('absence prolongée : forfait', () => {
  let s = start(0);
  for (let i = 0; i < 12 && s.status === 'playing'; i++) {
    const k = s.kick;
    if (k.shooter === A) s = engine.apply(s, A, { type: 'choose', zone: 1 }, { now: k.opensAt, config: CONFIG }).state;
    else s = engine.apply(s, A, { type: 'choose', zone: 2 }, { now: k.opensAt, config: CONFIG }).state;
    if (s.status === 'playing' && s.kick.index === k.index) s = engine.timeout(s, { now: s.kick.deadline, config: CONFIG }).state;
  }
  assert.equal(s.status, 'finished');
  assert.equal(s.winner, A);
});

test('abandon : l\'autre joueur gagne', () => {
  const s = engine.forfeit(start(0), B).state;
  assert.equal(s.winner, A);
  assert.equal(engine.result(s).reason, 'forfeit');
});
