// Yas Foot — interface. Le serveur fait foi, mais le tireur n'attend pas sa
// réponse : au relâchement, son navigateur calcule le tir avec la même physique
// (sim.js, copie exacte de celle du serveur) et l'anime aussitôt. L'adversaire
// rejoue les images reçues (événement « shot »). Si le serveur refuse le tir ou
// calcule autre chose (état périmé), l'écran se cale sur sa version.
// Animation à 60 images par seconde, en déplaçant directement les palets dans
// le SVG (pas de re-rendu React à chaque image).
// Avant-match : équipe (drapeau), formation et stade, puis écran « VS ».
// Visée façon Soccer Stars : pose le doigt sur un de tes palets (ils brillent
// quand c'est à toi), tire vers l'arrière : le cercle sombre grandit avec la
// puissance, la flèche blanche montre la direction ; relâche pour tirer. Pas de
// guide de trajectoire : on vise à l'œil. Étincelles jaunes à chaque choc.
// Passe : si ton tir envoie le ballon sur un coéquipier, tu rejoues.
// Ta cage est toujours en bas (téléphone en portrait) ou à gauche (paysage).
import { forwardRef, memo, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { Sheet } from '../../components/ui';
import { serverNow } from '../../lib/socket';
import { sfx, useSoundEnabled } from '../../lib/sound';
import { useGameEvents } from '../../player/pages/Match';
import { TurnAvatar, Seconds, useTimeLeft } from '../common/Turn';
import { FlagDisc, FlagBadge, TEAM_NAMES, TEAM_COLOR } from './flags';
import { STADIUMS, Pitch, StadiumThumb, useStadium, MARGIN_SIDE, MARGIN_END } from './stadiums';
import { shoot, shotInput } from './physics';

const MAX_DRAG = 170;   // traction (unités du terrain) pour la pleine puissance
const MIN_POWER = 0.08;
const MINE = '#5FE1FF';  // anneau de mes palets quand c'est à moi
const THEIRS = '#FF5A5F'; // anneau des palets adverses pendant leur tour
const VS_MS = 2400;
const TRAIL = 6;         // points de la traînée du ballon
// Palets neutres tant qu'une équipe n'est pas choisie.
const NEUTRAL = [
  { light: '#FFE566', main: '#FFD100', dark: '#C99A00' },
  { light: '#5F99D2', main: '#1D5FB4', dark: '#00377D' },
];

// Le terrain ne change pas pendant un tir : on ne le redessine pas à chaque rendu.
const StaticPitch = memo(Pitch, (a, b) => a.theme === b.theme && a.F.W === b.F.W && a.F.H === b.F.H);

function usePortrait() {
  const q = '(orientation: portrait)';
  const [p, setP] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setP(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return p;
}

// Rotation terrain → écran (degrés) pour que ma cage soit en bas / à gauche.
function orientation(portrait, side, F) {
  const ex = F.goalDepth + MARGIN_END;
  if (!portrait) {
    const viewBox = `${-ex} ${-MARGIN_SIDE} ${F.W + 2 * ex} ${F.H + 2 * MARGIN_SIDE}`;
    return side === 0
      ? { transform: '', angle: 0, viewBox }
      : { transform: `rotate(180 ${F.W / 2} ${F.H / 2})`, angle: 180, viewBox };
  }
  const viewBox = `${-MARGIN_SIDE} ${-ex} ${F.H + 2 * MARGIN_SIDE} ${F.W + 2 * ex}`;
  return side === 0
    ? { transform: `translate(0 ${F.W}) rotate(-90)`, angle: -90, viewBox }
    : { transform: `translate(${F.H} 0) rotate(90)`, angle: 90, viewBox };
}

// Décalage d'ombre constant à l'écran (bas-droite), exprimé dans le repère du terrain.
function shadowOffset(angle) {
  const a = (-angle * Math.PI) / 180;
  const [x, y] = [3, 6];
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

const Disc = forwardRef(function Disc({ x, y, R, team, neutral, upright, shadow, ring, onPointerDown, label }, ref) {
  return (
    <g ref={ref} transform={`translate(${x} ${y})`} onPointerDown={onPointerDown} className={onPointerDown ? 'foot-disc mine' : 'foot-disc'}
      role={onPointerDown ? 'button' : undefined} aria-label={label}>
      <circle cx={shadow[0]} cy={shadow[1]} r={R} fill="rgba(0,0,0,.32)" />
      {ring && (
        <g className="disc-ring">
          <circle r={R + 7} fill="none" stroke={ring} strokeOpacity=".35" strokeWidth="9" />
          <circle r={R + 5} fill="none" stroke={ring} strokeWidth="3.5" />
        </g>
      )}
      <g transform={`rotate(${upright})`}>
        {team ? <FlagDisc code={team} r={R} /> : (
          <g>
            <circle r={R} fill={`url(#foot-neutral-${neutral})`} />
            <circle r={R - 4} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.5" />
          </g>
        )}
      </g>
      {onPointerDown && <circle r={R + 14} fill="transparent" />}
    </g>
  );
});

const spinOf = (x, y) => (x + y) * 1.6;

const Ball = forwardRef(function Ball({ x, y, R, shadow, spinRef }, ref) {
  return (
    <g ref={ref} transform={`translate(${x} ${y})`}>
      <circle cx={shadow[0] * 0.7} cy={shadow[1] * 0.7} r={R} fill="rgba(0,0,0,.32)" />
      <g ref={spinRef} transform={`rotate(${spinOf(x, y)})`}>
        <circle r={R} fill="#fff" stroke="#16181D" strokeWidth="1.8" />
        <path d={`M0 ${-R * 0.42} L${R * 0.4} ${-R * 0.13} L${R * 0.25} ${R * 0.34} L${-R * 0.25} ${R * 0.34} L${-R * 0.4} ${-R * 0.13} Z`} fill="#16181D" />
        {[0, 72, 144, 216, 288].map(a => (
          <path key={a} transform={`rotate(${a})`} d={`M${-R * 0.18} ${-R * 0.98} L${R * 0.18} ${-R * 0.98} L${R * 0.1} ${-R * 0.72} L${-R * 0.1} ${-R * 0.72} Z`} fill="#16181D" />
        ))}
      </g>
      <circle r={R} fill="url(#foot-ball-shade)" />
    </g>
  );
});

// Visée comme dans Soccer Stars : cercle sombre qui grandit avec la puissance et
// flèche blanche dans la direction du tir. Pas de guide de trajectoire : on vise
// à l'œil un coéquipier, le ballon ou le but.
function Aim({ origin, pull, R }) {
  const len = Math.hypot(pull[0], pull[1]);
  if (len < 2) return null;
  const power = Math.min(1, len / MAX_DRAG);
  const ux = pull[0] / len; const uy = pull[1] / len;
  const [ox, oy] = origin;
  const start = [ox + ux * (R * 0.35), oy + uy * (R * 0.35)];
  const tipLen = R + 14 + power * 96;
  const tip = [ox + ux * tipLen, oy + uy * tipLen];
  const head = `${tip[0] + ux * 4},${tip[1] + uy * 4} ${tip[0] - ux * 18 - uy * 11},${tip[1] - uy * 18 + ux * 11} ${tip[0] - ux * 18 + uy * 11},${tip[1] - uy * 18 - ux * 11}`;
  return (
    <g pointerEvents="none">
      <circle cx={ox} cy={oy} r={R + 16 + power * (MAX_DRAG - R - 16)} fill="rgba(4,24,12,.36)" />
      <line x1={start[0]} y1={start[1]} x2={tip[0] - ux * 12} y2={tip[1] - uy * 12} stroke="rgba(0,0,0,.25)" strokeWidth="9" strokeLinecap="round" transform="translate(2 3)" />
      <line x1={start[0]} y1={start[1]} x2={tip[0] - ux * 12} y2={tip[1] - uy * 12} stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <polygon points={head} fill="#fff" strokeLinejoin="round" stroke="#fff" strokeWidth="3" />
    </g>
  );
}

function Clock({ until }) {
  const left = useTimeLeft(until);
  if (left == null) return <span className="foot-clock">--:--</span>;
  const s = Math.ceil(left / 1000);
  return <span className={`foot-clock${s <= 30 ? ' low' : ''}`}>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

// Formation vue en miniature : ma cage en bas.
function FormationThumb({ pos }) {
  return (
    <svg viewBox="0 0 120 150" aria-hidden className="formation-thumb">
      <rect width="120" height="150" fill="#3FAE60" />
      {[0, 1, 2, 3, 4].map(i => i % 2 === 0 && <rect key={i} x="0" y={i * 30} width="120" height="30" fill="#379B54" />)}
      <rect x="1" y="1" width="118" height="148" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="1.5" />
      <path d="M30 1 A30 30 0 0 0 90 1" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="1.5" />
      <rect x="30" y="128" width="60" height="21" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="1.5" />
      {pos.map(([x, y], i) => (
        <circle key={i} cx={(y / 600) * 120} cy={146 - (x / 500) * 138} r="8.5" fill="#FFD100" stroke="#00377D" strokeWidth="2.5" />
      ))}
    </svg>
  );
}

function Confetti() {
  const colors = ['#FFD100', '#E5484D', '#5F99D2', '#fff', '#2FA35A'];
  return (
    <div className="foot-confetti" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} style={{
          left: `${(i * 37) % 100}%`, background: colors[i % colors.length],
          animationDelay: `${(i % 9) * 0.06}s`, animationDuration: `${1.3 + (i % 5) * 0.18}s`, '--r': `${(i * 47) % 360}deg`,
        }} />
      ))}
    </div>
  );
}

