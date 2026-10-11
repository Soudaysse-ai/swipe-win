// Yas Cards — interface, organisée comme une table de jeu : adversaires en haut
// (dos des cartes en éventail), pioche et défausse au centre, ta main en bas.
// Les mains adverses ne sont jamais envoyées au navigateur (seul leur nombre l'est)
// et toutes les règles sont appliquées par le serveur.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/ui';
import { useGameEvents } from '../../player/pages/Match';
import { TurnAvatar, Seconds } from '../common/Turn';
import { CardFace, CardBack, COLOR, COLOR_NAME, cardName } from './CardFace';

const TURN_RING = '#FFD100';

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

function Opponent({ player, name, count, active, deadline, total, declared, vulnerable, onCall, out, solo }) {
  const fan = Math.min(count, solo ? 9 : 5);
  return (
    <div className={`cards-opp${active ? ' active' : ''}${out ? ' out' : ''}${solo ? ' solo' : ''}`}>
      <div className="opp-fan" aria-hidden>
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

export default function CardsGame({ snapshot, me, sendAction, matchId }) {
  const v = snapshot.view;
  const [wildCard, setWildCard] = useState(null);
  const [banner, setBanner] = useState(null);
  const [declare, setDeclare] = useState(false);
  const [handRef, handW] = useWidth();
  const known = useRef(new Set(v.hand.map(c => c.id)));
  const [fresh, setFresh] = useState(new Set());
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  const name = (u) => (u === me ? 'Toi' : byId[u]?.username);
  const playing = v.status === 'playing';
  const myTurn = playing && v.turn === me;
  const playable = new Set(v.playable);
  const others = v.players.filter(u => u !== me);
  const myCount = v.hand.length;

  useGameEvents(matchId, (e) => {
    const p = e.payload;
    const show = (t) => { setBanner(t); setTimeout(() => setBanner(null), 2200); };
    const mine = (u) => u === me;
    const obj = (u) => (mine(u) ? 'toi' : name(u)); // en complément : « +2 pour toi »
    if (e.type === 'skipped') show(mine(p.userId) ? 'Tu passes ton tour' : `${name(p.userId)} passe son tour`);
    if (e.type === 'reversed') show('Changement de sens !');
    if (e.type === 'challenge_result') {
      show(p.success ? `Contestation réussie : ${mine(p.by) ? 'tu pioches' : `${name(p.by)} pioche`} 4`
        : `+4 régulier : ${mine(p.victim) ? 'tu pioches' : `${name(p.victim)} pioche`} 6`);
    }
    if (e.type === 'last_card') show(mine(p.userId) ? 'Tu annonces : Dernière carte !' : `${name(p.userId)} : Dernière carte !`);
    if (e.type === 'last_card_caught') {
      show(mine(p.by) ? `Tu signales ${name(p.userId)} : +2 cartes pour lui` : mine(p.userId) ? `${name(p.by)} te signale : +2 cartes` : `${name(p.by)} signale ${name(p.userId)} : +2 cartes`);
    }
    if (e.type === 'cards_drawn' && p.reason === 'draw2') show(`+2 pour ${obj(p.userId)}`);
    if (e.type === 'cards_drawn' && p.reason === 'wild4') show(`+4 pour ${obj(p.userId)}`);
    if (e.type === 'turn_timeout') show(`Temps écoulé pour ${obj(p.userId)}`);
  });

  // Cartes qui viennent d'arriver dans ma main : petite animation de distribution.
  useEffect(() => {
    const ids = v.hand.map(c => c.id);
    const added = ids.filter(id => !known.current.has(id));
    known.current = new Set(ids);
    if (!added.length) return undefined;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 700);
    return () => clearTimeout(t);
  }, [v.hand.map(c => c.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  async function play(card) {
    if (!myTurn || !playable.has(card.id)) return;
    if (card.kind === 'wild' || card.kind === 'wild4') { setWildCard(card); return; }
    const ok = await sendAction({ type: 'play', cardId: card.id, declareLastCard: declare && myCount === 2 });
    if (ok) setDeclare(false);
  }
  async function playWild(color) {
    const c = wildCard;
    setWildCard(null);
    const ok = await sendAction({ type: 'play', cardId: c.id, color, declareLastCard: declare && myCount === 2 });
    if (ok) setDeclare(false);
  }

  const canDraw = myTurn && v.phase === 'play' && !playable.size;
  const canDeclareNow = v.vulnerable === me;
  const canPreDeclare = myTurn && myCount === 2 && v.phase !== 'challenge' && !v.declared[me];
  const order = { red: 0, yellow: 1, green: 2, blue: 3 };
  const sortedHand = [...v.hand].sort((a, b) => (order[a.color] ?? 9) - (order[b.color] ?? 9) || (a.value ?? 20) - (b.value ?? 20) || a.kind.localeCompare(b.kind));

  // Éventail de la main : les cartes se chevauchent juste ce qu'il faut pour tenir.
  const cardW = handW < 420 ? 66 : 80;
  const n = sortedHand.length;
  const step = n > 1 ? Math.min(cardW * 0.72, (handW - cardW - 8) / (n - 1)) : 0;

  // Ce qui vient de se passer, puis ce qu'on attend.
  const lp = v.lastPlay;
  const lastLine = lp ? (
    <>{lp.userId === me ? 'Tu as joué' : `${name(lp.userId)} a joué`} <b>{cardName(lp.card)}</b>
      {lp.chosenColor && <> · couleur <ColorWord color={lp.chosenColor} /></>}</>
  ) : <>Première carte : <b>{cardName(v.top)}</b></>;
  let turnLine;
  if (!playing) turnLine = v.winner === me ? 'Tu as posé ta dernière carte !' : `${name(v.winner)} a gagné la manche`;
  else if (myTurn) {
    turnLine = v.phase === 'challenge' ? `${name(v.challenge?.by)} t'a mis un +4 !`
      : v.phase === 'drawn' ? 'Joue la carte piochée ou passe'
        : playable.size ? 'À toi : choisis une carte' : 'Aucune carte jouable : pioche';
  } else turnLine = v.phase === 'challenge' ? `${name(v.turn)} décide s'il conteste le +4…` : `Au tour de ${name(v.turn)}…`;

  return (
    <div className="cards-game">
      <div className={`cards-opps n${others.length}`}>
        {others.map(u => (
          <Opponent key={u} player={byId[u]} name={name(u)} count={v.counts[u]} solo={others.length === 1}
            active={playing && v.turn === u} deadline={v.turnDeadline} total={v.turnMs}
            declared={v.declared[u]} vulnerable={v.vulnerable === u} out={v.forfeited.includes(u)}
            onCall={() => sendAction({ type: 'call_last_card' })} />
        ))}
      </div>

      <div className="cards-table">
        <svg className={`dir-arrows${v.direction === 1 ? '' : ' ccw'}`} viewBox="0 0 200 200" aria-label={v.direction === 1 ? 'Sens horaire' : 'Sens antihoraire'}>
          <path d="M44 70 A64 64 0 0 1 120 38" />
          <path d="M120 38 l-4 -11 M120 38 l-12 3" />
          <path d="M156 130 A64 64 0 0 1 80 162" />
          <path d="M80 162 l4 11 M80 162 l12 -3" />
        </svg>
        <button className={`draw-pile${canDraw ? ' callout' : ''}`} onClick={() => canDraw && sendAction({ type: 'draw' })}
          disabled={!canDraw} aria-label={`Piocher (${v.drawPileCount} cartes)`}>
          <span className="pile-card p3"><CardBack width={64} /></span>
          <span className="pile-card p2"><CardBack width={64} /></span>
          <span className="pile-card"><CardBack width={64} /></span>
          <span className="pile-count">{v.drawPileCount}</span>
        </button>
        <div className="discard" style={{ '--active': COLOR[v.activeColor] }} aria-label={`Carte du dessus : ${cardName(v.top)}, couleur active ${COLOR_NAME[v.activeColor]}`}>
          <div key={v.top.id} className={`discard-card ${lp?.userId === me ? 'from-me' : 'from-them'}`}><CardFace card={v.top} width={96} /></div>
          {(v.top.kind === 'wild' || v.top.kind === 'wild4') && <span className="active-color">{COLOR_NAME[v.activeColor]}</span>}
        </div>
        {banner && <div className="table-banner"><span>{banner}</span></div>}
      </div>

      <div className="cards-status" aria-live="polite">
        <span className="last">{lastLine}</span>
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
        <div className="hand-row" style={{ width: cardW + step * Math.max(0, n - 1), height: cardW * 1.5 + 4 }}>
          {sortedHand.map((c, i) => {
            const ok = myTurn && playable.has(c.id);
            return (
              <button key={c.id} type="button" className={`hand-card${ok ? ' playable' : ''}${myTurn && !ok ? ' dim' : ''}${fresh.has(c.id) ? ' fresh' : ''}`}
                style={{ left: i * step, zIndex: i }} onClick={() => play(c)} disabled={!myTurn}
                aria-label={`${cardName(c)}${ok ? ' (jouable)' : ''}`}>
                <CardFace card={c} width={cardW} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="cards-me">
        <TurnAvatar player={byId[me]} color={TURN_RING} active={myTurn} deadline={v.turnDeadline} total={v.turnMs} size={38} />
        <span><b>Toi</b> · {myCount} carte{myCount > 1 ? 's' : ''} en main</span>
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
