// Yas Cards — jeu de défausse, 2 à 4 joueurs, paquet original de 108 cartes.
//
// Paquet : par couleur (jaune, rouge, bleu, vert) un 0, deux 1..9, deux Passe,
// deux Inverse, deux +2 (25 cartes) ; plus 4 Jokers et 4 Jokers +4.
//
// Règles V1 (cahier des charges §6)
//  - 7 cartes chacun ; une carte NUMÉROTÉE est retournée pour commencer
//    (le serveur va chercher la première carte numérotée de la pioche si besoin).
//  - Jouer : même couleur (couleur active), même chiffre, même symbole, ou un Joker.
//  - Piocher n'est permis que si aucune carte n'est jouable. La carte piochée peut
//    être jouée immédiatement si elle est jouable ; sinon le tour passe.
//  - Passe : le suivant perd son tour. Inverse : change de sens (à 2 : comme Passe).
//    +2 : le suivant pioche 2 et perd son tour. Joker : choix de la couleur.
//    Joker +4 : choix de la couleur ; le suivant peut l'accepter (pioche 4, perd son
//    tour) ou le contester. Le +4 n'est légal que si l'auteur n'avait aucune carte de
//    la couleur active : contestation gagnée → l'auteur pioche 4 (le contestataire
//    joue normalement) ; perdue → le contestataire pioche 6 et perd son tour.
//    Seul le verdict est révélé, jamais la main de l'auteur.
//  - Règles 1.1 : un +4 peut être renvoyé avec un autre +4 (le cumul passe au suivant :
//    +8, +12…). Accepter fait piocher tout le cumul. Contester porte sur le dernier +4 :
//    bluff → son auteur pioche le cumul ; sinon le contestataire pioche le cumul + 2.
//    Pas de cumul des +2.
//  - Dernière carte : à 1 carte, le joueur doit l'annoncer (avant ou juste après avoir
//    joué). Tant que le joueur suivant n'a pas agi, un adversaire peut le signaler :
//    pénalité de 2 cartes.
//  - Une manche : le premier sans carte gagne immédiatement. Les autres sont classés
//    par nombre de cartes, puis valeur des cartes (chiffre, actions 20, Jokers 50),
//    rang partagé en cas d'égalité parfaite.
//  - Chronomètre 20 s : à l'expiration, le joueur pioche une carte et passe (phase
//    « jouer »), passe (carte piochée non jouée) ou accepte le +4. maxTimeouts = forfait.
const { EngineError } = require('../engineError');
const { shuffle } = require('../../lib/rng');

const COLORS = ['yellow', 'red', 'blue', 'green'];
// Générateur aléatoire de l'action en cours (le moteur est synchrone : apply,
// timeout et forfeit le positionnent avant toute pioche).
let RNG = null;
const HAND_SIZE = 7;

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    const c = color[0].toUpperCase();
    deck.push({ id: `${c}0`, color, kind: 'number', value: 0 });
    for (let v = 1; v <= 9; v++) for (const k of ['a', 'b']) deck.push({ id: `${c}${v}${k}`, color, kind: 'number', value: v });
    for (const kind of ['skip', 'reverse', 'draw2']) for (const k of ['a', 'b']) deck.push({ id: `${c}-${kind}-${k}`, color, kind, value: null });
  }
  for (let i = 1; i <= 4; i++) deck.push({ id: `W${i}`, color: null, kind: 'wild', value: null });
  for (let i = 1; i <= 4; i++) deck.push({ id: `W4-${i}`, color: null, kind: 'wild4', value: null });
  return deck;
}

const cardPoints = (c) => (c.kind === 'number' ? c.value : c.kind === 'wild' || c.kind === 'wild4' ? 50 : 20);
const isWild = (c) => c.kind === 'wild' || c.kind === 'wild4';

function matches(card, top, activeColor) {
  if (isWild(card)) return true;
  if (card.color === activeColor) return true;
  if (card.kind === 'number' && top.kind === 'number' && card.value === top.value) return true;
  if (card.kind !== 'number' && card.kind === top.kind) return true;
  return false;
}

const top = (s) => s.discard[s.discard.length - 1];
const active = (s) => s.players.filter(u => !s.forfeited.includes(u));

