const test = require('node:test');
const assert = require('node:assert/strict');
const { hit, reset } = require('../../src/lib/rateLimit');
const { filterText, containsBlocked, sanitize } = require('../../src/services/contentFilter');
const P = require('../../src/services/progression');
const { toCsv } = require('../../src/services/exporter');

test('limiteur : fenêtre glissante', () => {
  reset();
  const opts = { force: true };
  for (let i = 0; i < 5; i++) assert.equal(hit('k', 5, 1000, 0, opts), true);
  assert.equal(hit('k', 5, 1000, 10, opts), false);
  assert.equal(hit('k', 5, 1000, 1001, opts), true, 'nouvelle fenêtre');
});

test('filtre du chat : insultes masquées, variantes détectées, texte normal intact', () => {
  assert.equal(filterText('bonne partie !').filtered, false);
  const f = filterText('t es un connard');
  assert.equal(f.filtered, true);
  assert.equal(f.text.includes('connard'), false);
  assert.equal(containsBlocked('C0NN4RD'), true);
  assert.equal(containsBlocked('concours'), false, 'pas de faux positif sur un mot contenant « con »');
  assert.equal(sanitize('  a\u0000b   c  ', 10), 'ab c');
});

test('niveaux : 100 × (N − 1)²', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(P.xpForLevel), [0, 100, 400, 900, 1600]);
  assert.equal(P.levelForXp(0), 1);
  assert.equal(P.levelForXp(99), 1);
  assert.equal(P.levelForXp(100), 2);
  assert.equal(P.levelForXp(1599), 4);
  assert.equal(P.levelForXp(1600), 5);
  const pr = P.levelProgress(250);
  assert.equal(pr.level, 2);
  assert.equal(pr.progress, 0.5);
});

test('points de saison', () => {
  assert.equal(P.seasonPointsFor({ placement: 1, playerCount: 2 }), 30);
  assert.equal(P.seasonPointsFor({ placement: 2, playerCount: 2 }), 0, '1v1 : victoire ou défaite seulement');
  assert.equal(P.seasonPointsFor({ isDraw: true, placement: 1, playerCount: 2 }), 10);
  assert.deepEqual([1, 2, 3, 4].map(p => P.seasonPointsFor({ placement: p, playerCount: 4 })), [30, 15, 8, 3]);
});

test('ligues : seuils par défaut et calibrés', () => {
  assert.equal(P.leagueFor(850), 'Bronze');
  assert.equal(P.leagueFor(900), 'Silver');
  assert.equal(P.leagueFor(1299), 'Gold');
  assert.equal(P.leagueFor(1800), 'Legend');
  assert.equal(P.leagueFor(1000, [{ name: 'Bronze', min_rating: 0 }, { name: 'Silver', min_rating: 1050 }]), 'Bronze');
});

test('défi du jour : rotation déterministe des 4 jeux', () => {
  const days = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].map(d => P.dailyChallenge(d).gameId);
  assert.equal(new Set(days).size, 4);
  assert.ok(!days.includes('penalty'));
  assert.equal(P.dailyChallenge('2026-10-14').gameId, days[0]);
});

test('export CSV : séparateur ; et neutralisation des formules', () => {
  const csv = toCsv([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], [{ a: '=HYPERLINK("x")', b: 'x;y' }]);
  assert.ok(csv.startsWith('﻿A;B'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"x;y"'));
});

test('CORS : adresses exactes et motifs « * » sur un seul segment', () => {
  const { _toMatcher } = require('../../src/lib/cors');
  const exact = _toMatcher('https://www.defi-yas.com');
  assert.equal(exact('https://www.defi-yas.com'), true);
  assert.equal(exact('https://www.defi-yas.com.evil.io'), false);
  const preview = _toMatcher('https://defi-yas-*.vercel.app');
  assert.equal(preview('https://defi-yas-git-claude-abc-team.vercel.app'), true);
  assert.equal(preview('https://defi-yas-x.evil.io/.vercel.app'), false);
  assert.equal(preview('https://defi-yas-a.b.vercel.app'), false);
});

test('numéro : formats de saisie courants acceptés', () => {
  const { normalizePhone } = require('../../src/services/authService');
  for (const raw of ['4123456', '412 34 56', '+269 412 34 56', '00269 412-34-56', '2694123456']) {
    assert.equal(normalizePhone(raw), '+2694123456', raw);
  }
  for (const raw of ['', '123', '3123456', '+33612345678']) {
    assert.throws(() => normalizePhone(raw), { code: 'PHONE_INVALID' }, raw);
  }
});
