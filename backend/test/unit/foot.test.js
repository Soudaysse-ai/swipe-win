const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../src/games/foot/engine');
const { scriptedRng, seededRng } = require('../helpers/engine');

// setupSeconds 0 : coup d'envoi immédiat (l'avant-match a ses propres tests plus bas).
const CONFIG = { turnSeconds: 20, matchSeconds: 300, goalsToWin: 3, maxTimeouts: 3, setupSeconds: 0 };
const [A, B] = ['home', 'away'];
const { FIELD, simulate, TEAMS, FORMATIONS, MAX_PASSES, VS_MS } = engine._internals;
const players = [{ userId: A, seat: 0 }, { userId: B, seat: 1 }];

// Partie où A commence (rng → 0), tir possible tout de suite.
function start(now = 0) {
  const s = engine.init({ players, rng: scriptedRng([0]), now, config: CONFIG });
  return { s, now: s.turnOpensAt };
}

test('mise en place : 5 palets par équipe, symétriques, ballon au centre', () => {
  const { s } = start();
  assert.equal(s.discs[A].length, 5);
  assert.deepEqual(s.ball, [FIELD.W / 2, FIELD.H / 2]);
  s.discs[A].forEach(([x, y], i) => assert.deepEqual(s.discs[B][i], [FIELD.W - x, FIELD.H - y]));
  assert.equal(s.turn, A);
});

test('un tir déplace le palet, la main passe, le tir suivant attend la fin de l\'animation', () => {
  const { s, now } = start();
  const out = engine.apply(s, A, { type: 'shoot', disc: 1, dx: 0.6, dy: 0 }, { now, config: CONFIG });
  const st = out.state;
  assert.ok(st.discs[A][1][0] > s.discs[A][1][0] + 50, 'le palet a avancé');
  assert.equal(st.turn, B);
  assert.equal(st.shots[A], 1);
  const shot = out.events.find(e => e.type === 'shot');
  assert.ok(shot.payload.frames.length > 5);
  assert.equal(shot.payload.frames[0].length, 11);
  assert.ok(st.turnOpensAt > now + 200);
  assert.throws(() => engine.apply(st, B, { type: 'shoot', disc: 0, dx: 1, dy: 0 }, { now: now + 1, config: CONFIG }), { code: 'NOT_OPEN' });
  assert.throws(() => engine.apply(st, A, { type: 'shoot', disc: 0, dx: 1, dy: 0 }, { now: st.turnOpensAt, config: CONFIG }), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => engine.apply(st, B, { type: 'shoot', disc: 7, dx: 1, dy: 0 }, { now: st.turnOpensAt, config: CONFIG }), { code: 'BAD_DISC' });
  assert.throws(() => engine.apply(st, B, { type: 'shoot', disc: 0, dx: 0.01, dy: 0 }, { now: st.turnOpensAt, config: CONFIG }), { code: 'TOO_WEAK' });
});

test('frapper le ballon le met en mouvement (collision palet / ballon)', () => {
  const { s, now } = start();
  s.discs[A][4] = [440, 300];
  s.discs[B][4] = [580, 120]; // l'attaquant adverse s'écarte
  const st = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 0.5, dy: 0 }, { now, config: CONFIG }).state;
  assert.ok(st.ball[0] > 600, `ballon poussé vers la droite (${st.ball[0]})`);
  assert.ok(st.discs[A][4][0] < st.ball[0], 'le palet reste derrière le ballon');
});

test('but : score, retour en place, l\'équipe qui encaisse engage', () => {
  const { s, now } = start();
  s.ball = [900, 300];
  s.discs[A][4] = [850, 300];
  s.discs[B] = s.discs[B].map(([x, y], i) => [500 + i * 10, 40 + i * 60]); // cage dégagée
  const out = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 1, dy: 0 }, { now, config: CONFIG });
  assert.equal(out.state.score[A], 1);
  assert.equal(out.events.find(e => e.type === 'shot').payload.goal, A);
  assert.ok(out.events.some(e => e.type === 'goal' && e.payload.scorer === A && !e.payload.own));
  assert.deepEqual(out.state.ball, [FIELD.W / 2, FIELD.H / 2]);
  assert.equal(out.state.turn, B);
});