function nextFrom(s, from, steps = 1) {
  const list = s.players;
  let idx = list.indexOf(from);
  let moved = 0;
  while (moved < steps) {
    idx = (idx + s.direction + list.length) % list.length;
    if (!s.forfeited.includes(list[idx])) moved++;
  }
  return list[idx];
}

function init({ players, rng, now, config }) {
  if (players.length < 2 || players.length > 4) throw new EngineError('BAD_PLAYERS', 'Yas Cards se joue de 2 à 4 joueurs');
  const order = [...players].sort((a, b) => a.seat - b.seat).map(p => p.userId);
  const deck = shuffle(buildDeck(), rng);
  const hands = {};
  for (const u of order) hands[u] = deck.splice(0, HAND_SIZE);
  // Carte de départ : la première carte numérotée de la pioche.
  const firstIdx = deck.findIndex(c => c.kind === 'number');
  const [first] = deck.splice(firstIdx, 1);
  const turnMs = config.turnSeconds * 1000;
  return {
    players: order,
    hands,
    drawPile: deck,
    discard: [first],
    activeColor: first.color,
    direction: 1,
    turn: order[rng.int(order.length)],
    phase: 'play',              // play | drawn | challenge
    drawnCardId: null,
    pendingWild4: null,         // { by, victim, illegal, count }
    declared: {},               // userId -> a annoncé « Dernière carte »
    vulnerable: null,           // userId à 1 carte sans annonce (signalable)
    forfeited: [],
    winner: null,
    timeouts: Object.fromEntries(order.map(u => [u, 0])),
    actions: Object.fromEntries(order.map(u => [u, 0])),
    stats: Object.fromEntries(order.map(u => [u, { played: 0, drawn: 0, challengesWon: 0, caught: 0 }])),
    lastPlay: null,
    turnMs,
    turnDeadline: now + turnMs,
    status: 'playing',
    endReason: null,
  };
}

function view(state, viewerId) {
  return {
    players: state.players,
    hand: state.hands[viewerId] || [],
    counts: Object.fromEntries(state.players.map(u => [u, state.hands[u].length])),
    top: top(state),
    activeColor: state.activeColor,
    direction: state.direction,
    drawPileCount: state.drawPile.length,
    turn: state.turn,
    phase: state.phase,
    drawnCardId: state.turn === viewerId ? state.drawnCardId : null,
    challenge: state.pendingWild4 ? { by: state.pendingWild4.by, victim: state.pendingWild4.victim, count: state.pendingWild4.count || 4 } : null,
    declared: state.declared,
    vulnerable: state.vulnerable,
    forfeited: state.forfeited,
    lastPlay: state.lastPlay,
    playable: state.turn === viewerId && state.status === 'playing'
      ? playableIds(state, viewerId) : [],
    turnDeadline: state.turnDeadline,
    turnMs: state.turnMs,
    status: state.status,
    winner: state.winner,
  };
}

function playableIds(s, userId) {
  if (s.phase === 'drawn') {
    const c = s.hands[userId].find(x => x.id === s.drawnCardId);
    return c && matches(c, top(s), s.activeColor) ? [c.id] : [];
  }
  // Face à un +4 : seul un autre +4 peut être posé (renvoi, le cumul passe au suivant).
  if (s.phase === 'challenge') return s.hands[userId].filter(c => c.kind === 'wild4').map(c => c.id);
  if (s.phase !== 'play') return [];
  return s.hands[userId].filter(c => matches(c, top(s), s.activeColor)).map(c => c.id);
}

// Pioche n cartes (remélange la défausse si la pioche est vide).
function draw(s, userId, n, events, reason) {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (!s.drawPile.length) {
      const keep = s.discard.pop();
      s.drawPile = shuffle(s.discard, RNG);
      s.discard = [keep];
      if (s.drawPile.length) events.push({ type: 'reshuffle', payload: { count: s.drawPile.length } });
    }
    if (!s.drawPile.length) break;
    got.push(s.drawPile.shift());
  }
  s.hands[userId].push(...got);
  s.stats[userId].drawn += got.length;
  if (s.hands[userId].length > 1) delete s.declared[userId];
  if (s.vulnerable === userId && s.hands[userId].length !== 1) s.vulnerable = null;
  events.push({ type: 'cards_drawn', payload: { userId, count: got.length, reason } });
  if (got.length) events.push({ type: 'you_drew', to: userId, payload: { cards: got, reason } });
  return got;
}

