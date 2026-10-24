const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../src/games/cards/engine');
const { seededRng, scriptedRng } = require('../helpers/engine');

const CONFIG = { turnSeconds: 20, maxTimeouts: 3 };
const [A, B, C, D] = ['ua', 'ub', 'uc', 'ud'];
const { buildDeck } = engine._internals;
const ctx = () => ({ rng: seededRng(9), now: 5000, config: CONFIG });

const card = (id) => buildDeck().find(c => c.id === id);
const n = (color, v, k = 'a') => `${color[0].toUpperCase()}${v}${v === 0 ? '' : k}`;

function start(count = 2, first = 0) {
  const players = [A, B, C, D].slice(0, count).map((u, seat) => ({ userId: u, seat }));
  return engine.init({ players, rng: { int: (k) => (k === count ? first : seededRng(1).int(k)) }, now: 1000, config: CONFIG });
}

// Prépare une situation précise : mains, carte du dessus, couleur active, joueur au trait.
function setup(count, { hands, top, color, turn = A }) {
  const s = start(count);
  for (const [u, ids] of Object.entries(hands)) s.hands[u] = ids.map(card);
  const used = new Set([...Object.values(hands).flat(), top]);
  s.drawPile = buildDeck().filter(c => !used.has(c.id));
  s.discard = [card(top)];
  s.activeColor = color || card(top).color;
  s.turn = turn;
  s.phase = 'play';
  return s;
}

const act = (s, u, action) => engine.apply(s, u, action, ctx()).state;
const total = (s) => s.drawPile.length + s.discard.length + Object.values(s.hands).reduce((t, h) => t + h.length, 0);

test('paquet de 108 cartes : 76 numérotées, 24 actions colorées, 8 universelles', () => {
  const d = buildDeck();
  assert.equal(d.length, 108);
  assert.equal(new Set(d.map(c => c.id)).size, 108);
  assert.equal(d.filter(c => c.kind === 'number').length, 76);
  assert.equal(d.filter(c => ['skip', 'reverse', 'draw2'].includes(c.kind)).length, 24);
  assert.equal(d.filter(c => c.kind === 'wild').length, 4);
  assert.equal(d.filter(c => c.kind === 'wild4').length, 4);
  for (const color of ['yellow', 'red', 'blue', 'green']) assert.equal(d.filter(c => c.color === color).length, 25);
});

test('distribution : 7 cartes, carte de départ numérotée, rien de perdu', () => {
  for (let seed = 1; seed < 30; seed++) {
    const s = engine.init({ players: [A, B, C].map((u, seat) => ({ userId: u, seat })), rng: seededRng(seed), now: 0, config: CONFIG });
    assert.ok(Object.values(s.hands).every(h => h.length === 7));
    assert.equal(s.discard[0].kind, 'number');
    assert.equal(s.activeColor, s.discard[0].color);
    assert.equal(total(s), 108);
  }
});

test('les mains des adversaires restent secrètes', () => {
  const s = start(3);
  const v = engine.view(s, A);
  assert.equal(v.hand.length, 7);
  assert.deepEqual(v.counts, { [A]: 7, [B]: 7, [C]: 7 });
  assert.equal(JSON.stringify(v).includes(s.hands[B][0].id) && !s.hands[A].some(c => c.id === s.hands[B][0].id), false);
  assert.equal(v.drawPile, undefined);
});

test('jouer : même couleur, même chiffre, même symbole ; sinon refus', () => {
  let s = setup(2, { hands: { [A]: [n('red', 5), n('blue', 7), 'G-skip-a', n('green', 2)], [B]: [n('red', 1)] }, top: n('red', 7) });
  assert.throws(() => act(s, A, { type: 'play', cardId: n('green', 2) }), { code: 'ILLEGAL_CARD' });
  assert.throws(() => act(s, B, { type: 'play', cardId: n('red', 1) }), { code: 'NOT_YOUR_TURN' });
  s = act(s, A, { type: 'play', cardId: n('blue', 7) }); // même chiffre
  assert.equal(s.activeColor, 'blue');
  assert.equal(s.turn, B);
  let t = setup(2, { hands: { [A]: ['G-skip-a', n('red', 3)], [B]: [n('red', 1)] }, top: 'B-skip-a' });
  t = act(t, A, { type: 'play', cardId: 'G-skip-a' }); // même symbole
  assert.equal(t.activeColor, 'green');
});

