const test = require('node:test');
const assert = require('node:assert/strict');
const { elo, eloExpected, plackettLuce, OS, osDisplay } = require('../../src/services/rating');

test('Elo : probabilité attendue symétrique à cotes égales', () => {
  assert.equal(eloExpected(1000, 1000), 0.5);
  assert.ok(Math.abs(eloExpected(1200, 1000) + eloExpected(1000, 1200) - 1) < 1e-12);
});

test('Elo : victoire à cotes égales = +16 / −16 (K = 32)', () => {
  const r = elo(1000, 1000, 1);
  assert.equal(r.a, 1016);
  assert.equal(r.b, 984);
});

test('Elo : nul entre égaux ne change rien, somme conservée sinon', () => {
  const d = elo(1000, 1000, 0.5);
  assert.equal(d.a, 1000);
  assert.equal(d.b, 1000);
  const r = elo(1300, 1100, 0);
  assert.ok(Math.abs(r.a + r.b - 2400) < 1e-9);
  assert.ok(r.a < 1300 && r.b > 1100);
});

test('Elo : battre un joueur plus fort rapporte plus', () => {
  const vsStrong = elo(1000, 1400, 1).a - 1000;
  const vsWeak = elo(1000, 600, 1).a - 1000;
  assert.ok(vsStrong > vsWeak);
  assert.ok(vsStrong < 32 && vsWeak > 0);
});

test('OpenSkill : à 4 joueurs égaux, la cote décroît avec la place', () => {
  const players = [1, 2, 3, 4].map(rank => ({ mu: OS.MU, sigma: OS.SIGMA, rank }));
  const out = plackettLuce(players);
  assert.ok(out[0].mu > out[1].mu && out[1].mu > out[2].mu && out[2].mu > out[3].mu);
  assert.ok(out[0].mu > OS.MU && out[3].mu < OS.MU);
  assert.ok(out.every(o => o.sigma < OS.SIGMA));
});

test('OpenSkill : les égalités donnent la même cote', () => {
  const out = plackettLuce([
    { mu: 25, sigma: OS.SIGMA, rank: 1 },
    { mu: 25, sigma: OS.SIGMA, rank: 2 },
    { mu: 25, sigma: OS.SIGMA, rank: 2 },
  ]);
  assert.ok(Math.abs(out[1].mu - out[2].mu) < 1e-12);
  assert.ok(out[0].mu > out[1].mu);
});

test('OpenSkill : la cote affichée démarre à 1000', () => {
  assert.equal(osDisplay(OS.MU), 1000);
});