function beginTurn(s, userId, now) {
  s.turn = userId;
  s.phase = 'play';
  s.drawnCardId = null;
  s.turnDeadline = now + s.turnMs;
}

// Toute action du joueur au trait clôt la fenêtre de signalement « Dernière carte ».
function closeLastCardWindow(s, actor) {
  if (s.vulnerable && s.vulnerable !== actor) s.vulnerable = null;
}

function finish(s, winner, events, reason = 'out_of_cards') {
  s.status = 'finished';
  s.winner = winner;
  s.endReason = reason;
  s.turn = null;
  s.phase = null;
  s.turnDeadline = null;
  s.vulnerable = null;
  s.pendingWild4 = null;
  events.push({ type: 'game_over', payload: { winner } });
}

function playCard(s, userId, cardId, chosenColor, declare, now, events) {
  const hand = s.hands[userId];
  const idx = hand.findIndex(c => c.id === cardId);
  if (idx === -1) throw new EngineError('NOT_IN_HAND', 'Tu n\'as pas cette carte');
  const card = hand[idx];
  if (s.phase === 'drawn' && cardId !== s.drawnCardId) throw new EngineError('ONLY_DRAWN', 'Tu ne peux jouer que la carte piochée');
  if (!matches(card, top(s), s.activeColor)) throw new EngineError('ILLEGAL_CARD', 'Cette carte ne peut pas être posée');
  if (isWild(card) && !COLORS.includes(chosenColor)) throw new EngineError('COLOR_REQUIRED', 'Choisis une couleur');

  // Légalité du +4 (enregistrée en privé, vérifiée seulement en cas de contestation)
  const illegalWild4 = card.kind === 'wild4' && hand.some(c => c.id !== card.id && c.color === s.activeColor);
  if (declare && hand.length === 2) s.declared[userId] = true;
  hand.splice(idx, 1);
  s.discard.push(card);
  s.activeColor = isWild(card) ? chosenColor : card.color;
  s.stats[userId].played += 1;
  s.lastPlay = { userId, card, chosenColor: isWild(card) ? chosenColor : null };
  events.push({ type: 'card_played', payload: { userId, card, chosenColor: isWild(card) ? chosenColor : null } });

  if (hand.length === 0) return finish(s, userId, events);
  if (hand.length === 1) {
    s.vulnerable = s.declared[userId] ? null : userId;
    if (s.declared[userId]) events.push({ type: 'last_card', payload: { userId } });
  }

  const two = active(s).length === 2;
  switch (card.kind) {
    case 'skip': {
      const skipped = nextFrom(s, userId);
      events.push({ type: 'skipped', payload: { userId: skipped } });
      return beginTurn(s, nextFrom(s, userId, 2), now);
    }
    case 'reverse': {
      s.direction = -s.direction;
      events.push({ type: 'reversed', payload: { direction: s.direction } });
      if (two) {
        events.push({ type: 'skipped', payload: { userId: nextFrom(s, userId) } });
        return beginTurn(s, userId, now);
      }
      return beginTurn(s, nextFrom(s, userId), now);
    }
    case 'draw2': {
      const victim = nextFrom(s, userId);
      draw(s, victim, 2, events, 'draw2');
      events.push({ type: 'skipped', payload: { userId: victim } });
      return beginTurn(s, nextFrom(s, userId, 2), now);
    }
    case 'wild4': {
      const victim = nextFrom(s, userId);
      const count = (s.pendingWild4?.count || 0) + 4;   // renvoi : le cumul grossit
      s.pendingWild4 = { by: userId, victim, illegal: illegalWild4, count };
      s.turn = victim;
      s.phase = 'challenge';
      s.drawnCardId = null;
      s.turnDeadline = now + s.turnMs;
      events.push({ type: 'wild4_pending', payload: { by: userId, victim, count } });
      return undefined;
    }
    default:
      return beginTurn(s, nextFrom(s, userId), now);
  }
}

