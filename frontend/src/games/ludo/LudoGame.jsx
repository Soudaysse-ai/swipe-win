// Yas Ludo — interface. Dés, déplacements et captures sont calculés par le serveur.
import { useState } from 'react';
import Avatar from '../../components/Avatar';
import { TimerBar } from '../../components/ui';
import Dice from '../common/Dice';
import { useGameEvents } from '../../player/pages/Match';

const C = 20; // taille d'une case (viewBox 300 × 300)
const COLOR = { red: '#E5484D', green: '#2FA35A', yellow: '#FFC400', blue: '#2F6FD6' };
const LIGHT = { red: '#FBD3D4', green: '#CDEBD7', yellow: '#FFF0B3', blue: '#D3E1F7' };
const NAME = { red: 'Rouge', green: 'Vert', yellow: 'Jaune', blue: 'Bleu' };
const START = { red: 0, green: 13, yellow: 26, blue: 39 };

// Parcours principal (52 cases) en coordonnées [ligne, colonne], sens horaire depuis le départ rouge.
const TRACK = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];
const HOME_COL = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};
const BASE = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
const BASE_SPOTS = [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]];
const FINISH = { red: [7, 6.2], green: [6.2, 7], yellow: [7, 7.8], blue: [7.8, 7] };

function cellOf(color, p, i) {
  if (p === -1) { const [r0, c0] = BASE[color]; const [dr, dc] = BASE_SPOTS[i]; return [r0 + dr, c0 + dc]; }
  if (p === 56) return FINISH[color];
  if (p >= 51) return HOME_COL[color][p - 51].map(x => x + 0.5);
  const [r, c] = TRACK[(START[color] + p) % 52];
  return [r + 0.5, c + 0.5];
}

