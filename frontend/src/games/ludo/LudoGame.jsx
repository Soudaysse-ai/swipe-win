// Yas Ludo — interface. Dés, déplacements et captures sont calculés par le serveur ;
// l'écran se contente de les rendre lisibles : chaque joueur est placé au coin de sa
// base, le dé apparaît à côté de celui qui joue, les pions avancent case par case.
import { useEffect, useRef, useState } from 'react';
import Dice from '../common/Dice';
import { TurnAvatar, Seconds } from '../common/Turn';
import { useGameEvents } from '../../player/pages/Match';

const C = 20; // taille d'une case (viewBox 300 × 300)
const COLOR = { red: '#E5484D', green: '#2FA35A', yellow: '#F5B700', blue: '#2F6FD6' };
const DARK = { red: '#C9353B', green: '#238549', yellow: '#D99E00', blue: '#2259B8' };
const NAME = { red: 'Rouge', green: 'Vert', yellow: 'Jaune', blue: 'Bleu' };
const START = { red: 0, green: 13, yellow: 26, blue: 39 };
// Coin de chaque base : la place du joueur autour du plateau.
const CORNER = { red: 'top-left', green: 'top-right', blue: 'bottom-left', yellow: 'bottom-right' };
const STEP_MS = 150;       // durée d'un pas de pion
const ROLL_MS = 750;       // durée de l'animation du dé
const FLASH_MS = 1700;     // résultat affiché quand le lancer termine le tour

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
const BASE_SPOTS = [[2, 2], [2, 4], [4, 2], [4, 4]];
const FINISH = { red: [7.5, 6.6], green: [6.6, 7.5], yellow: [7.5, 8.4], blue: [8.4, 7.5] };

function cellOf(color, p, i) {
  if (p === -1) { const [r0, c0] = BASE[color]; const [dr, dc] = BASE_SPOTS[i]; return [r0 + dr, c0 + dc]; }
  if (p === 56) return FINISH[color];
  if (p >= 51) return HOME_COL[color][p - 51].map(x => x + 0.5);
  const [r, c] = TRACK[(START[color] + p) % 52];
  return [r + 0.5, c + 0.5];
}

