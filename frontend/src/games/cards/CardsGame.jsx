// Yas Cards — interface. Les mains adverses ne sont jamais envoyées au navigateur :
// seul le nombre de cartes l'est. Toutes les règles sont appliquées par le serveur.
import { useState } from 'react';
import Avatar from '../../components/Avatar';
import { Sheet, TimerBar } from '../../components/ui';
import { useGameEvents } from '../../player/pages/Match';

const COLOR = { yellow: '#FFC400', red: '#E5484D', blue: '#2F6FD6', green: '#2FA35A' };
const COLOR_NAME = { yellow: 'Jaune', red: 'Rouge', blue: 'Bleu', green: 'Vert' };
const LABEL = { skip: '⦸', reverse: '⟲', draw2: '+2', wild: '★', wild4: '+4' };
const KIND_NAME = { skip: 'Passe', reverse: 'Inverse', draw2: '+2', wild: 'Joker', wild4: 'Joker +4' };

export function cardName(c) {
  if (!c) return '';
  if (c.kind === 'number') return `${c.value} ${COLOR_NAME[c.color]}`;
  if (c.kind === 'wild' || c.kind === 'wild4') return KIND_NAME[c.kind];
  return `${KIND_NAME[c.kind]} ${COLOR_NAME[c.color]}`;
}

// Carte au design original Défi Yas : fond de couleur, médiator blanc, symbole en italique.
export function Card({ card, size = 64, highlight = false, dim = false, onClick, label, back = false }) {
  const w = size;
  const h = size * 1.45;
  if (back) {
    return (
      <svg width={w} height={h} viewBox="0 0 64 93" aria-hidden style={{ flexShrink: 0 }}>
        <rect x="1" y="1" width="62" height="91" rx="9" fill="#00377D" stroke="#fff" strokeWidth="2" />
        <path d="M22 66c13-4 26-10 37-18 8-5 7-13 2-18-6-5-20-13-31-16-8-3-16 2-18 10-2 5-3 10-4 15-1 5-1 9-1 14 0 8 6 13 15 13z" fill="#FFD100" transform="translate(-4 6) scale(.9)" />
        <text x="32" y="56" textAnchor="middle" fontSize="13" fontWeight="800" fontStyle="italic" fill="#00377D">Yas</text>
      </svg>
    );
  }
  const wild = card.kind === 'wild' || card.kind === 'wild4';
  const fill = wild ? '#0E0E10' : COLOR[card.color];
  const text = card.kind === 'number' ? String(card.value) : LABEL[card.kind];
  const svg = (
    <svg width={w} height={h} viewBox="0 0 64 93" style={{ display: 'block' }} aria-hidden>
      <rect x="1" y="1" width="62" height="91" rx="9" fill={fill} stroke="#fff" strokeWidth="2.5" />
      {wild ? (
        <g transform="translate(32 47)">
          <path d="M0 0 L0 -26 A26 26 0 0 1 26 0 Z" fill={COLOR.red} />
          <path d="M0 0 L26 0 A26 26 0 0 1 0 26 Z" fill={COLOR.blue} />
          <path d="M0 0 L0 26 A26 26 0 0 1 -26 0 Z" fill={COLOR.green} />
          <path d="M0 0 L-26 0 A26 26 0 0 1 0 -26 Z" fill={COLOR.yellow} />
        </g>
      ) : (
        <path d="M24 72c14-4 28-11 40-20 8-6 8-15 2-20-7-6-23-15-35-18-10-3-19 3-21 12-2 6-3 12-4 18-1 5-1 10-1 15 0 10 7 16 19 13z" fill="#fff" transform="translate(-6 4) scale(.92)" />
      )}
      <text x="32" y={wild ? 53 : 56} textAnchor="middle" fontSize={text.length > 1 ? 20 : 26} fontWeight="800" fontStyle="italic"
        fill={wild ? '#fff' : fill} stroke={wild ? '#0E0E10' : 'none'} strokeWidth={wild ? 1 : 0}>{text}</text>
      <text x="8" y="16" fontSize="11" fontWeight="800" fontStyle="italic" fill="#fff">{text}</text>
    </svg>
  );
  if (!onClick) return <span style={{ display: 'inline-block', flexShrink: 0, opacity: dim ? 0.5 : 1 }} aria-label={label || cardName(card)}>{svg}</span>;
  return (
    <button onClick={onClick} aria-label={label || cardName(card)} style={{
      flexShrink: 0, padding: 0, borderRadius: 10, transition: 'transform .15s',
      transform: highlight ? 'translateY(-12px)' : 'none', opacity: dim ? 0.55 : 1,
      boxShadow: highlight ? '0 8px 16px rgba(0,55,125,.35)' : '0 2px 6px rgba(0,0,0,.2)',
    }}>{svg}</button>
  );
}