function resolveWild4(s, victim, challenge, now, events) {
  const { by, illegal } = s.pendingWild4;
  const count = s.pendingWild4.count || 4;
  s.pendingWild4 = null;
  if (!challenge) {
    draw(s, victim, count, events, 'wild4');
    events.push({ type: 'skipped', payload: { userId: victim } });
    return beginTurn(s, nextFrom(s, victim), now);
  }
  if (illegal) {
    draw(s, by, count, events, 'challenge_lost');
    s.stats[victim].challengesWon += 1;
    events.push({ type: 'challenge_result', payload: { by, victim, success: true, count } });
    return beginTurn(s, victim, now); // le contestataire joue normalement
  }
  draw(s, victim, count + 2, events, 'challenge_failed');
  events.push({ type: 'challenge_result', payload: { by, victim, success: false, count } });
  return beginTurn(s, nextFrom(s, victim), now);
}

function apply(state, userId, action, { now, rng }) {
  RNG = rng;
  if (state.status !== 'playing') throw new EngineError('GAME_OVER', 'La partie est terminée');
  if (!state.players.includes(userId) || state.forfeited.includes(userId)) throw new EngineError('NOT_PLAYER', 'Vous ne jouez pas dans cette partie');
  const s = structuredClone(state);
  const events = [];
  const type = action?.type;

  // Actions possibles hors de son tour
  if (type === 'last_card') {
    const n = s.hands[userId].length;
    if (s.vulnerable === userId && n === 1) {
      s.vulnerable = null;
      s.declared[userId] = true;
    } else if (s.turn === userId && n === 2 && s.phase !== 'challenge') {
      s.declared[userId] = true;
    } else {
      throw new EngineError('NOT_NOW', 'Tu ne peux annoncer « Dernière carte » qu\'avec 2 cartes à ton tour ou juste après avoir joué');
    }
    events.push({ type: 'last_card', payload: { userId } });
    s.actions[userId] += 1;
    return { state: s, events };
  }
  if (type === 'call_last_card') {
    const target = s.vulnerable;
    if (!target || target === userId) throw new EngineError('NOTHING_TO_CALL', 'Personne à signaler');
    s.vulnerable = null;
    s.stats[target].caught += 1;
    events.push({ type: 'last_card_caught', payload: { by: userId, userId: target } });
    draw(s, target, 2, events, 'last_card_penalty');
    s.actions[userId] += 1;
    return { state: s, events };
  }

  if (s.turn !== userId) throw new EngineError('NOT_YOUR_TURN', 'Ce n\'est pas votre tour');
  closeLastCardWindow(s, userId);

  if (s.phase === 'challenge') {
    if (type === 'play') {
      // Renvoi du +4 avec un autre +4.
      const card = s.hands[userId].find(c => c.id === action.cardId);
      if (!card || card.kind !== 'wild4') throw new EngineError('BAD_PHASE', 'Face à un +4 : accepte, conteste ou renvoie un +4');
      playCard(s, userId, action.cardId, action.color, !!action.declareLastCard, now, events);
    } else if (type === 'challenge' || type === 'accept') {
      resolveWild4(s, userId, type === 'challenge', now, events);
    } else throw new EngineError('BAD_PHASE', 'Face à un +4 : accepte, conteste ou renvoie un +4');
  } else if (type === 'play') {
    playCard(s, userId, action.cardId, action.color, !!action.declareLastCard, now, events);
  } else if (type === 'draw') {
    if (s.phase !== 'play') throw new EngineError('BAD_PHASE', 'Tu as déjà pioché');
    if (playableIds(s, userId).length) throw new EngineError('MUST_PLAY', 'Tu as une carte jouable : pas de pioche');
    const [card] = draw(s, userId, 1, events, 'draw');
    if (card && matches(card, top(s), s.activeColor)) {
      s.phase = 'drawn';
      s.drawnCardId = card.id;
      s.turnDeadline = now + s.turnMs;
    } else {
      beginTurn(s, nextFrom(s, userId), now);
    }
  } else if (type === 'pass') {
    if (s.phase !== 'drawn') throw new EngineError('BAD_PHASE', 'Tu ne peux passer qu\'après avoir pioché');
    beginTurn(s, nextFrom(s, userId), now);
  } else {
    throw new EngineError('BAD_ACTION', 'Action inconnue');
  }
  s.timeouts[userId] = 0;
  s.actions[userId] += 1;
  return { state: s, events };
}