function SetupPanel({ v, me, opp, oppName, sendAction, theme, setStadium }) {
  const [tab, setTab] = useState('team');
  const left = useTimeLeft(v.setupEndsAt);
  const ready = !!v.ready?.[me];
  const oppReady = !!v.ready?.[opp];
  const myTeam = v.teams?.[me];
  const oppTeam = v.teams?.[opp];
  const pick = (patch) => sendAction({ type: 'setup', ...patch });
  const TABS = [['team', 'Équipe'], ['formation', 'Formation'], ['stadium', 'Stade']];
  return (
    <div className="foot-setup" role="dialog" aria-label="Avant-match">
      <div className="foot-setup-head">
        <h2>Prépare ton <span>match</span></h2>
        <p>Coup d'envoi dans <b>{left == null ? '…' : Math.ceil(left / 1000)}</b> s</p>
      </div>
      <div className="tabs foot-setup-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="foot-setup-body">
        {tab === 'team' && (
          <div className="flag-grid">
            {v.options.teams.map(code => (
              <button key={code} type="button" className={`flag-pick${myTeam === code ? ' on' : ''}`} aria-pressed={myTeam === code}
                disabled={ready || oppTeam === code} onClick={() => pick({ team: code })} aria-label={`${TEAM_NAMES[code]}${oppTeam === code ? ' (prise par ton adversaire)' : ''}`}>
                <FlagBadge code={code} size={50} />
                <small>{TEAM_NAMES[code]}</small>
                {oppTeam === code && <em>Adversaire</em>}
              </button>
            ))}
          </div>
        )}
        {tab === 'formation' && (
          <div className="formation-grid">
            {Object.entries(v.options.formations).map(([id, f]) => (
              <button key={id} type="button" className={`formation-pick${v.formations?.[me] === id ? ' on' : ''}`} aria-pressed={v.formations?.[me] === id}
                disabled={ready} onClick={() => pick({ formation: id })}>
                <FormationThumb pos={f.pos} />
                <b>{id}</b><small>{f.name}</small>
              </button>
            ))}
          </div>
        )}
        {tab === 'stadium' && (
          <div className="stadium-grid">
            {STADIUMS.map(s => (
              <button key={s.id} type="button" className={`stadium-pick${theme.id === s.id ? ' on' : ''}`} aria-pressed={theme.id === s.id} onClick={() => setStadium(s.id)}>
                <StadiumThumb theme={s} /><b>{s.name}</b>
              </button>
            ))}
            <p className="small">Le stade ne change que ton écran : ton adversaire voit le sien.</p>
          </div>
        )}
      </div>
      <button className="btn block" disabled={ready} onClick={() => pick({ ready: true })}>
        {ready ? (oppReady ? 'C\'est parti !' : `Prêt ✓ — on attend ${oppName}…`) : <>Je suis prêt <span className="arrow" /></>}
      </button>
    </div>
  );
}