test('pioche interdite avec une carte jouable ; carte piochée jouable ou tour suivant', () => {
  let s = setup(2, { hands: { [A]: [n('red', 5), n('blue', 2)], [B]: [n('green', 1)] }, top: n('red', 7) });
  assert.throws(() => act(s, A, { type: 'draw' }), { code: 'MUST_PLAY' });
  // A n'a rien de jouable ; la carte suivante de la pioche est jouable
  s = setup(2, { hands: { [A]: [n('blue', 2), n('green', 3)], [B]: [n('green', 1)] }, top: n('red', 7) });
  s.drawPile.unshift(s.drawPile.splice(s.drawPile.findIndex(c => c.id === n('red', 4)), 1)[0]);
  s = act(s, A, { type: 'draw' });
  assert.equal(s.phase, 'drawn');
  assert.equal(s.drawnCardId, n('red', 4));
  assert.throws(() => act(s, A, { type: 'play', cardId: n('blue', 2) }), { code: 'ONLY_DRAWN' });
  const played = act(s, A, { type: 'play', cardId: n('red', 4) });
  assert.equal(played.turn, B);
  const passed = act(s, A, { type: 'pass' });
  assert.equal(passed.turn, B);
  assert.equal(passed.hands[A].length, 3);
  // carte piochée non jouable : le tour passe automatiquement
  let t = setup(2, { hands: { [A]: [n('blue', 2)], [B]: [n('green', 1)] }, top: n('red', 7) });
  t.drawPile.unshift(t.drawPile.splice(t.drawPile.findIndex(c => c.id === n('green', 5)), 1)[0]);
  t = act(t, A, { type: 'draw' });
  assert.equal(t.turn, B);
  assert.equal(t.hands[A].length, 2);
});