function forfeitInto(s, userId, now, events, reason) {
  if (s.forfeited.includes(userId)) return { state: s, events };
  const wasTurn = s.turn === userId;
  s.forfeited.push(userId);
  // ses cartes retournent sous la pioche
  s.drawPile.push(...s.hands[userId]);
  s.forfeitedCards = { ...(s.forfeitedCards || {}), [userId]: s.hands[userId].length };
  s.hands[userId] = [];
  if (s.vulnerable === userId) s.vulnerable = null;
  if (s.pendingWild4 && (s.pendingWild4.by === userId || s.pendingWild4.victim === userId)) s.pendingWild4 = null;
  events.push({ type: 'player_forfeit', payload: { userId, reason } });
  const rest = active(s);
  if (rest.length === 1) {
    finish(s, rest[0], events, reason);
  } else if (wasTurn || s.phase === 'challenge') {
    beginTurn(s, wasTurn ? nextFrom(s, userId) : s.turn, now);
  }
  return { state: s, events };
}

function timeout(state, { now, config, rng }) {
  RNG = rng;
  if (state.status !== 'playing') return { state, events: [] };
  const s = structuredClone(state);
  const userId = s.turn;
  const events = [{ type: 'turn_timeout', payload: { userId } }];
  closeLastCardWindow(s, userId);
  s.timeouts[userId] += 1;
  if (s.timeouts[userId] >= (config.maxTimeouts || 3)) return forfeitInto(s, userId, now, events, 'timeouts_limit');
  if (s.phase === 'challenge') resolveWild4(s, userId, false, now, events);
  else if (s.phase === 'drawn') beginTurn(s, nextFrom(s, userId), now);
  else {
    draw(s, userId, 1, events, 'timeout');
    beginTurn(s, nextFrom(s, userId), now);
  }
  return { state: s, events };
}

function forfeit(state, userId, { now, rng }) {
  RNG = rng;
  if (state.status !== 'playing') return { state, events: [] };
  return forfeitInto(structuredClone(state), userId, now, [], 'forfeit');
}

function deadline(state) {
  if (state.status !== 'playing') return null;
  return { at: state.turnDeadline, userIds: [state.turn] };
}

function resume(state, { now }) {
  if (state.status !== 'playing') return state;
  return { ...state, turnDeadline: now + state.turnMs };
}

function result(state) {
  if (state.status !== 'finished') return null;
  const handValue = (u) => state.hands[u].reduce((t, c) => t + cardPoints(c), 0);
  const others = state.players
    .filter(u => u !== state.winner && !state.forfeited.includes(u))
    .map(u => ({ u, n: state.hands[u].length, v: handValue(u) }))
    .sort((a, b) => a.n - b.n || a.v - b.v);
  const placements = [];
  const stat = (u) => ({
    moves: state.stats[u].played, cardsPlayed: state.stats[u].played, cardsDrawn: state.stats[u].drawn,
    cardsLeft: state.hands[u].length, handValue: handValue(u), challengesWon: state.stats[u].challengesWon,
    lastCardCaught: state.stats[u].caught, forfeited: state.forfeited.includes(u),
  });
  placements.push({ userId: state.winner, place: 1, outcome: 'win', stats: stat(state.winner) });
  let place = 2;
  others.forEach((o, i) => {
    const prev = others[i - 1];
    const p = prev && prev.n === o.n && prev.v === o.v ? placements[placements.length - 1].place : place;
    placements.push({ userId: o.u, place: p, outcome: 'loss', stats: stat(o.u) });
    place = 2 + i + 1;
  });
  // abandons : derniers, du dernier abandon au premier
  [...state.forfeited].reverse().forEach((u) => {
    if (u === state.winner) return;
    placements.push({ userId: u, place: placements.length + 1, outcome: 'loss', stats: stat(u) });
  });
  return { isDraw: false, reason: state.endReason, placements };
}

function actionsCount(state, userId) {
  return state.actions[userId] || 0;
}

module.exports = {
  id: 'cards', rulesVersion: '1.1.0', minPlayers: 2, maxPlayers: 4,
  init, view, apply, deadline, timeout, forfeit, result, actionsCount, resume,
  _internals: { buildDeck, matches, cardPoints, playableIds, COLORS },
};