export default function FootGame({ snapshot, me, sendAction, matchId, onResign, onChat }) {
  const v = snapshot.view;
  const F = v.field;
  const portrait = usePortrait();
  const side = v.players[1] === me ? 1 : 0;
  const view = orientation(portrait, side, F);
  const shadow = shadowOffset(view.angle);
  const upright = -view.angle;
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  // Le pseudonyme de chacun, y compris le mien (plus de « Toi »).
  const name = (u) => byId[u]?.username || '';
  const opp = v.players.find(u => u !== me) || v.players[1];
  const meId = v.players.includes(me) ? me : v.players[0];
  const [theme, setStadium] = useStadium();
  const [soundOn, setSoundOn] = useSoundEnabled();

  const svgRef = useRef(null);
  const fieldRef = useRef(null);
  const bodyRefs = useRef([]);       // <g> des 10 palets puis du ballon
  const spinRef = useRef(null);
  const trailRefs = useRef([]);
  const sparkRef = useRef(null);       // étincelles des chocs (ajoutées directement dans le SVG)
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anim = useRef(null);         // tir en cours d'animation
  const raf = useRef(null);
  const timers = useRef([]);
  // Positions affichées par React pendant un tir (celles du départ, puis celles de
  // l'arrivée pendant « BUT ! ») : l'animation, elle, déplace directement le SVG.
  const [held, setHeld] = useState(null);
  const [goalFlash, setGoalFlash] = useState(null);
  // Score d'avant le tir, affiché pendant qu'il se joue : le nouveau score (et le coup
  // de sifflet final) n'apparaissent qu'avec « BUT ! », pas quand le ballon part.
  const [scoreHold, setScoreHold] = useState(null);
  const [passFlash, setPassFlash] = useState(null);
  const [vsUntil, setVsUntil] = useState(() => (
    v.phase === 'play' && !v.shots[v.players[0]] && !v.shots[v.players[1]] && serverNow() < (v.turnOpensAt || 0) ? v.turnOpensAt : 0));
  const [aim, setAim] = useState(null);         // { disc, origin, pointer }
  const [menu, setMenu] = useState(false);
  const [, setTick] = useState(0);

  const later = (ms, fn) => { timers.current.push(setTimeout(fn, ms)); };
  const clearSounds = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    clearSounds();
  }, []);

  const official = () => [...v.discs[v.players[0]], ...v.discs[v.players[1]], v.ball];

  // Déplace les palets et le ballon dans le SVG, sans passer par React.
  function paint(pos, trail) {
    pos.forEach(([x, y], i) => bodyRefs.current[i]?.setAttribute('transform', `translate(${x} ${y})`));
    const [bx, by] = pos[10];
    spinRef.current?.setAttribute('transform', `rotate(${spinOf(bx, by)})`);
    trailRefs.current.forEach((c, i) => {
      const p = trail?.[trail.length - 1 - (i + 1) * 2];
      if (!c) return;
      if (!p) { c.setAttribute('opacity', '0'); return; }
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]);
      c.setAttribute('opacity', String(0.42 - i * 0.065));
    });
  }

  // Sons et étincelles jaunes à chaque choc (positions fournies par la simulation).
  function sounds(hits, frameMs) {
    hits.forEach(([f, kind, i, x, y]) => later(f * frameMs, () => {
      sfx[kind]?.(i);
      if (x != null && i >= 0.12) spark(x, y, i);
    }));
  }
  function spark(x, y, i) {
    const layer = sparkRef.current;
    if (!layer || reduceMotion) return;
    const n = 4 + Math.round(i * 6);
    for (let k = 0; k < n; k++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const ang = (k / n) * Math.PI * 2 + i * 3;
      const dist = 18 + i * 34 + (k % 3) * 7;
      c.setAttribute('cx', x); c.setAttribute('cy', y);
      c.setAttribute('r', String(3 + (k % 2) * 1.6));
      c.setAttribute('fill', k % 3 ? '#FFE45C' : '#FFC21A');
      layer.appendChild(c);
      const anim = c.animate([
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(.4)`, opacity: 0 },
      ], { duration: 420 + (k % 3) * 60, easing: 'cubic-bezier(.2,.7,.3,1)' });
      anim.onfinish = () => c.remove();
    }
  }

  // Joue une trajectoire (images régulières, interpolées) ; `a.frames` peut être
  // remplacée en cours de route par celle du serveur.
  function run(a) {
    if (raf.current) cancelAnimationFrame(raf.current);
    const trail = [];
    const step = () => {
      if (anim.current !== a) return;
      const t = (performance.now() - a.start) / a.frameMs;
      const fr = a.frames;
      const i = Math.floor(t);
      if (i >= fr.length - 1) {
        paint(fr[fr.length - 1], null);
        raf.current = null;
        a.played = true;
        if (!a.local || a.server) finish(a);
        else later(4000, () => { if (anim.current === a) finish(a); }); // réponse du serveur trop lente
        return;
      }
      const p = fr[i]; const q = fr[i + 1]; const k = t - i;
      const pos = p.map(([x, y], n) => [x + (q[n][0] - x) * k, y + (q[n][1] - y) * k]);
      trail.push(pos[10]);
      if (trail.length > TRAIL * 2 + 2) trail.shift();
      paint(pos, trail);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  function finish(a) {
    anim.current = null;
    setScoreHold(null);
    const out = a.server || a.result;   // le serveur fait foi
    const last = a.frames[a.frames.length - 1];
    if (out.goal) {
      setHeld(last);
      setGoalFlash({ scorer: out.goal, own: out.goal !== a.userId });
      sfx.goal();
      later(1900, () => { setGoalFlash(null); setHeld(null); });
      return;
    }
    setHeld(null);
    if (out.pass != null) {
      const team = v.players.indexOf(a.userId);
      setPassFlash({ userId: a.userId, at: last[team * 5 + out.pass] });
      sfx.pass();
      later(1600, () => setPassFlash(null));
    }
  }

  function start(a) {
    anim.current = a;
    setAim(null);
    setHeld(a.frames[0]);
    setScoreHold(s => s || v.score);
    sfx.kick(a.power);
    sounds(a.hits, a.frameMs);
    run(a);
  }

  // Annule un tir local refusé : retour à l'état officiel.
  function cancel(a) {
    if (anim.current !== a) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    anim.current = null;
    clearSounds();
    paint(official(), null);
    setHeld(null);
    setScoreHold(null);
  }

  useGameEvents(matchId, (e) => {
    if (e.type === 'kickoff') {
      setVsUntil(Date.now() + VS_MS);
      sfx.whistle();
      return;
    }
    if (e.type === 'final_whistle') { sfx.whistle(true); return; }
    if (e.type !== 'shot') return;
    const { frames, frameMs, goal, pass, hits = [], power, userId } = e.payload;
    const server = { goal, pass };
    const a = anim.current;
    // Confirmation de mon propre tir, déjà animé localement.
    if (a?.local && !a.server && userId === me) {
      a.server = server;
      const mine = a.frames[a.frames.length - 1];
      const theirs = frames[frames.length - 1];
      const same = mine.every(([x, y], n) => x === theirs[n][0] && y === theirs[n][1]);
      if (!same) {
        // Le serveur a calculé autre chose (état périmé) : on suit sa trajectoire.
        clearSounds();
        a.frames = frames; a.frameMs = frameMs;
        if (a.played) run(a);
      } else if (a.played) finish(a);
      return;
    }
    if (a && raf.current) cancelAnimationFrame(raf.current);
    start({ frames, frameMs, power, hits, userId, server, result: server, local: false, start: performance.now() });
  });

  // Réafficher quand le tir s'ouvre (fin de l'animation côté serveur) et à la fin de l'écran VS.
  useEffect(() => {
    const wait = (v.turnOpensAt || 0) - serverNow();
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setTick(n => n + 1), wait + 30);
    return () => clearTimeout(t);
  }, [v.turnOpensAt, v.seq]);
  useEffect(() => {
    if (!vsUntil) return undefined;
    const t = setTimeout(() => setVsUntil(0), Math.max(0, vsUntil - Date.now()));
    return () => clearTimeout(t);
  }, [vsUntil]);

  const playing = v.status === 'playing';
  const setup = playing && v.phase === 'setup';
  const animating = !!held || !!goalFlash;
  const myTurn = playing && v.phase === 'play' && v.turn === me;
  const canShoot = myTurn && !animating && !vsUntil && serverNow() >= v.turnOpensAt;
  const theirTurn = playing && v.phase === 'play' && v.turn && v.turn !== me && !animating && !vsUntil;
  // Après une belle passe : je peux replacer le receveur autour du ballon avant de tirer.
  const receiver = canShoot && v.passReceiver?.userId === me ? v.passReceiver.disc : null;
  const placing = receiver !== null && !aim;

  // Petit signal sonore quand la main revient.
  const wasMine = useRef(false);
  useEffect(() => {
    if (canShoot && !wasMine.current) sfx.turn();
    wasMine.current = canShoot;
  }, [canShoot]);

  // Positions rendues par React : départ du tir en cours, sinon état officiel.
  const bodies = held || official();
  const discsOf = (teamIdx) => bodies.slice(teamIdx * 5, teamIdx * 5 + 5);
  const ballPos = bodies[10];

  function toField(evt) {
    const pt = svgRef.current.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(fieldRef.current.getScreenCTM().inverse());
    return [p.x, p.y];
  }
  function shotOf(a) {
    let dx = (a.origin[0] - a.pointer[0]) / MAX_DRAG;
    let dy = (a.origin[1] - a.pointer[1]) / MAX_DRAG;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { ...shotInput(dx, dy), len };
  }
  function down(disc, evt) {
    if (!canShoot) return;
    evt.preventDefault();
    svgRef.current.setPointerCapture?.(evt.pointerId);
    const origin = discsOf(side)[disc];
    setAim({ disc, origin, pointer: toField(evt) });
  }
  function move(evt) {
    if (!aim) return;
    setAim({ ...aim, pointer: toField(evt) });
  }
  // Même règle que le serveur : but (cage de gauche → l'équipe de droite marque),
  // sinon passe tant que la limite de passes d'affilée n'est pas atteinte.
  function localResult(sim) {
    const goal = sim.goal === 'left' ? v.players[1] : sim.goal === 'right' ? v.players[0] : null;
    const pass = !goal && sim.pass && (v.passes || 0) < (v.maxPasses || 2) ? sim.pass.to : null;
    return { goal, pass };
  }
  // Touche sur la pelouse, près du ballon : le receveur s'y place (mêmes règles que le serveur).
  const [placeNote, setPlaceNote] = useState(null);
  function placeAt(evt) {
    if (!placing || evt.target.closest?.('.foot-disc')) return;
    const [x, y] = toField(evt);
    const [bx, by] = v.ball;
    const d = Math.hypot(x - bx, y - by);
    const R = F.discR;
    let why = null;
    if (d > v.place.max) why = 'Trop loin du ballon';
    else if (d < v.place.min) why = 'Trop près du ballon';
    else if (x < R || x > F.W - R || y < R || y > F.H - R) why = 'Reste sur le terrain';
    else if (v.players.some(u => v.discs[u].some(([ox, oy], i) => !(u === me && i === receiver) && Math.hypot(ox - x, oy - y) < 2 * R))) why = 'Un autre joueur est déjà là';
    if (why) { setPlaceNote(why); later(1400, () => setPlaceNote(null)); return; }
    setPlaceNote(null);
    sendAction({ type: 'place', disc: receiver, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }
  async function up() {
    if (!aim) return;
    const a = aim;
    setAim(null);
    const { dx, dy, len } = shotOf(a);
    if (len < MIN_POWER) return;
    // Le tir part tout de suite à l'écran ; le serveur confirme ensuite.
    const sim = shoot(v, me, a.disc, dx, dy);
    const local = sim && {
      frames: sim.frames, frameMs: sim.frameMs, power: sim.power, hits: sim.hits, userId: me, local: true,
      result: localResult(sim),
      server: null, start: performance.now(),
    };
    if (local) start(local);
    const ok = await sendAction({ type: 'shoot', disc: a.disc, dx, dy });
    if (!ok && local) cancel(local);
  }

  const pull = aim ? [aim.origin[0] - aim.pointer[0], aim.origin[1] - aim.pointer[1]] : null;
  const power = pull ? Math.min(100, Math.round((Math.hypot(pull[0], pull[1]) / MAX_DRAG) * 100)) : 0;
  const team = (u) => v.teams?.[u] || null;
  const color = (u) => TEAM_COLOR[team(u)] || NEUTRAL[v.players[0] === u ? 0 : 1].main;
  const passesLeft = (v.maxPasses || 2) - (v.passes || 0);

  let status;
  if (!playing) status = <b>Coup de sifflet final</b>;
  else if (setup) status = <><b>Avant-match</b> : équipe, formation, stade</>;
  else if (vsUntil) status = <b>Coup d'envoi !</b>;
  else if (scoreHold) status = <>Tir en cours…</>;
  else if (goalFlash) status = <b>{goalFlash.own ? 'Contre son camp !' : `But de ${name(goalFlash.scorer)} !`}</b>;
  else if (v.phase === 'ending') status = <b>Coup de sifflet final !</b>;
  else if (passFlash) status = <><b>Belle passe !</b> {passFlash.userId === me ? 'Tu rejoues' : `${name(passFlash.userId)} rejoue`}{passesLeft > 0 ? '' : ' (dernière passe)'}</>;
  else if (animating) status = <>Tir en cours…</>;
  else if (aim) status = <>Puissance <b>{power} %</b> · relâche</>;
  else if (placing && placeNote) status = <><b>{placeNote}</b></>;
  else if (placing) status = <><b>Belle passe !</b> Replace-toi, puis tire</>;
  else if (canShoot) status = <><b>{v.passes ? 'Belle passe, rejoue !' : 'À toi !'}</b> Tire vers l'arrière <Seconds deadline={v.turnDeadline} /></>;
  else if (myTurn) status = <><b>À toi</b> dans un instant…</>;
  else status = <><b>{name(v.turn)}</b> {v.passes ? 'rejoue après une passe…' : 'prépare son tir…'}</>;

  const scoreBox = (u, align) => (
    <div className={`foot-team ${align}${playing && v.turn === u && v.phase === 'play' ? ' active' : ''}`}
      style={{ '--team': color(u) }}>
      <span className="foot-avatar">
        <TurnAvatar player={byId[u]} color={color(u)} active={playing && v.phase === 'play' && v.turn === u && !animating}
          deadline={v.turnDeadline} total={v.turnMs} size={34} />
        {team(u) && <span className="foot-flag-mini"><FlagBadge code={team(u)} size={18} /></span>}
      </span>
      <span className="foot-name">{name(u)}</span>
      <span className="foot-score">{(scoreHold || v.score)[u]}</span>
    </div>
  );

  return (
    <div className={`foot${portrait ? ' portrait' : ''}`} style={{ '--stadium': theme.bg }}>
      {/* Score et état du tour flottent au-dessus de la pelouse, comme dans Soccer Stars. */}
      <div className="foot-hud">
      <div className="foot-top">
        {onResign && <button type="button" className="foot-icon" onClick={onResign} aria-label="Abandonner"><Icon name="flag" size={20} /></button>}
        <div className="foot-board">
          {scoreBox(meId, 'left')}
          <span className="foot-mid">
            <Clock until={playing && v.phase !== 'setup' ? v.matchEndsAt : null} />
            <small>Premier à {v.goalsToWin}</small>
          </span>
          {scoreBox(opp, 'right')}
        </div>
        <button type="button" className="foot-icon" onClick={() => setMenu(true)} aria-label="Options : son, stade, chat"><Icon name="settings" size={20} /></button>
      </div>
      <p className="foot-status" aria-live="polite">
        {snapshot.training && <span className="foot-training"><Icon name="bot" size={13} /> Entraînement</span>}
        <span className="dot" style={{ background: v.turn ? color(v.turn) : '#3BA55C' }} /><span>{status}</span>
      </p>
      </div>

      <div className="foot-field-wrap">
        <svg ref={svgRef} className="foot-field" viewBox={view.viewBox} role="img" aria-label="Terrain de Yas Foot"
          onPointerMove={move} onPointerUp={up} onPointerCancel={() => setAim(null)} onClick={placeAt}>
          <defs>
            <pattern id="foot-net" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M0 0 L10 10 M10 0 L0 10" stroke="rgba(255,255,255,.45)" strokeWidth="1.2" />
            </pattern>
            {NEUTRAL.map((t, i) => (
              <radialGradient key={i} id={`foot-neutral-${i}`} cx="40%" cy="35%" r="70%">
                <stop offset="0%" stopColor={t.light} /><stop offset="65%" stopColor={t.main} /><stop offset="100%" stopColor={t.dark} />
              </radialGradient>
            ))}
            <radialGradient id="foot-ball-shade" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".22" />
            </radialGradient>
            <radialGradient id="foot-light">
              <stop offset="0" stopColor="#FFF6C2" stopOpacity=".55" /><stop offset=".4" stopColor="#FFF6C2" stopOpacity=".15" /><stop offset="1" stopColor="#FFF6C2" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g ref={fieldRef} transform={view.transform}>
            <StaticPitch F={F} theme={theme} />
            {placing && (
              <g pointerEvents="none" className="place-zone">
                <circle cx={v.ball[0]} cy={v.ball[1]} r={v.place.max} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth="3" strokeDasharray="10 9" />
                <circle cx={v.ball[0]} cy={v.ball[1]} r={v.place.min} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeDasharray="4 6" />
              </g>
            )}
            {aim && <Aim origin={aim.origin} pull={pull} R={F.discR} />}
            {Array.from({ length: TRAIL }, (_, i) => (
              <circle key={`tr${i}`} ref={(el) => { trailRefs.current[i] = el; }} r={F.ballR * (0.8 - i * 0.1)} fill="#fff" opacity="0" pointerEvents="none" />
            ))}
            {[0, 1].map(t => discsOf(t).map(([x, y], i) => {
              const owner = v.players[t];
              const mine = owner === me && t === side;
              // Anneaux lumineux sur l'équipe qui a la main (comme Soccer Stars).
              const ring = mine && canShoot && (!aim || aim.disc === i)
                ? (placing && i === receiver ? '#FFD100' : MINE)
                : (!mine && theirTurn && owner === v.turn ? THEIRS : null);
              return (
                <Disc key={`${t}-${i}`} ref={(el) => { bodyRefs.current[t * 5 + i] = el; }} x={x} y={y} R={F.discR}
                  team={team(owner)} neutral={t} upright={upright} shadow={shadow} ring={ring}
                  onPointerDown={mine && canShoot ? (e) => down(i, e) : undefined}
                  label={mine && canShoot ? `Tirer le palet ${i + 1}` : undefined} />
              );
            }))}
            <Ball ref={(el) => { bodyRefs.current[10] = el; }} spinRef={spinRef} x={ballPos[0]} y={ballPos[1]} R={F.ballR} shadow={shadow} />
            <g ref={sparkRef} pointerEvents="none" />
            {passFlash?.at && (
              <g className="foot-pass-bubble" transform={`translate(${passFlash.at[0]} ${passFlash.at[1]}) rotate(${upright}) translate(0 ${-F.discR - 26})`} pointerEvents="none">
                <rect x="-66" y="-17" width="132" height="32" rx="9" fill="#fff" />
                <path d="M-8 14 L0 24 L8 14 Z" fill="#fff" />
                <text textAnchor="middle" dominantBaseline="central" y="-1" fontSize="19" fontWeight="900" fontStyle="italic" fill="#0B6FC4" fontFamily="var(--yas-font)">BELLE PASSE !</text>
              </g>
            )}
          </g>
        </svg>

        {setup && (
          <SetupPanel v={v} me={me} opp={opp} oppName={byId[opp]?.username || 'ton adversaire'} sendAction={sendAction}
            theme={theme} setStadium={setStadium} />
        )}
        {!!vsUntil && (
          <div className="foot-vs" role="status">
            <div className="foot-vs-team">
              {team(meId) && <FlagBadge code={team(meId)} size={92} />}
              <b>{TEAM_NAMES[team(meId)] || ''}</b><span>{name(meId)}</span>
            </div>
            <strong>VS</strong>
            <div className="foot-vs-team">
              {team(opp) && <FlagBadge code={team(opp)} size={92} />}
              <b>{TEAM_NAMES[team(opp)] || ''}</b><span>{name(opp)}</span>
            </div>
          </div>
        )}
        {goalFlash && (
          <div className="foot-goal" role="status">
            <Confetti />
            <b>{goalFlash.own ? 'Contre son camp !' : 'BUT !'}</b>
            <span>{goalFlash.own ? `Le but compte pour ${name(goalFlash.scorer)}` : `${name(goalFlash.scorer)} marque`}</span>
          </div>
        )}
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} label="Options du match">
        <div className="stack lg">
          <h2 className="h2">Options</h2>
          <div className="foot-option">
            <span><b>Sons</b><small>Tirs, chocs, public et sifflet</small></span>
            <button type="button" role="switch" aria-checked={soundOn} aria-label="Sons" className={`switch${soundOn ? ' on' : ''}`} onClick={() => setSoundOn(!soundOn)}>
              <span />
            </button>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <b>Stade</b>
            <div className="stadium-grid">
              {STADIUMS.map(s => (
                <button key={s.id} type="button" className={`stadium-pick${theme.id === s.id ? ' on' : ''}`} aria-pressed={theme.id === s.id} onClick={() => setStadium(s.id)}>
                  <StadiumThumb theme={s} /><b>{s.name}</b>
                </button>
              ))}
            </div>
          </div>
          {onChat && <button className="btn outline block" onClick={() => { setMenu(false); onChat(); }}><Icon name="chat" size={18} /> Chat et réactions</button>}
          <button className="btn block" onClick={() => setMenu(false)}>Retour au match</button>
        </div>
      </Sheet>
    </div>
  );
}