test('contre son camp : le but est accordé à l\'adversaire', () => {
  const { s, now } = start();
  s.ball = [100, 300];
  s.discs[A][3] = [150, 300];
  s.discs[A][0] = [60, 120]; // gardien écarté
  const out = engine.apply(s, A, { type: 'shoot', disc: 3, dx: -1, dy: 0 }, { now, config: CONFIG });
  assert.equal(out.state.score[B], 1);
  assert.ok(out.events.some(e => e.type === 'goal' && e.payload.own));
  assert.equal(out.state.goals[0].own, true);
});

test('3e but : fin de partie après l\'animation, vainqueur au score', () => {
  const { s, now } = start();
  s.score[A] = 2;
  s.ball = [900, 300];
  s.discs[A][4] = [850, 300];
  s.discs[B] = s.discs[B].map(([x, y], i) => [500 + i * 10, 40 + i * 60]);
  const st = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 1, dy: 0 }, { now, config: CONFIG }).state;
  assert.equal(st.phase, 'ending');
  assert.equal(engine.result(st), null);
  const dl = engine.deadline(st);
  assert.deepEqual(dl.userIds, []);
  const end = engine.timeout(st, { now: dl.at, config: CONFIG }).state;
  const res = engine.result(end);
  assert.equal(res.placements[0].userId, A);
  assert.equal(res.placements[0].stats.goals, 3);
  assert.equal(res.reason, 'goals');
});

test('fin du temps : le score décide, égalité possible', () => {
  const { s } = start();
  const dl = engine.deadline({ ...s, turnDeadline: s.matchEndsAt + 1 });
  assert.equal(dl.at, s.matchEndsAt);
  const end = engine.timeout(s, { now: s.matchEndsAt, config: CONFIG }).state;
  const res = engine.result(end);
  assert.equal(res.isDraw, true);
  assert.equal(res.reason, 'time_up');
});

test('pas de tir à temps : la main passe ; 3 fois de suite = forfait', () => {
  let { s } = start();
  let now = s.turnDeadline;
  s = engine.timeout(s, { now, config: CONFIG }).state;
  assert.equal(s.turn, B);
  for (const _ of [1, 2, 3, 4, 5]) {
    if (s.status !== 'playing') break;
    now = s.turnDeadline;
    s = engine.timeout(s, { now, config: CONFIG }).state;
  }
  assert.equal(s.status, 'finished');
  assert.equal(s.endReason, 'timeouts_limit');
});

test('simulation déterministe et jamais hors du terrain', () => {
  const rng = seededRng(11);
  const { s } = start();
  let st = s;
  for (let k = 0; k < 60; k++) {
    const u = st.turn;
    if (!u) break;
    const disc = rng.int(5);
    const dx = (rng.int(2001) - 1000) / 1000;
    const dy = (rng.int(2001) - 1000) / 1000;
    if (Math.hypot(dx, dy) < 0.1) continue;
    const a = simulate(st, u, disc, dx * 15, dy * 15);
    const b = simulate(st, u, disc, dx * 15, dy * 15);
    assert.deepEqual(a.frames, b.frames);
    st = engine.apply(st, u, { type: 'shoot', disc, dx, dy }, { now: st.turnOpensAt, config: { ...CONFIG, matchSeconds: 100000 } }).state;
    for (const p of st.players) {
      for (const [x, y] of st.discs[p]) {
        assert.ok(x >= -FIELD.GOAL_DEPTH && x <= FIELD.W + FIELD.GOAL_DEPTH && y >= 0 && y <= FIELD.H, `palet hors terrain ${x},${y}`);
      }
    }
    const [bx, by] = st.ball;
    assert.ok(bx >= -FIELD.GOAL_DEPTH && bx <= FIELD.W + FIELD.GOAL_DEPTH && by >= 0 && by <= FIELD.H, `ballon hors terrain ${bx},${by}`);
    if (st.phase !== 'play') break;
  }
});

