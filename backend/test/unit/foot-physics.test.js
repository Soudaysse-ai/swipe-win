// La physique de Yas Foot tourne à la fois sur le serveur (qui fait foi) et dans
// le navigateur du tireur (animation immédiate). Les deux doivent être identiques.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { toEsm, SOURCE, TARGET } = require('../../scripts/sync-foot-physics');
const physics = require('../../src/games/foot/physics');
const engine = require('../../src/games/foot/engine');

test('la copie navigateur (sim.js) est exactement la physique du serveur', () => {
  assert.equal(fs.readFileSync(TARGET, 'utf8'), toEsm(fs.readFileSync(SOURCE, 'utf8')),
    'sim.js est périmé : lancer « npm run sync:foot » dans backend/');
});

test('la copie navigateur donne les mêmes trajectoires que le serveur', async () => {
  const sim = await import(TARGET);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const s = engine.init({ players: [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], rng: { int: () => 0 }, now: 0, config: { setupSeconds: 0 } });
  let pos = { players: s.players, discs: s.discs, ball: s.ball };
  for (let k = 0; k < 60; k++) {
    const u = s.players[k % 2];
    const disc = Math.floor(rnd() * 5);
    const dx = Math.round((rnd() * 2 - 1) * 1000) / 1000;
    const dy = Math.round((rnd() * 2 - 1) * 1000) / 1000;
    const v1 = physics.shotVelocity(dx, dy);
    const v2 = sim.shotVelocity(dx, dy);
    assert.deepEqual(v1, v2);
    if (!v1) continue;
    const server = physics.simulate(pos, u, disc, v1.vx, v1.vy);
    const client = sim.simulate(pos, u, disc, v2.vx, v2.vy, { frameEvery: 1 });
    assert.deepEqual(client.discs, server.discs);
    assert.deepEqual(client.ball, server.ball);
    assert.equal(client.goal, server.goal);
    assert.deepEqual(client.pass, server.pass);
    assert.deepEqual(client.frames[client.frames.length - 1], server.frames[server.frames.length - 1], 'même dernière image');
    pos = server.goal ? pos : { players: s.players, discs: server.discs, ball: server.ball };
  }
});

test('le tir appliqué par le moteur correspond à la simulation du navigateur', async () => {
  const sim = await import(TARGET);
  const s = engine.init({ players: [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], rng: { int: () => 0 }, now: 0, config: { setupSeconds: 0 } });
  const action = { type: 'shoot', disc: 4, dx: 0.731, dy: -0.12 };
  const out = engine.apply(s, 'a', action, { now: s.turnOpensAt });
  const v = sim.shotVelocity(action.dx, action.dy);
  const local = sim.simulate(engine.view(s, 'a'), 'a', action.disc, v.vx, v.vy, { frameEvery: 1 });
  assert.deepEqual(local.discs, out.state.discs);
  assert.deepEqual(local.ball, out.state.ball);
  const frames = out.events[0].payload.frames;
  assert.deepEqual(local.frames[local.frames.length - 1], frames[frames.length - 1]);
});
