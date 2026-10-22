// Yas Cards — interface, organisée comme une table de jeu : adversaires en haut
// (dos des cartes en éventail), pioche et défausse au centre, ta main en bas.
// Les mains adverses ne sont jamais envoyées au navigateur (seul leur nombre l'est)
// et toutes les règles sont appliquées par le serveur.
//
// Animations façon Plato « Ocho » :
//  - la carte jouée vole de sa vraie place (ta main, ou l'éventail de
//    l'adversaire en se retournant) jusqu'à la défausse ; ta carte part dès que
//    tu la touches, sans attendre le serveur (elle revient s'il refuse) ;
//  - les cartes piochées volent de la pioche vers le joueur, l'une après l'autre ;
//  - +2, +4, Passe, Inverse et Joker : halo dans la couleur, symbole qui jaillit ;
//  - flèches du sens du jeu autour de la défausse, dans la couleur de la carte
//    réellement posée (pas celle d'une carte encore en vol) ;
//  - journal des dernières actions sous la table ;
//  - ta main en éventail (arc), déplacée par transform (fluide sur téléphone) ; dès
//    que tu joues, elle se calme sans attendre le serveur (plus de cartes qui restent
//    levées puis retombent pendant l'aller-retour réseau).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/ui';
import { useGameEvents } from '../../player/pages/Match';
import { TurnAvatar, Seconds } from '../common/Turn';
import { CardFace, CardBack, COLOR, COLOR_NAME, cardName } from './CardFace';
import { Flight, Burst, DirectionRing, isSpecial, rectIn, reducedMotion } from './fx';
import { sfx } from '../../lib/sound';

// Son de la carte qui arrive sur la défausse, selon son effet.
const LAND_SOUND = { draw2: () => sfx.cardPlus(false), wild4: () => sfx.cardPlus(true), skip: () => sfx.cardSkip(), reverse: () => sfx.cardReverse(), wild: () => sfx.cardWild() };

const TURN_RING = '#FFD100';
const PILE_W = 96;
const STAGGER = 140;      // délai entre deux cartes piochées
const CAUSE_MS = 480;     // une pioche forcée (+2, +4) attend que sa carte soit posée
const BURST_MS = 1150;

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(360);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Légère inclinaison propre à chaque carte posée : la défausse a l'air d'une vraie pile.
const tilt = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 13) - 6);
};

function Opponent({ player, name, count, active, deadline, total, declared, vulnerable, onCall, out, solo, fanRef }) {
  const fan = Math.min(count, solo ? 9 : 5);
  return (
    <div className={`cards-opp${active ? ' active' : ''}${out ? ' out' : ''}${solo ? ' solo' : ''}`}>
      <div className="opp-fan" aria-hidden ref={fanRef}>
        {Array.from({ length: fan }, (_, i) => {
          const mid = (fan - 1) / 2;
          return <span key={i} style={{ transform: `translateX(${(i - mid) * (solo ? 16 : 11)}px) rotate(${(i - mid) * (solo ? 4 : 5)}deg)` }}><CardBack width={solo ? 34 : 26} /></span>;
        })}
      </div>
      <div className="opp-id">
        <TurnAvatar player={player} color={TURN_RING} active={active} deadline={deadline} total={total} size={solo ? 46 : 38} />
        <span className="opp-text">
          <b>{name}</b>
          <span>{out ? 'Abandon' : `${count} carte${count > 1 ? 's' : ''}`}</span>
        </span>
      </div>
      {declared && count === 1 && <span className="chip yellow opp-chip">Dernière carte !</span>}
      {vulnerable && <button className="btn sm danger opp-chip" onClick={onCall}>Signaler !</button>}
    </div>
  );
}

function ColorWord({ color }) {
  return <b style={{ color: COLOR[color] }}>{COLOR_NAME[color]}</b>;
}

function CardWord({ card, color }) {
  const tint = card.kind === 'wild' || card.kind === 'wild4' ? COLOR[color] || '#fff' : COLOR[card.color];
  return <b style={{ color: tint }}>{cardName(card)}</b>;
}