test('avant-match : équipe et formation au choix, coup d\'envoi quand les deux sont prêts', () => {
  const config = { ...CONFIG, setupSeconds: 15 };
  let s = engine.init({ players, rng: scriptedRng([0]), now: 0, config });
  assert.equal(s.phase, 'setup');
  assert.deepEqual(engine.deadline(s), { at: 15_000, userIds: [] });
  assert.throws(() => engine.apply(s, A, { type: 'shoot', disc: 0, dx: 1, dy: 0 }, { now: 100, config }), { code: 'NOT_OPEN' });
  assert.throws(() => engine.apply(s, A, { type: 'setup', team: 'xx' }, { now: 100, config }), { code: 'BAD_TEAM' });
  assert.throws(() => engine.apply(s, A, { type: 'setup', formation: '9-9' }, { now: 100, config }), { code: 'BAD_FORMATION' });
  s = engine.apply(s, A, { type: 'setup', team: 'km', formation: '1-3-1' }, { now: 100, config }).state;
  assert.deepEqual(s.discs[A], FORMATIONS['1-3-1'].pos);
  assert.throws(() => engine.apply(s, B, { type: 'setup', team: 'km' }, { now: 200, config }), { code: 'TEAM_TAKEN' });
  s = engine.apply(s, A, { type: 'setup', ready: true }, { now: 300, config }).state;
  assert.equal(s.phase, 'setup');
  const out = engine.apply(s, B, { type: 'setup', team: 'sn', formation: '1-2-2', ready: true }, { now: 1000, config });
  s = out.state;
  assert.ok(out.events.some(e => e.type === 'kickoff'));
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.teams, { [A]: 'km', [B]: 'sn' });
  assert.equal(s.turnOpensAt, 1000 + VS_MS);
  assert.equal(s.matchEndsAt, s.turnOpensAt + 300_000);
  s.discs[B].forEach(([x, y], i) => assert.deepEqual([x, y], [FIELD.W - FORMATIONS['1-2-2'].pos[i][0], FIELD.H - FORMATIONS['1-2-2'].pos[i][1]]));
  assert.throws(() => engine.apply(s, A, { type: 'setup', team: 'fr' }, { now: 1100, config }), { code: 'NOT_SETUP' });
});

test('avant-match : sans choix à la fin du compte à rebours, équipes différentes attribuées', () => {
  const config = { ...CONFIG, setupSeconds: 15 };
  let s = engine.init({ players, rng: scriptedRng([1]), now: 0, config });
  s = engine.apply(s, B, { type: 'setup', team: TEAMS[0] }, { now: 50, config }).state;
  const out = engine.timeout(s, { now: 15_000, config });
  s = out.state;
  assert.equal(s.phase, 'play');
  assert.equal(s.teams[B], TEAMS[0]);
  assert.ok(TEAMS.includes(s.teams[A]) && s.teams[A] !== s.teams[B]);
  assert.equal(s.turn, B);
  assert.equal(s.timeouts[A] + s.timeouts[B], 0, 'l\'avant-match ne compte pas comme temps dépassé');
});

// Ballon entre le tireur et un coéquipier, adversaires écartés.
function passSetup() {
  const { s, now } = start();
  s.discs[A] = [[60, 300], [200, 120], [200, 480], [640, 300], [400, 300]];
  s.discs[B] = s.discs[B].map(([x, y], i) => [520 + i * 90, i % 2 ? 40 : 560]);
  s.ball = [470, 300];
  return { s, now };
}

test('passe : le ballon envoyé sur un coéquipier redonne la main, au plus deux fois de suite', () => {
  let { s, now } = passSetup();
  for (let k = 1; k <= MAX_PASSES; k++) {
    const out = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 0.5, dy: 0 }, { now, config: CONFIG });
    const pass = out.events.find(e => e.type === 'pass');
    assert.ok(pass, `passe n° ${k}`);
    assert.deepEqual([pass.payload.to, pass.payload.count], [3, k]);
    assert.equal(out.events.find(e => e.type === 'shot').payload.pass, 3);
    assert.equal(out.state.turn, A, 'le tireur rejoue');
    assert.equal(out.state.passes, k);
    // Même situation au tir suivant.
    s = { ...out.state, discs: passSetup().s.discs, ball: [470, 300] };
    now = out.state.turnOpensAt;
  }
  const out = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 0.5, dy: 0 }, { now, config: CONFIG });
  assert.ok(!out.events.some(e => e.type === 'pass'), 'pas de troisième passe');
  assert.equal(out.state.turn, B);
  assert.equal(out.state.passes, 0);
  assert.equal(out.state.passCount[A], MAX_PASSES);
  const hits = out.events.find(e => e.type === 'shot').payload.hits;
  assert.ok(hits.some(h => h[1] === 'ball') && hits.every(h => h[2] > 0 && h[2] <= 1));
});