test('Passe : le joueur suivant perd son tour', () => {
  const s = act(setup(3, { hands: { [A]: ['R-skip-a', n('red', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) }), A, { type: 'play', cardId: 'R-skip-a' });
  assert.equal(s.turn, C);
});

test('Inverse : change le sens ; à deux joueurs, agit comme Passe', () => {
  let s = act(setup(3, { hands: { [A]: ['R-reverse-a', n('red', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) }), A, { type: 'play', cardId: 'R-reverse-a' });
  assert.equal(s.direction, -1);
  assert.equal(s.turn, C);
  s = act(setup(2, { hands: { [A]: ['R-reverse-a', n('red', 1)], [B]: [n('red', 2)] }, top: n('red', 7) }), A, { type: 'play', cardId: 'R-reverse-a' });
  assert.equal(s.turn, A);
});

test('+2 : le suivant pioche 2 et perd son tour (pas de cumul)', () => {
  const s = act(setup(3, { hands: { [A]: ['R-draw2-a', n('red', 1)], [B]: ['R-draw2-b'], [C]: [n('red', 3)] }, top: n('red', 7) }), A, { type: 'play', cardId: 'R-draw2-a' });
  assert.equal(s.hands[B].length, 3);
  assert.equal(s.turn, C, 'B ne peut pas renvoyer son +2');
});

test('Joker : couleur obligatoire puis appliquée', () => {
  const s0 = setup(2, { hands: { [A]: ['W1', n('red', 1)], [B]: [n('red', 2)] }, top: n('red', 7) });
  assert.throws(() => act(s0, A, { type: 'play', cardId: 'W1' }), { code: 'COLOR_REQUIRED' });
  const s = act(s0, A, { type: 'play', cardId: 'W1', color: 'green' });
  assert.equal(s.activeColor, 'green');
  assert.equal(s.turn, B);
});

test('+4 accepté : la victime pioche 4 et passe son tour', () => {
  let s = setup(3, { hands: { [A]: ['W4-1', n('blue', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = act(s, A, { type: 'play', cardId: 'W4-1', color: 'blue' });
  assert.equal(s.phase, 'challenge');
  assert.equal(s.turn, B);
  assert.throws(() => act(s, B, { type: 'play', cardId: n('red', 2) }), { code: 'BAD_PHASE' });
  s = act(s, B, { type: 'accept' });
  assert.equal(s.hands[B].length, 5);
  assert.equal(s.turn, C);
});

test('+4 contesté et illégal : l\'auteur pioche 4, le contestataire joue', () => {
  let s = setup(3, { hands: { [A]: ['W4-1', n('red', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = act(s, A, { type: 'play', cardId: 'W4-1', color: 'blue' });
  // La vue du contestataire ne révèle pas la main de l'auteur
  const v = engine.view(s, B);
  assert.equal(JSON.stringify(v).includes(n('red', 1)), false);
  const out = engine.apply(s, B, { type: 'challenge' }, ctx());
  s = out.state;
  assert.equal(s.hands[A].length, 5);
  assert.equal(s.hands[B].length, 1);
  assert.equal(s.turn, B);
  assert.equal(s.phase, 'play');
  const verdict = out.events.find(e => e.type === 'challenge_result');
  assert.deepEqual(verdict.payload, { by: A, victim: B, success: true, count: 4 });
});

test('+4 renvoyé avec un autre +4 : le cumul passe au suivant, qui pioche 8', () => {
  let s = setup(3, { hands: { [A]: ['W4-1', n('blue', 1)], [B]: ['W4-2', n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = act(s, A, { type: 'play', cardId: 'W4-1', color: 'blue' });
  assert.deepEqual(engine.view(s, B).playable, ['W4-2'], 'seul un +4 peut être posé face à un +4');
  s = act(s, B, { type: 'play', cardId: 'W4-2', color: 'green' });
  assert.equal(s.phase, 'challenge');
  assert.equal(s.turn, C);
  assert.equal(s.activeColor, 'green');
  assert.equal(engine.view(s, C).challenge.count, 8);
  s = act(s, C, { type: 'accept' });
  assert.equal(s.hands[C].length, 9);
  assert.equal(s.hands[B].length, 1);
  assert.equal(s.turn, A, 'C pioche 8 et passe son tour');
  assert.equal(total(s), 108);
});

test('+4 renvoyé puis contesté : bluff → l\'auteur du dernier +4 pioche le cumul ; sinon cumul + 2', () => {
  // B renvoie alors qu'il avait du bleu (couleur demandée par A) : bluff.
  let s = setup(3, { hands: { [A]: ['W4-1', n('blue', 1)], [B]: ['W4-2', n('blue', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = act(s, A, { type: 'play', cardId: 'W4-1', color: 'blue' });
  s = act(s, B, { type: 'play', cardId: 'W4-2', color: 'green' });
  const out = engine.apply(s, C, { type: 'challenge' }, ctx());
  assert.equal(out.state.hands[B].length, 1 + 8);
  assert.equal(out.state.turn, C);
  assert.deepEqual(out.events.find(e => e.type === 'challenge_result').payload, { by: B, victim: C, success: true, count: 8 });
  // B renvoie sans carte de la couleur demandée : renvoi régulier, C pioche 10.
  let t = setup(3, { hands: { [A]: ['W4-1', n('blue', 1)], [B]: ['W4-2', n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  t = act(t, A, { type: 'play', cardId: 'W4-1', color: 'blue' });
  t = act(t, B, { type: 'play', cardId: 'W4-2', color: 'green' });
  t = act(t, C, { type: 'challenge' });
  assert.equal(t.hands[C].length, 11);
  assert.equal(t.turn, A);
});

test('+4 contesté mais légal : le contestataire pioche 6 et perd son tour', () => {
  let s = setup(3, { hands: { [A]: ['W4-1', n('blue', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = act(s, A, { type: 'play', cardId: 'W4-1', color: 'blue' });
  s = act(s, B, { type: 'challenge' });
  assert.equal(s.hands[B].length, 7);
  assert.equal(s.hands[A].length, 1);
  assert.equal(s.turn, C);
});

test('Dernière carte oubliée et signalée : +2 cartes', () => {
  let s = setup(3, { hands: { [A]: [n('red', 1), n('red', 2)], [B]: [n('blue', 2), n('green', 9)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = act(s, A, { type: 'play', cardId: n('red', 1) });
  assert.equal(s.vulnerable, A);
  assert.throws(() => act(s, A, { type: 'call_last_card' }), { code: 'NOTHING_TO_CALL' });
  s = act(s, C, { type: 'call_last_card' }); // C n'est pas au trait : autorisé
  assert.equal(s.hands[A].length, 3);
  assert.equal(s.vulnerable, null);
});

test('Dernière carte annoncée (avant ou juste après) : aucun risque', () => {
  let s = setup(2, { hands: { [A]: [n('red', 1), n('red', 2)], [B]: [n('blue', 2), n('green', 9)] }, top: n('red', 7) });
  const pre = act(s, A, { type: 'play', cardId: n('red', 1), declareLastCard: true });
  assert.equal(pre.vulnerable, null);
  assert.throws(() => act(pre, B, { type: 'call_last_card' }), { code: 'NOTHING_TO_CALL' });
  s = act(s, A, { type: 'play', cardId: n('red', 1) });
  s = act(s, A, { type: 'last_card' }); // annonce tardive mais avant le signalement
  assert.equal(s.vulnerable, null);
});

test('Dernière carte : plus de signalement après le début du tour suivant', () => {
  let s = setup(3, { hands: { [A]: [n('red', 1), n('red', 2)], [B]: [n('red', 5), n('green', 9), n('green', 8)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = act(s, A, { type: 'play', cardId: n('red', 1) });
  s = act(s, B, { type: 'play', cardId: n('red', 5) });
  assert.equal(s.vulnerable, null);
  assert.throws(() => act(s, C, { type: 'call_last_card' }), { code: 'NOTHING_TO_CALL' });
});

test('victoire et classement : nombre de cartes, puis valeur, rang partagé', () => {
  let s = setup(4, {
    hands: {
      [A]: [n('red', 1)],
      [B]: [n('blue', 2), 'W1'],          // 2 cartes, 52 pts
      [C]: [n('blue', 3), n('green', 4)], // 2 cartes, 7 pts
      [D]: [n('blue', 4), n('green', 3)], // 2 cartes, 7 pts (égalité avec C)
    },
    top: n('red', 7),
  });
  s.declared[A] = true;
  s = act(s, A, { type: 'play', cardId: n('red', 1) });
  assert.equal(s.status, 'finished');
  const r = engine.result(s);
  const places = Object.fromEntries(r.placements.map(p => [p.userId, p.place]));
  assert.deepEqual(places, { [A]: 1, [C]: 2, [D]: 2, [B]: 4 });
  assert.equal(r.placements.find(p => p.userId === B).stats.handValue, 52);
});

test('chronomètre : pioche + passe ; +4 en attente = accepté ; abus = forfait', () => {
  let s = setup(3, { hands: { [A]: [n('red', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  s = engine.timeout(s, ctx()).state;
  assert.equal(s.hands[A].length, 2);
  assert.equal(s.turn, B);
  let w = setup(3, { hands: { [A]: ['W4-1', n('blue', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  w = act(w, A, { type: 'play', cardId: 'W4-1', color: 'blue' });
  w = engine.timeout(w, ctx()).state;
  assert.equal(w.hands[B].length, 5);
  let f = setup(3, { hands: { [A]: [n('red', 1)], [B]: [n('red', 2)], [C]: [n('red', 3)] }, top: n('red', 7) });
  for (let i = 0; i < 3; i++) { f.turn = A; f.phase = 'play'; f = engine.timeout(f, ctx()).state; }
  assert.ok(f.forfeited.includes(A));
  assert.equal(f.status, 'playing');
  assert.equal(total(f), 108, 'les cartes du joueur retournent dans la pioche');
});

test('pioche vide : la défausse est remélangée', () => {
  let s = setup(2, { hands: { [A]: [n('blue', 2)], [B]: [n('green', 1)] }, top: n('red', 7) });
  s.discard = [...s.drawPile.splice(0), card(n('red', 7))].filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  s.discard.push(s.discard.splice(s.discard.findIndex(c => c.id === n('red', 7)), 1)[0]);
  assert.equal(s.drawPile.length, 0);
  const out = engine.apply(s, A, { type: 'draw' }, ctx());
  assert.ok(out.events.some(e => e.type === 'reshuffle'));
  assert.equal(total(out.state), 108);
  assert.equal(out.state.discard.length, 1);
});

test('forfait à 2 joueurs : l\'autre gagne', () => {
  const s = engine.forfeit(start(2), A, ctx()).state;
  assert.equal(s.status, 'finished');
  assert.deepEqual(engine.result(s).placements.map(p => [p.userId, p.place]), [[B, 1], [A, 2]]);
});

test('le premier joueur est tiré au sort', () => {
  assert.equal(start(3, 2).turn, C);
  void scriptedRng;
});