// Fait avancer les pions case par case entre deux états reçus du serveur.
// Un pion capturé ne rentre à sa base qu'une fois le pion qui le prend arrivé.
function useSteppedTokens(tokens) {
  const [shown, setShown] = useState(tokens);
  const shownRef = useRef(tokens);
  const key = JSON.stringify(tokens);
  useEffect(() => {
    const from = shownRef.current;
    const to = tokens;
    const paths = {};
    let steps = 0;
    for (const u of Object.keys(to)) {
      to[u].forEach((p, i) => {
        const f = from[u]?.[i];
        if (f != null && f >= 0 && p > f && p - f <= 6) { paths[`${u}:${i}`] = f; steps = Math.max(steps, p - f); }
      });
    }
    const frame = (k) => Object.fromEntries(Object.keys(to).map(u => [u, to[u].map((p, i) => {
      const f = paths[`${u}:${i}`];
      if (f != null) return Math.min(f + k, p);
      const prev = from[u]?.[i];
      if (p === -1 && prev != null && prev >= 0 && k < steps) return prev;
      return p;
    })]));
    const apply = (k) => { const n = frame(k); shownRef.current = n; setShown(n); };
    apply(0);
    const timers = [];
    for (let k = 1; k <= steps; k++) timers.push(setTimeout(() => apply(k), k * STEP_MS));
    return () => { timers.forEach(clearTimeout); shownRef.current = to; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

function Star({ x, y }) {
  return <path d="M0-6 1.8-2 6-1.8 2.8 1.1 3.7 5.5 0 3.3-3.7 5.5-2.8 1.1-6-1.8-1.8-2z" transform={`translate(${x} ${y})`} fill="none" stroke="#9FB3CC" strokeWidth="1.1" strokeLinejoin="round" />;
}

function Board({ v, tokens, me, onPick, canPick }) {
  const safe = new Set(v.safe);
  const myMovable = canPick ? new Set(v.movable) : new Set();
  const pieces = [];
  const byCell = {};
  for (const u of v.players) {
    const color = v.colors[u];
    tokens[u].forEach((p, i) => {
      const [r, c] = cellOf(color, p, i);
      const key = p === -1 ? `b${u}${i}` : `${r},${c}`;
      byCell[key] = (byCell[key] || 0) + 1;
      pieces.push({ u, i, p, color, r, c, key, n: byCell[key] - 1 });
    });
  }
  return (
    <svg className="ludo-board" viewBox="0 0 300 300" role="img" aria-label="Plateau de Yas Ludo">
      <rect width="300" height="300" fill="#fff" />
      {Object.entries(BASE).map(([color, [r, c]]) => (
        <g key={color}>
          <rect x={c * C} y={r * C} width={6 * C} height={6 * C} fill={COLOR[color]} />
          <rect x={c * C + 0.9 * C} y={r * C + 0.9 * C} width={4.2 * C} height={4.2 * C} fill={DARK[color]} rx="9" />
          {BASE_SPOTS.map(([dr, dc], i) => <circle key={i} cx={(c + dc) * C} cy={(r + dr) * C} r={C * 0.7} fill="rgba(0,0,0,.16)" />)}
        </g>
      ))}
      {TRACK.map(([r, c], idx) => {
        const startColor = Object.keys(START).find(k => START[k] === idx);
        return (
          <g key={idx}>
            <rect x={c * C} y={r * C} width={C} height={C} fill={startColor ? COLOR[startColor] : '#fff'} stroke="#DCE3EC" strokeWidth="0.8" />
            {safe.has(idx) && !startColor && <Star x={c * C + C / 2} y={r * C + C / 2} />}
          </g>
        );
      })}
      {Object.entries(HOME_COL).map(([color, cells]) => cells.map(([r, c], i) => (
        <rect key={`${color}${i}`} x={c * C} y={r * C} width={C} height={C} fill={COLOR[color]} stroke="#DCE3EC" strokeWidth="0.8" />
      )))}
      <polygon points={`${6 * C},${6 * C} ${9 * C},${6 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.green} />
      <polygon points={`${9 * C},${6 * C} ${9 * C},${9 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.yellow} />
      <polygon points={`${9 * C},${9 * C} ${6 * C},${9 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.blue} />
      <polygon points={`${6 * C},${9 * C} ${6 * C},${6 * C} ${7.5 * C},${7.5 * C}`} fill={COLOR.red} />
      {pieces.map(pc => {
        const can = pc.u === me && myMovable.has(pc.i);
        const total = byCell[pc.key];
        const off = total > 1 ? (pc.n - (total - 1) / 2) * 4.5 : 0;
        const x = pc.c * C + off;
        const y = pc.r * C + off;
        return (
          <g key={`${pc.u}-${pc.i}`} className={`ludo-token${can ? ' can' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={() => can && onPick(pc.i)} role={can ? 'button' : undefined} aria-label={can ? `Déplacer le pion ${pc.i + 1}` : undefined}>
            {can && <g className="halo"><circle r={C * 0.64} stroke="#fff" strokeWidth="3" /><circle r={C * 0.76} stroke="#00377D" strokeWidth="2" /></g>}
            <ellipse cx="0" cy="2.2" rx={C * 0.4} ry={C * 0.34} fill="rgba(0,0,0,.28)" />
            <circle r={C * 0.4} fill="#fff" />
            <circle r={C * 0.27} fill={COLOR[pc.color]} />
            <circle r={C * 0.27} fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
            {can && <circle r={C * 0.9} fill="transparent" />}
          </g>
        );
      })}
    </svg>
  );
}

// Place d'un joueur, au coin de sa base : avatar, nom, chronomètre et dé.
function Seat({ color, empty, player, name, active, home, place, out, deadline, total, dice, onRoll, mine }) {
  const corner = CORNER[color];
  if (empty) return <div className={`ludo-seat ${corner} empty`} />;
  return (
    <div className={`ludo-seat ${corner}${active ? ' active' : ''}${out ? ' out' : ''}`} style={{ '--pc': COLOR[color] }}
      aria-label={`${name} (${NAME[color]})${active ? ', à son tour' : ''}`}>
      <TurnAvatar player={player} active={active} deadline={deadline} total={total} />
      <span className="seat-info">
        <b>{name}</b>
        <span className="seat-meta">
          {place >= 0 ? <span className="chip yellow">{place + 1}{place === 0 ? 'er' : 'e'}</span>
            : out ? <span className="chip red">Abandon</span>
              : <>🏁 {home}/4</>}
        </span>
      </span>
      {dice && (onRoll
        ? <Dice size={50} accent={COLOR[color]} active onClick={onRoll} label="Lancer le dé" />
        : <Dice size={mine ? 50 : 44} accent={COLOR[color]} value={dice.value} rolling={dice.rolling} active={active} />)}
    </div>
  );
}

export default function LudoGame({ snapshot, me, sendAction, matchId }) {
  const v = snapshot.view;
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  const name = (u) => (u === me ? 'Toi' : byId[u]?.username);
  const tokens = useSteppedTokens(v.tokens);
  const [rolling, setRolling] = useState(false);
  const [rollEnd, setRollEnd] = useState(0);  // instant où l'animation du dé s'arrête
  const [flash, setFlash] = useState(null);   // lancer qui a mis fin au tour : { userId, value, text, until }
  const [banner, setBanner] = useState(null);
  const note = useRef(null);
  const seqRef = useRef(v.lastRoll?.seq ?? null);
  const playing = v.status === 'playing';

  useGameEvents(matchId, (e) => {
    const show = (t) => { setBanner(t); setTimeout(() => setBanner(null), 1900); };
    if (e.type === 'no_move') note.current = 'aucun pion ne peut avancer';
    if (e.type === 'three_sixes') note.current = 'trois 6 d\'affilée : tour perdu';
    if (e.type === 'token_moved' && e.payload.captured?.length) show(`💥 ${name(e.payload.userId)} capture un pion !`);
    if (e.type === 'player_finished') show(`🏁 ${name(e.payload.userId)} termine ${e.payload.place === 1 ? '1er' : `${e.payload.place}e`} !`);
    if (e.type === 'turn_timeout') show(`⏱️ Temps écoulé : le serveur joue pour ${name(e.payload.userId)}`);
  });

  // Nouveau lancer reçu : le dé tourne, puis se pose. S'il a terminé le tour
  // (aucun pion jouable, trois 6), le résultat reste affiché un moment.
  useEffect(() => {
    const r = v.lastRoll;
    if (!r || r.seq === seqRef.current) return;
    seqRef.current = r.seq;
    setRolling(true);
    setRollEnd(Date.now() + ROLL_MS);
    const ended = v.turn !== r.userId || (v.phase === 'roll' && note.current);
    if (ended && note.current) setFlash({ userId: r.userId, value: r.value, text: note.current, until: Date.now() + FLASH_MS });
    note.current = null;
  }, [v.lastRoll?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chaque affichage temporaire a son propre minuteur : un lancer suivant (souvent celui
  // du bot, très rapide) ne doit jamais annuler la fin d'un affichage précédent, sinon
  // le dé reste verrouillé et le joueur perd son tour.
  useEffect(() => {
    if (!rollEnd) return undefined;
    const t = setTimeout(() => setRolling(false), Math.max(0, rollEnd - Date.now()));
    return () => clearTimeout(t);
  }, [rollEnd]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), Math.max(0, flash.until - Date.now()));
    return () => clearTimeout(t);
  }, [flash]);

  const myTurn = playing && v.turn === me;
  const busy = rolling || !!flash;
  const canRoll = myTurn && v.phase === 'roll' && !busy;
  const canPick = myTurn && v.phase === 'move' && !rolling;

  async function roll() {
    if (!canRoll) return;
    setRolling(true);
    setRollEnd(Date.now() + 5000); // filet de sécurité si la réponse du serveur se fait attendre
    const ok = await sendAction({ type: 'roll' });
    if (!ok) setRolling(false);
  }

  // Valeur affichée par le dé d'un joueur.
  function diceFor(u) {
    if (flash?.userId === u) return { value: flash.value, show: true };
    const r = v.lastRoll;
    if (u !== v.turn) return { show: false };
    if (v.phase === 'move' && r?.userId === u) return { value: r.value, show: true };
    if (rolling && r?.userId === u) return { value: r.value, show: true };
    return { value: null, show: true };
  }

  function seat(color) {
    const u = v.players.find(x => v.colors[x] === color);
    if (!u) return <Seat key={color} color={color} empty />;
    const d = diceFor(u);
    const mine = u === me;
    return (
      <Seat key={color} color={color} player={byId[u]} name={name(u)} mine={mine}
        active={playing && v.turn === u && !flash}
        home={v.tokens[u].filter(x => x === 56).length} place={v.finished.indexOf(u)} out={v.forfeited.includes(u)}
        deadline={v.turnDeadline} total={v.turnMs}
        dice={d.show ? { value: d.value, rolling: rolling && (v.lastRoll?.userId === u || (mine && myTurn)) } : null}
        onRoll={mine && canRoll ? roll : null} />
    );
  }

  const turnColor = COLOR[v.colors[v.turn]] || COLOR.red;
  const mySeconds = myTurn && !flash ? <Seconds deadline={v.turnDeadline} /> : null;
  let status;
  if (!playing) status = <b>Partie terminée</b>;
  else if (flash) status = <><b>{flash.userId === me ? 'Tu as fait' : `${name(flash.userId)} a fait`} {flash.value}</b> : {flash.text}</>;
  else if (myTurn && v.phase === 'roll') status = <><b>À toi !</b> {v.sixes ? 'Tu as fait 6 : relance le dé' : 'Touche le dé pour le lancer'}{mySeconds}</>;
  else if (myTurn && v.phase === 'move') status = rolling ? <b>Lancer en cours…</b> : <><b>Tu as fait {v.dice}</b> : touche un pion qui clignote{mySeconds}</>;
  else if (v.phase === 'move') status = <><b>{name(v.turn)}</b> a fait {v.dice} et choisit un pion…</>;
  else status = <><b>{name(v.turn)}</b> lance le dé…</>;

  return (
    <div className="ludo">
      <div className="ludo-seats">{seat('red')}{seat('green')}</div>
      <div className="ludo-board-wrap">
        <Board v={v} tokens={tokens} me={me} canPick={canPick} onPick={(i) => sendAction({ type: 'move', token: i })} />
        {banner && <div className="ludo-banner"><span>{banner}</span></div>}
      </div>
      <div className="ludo-seats">{seat('blue')}{seat('yellow')}</div>
      <p className="game-status" aria-live="polite"><span className="dot" style={{ background: flash ? COLOR[v.colors[flash.userId]] : turnColor }} /><span>{status}</span></p>
    </div>
  );
}