export default function CardsGame({ snapshot, me, sendAction, matchId }) {
  const v = snapshot.view;
  const [wildCard, setWildCard] = useState(null);
  const [banner, setBanner] = useState(null);
  const [declare, setDeclare] = useState(false);
  const [handRef, handW] = useWidth();
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  // Le pseudonyme de chacun, y compris le mien (plus de « Toi »).
  const name = (u) => byId[u]?.username || '';
  const playing = v.status === 'playing';
  const myTurn = playing && v.turn === me;
  // Commande envoyée, en attente du nouvel état : la main ne propose plus rien.
  const [sentAt, setSentAt] = useState(null);
  const busy = sentAt != null && sentAt === snapshot.version;
  const playable = new Set(v.playable);
  const others = v.players.filter(u => u !== me);
  const myCount = v.hand.length;

  // ── Éléments mesurés pour les vols ──────────────────────────────────────
  const rootRef = useRef(null);
  const pileRef = useRef(null);
  const slotRef = useRef(null);
  const handEls = useRef(new Map());
  const oppEls = useRef(new Map());
  const lastRects = useRef(new Map());  // dernière place connue de mes cartes (elles peuvent disparaître avant le vol)

  // ── Vols en cours et défausse affichée ──────────────────────────────────
  const [flights, setFlights] = useState([]);
  const landings = useRef(new Map());
  const seq = useRef(0);
  // Ce que montre la défausse, avec la couleur en jeu pour cette carte.
  const [shown, setShown] = useState({ top: v.top, under: null, color: v.activeColor });
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const pendingTop = useRef(null);       // carte en vol vers la défausse
  // Ordre des cartes posées : une carte partie plus tôt (vol plus long) ne doit
  // jamais recouvrir une carte plus récente déjà arrivée.
  const pileOrder = useRef(0);
  const shownOrder = useRef(0);
  const [leaving, setLeaving] = useState(() => new Set());   // mes cartes parties vers la défausse
  const [incoming, setIncoming] = useState(() => new Set()); // mes cartes en vol depuis la pioche
  const [burst, setBurst] = useState(null);
  const [spin, setSpin] = useState(false);
  const [log, setLog] = useState([]);

  const later = useRef([]);
  useEffect(() => () => later.current.forEach(clearTimeout), []);
  const after = (ms, fn) => later.current.push(setTimeout(fn, ms));

  function fly(f, onLand) {
    const key = ++seq.current;
    if (onLand) landings.current.set(key, onLand);
    setFlights(list => [...list, { ...f, key }]);
    return key;
  }
  function landed(key) {
    setFlights(list => list.filter(x => x.key !== key));
    const fn = landings.current.get(key);
    landings.current.delete(key);
    fn?.();
  }
  function dropFlight(key) {
    landings.current.delete(key);
    setFlights(list => list.filter(x => x.key !== key));
  }

  const pileTarget = (card) => {
    const r = rectIn(slotRef.current, rootRef.current);
    return r && { ...r, w: PILE_W, rot: tilt(card.id) };
  };
  const oppSource = (u) => {
    const r = rectIn(oppEls.current.get(u), rootRef.current);
    return r && { x: r.x, y: r.y, w: 34, rot: 0 };
  };

  // La carte arrive sur la défausse : elle passe au-dessus, effet si elle est spéciale.
  function land(card, color, order = ++pileOrder.current) {
    if (pendingTop.current === card.id) pendingTop.current = null;
    if (order < shownOrder.current) return;
    shownOrder.current = order;
    const cur = shownRef.current.top;
    if (cur?.id === card.id) return;
    const wild = card.kind === 'wild' || card.kind === 'wild4';
    setShown({ top: card, under: cur, color: wild ? color || v.activeColor : card.color });
    sfx.cardLand();
    LAND_SOUND[card.kind]?.();
    if (isSpecial(card) && !reducedMotion()) {
      const c = wild ? COLOR[color] || COLOR[v.activeColor] : COLOR[card.color];
      setBurst({ id: card.id, card, color: c });
      after(BURST_MS, () => setBurst(b => (b?.id === card.id ? null : b)));
    }
  }

  // Ma carte part tout de suite vers la défausse ; elle revient si le serveur refuse.
  async function playCard(card, color) {
    const el = handEls.current.get(card.id);
    const from = rectIn(el, rootRef.current) || lastRects.current.get(card.id);
    const to = pileTarget(card);
    let key = null;
    if (from && to && !reducedMotion()) {
      from.rot = Number(el?.dataset.rot) || 0;
      from.w = cardW;
      pendingTop.current = card.id;
      setLeaving(s => new Set(s).add(card.id));
      const order = ++pileOrder.current;
      sfx.cardFlick();
      key = fly({ card, from, to, duration: 380 }, () => land(card, color, order));
    }
    setSentAt(snapshot.version);
    const ok = await sendAction({ type: 'play', cardId: card.id, ...(color ? { color } : {}), declareLastCard: declare && myCount === 2 });
    if (ok) { setDeclare(false); return; }
    setSentAt(null);
    // Refusé : la carte reprend sa place, la défausse revient à l'état officiel.
    if (key) dropFlight(key);
    if (pendingTop.current === card.id) pendingTop.current = null;
    setLeaving(s => { const n = new Set(s); n.delete(card.id); return n; });
    if (shownRef.current.top?.id === card.id) setShown({ top: v.top, under: null, color: v.activeColor });
    shownOrder.current = ++pileOrder.current;
  }

  async function play(card) {
    if (!myTurn || busy || !playable.has(card.id)) return;
    if (card.kind === 'wild' || card.kind === 'wild4') { setWildCard(card); return; }
    await playCard(card);
  }
  async function playWild(color) {
    const c = wildCard;
    setWildCard(null);
    await playCard(c, color);
  }

  // Nouvelle carte sur la défausse dans l'état officiel : la faire voler depuis
  // son joueur (si ce n'est pas déjà mon vol en cours).
  useEffect(() => {
    if (v.top.id === shown.top?.id || pendingTop.current === v.top.id) return;
    const lp = v.lastPlay;
    const byPlay = lp && lp.card?.id === v.top.id;
    let from = null;
    if (byPlay) from = lp.userId === me ? lastRects.current.get(v.top.id) : oppSource(lp.userId);
    const to = pileTarget(v.top);
    if (!byPlay || !from || !to || reducedMotion()) { land(v.top, lp?.chosenColor); return; }
    pendingTop.current = v.top.id;
    const card = v.top; const color = lp.chosenColor;
    const order = ++pileOrder.current;
    fly({ card, from: { ...from, rot: 0 }, to, flip: lp.userId !== me, duration: 460 }, () => land(card, color, order));
  }, [v.top.id, shown.top?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mes cartes quittent la liste « en vol » quand le serveur les a retirées de ma main.
  const handIds = v.hand.map(c => c.id).join(',');
  useEffect(() => {
    setLeaving(s => {
      if (!s.size) return s;
      const ids = new Set(v.hand.map(c => c.id));
      const n = new Set([...s].filter(id => ids.has(id)));
      return n.size === s.size ? s : n;
    });
  }, [handIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cartes piochées : elles volent de la pioche vers ma main (en se retournant)
  // ou vers l'éventail de l'adversaire.
  const known = useRef(new Set(v.hand.map(c => c.id)));
  const prevCounts = useRef(v.counts);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const from = rectIn(pileRef.current, root);
    const ids = v.hand.map(c => c.id);
    const added = v.hand.filter(c => !known.current.has(c.id));
    known.current = new Set(ids);
    // Une carte vole encore vers la défausse (le +2 ou le +4 qui fait piocher) :
    // les cartes piochées partent quand elle est posée, pas avant.
    const wait = v.top.id !== shownRef.current.top?.id || pendingTop.current ? CAUSE_MS : 0;
    // Bruit de carte piochée, une fois par carte (moi ou un adversaire).
    const drawn = added.length + others.reduce((n, u) => n + Math.max(0, Math.min(8, v.counts[u] - (prevCounts.current?.[u] ?? v.counts[u]))), 0);
    for (let i = 0; i < drawn; i++) after(wait + i * STAGGER, () => sfx.cardDraw());
    if (added.length && from && !reducedMotion()) {
      setIncoming(s => new Set([...s, ...added.map(c => c.id)]));
      added.forEach((c, i) => {
        const el = handEls.current.get(c.id);
        const to = rectIn(el, root);
        const done = () => setIncoming(s => { const n = new Set(s); n.delete(c.id); return n; });
        if (!to) { done(); return; }
        // Arrivée exactement dans l'angle de sa place dans l'éventail.
        fly({ card: c, flip: true, from: { ...from, w: 64, rot: 0 }, to: { ...to, w: cardW, rot: Number(el.dataset.rot) || 0 }, delay: wait + i * STAGGER, duration: 480 }, done);
      });
    }
    for (const u of others) {
      const before = prevCounts.current?.[u] ?? v.counts[u];
      const gained = v.counts[u] - before;
      if (gained > 0 && gained <= 8 && from && !reducedMotion()) {
        const to = oppSource(u);
        if (to) for (let i = 0; i < gained; i++) fly({ card: null, from: { ...from, w: 64, rot: 0 }, to: { ...to, rot: 0 }, delay: wait + i * STAGGER, duration: 420 });
      }
    }
    prevCounts.current = v.counts;
  }, [handIds, others.map(u => v.counts[u]).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Place de chaque carte de ma main après chaque rendu (source des vols).
  useLayoutEffect(() => {
    const root = rootRef.current;
    for (const [id, el] of handEls.current) {
      const r = rectIn(el, root);
      if (r) lastRects.current.set(id, r);
    }
  });

  // Changement de sens : les flèches font un tour rapide.
  const firstDir = useRef(true);
  useEffect(() => {
    if (firstDir.current) { firstDir.current = false; return undefined; }
    setSpin(true);
    const t = setTimeout(() => setSpin(false), 700);
    return () => clearTimeout(t);
  }, [v.direction]);

  // Journal des actions et annonces.
  useGameEvents(matchId, (e) => {
    const p = e.payload;
    const mine = (u) => u === me;
    const who = (u) => (mine(u) ? 'Tu' : name(u));
    const obj = (u) => (mine(u) ? 'toi' : name(u));
    const show = (t) => { setBanner(t); after(2200, () => setBanner(b => (b === t ? null : b))); };
    let line = null;
    if (e.type === 'card_played') line = <>{who(p.userId)} {mine(p.userId) ? 'joues' : 'joue'} <CardWord card={p.card} color={p.chosenColor} />{p.chosenColor && <> · couleur <ColorWord color={p.chosenColor} /></>}</>;
    if (e.type === 'cards_drawn' && p.count) line = <>{who(p.userId)} {mine(p.userId) ? 'pioches' : 'pioche'} {p.count} carte{p.count > 1 ? 's' : ''}{p.reason === 'draw2' ? ' (+2)' : p.reason === 'wild4' ? ' (+4)' : ''}</>;
    if (e.type === 'skipped') line = <>{mine(p.userId) ? 'Tu passes ton tour' : `${name(p.userId)} passe son tour`}</>;
    if (e.type === 'reversed') line = <>Changement de sens !</>;
    if (e.type === 'reshuffle') { line = <>La défausse est mélangée dans la pioche</>; sfx.shuffle(); }
    if (e.type === 'turn_timeout') line = <>Temps écoulé pour {obj(p.userId)}</>;
    if (e.type === 'last_card') sfx.lastCard();
    if (e.type === 'last_card') line = <>{mine(p.userId) ? 'Tu annonces' : `${name(p.userId)} annonce`} : <b>Dernière carte !</b></>;
    if (e.type === 'challenge_result') {
      const t = p.success ? `Contestation réussie : ${mine(p.by) ? 'tu pioches' : `${name(p.by)} pioche`} 4`
        : `+4 régulier : ${mine(p.victim) ? 'tu pioches' : `${name(p.victim)} pioche`} 6`;
      show(t); line = <>{t}</>;
    }
    if (e.type === 'last_card_caught') {
      const t = mine(p.by) ? `Tu signales ${name(p.userId)} : +2 cartes pour lui` : mine(p.userId) ? `${name(p.by)} te signale : +2 cartes` : `${name(p.by)} signale ${name(p.userId)} : +2 cartes`;
      show(t); line = <>{t}</>;
    }
    if (line) setLog(l => [...l.slice(-2), { key: ++seq.current, line }]);
  });

  // Petit signal quand la main revient ; fanfare si je gagne.
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) sfx.turn();
    wasMine.current = myTurn;
  }, [myTurn]);
  useEffect(() => {
    if (v.status !== 'playing' && v.winner === me) sfx.fanfare();
  }, [v.status, v.winner]); // eslint-disable-line react-hooks/exhaustive-deps

  const canDraw = myTurn && v.phase === 'play' && !playable.size;
  const canDeclareNow = v.vulnerable === me;
  const canPreDeclare = myTurn && myCount === 2 && v.phase !== 'challenge' && !v.declared[me];
  const order = { red: 0, yellow: 1, green: 2, blue: 3 };
  const sortedHand = [...v.hand].filter(c => !leaving.has(c.id))
    .sort((a, b) => (order[a.color] ?? 9) - (order[b.color] ?? 9) || (a.value ?? 20) - (b.value ?? 20) || a.kind.localeCompare(b.kind));

  // Éventail de la main : arc léger, cartes qui se chevauchent juste ce qu'il faut.
  const cardW = handW < 420 ? 76 : 88;
  const n = sortedHand.length;
  const mid = (n - 1) / 2;
  const spread = n > 1 ? Math.min(4.5, 30 / (n - 1)) : 0;     // degrés entre deux cartes
  // Les cartes des bords, inclinées, débordent de leur place : on en tient compte.
  const overhang = cardW * 1.5 * Math.sin((mid * spread * Math.PI) / 180);
  const step = n > 1 ? Math.max(8, Math.min(cardW * 0.66, (handW - cardW - 2 * overhang - 14) / (n - 1))) : 0;
  const drop = (i) => (mid ? ((i - mid) / mid) ** 2 * 12 : 0); // les bords descendent un peu
  const LIFT = 20;
  const handReady = myTurn && !busy;

  // Ce qui vient de se passer (journal), puis ce qu'on attend.
  const lp = v.lastPlay;
  const fallback = lp ? (
    <>{lp.userId === me ? 'Tu as joué' : `${name(lp.userId)} a joué`} <CardWord card={lp.card} color={lp.chosenColor} />
      {lp.chosenColor && <> · couleur <ColorWord color={lp.chosenColor} /></>}</>
  ) : <>Première carte : <b>{cardName(v.top)}</b></>;
  let turnLine;
  if (!playing) turnLine = v.winner === me ? 'Tu as posé ta dernière carte !' : `${name(v.winner)} a gagné la manche`;
  else if (myTurn) {
    turnLine = v.phase === 'challenge' ? `${name(v.challenge?.by)} t'a mis un +4 !`
      : v.phase === 'drawn' ? 'Joue la carte piochée ou passe'
        : playable.size ? 'À toi : choisis une carte' : 'Aucune carte jouable : pioche';
  } else turnLine = v.phase === 'challenge' ? `${name(v.turn)} décide s'il conteste le +4…` : `Au tour de ${name(v.turn)}…`;

  const top = shown.top || v.top;
  const wildTop = top.kind === 'wild' || top.kind === 'wild4';
  // Couleur en jeu affichée : celle de la carte posée. Tant qu'une nouvelle carte est
  // en vol, l'anneau garde la couleur de la carte visible.
  const shownColor = top.id === v.top.id ? v.activeColor : shown.color || v.activeColor;
  const activeColor = COLOR[shownColor];

  return (
    <div className="cards-game" ref={rootRef}>
      <div className={`cards-opps n${others.length}`}>
        {others.map(u => (
          <Opponent key={u} player={byId[u]} name={name(u)} count={v.counts[u]} solo={others.length === 1}
            active={playing && v.turn === u} deadline={v.turnDeadline} total={v.turnMs}
            declared={v.declared[u]} vulnerable={v.vulnerable === u} out={v.forfeited.includes(u)}
            onCall={() => sendAction({ type: 'call_last_card' })}
            fanRef={(el) => { if (el) oppEls.current.set(u, el); else oppEls.current.delete(u); }} />
        ))}
      </div>

      <div className="cards-table">
        <button ref={pileRef} className={`draw-pile${canDraw ? ' callout' : ''}`} onClick={() => canDraw && sendAction({ type: 'draw' })}
          disabled={!canDraw} aria-label={`Piocher (${v.drawPileCount} cartes)`}>
          <span className="pile-card p3"><CardBack width={64} /></span>
          <span className="pile-card p2"><CardBack width={64} /></span>
          <span className="pile-card"><CardBack width={64} /></span>
          <span className="pile-count">{v.drawPileCount}</span>
        </button>
        <div className="discard" style={{ '--active': activeColor }} aria-label={`Carte du dessus : ${cardName(v.top)}, couleur active ${COLOR_NAME[v.activeColor]}`}>
          <div className="discard-slot" ref={slotRef} style={{ width: PILE_W, height: PILE_W * 1.5 }}>
            <DirectionRing color={activeColor} ccw={v.direction !== 1} spin={spin} />
            {burst && <Burst key={`glow-${burst.id}`} layer="glow" card={burst.card} color={burst.color} />}
            {shown.under && (
              <div className="discard-card under" data-card={shown.under.id} style={{ transform: `rotate(${tilt(shown.under.id)}deg)` }}><CardFace card={shown.under} width={PILE_W} /></div>
            )}
            <div key={top.id} className="discard-card" data-card={top.id} style={{ transform: `rotate(${tilt(top.id)}deg)` }}><CardFace card={top} width={PILE_W} /></div>
            {burst && <Burst key={`burst-${burst.id}`} layer="front" card={burst.card} color={burst.color} />}
          </div>
          {wildTop && <span className="active-color">{COLOR_NAME[shownColor]}</span>}
        </div>
        {banner && <div className="table-banner"><span>{banner}</span></div>}
      </div>

      <div className="cards-status" aria-live="polite">
        <div className="cards-log">
          {log.length ? log.map((l, i) => (
            <span key={l.key} className={`log-line age${log.length - 1 - i}`}>{l.line}</span>
          )) : <span className="log-line age0">{fallback}</span>}
        </div>
        <span className="turn">{turnLine}{myTurn && <Seconds deadline={v.turnDeadline} />}</span>
      </div>

      {(myTurn && v.phase === 'drawn') || canDraw || canDeclareNow || canPreDeclare ? (
        <div className="cards-actions">
          {canDraw && <button className="btn md" onClick={() => sendAction({ type: 'draw' })}>Piocher une carte</button>}
          {myTurn && v.phase === 'drawn' && <button className="btn md outline-light" onClick={() => sendAction({ type: 'pass' })}>Passer</button>}
          {canDeclareNow && <button className="last-card-btn" onClick={() => sendAction({ type: 'last_card' })}>Dernière carte !</button>}
          {!canDeclareNow && canPreDeclare && (
            <button className={`last-card-btn${declare ? ' on' : ''}`} onClick={() => setDeclare(d => !d)} aria-pressed={declare}>
              {declare ? 'Annonce prête ✓' : 'Annoncer « Dernière carte »'}
            </button>
          )}
        </div>
      ) : null}

      <div className="cards-hand" ref={handRef} aria-label="Ma main">
        <div className="hand-row" style={{ width: cardW + step * Math.max(0, n - 1), height: cardW * 1.5 + 16 }}>
          {sortedHand.map((c, i) => {
            const ok = handReady && playable.has(c.id);
            return (
              <button key={c.id} type="button" data-card={c.id} data-rot={(i - mid) * spread} ref={(el) => { if (el) handEls.current.set(c.id, el); else handEls.current.delete(c.id); }}
                className={`hand-card${ok ? ' playable' : ''}${incoming.has(c.id) ? ' incoming' : ''}`}
                style={{ transform: `translate(${i * step}px, ${drop(i) - (ok ? LIFT : 0)}px) rotate(${(i - mid) * spread}deg)`, zIndex: i }}
                onClick={() => play(c)} disabled={!handReady}
                aria-label={`${cardName(c)}${ok ? ' (jouable)' : ''}`}>
                <CardFace card={c} width={cardW} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="cards-me">
        <TurnAvatar player={byId[me]} color={TURN_RING} active={myTurn} deadline={v.turnDeadline} total={v.turnMs} size={38} />
        <span><b>{name(me)}</b> · {myCount} carte{myCount > 1 ? 's' : ''} en main</span>
      </div>

      <div className="cards-fx" aria-hidden>
        {flights.map(f => <Flight key={f.key} f={f} onDone={landed} />)}
      </div>

      <Sheet open={!!wildCard} onClose={() => setWildCard(null)} label="Choisir une couleur">
        <h2 className="h3" style={{ marginBottom: 14 }}>Choisis la couleur</h2>
        <div className="color-pick">
          {Object.entries(COLOR).map(([k, c]) => (
            <button key={k} type="button" style={{ background: c }} onClick={() => playWild(k)}>{COLOR_NAME[k]}</button>
          ))}
        </div>
      </Sheet>

      <Sheet open={myTurn && v.phase === 'challenge'} center onClose={() => {}} label="+4">
        <div className="stack center">
          <div style={{ display: 'flex', justifyContent: 'center' }}><CardFace card={v.top} width={84} /></div>
          <h2 className="h3">{name(v.challenge?.by)} t'a mis un +4</h2>
          <p className="small">Un +4 n'est autorisé que si son auteur n'avait aucune carte de la couleur active. Tu penses qu'il bluffe ?</p>
          <p className="tiny muted">Contestation gagnée : il pioche 4 et tu joues. Perdue : tu pioches 6.</p>
          <button className="btn block" onClick={() => sendAction({ type: 'accept' })}>Accepter (+4)</button>
          <button className="btn block blue" onClick={() => sendAction({ type: 'challenge' })}>Contester</button>
        </div>
      </Sheet>
    </div>
  );
}