function Board({ v, me, onPick }) {
  const safe = new Set(v.safe);
  const myMovable = v.turn === me && v.phase === 'move' ? new Set(v.movable) : new Set();
  // regroupe les pions par case pour les décaler légèrement
  const pieces = [];
  const byCell = {};
  for (const u of v.players) {
    const color = v.colors[u];
    v.tokens[u].forEach((p, i) => {
      const [r, c] = cellOf(color, p, i);
      const key = p === -1 ? `b${u}${i}` : `${r},${c}`;
      byCell[key] = (byCell[key] || 0) + 1;
      pieces.push({ u, i, p, color, r, c, key, n: byCell[key] - 1 });
    });
  }
  return (
    <svg className="ludo-board" viewBox="0 0 300 300" width="100%" style={{ display: 'block', background: '#fff', borderRadius: 18, boxShadow: 'var(--yas-shadow-card)', touchAction: 'manipulation' }} role="img" aria-label="Plateau de Yas Ludo">
      {Object.entries(BASE).map(([color, [r, c]]) => (
        <g key={color}>
          <rect x={c * C} y={r * C} width={6 * C} height={6 * C} fill={COLOR[color]} rx="10" />
          <rect x={c * C + C} y={r * C + C} width={4 * C} height={4 * C} fill="#fff" rx="10" />
          {BASE_SPOTS.map(([dr, dc], i) => <circle key={i} cx={(c + dc) * C} cy={(r + dr) * C} r={C * 0.62} fill={LIGHT[color]} />)}
        </g>
      ))}
      {TRACK.map(([r, c], idx) => {
        const startColor = Object.keys(START).find(k => START[k] === idx);
        return (
          <g key={idx}>
            <rect x={c * C} y={r * C} width={C} height={C} fill={startColor ? COLOR[startColor] : '#fff'} stroke="#D9E1EB" strokeWidth="1" />
            {safe.has(idx) && !startColor && <text x={c * C + C / 2} y={r * C + C * 0.72} textAnchor="middle" fontSize="13" fill="#A6B9D2">★</text>}
          </g>
        );
      })}
      {Object.entries(HOME_COL).map(([color, cells]) => cells.map(([r, c], i) => (
        <rect key={`${color}${i}`} x={c * C} y={r * C} width={C} height={C} fill={LIGHT[color]} stroke="#D9E1EB" strokeWidth="1" />
      )))}
      <polygon points={`${6 * C},${6 * C} ${9 * C},${6 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.green} />
      <polygon points={`${9 * C},${6 * C} ${9 * C},${9 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.yellow} />
      <polygon points={`${9 * C},${9 * C} ${6 * C},${9 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.blue} />
      <polygon points={`${6 * C},${9 * C} ${6 * C},${6 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.red} />
      {pieces.map(pc => {
        const can = pc.u === me && myMovable.has(pc.i);
        const total = byCell[pc.key];
        const off = total > 1 ? (pc.n - (total - 1) / 2) * 5 : 0;
        const x = pc.c * C + off;
        const y = pc.r * C + off;
        return (
          <g key={`${pc.u}-${pc.i}`} style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform .35s ease', cursor: can ? 'pointer' : 'default' }}
            onClick={() => can && onPick(pc.i)} role={can ? 'button' : undefined} aria-label={can ? `Déplacer le pion ${pc.i + 1}` : undefined}>
            {can && <circle r={C * 0.62} fill="none" stroke="#00377D" strokeWidth="2.5" style={{ animation: 'ludo-pulse 1s ease-in-out infinite' }} />}
            <circle r={C * 0.42} fill={COLOR[pc.color]} stroke="#fff" strokeWidth="2.5" />
            <circle r={C * 0.42} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
            <text y="3.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">{pc.i + 1}</text>
            {can && <circle r={C * 0.9} fill="transparent" />}
          </g>
        );
      })}
      <style>{'@keyframes ludo-pulse { 50% { transform: scale(1.25); opacity: .4 } }'}</style>
    </svg>
  );
}

export default function LudoGame({ snapshot, me, sendAction, matchId }) {
  const v = snapshot.view;
  const [rolling, setRolling] = useState(false);
  const [lastDice, setLastDice] = useState(null);
  const [banner, setBanner] = useState(null);
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  const myTurn = v.status === 'playing' && v.turn === me;
  const name = (u) => (u === me ? 'Toi' : byId[u]?.username);

  useGameEvents(matchId, (e) => {
    if (e.type === 'dice_rolled') {
      setLastDice({ value: e.payload.value, userId: e.payload.userId });
      setRolling(true);
      setTimeout(() => setRolling(false), 600);
    }
    const flash = (t) => { setBanner(t); setTimeout(() => setBanner(null), 1800); };
    if (e.type === 'three_sixes') flash(`Trois 6 ! Le tour de ${name(e.payload.userId)} est annulé`);
    if (e.type === 'token_moved' && e.payload.captured?.length) flash(`💥 ${name(e.payload.userId)} capture un pion !`);
    if (e.type === 'player_finished') flash(`🏁 ${name(e.payload.userId)} termine ${e.payload.place === 1 ? '1er' : `${e.payload.place}e`} !`);
    if (e.type === 'no_move') flash('Aucun pion ne peut bouger');
    if (e.type === 'turn_timeout') flash(`⏱️ Temps écoulé : le serveur joue pour ${name(e.payload.userId)}`);
  });

  const shownDice = v.phase === 'move' ? v.dice : lastDice?.value;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {v.players.map(u => {
          const color = v.colors[u];
          const home = v.tokens[u].filter(p => p === 56).length;
          const place = v.finished.indexOf(u);
          const out = v.forfeited.includes(u);
          return (
            <div key={u} className="card tight row" style={{ gap: 8, padding: '8px 10px', boxShadow: v.turn === u ? `0 0 0 3px ${COLOR[color]}` : undefined, opacity: out ? 0.45 : 1 }}>
              <Avatar id={byId[u]?.avatar} size={32} online={byId[u]?.connected} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="bold small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(u)}</div>
                <div className="tiny row" style={{ gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: COLOR[color] }} />{NAME[color]} · {home}/4 🏁
                </div>
              </div>
              {place >= 0 && <span className="chip yellow">{place + 1}</span>}
              {out && <span className="chip red">Abandon</span>}
            </div>
          );
        })}
      </div>

      {v.status === 'playing' && <TimerBar deadline={v.turnDeadline} total={v.turnMs} />}
      <div style={{ position: 'relative' }}>
        <Board v={v} me={me} onPick={(i) => sendAction({ type: 'move', token: i })} />
        {banner && (
          <div style={{ position: 'absolute', left: 12, right: 12, top: '42%', textAlign: 'center' }}>
            <span className="toast" style={{ display: 'inline-flex', animation: 'pop .3s' }}>{banner}</span>
          </div>
        )}
      </div>

      <div className="card row" style={{ gap: 14 }}>
        <Dice value={shownDice} rolling={rolling} color={COLOR[v.colors[v.turn]] || '#00377D'} />
        <div className="grow" aria-live="polite">
          {v.status !== 'playing' ? <b>Partie terminée</b> : myTurn ? (
            v.phase === 'roll' ? <><b>À toi !</b><div className="tiny muted">{v.sixes ? `Encore un lancer (${v.sixes} six d'affilée)` : 'Lance le dé'}</div></>
              : <><b>Choisis un pion</b><div className="tiny muted">Touche un pion entouré pour avancer de {v.dice}</div></>
          ) : <><b>Au tour de {name(v.turn)}</b><div className="tiny muted">{v.phase === 'move' ? `a fait ${v.dice}…` : 'lance le dé…'}</div></>}
        </div>
        {myTurn && v.phase === 'roll' && (
          <button className="btn md" onClick={() => sendAction({ type: 'roll' })}>Lancer</button>
        )}
      </div>
    </div>
  );
}