test('pas de passe si un adversaire touche le ballon en premier', () => {
  const { s, now } = passSetup();
  s.discs[B][2] = [560, 300]; // un adversaire s'intercale
  const out = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 0.5, dy: 0 }, { now, config: CONFIG });
  assert.ok(!out.events.some(e => e.type === 'pass'));
  assert.equal(out.state.turn, B);
});

test('belle passe contrôlée : le ballon reste collé au receveur, côté but adverse', () => {
  const { s, now } = passSetup();
  const out = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 0.5, dy: 0 }, { now, config: CONFIG });
  assert.ok(out.events.some(e => e.type === 'pass'));
  const [rx, ry] = out.state.discs[A][3];
  const [bx, by] = out.state.ball;
  const d = Math.hypot(bx - rx, by - ry);
  assert.ok(d <= FIELD.DISC_R + FIELD.BALL_R + 3, `ballon collé au receveur (distance ${d.toFixed(1)})`);
  assert.ok(bx > rx, 'ballon devant le receveur, vers le but adverse (A attaque à droite)');
  assert.deepEqual(out.state.passReceiver, { userId: A, disc: 3 });
  // Sans contrôle (limite de passes atteinte), le ballon rebondit comme avant.
  const loose = simulate(s, A, 4, 0.5 * 15, 0, { frames: false });
  assert.ok(Math.hypot(loose.ball[0] - loose.discs[A][3][0], loose.ball[1] - loose.discs[A][3][1]) > d);
});

test('après une belle passe, le receveur se replace autour du ballon puis tire', () => {
  const { s, now } = passSetup();
  const out = engine.apply(s, A, { type: 'shoot', disc: 4, dx: 0.5, dy: 0 }, { now, config: CONFIG });
  const st = out.state;
  const t = st.turnOpensAt;
  const [bx, by] = st.ball;
  const { PLACE_MIN, PLACE_MAX } = engine._internals;
  const spot = [bx - PLACE_MIN - 4, by];
  // Seul le receveur, seulement autour du ballon, seulement à son tour.
  assert.throws(() => engine.apply(st, A, { type: 'place', disc: 1, x: spot[0], y: spot[1] }, { now: t, config: CONFIG }), { code: 'BAD_DISC' });
  assert.throws(() => engine.apply(st, A, { type: 'place', disc: 3, x: bx - PLACE_MAX - 30, y: by }, { now: t, config: CONFIG }), { code: 'BAD_PLACE' });
  assert.throws(() => engine.apply(st, B, { type: 'place', disc: 3, x: spot[0], y: spot[1] }, { now: t, config: CONFIG }), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => engine.apply(st, A, { type: 'place', disc: 3, x: spot[0], y: spot[1] }, { now: t - 1, config: CONFIG }), { code: 'NOT_OPEN' });
  const placed = engine.apply(st, A, { type: 'place', disc: 3, x: spot[0], y: spot[1] }, { now: t, config: CONFIG });
  assert.deepEqual(placed.state.discs[A][3], spot);
  assert.equal(placed.state.turn, A, 'toujours à lui de tirer');
  assert.equal(placed.events[0].type, 'placed');
  // Le tir suivant met fin au replacement.
  const shot = engine.apply(placed.state, A, { type: 'shoot', disc: 3, dx: 0.8, dy: 0 }, { now: t, config: CONFIG });
  assert.equal(shot.state.passReceiver, null);
  assert.throws(() => engine.apply({ ...shot.state, turn: A }, A, { type: 'place', disc: 3, x: 300, y: 300 }, { now: shot.state.turnOpensAt, config: CONFIG }), { code: 'NO_PLACE' });
});
