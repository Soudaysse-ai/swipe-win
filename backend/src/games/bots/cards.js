// Bot Yas Cards : joue avec sa main et les informations publiques uniquement
// (carte du dessus, couleur active, nombre de cartes des adversaires).
// Facile : carte jouable au hasard, oublie parfois d'annoncer « Dernière carte » ;
// Normal / Difficile : se débarrasse des grosses cartes, garde les Jokers pour la fin,
// attaque l'adversaire suivant quand il lui reste peu de cartes, ne bluffe jamais au +4.
const { COLORS } = require('../cards/engine')._internals;

const CALL_CHANCE = { easy: 25, normal: 60, hard: 90 };        // signaler un oubli adverse (%)
const FORGET_CHANCE = { easy: 35, normal: 12, hard: 0 };       // oublier sa propre annonce (%)
const RECOVER_CHANCE = { easy: 0, normal: 50, hard: 100 };     // se rattraper avant d'être signalé (%)
const CHALLENGE_CHANCE = { easy: 0, normal: 20, hard: 35 };    // contester un +4 (%)

const isWild = (c) => c.kind === 'wild' || c.kind === 'wild4';
const roll = (rng, pct) => rng.int(100) < pct;

function nextPlayer(view, from) {
  const list = view.players;
  let idx = list.indexOf(from);
  for (let k = 0; k < list.length; k++) {
    idx = (idx + view.direction + list.length) % list.length;
    if (!view.forfeited.includes(list[idx])) return list[idx];
  }
  return from;
}

function bestColor(cards, rng) {
  const count = Object.fromEntries(COLORS.map(c => [c, 0]));
  for (const c of cards) if (c.color) count[c.color] += 1;
  const top = Math.max(...COLORS.map(c => count[c]));
  const best = COLORS.filter(c => count[c] === top);
  return best[rng.int(best.length)];
}

// Plus le score est haut, plus la carte est posée tôt.
function cardScore(card, threat) {
  switch (card.kind) {
    case 'number': return 10 + card.value;
    case 'skip':
    case 'reverse': return 12 + (threat ? 40 : 0);
    case 'draw2': return 14 + (threat ? 45 : 0);
    case 'wild': return 1;
    case 'wild4': return 2 + (threat ? 45 : 0);
    default: return 0;
  }
}

function chooseCard(view, botId, { level = 'normal', rng }) {
  const playable = view.hand.filter(c => view.playable.includes(c.id));
  if (!playable.length) return null;
  if (level === 'easy') return playable[rng.int(playable.length)];
  // +4 uniquement s'il est légal (aucune carte de la couleur active en main) : pas de bluff.
  const hasActive = view.hand.some(c => !isWild(c) && c.color === view.activeColor);
  const honest = playable.filter(c => c.kind !== 'wild4' || !hasActive);
  const pool = honest.length ? honest : playable;
  const next = nextPlayer(view, botId);
  const threat = (view.counts[next] ?? 99) <= 2;
  let best = []; let bestScore = -Infinity;
  for (const c of pool) {
    const s = cardScore(c, threat);
    if (s > bestScore) { best = [c]; bestScore = s; } else if (s === bestScore) best.push(c);
  }
  return best[rng.int(best.length)];
}

function playAction(view, card, level, rng) {
  const rest = view.hand.filter(c => c.id !== card.id);
  const action = { type: 'play', cardId: card.id };
  if (isWild(card)) action.color = level === 'easy' ? COLORS[rng.int(COLORS.length)] : bestColor(rest, rng);
  if (view.hand.length === 2 && !roll(rng, FORGET_CHANCE[level] ?? 0)) action.declareLastCard = true;
  return action;
}

function decide(view, botId, { level = 'normal', rng }) {
  if (view.status !== 'playing' || view.forfeited.includes(botId)) return null;

  // Hors de son tour : signaler l'adversaire qui a oublié « Dernière carte », ou se rattraper.
  if (view.vulnerable && view.vulnerable !== botId && roll(rng, CALL_CHANCE[level] ?? 0)) {
    return { action: { type: 'call_last_card' }, think: [1500, 3000] };
  }
  if (view.vulnerable === botId && view.hand.length === 1 && roll(rng, RECOVER_CHANCE[level] ?? 0)) {
    return { action: { type: 'last_card' }, think: [1800, 3500] };
  }

  if (view.turn !== botId) return null;
  if (view.phase === 'challenge') {
    return { action: { type: roll(rng, CHALLENGE_CHANCE[level] ?? 0) ? 'challenge' : 'accept' }, think: [1600, 2600] };
  }
  if (view.phase === 'drawn') {
    const card = view.hand.find(c => c.id === view.drawnCardId && view.playable.includes(c.id));
    return card
      ? { action: playAction(view, card, level, rng), think: [1100, 1600] }
      : { action: { type: 'pass' }, think: [1000, 1500] };
  }
  if (view.phase === 'play') {
    const card = chooseCard(view, botId, { level, rng });
    return card
      ? { action: playAction(view, card, level, rng), think: [1600, 2600] }
      : { action: { type: 'draw' }, think: [1400, 2100] };
  }
  return null;
}

module.exports = { decide, _internals: { chooseCard, nextPlayer, bestColor } };