export default function CardsGame({ snapshot, me, sendAction, matchId }) {
  const v = snapshot.view;
  const [wildCard, setWildCard] = useState(null);
  const [banner, setBanner] = useState(null);
  const [declare, setDeclare] = useState(false);
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  const name = (u) => (u === me ? 'Toi' : byId[u]?.username);
  const myTurn = v.status === 'playing' && v.turn === me;
  const playable = new Set(v.playable);
  const others = v.players.filter(u => u !== me);
  const myCount = v.hand.length;

  useGameEvents(matchId, (e) => {
    const p = e.payload;
    const flash = (t) => { setBanner(t); setTimeout(() => setBanner(null), 2000); };
    if (e.type === 'skipped') flash(`⦸ ${name(p.userId)} passe son tour`);
    if (e.type === 'reversed') flash('⟲ Changement de sens !');
    if (e.type === 'challenge_result') flash(p.success ? `✅ Contestation réussie : ${name(p.by)} pioche 4` : `❌ +4 légal : ${name(p.victim)} pioche 6`);
    if (e.type === 'last_card') flash(`📣 ${name(p.userId)} : Dernière carte !`);
    if (e.type === 'last_card_caught') flash(`🚨 ${name(p.by)} signale ${name(p.userId)} : +2 cartes`);
    if (e.type === 'cards_drawn' && p.reason === 'draw2') flash(`+2 pour ${name(p.userId)}`);
    if (e.type === 'cards_drawn' && p.reason === 'wild4') flash(`+4 pour ${name(p.userId)}`);
    if (e.type === 'turn_timeout') flash(`⏱️ Temps écoulé pour ${name(p.userId)}`);
  });

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

  const canDeclareNow = v.vulnerable === me;
  const canPreDeclare = myTurn && myCount === 2 && v.phase !== 'challenge' && !v.declared[me];
  const sortedHand = [...v.hand].sort((a, b) => (a.color || 'z').localeCompare(b.color || 'z') || (a.value ?? 99) - (b.value ?? 99));

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6, justifyContent: 'space-around' }}>
        {others.map(u => (
          <div key={u} className="card tight stack" style={{ alignItems: 'center', gap: 4, padding: '8px 6px', flex: 1, minWidth: 0,
            boxShadow: v.turn === u ? '0 0 0 3px var(--yas-blue)' : undefined, opacity: v.forfeited.includes(u) ? 0.4 : 1 }}>
            <Avatar id={byId[u]?.avatar} size={34} online={byId[u]?.connected} />
            <span className="tiny bold" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(u)}</span>
            <span className="row tiny" style={{ gap: 3 }}><Card back size={12} /> <b>{v.counts[u]}</b></span>
            {v.declared[u] && v.counts[u] === 1 && <span className="chip yellow" style={{ height: 22 }}>Dernière !</span>}
            {v.vulnerable === u && <button className="btn sm danger" style={{ height: 30, padding: '0 10px' }} onClick={() => sendAction({ type: 'call_last_card' })}>Signaler !</button>}
          </div>
        ))}
      </div>

      {v.status === 'playing' && <TimerBar deadline={v.turnDeadline} total={v.turnMs} />}

      <div className="card" style={{ position: 'relative', background: 'var(--yas-blue)', padding: '18px 12px' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 22 }}>
          <button onClick={() => myTurn && v.phase === 'play' && !playable.size && sendAction({ type: 'draw' })}
            disabled={!(myTurn && v.phase === 'play' && !playable.size)} aria-label={`Piocher (${v.drawPileCount} cartes)`}
            style={{ position: 'relative', borderRadius: 10, boxShadow: myTurn && v.phase === 'play' && !playable.size ? '0 0 0 4px #FFD100' : 'none' }}>
            <Card back size={62} />
            <span className="chip yellow" style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', height: 22 }}>{v.drawPileCount}</span>
          </button>
          <div style={{ position: 'relative' }}>
            <div key={v.top.id} style={{ animation: 'card-in .3s ease-out' }}><Card card={v.top} size={74} /></div>
            <span style={{ position: 'absolute', right: -14, top: -10, width: 28, height: 28, borderRadius: 14, background: COLOR[v.activeColor], border: '3px solid #fff' }}
              aria-label={`Couleur active : ${COLOR_NAME[v.activeColor]}`} />
          </div>
          <div className="stack center" style={{ color: '#fff', gap: 2 }}>
            <span style={{ fontSize: 28, display: 'inline-block', transform: v.direction === 1 ? 'none' : 'scaleX(-1)' }} aria-label={v.direction === 1 ? 'Sens horaire' : 'Sens antihoraire'}>↻</span>
            <span className="tiny">{COLOR_NAME[v.activeColor]}</span>
          </div>
        </div>
        {banner && <div className="center" style={{ marginTop: 12 }}><span className="chip yellow" style={{ height: 32, fontSize: 14 }}>{banner}</span></div>}
        <style>{'@keyframes card-in { from { transform: translateY(-30px) rotate(-12deg); opacity: 0 } to { transform: none; opacity: 1 } }'}</style>
      </div>

      <div className="center bold" aria-live="polite">
        {v.status !== 'playing' ? (v.winner === me ? 'Tu as posé ta dernière carte !' : `${name(v.winner)} a gagné la manche`)
          : myTurn ? (v.phase === 'challenge' ? `${name(v.challenge?.by)} t'a mis un +4 !` : v.phase === 'drawn' ? 'Joue la carte piochée ou passe' : playable.size ? 'À toi : choisis une carte' : 'Aucune carte jouable : pioche')
            : v.phase === 'challenge' ? `${name(v.turn)} décide s'il conteste le +4…` : `Au tour de ${name(v.turn)}…`}
      </div>

      <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {myTurn && v.phase === 'drawn' && <button className="btn md outline" onClick={() => sendAction({ type: 'pass' })}>Passer</button>}
        {(canDeclareNow || canPreDeclare) && (
          canDeclareNow
            ? <button className="btn md" style={{ animation: 'yas-ripple 1s infinite' }} onClick={() => sendAction({ type: 'last_card' })}>📣 Dernière carte !</button>
            : <button className={`btn md${declare ? '' : ' outline'}`} onClick={() => setDeclare(d => !d)} aria-pressed={declare}>📣 {declare ? 'Annonce prête' : 'Annoncer « Dernière carte »'}</button>
        )}
      </div>

      <div style={{ overflowX: 'auto', padding: '16px 4px 8px' }} aria-label="Ma main">
        <div className="row" style={{ gap: 0, width: 'max-content', margin: '0 auto' }}>
          {sortedHand.map((c, i) => (
            <div key={c.id} style={{ marginLeft: i ? (sortedHand.length > 7 ? -22 : -10) : 0 }}>
              <Card card={c} size={sortedHand.length > 9 ? 52 : 60} highlight={playable.has(c.id)} dim={myTurn && !playable.has(c.id)}
                onClick={() => play(c)} label={`${cardName(c)}${playable.has(c.id) ? ' (jouable)' : ''}`} />
            </div>
          ))}
        </div>
      </div>
      <p className="tiny muted center">{myCount} carte(s) en main</p>

      <Sheet open={!!wildCard} onClose={() => setWildCard(null)} label="Choisir une couleur">
        <h2 className="h3" style={{ marginBottom: 12 }}>Choisis la couleur</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {Object.entries(COLOR).map(([k, c]) => (
            <button key={k} className="btn block" style={{ background: c, color: k === 'yellow' ? '#00377D' : '#fff' }} onClick={() => playWild(k)}>{COLOR_NAME[k]}</button>
          ))}
        </div>
      </Sheet>

      <Sheet open={myTurn && v.phase === 'challenge'} center onClose={() => {}} label="+4">
        <div className="stack center">
          <div style={{ display: 'flex', justifyContent: 'center' }}><Card card={v.top} size={70} /></div>
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
