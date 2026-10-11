// Yas Foot — interface. Toute la physique est calculée par le serveur : l'écran
// rejoue les images du tir reçues (événement « shot ») puis affiche l'état officiel.
// Visée à la fronde : pose le doigt sur un de tes palets, tire vers l'arrière
// (la flèche montre la direction, le cercle la puissance), relâche pour tirer.
// Ta cage est toujours en bas (téléphone en portrait) ou à gauche (paysage).
import { useEffect, useRef, useState } from 'react';
import { avatarStyle } from '../../components/Avatar';
import { serverNow } from '../../lib/socket';
import { useGameEvents } from '../../player/pages/Match';
import { TurnAvatar, Seconds, useTimeLeft } from '../common/Turn';

const MAX_DRAG = 170;   // traction (unités du terrain) pour la pleine puissance
const MIN_POWER = 0.08;
const AIM = '#C6F432';
const TEAMS = [
  { light: '#FFE566', main: '#FFD100', dark: '#C99A00', ring: '#00377D' },   // joueur 1 : Sunshine Yellow
  { light: '#5F99D2', main: '#1D5FB4', dark: '#00377D', ring: '#FFD100' },   // joueur 2 : Midnight Blue
];

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
  if (!portrait) {
    return side === 0
      ? { transform: '', angle: 0, viewBox: `${-F.goalDepth - 14} -14 ${F.W + 2 * F.goalDepth + 28} ${F.H + 28}` }
      : { transform: `rotate(180 ${F.W / 2} ${F.H / 2})`, angle: 180, viewBox: `${-F.goalDepth - 14} -14 ${F.W + 2 * F.goalDepth + 28} ${F.H + 28}` };
  }
  const viewBox = `-14 ${-F.goalDepth - 14} ${F.H + 28} ${F.W + 2 * F.goalDepth + 28}`;
  return side === 0
    ? { transform: `translate(0 ${F.W}) rotate(-90)`, angle: -90, viewBox }
    : { transform: `translate(${F.H} 0) rotate(90)`, angle: 90, viewBox };
}

// Décalage d'ombre constant à l'écran (bas-droite), exprimé dans le repère du terrain.
function shadowOffset(angle) {
  const a = (-angle * Math.PI) / 180;
  const [x, y] = [3, 5];
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

function Pitch({ F }) {
  const { W, H, goalTop: GT, goalBottom: GB, goalDepth: D, postR } = F;
  const line = { stroke: 'rgba(255,255,255,.88)', strokeWidth: 3, fill: 'none' };
  const goal = (x0, dir) => (
    <g>
      <rect x={dir < 0 ? x0 - D : x0} y={GT} width={D} height={GB - GT} fill="url(#foot-net)" />
      <path d={`M${x0} ${GT} H${x0 + dir * D} V${GB} H${x0}`} stroke="#fff" strokeWidth="5" fill="none" strokeLinejoin="round" />
      <circle cx={x0} cy={GT} r={postR + 1} fill="#fff" />
      <circle cx={x0} cy={GB} r={postR + 1} fill="#fff" />
    </g>
  );
  const half = (mirror) => {
    const x = (v) => (mirror ? W - v : v);
    const rect = (x1, x2, y1, y2) => <rect x={Math.min(x(x1), x(x2))} y={y1} width={Math.abs(x(x2) - x(x1))} height={y2 - y1} {...line} />;
    return (
      <g>
        {rect(0, 150, 110, 490)}
        {rect(0, 60, 180, 420)}
        <circle cx={x(110)} cy={H / 2} r="4" fill="rgba(255,255,255,.88)" />
      </g>
    );
  };
  return (
    <g>
      <rect x={-D - 14} y="-14" width={W + 2 * D + 28} height={H + 28} rx="22" fill="#2A8547" />
      <rect x="0" y="0" width={W} height={H} fill="#3BA55C" />
      {Array.from({ length: 10 }, (_, i) => i % 2 === 0 && <rect key={i} x={i * 100} y="0" width="100" height={H} fill="rgba(255,255,255,.07)" />)}
      <rect x="0" y="0" width={W} height={H} {...line} />
      <line x1={W / 2} y1="0" x2={W / 2} y2={H} {...line} />
      <circle cx={W / 2} cy={H / 2} r="90" {...line} />
      <circle cx={W / 2} cy={H / 2} r="5" fill="rgba(255,255,255,.88)" />
      {half(false)}{half(true)}
      {goal(0, -1)}{goal(W, 1)}
    </g>
  );
}

function Disc({ x, y, R, team, emoji, textAngle, shadow, glow, onPointerDown, label }) {
  return (
    <g transform={`translate(${x} ${y})`} onPointerDown={onPointerDown} className={onPointerDown ? 'foot-disc mine' : 'foot-disc'}
      role={onPointerDown ? 'button' : undefined} aria-label={label}>
      <circle cx={shadow[0]} cy={shadow[1]} r={R} fill="rgba(0,0,0,.28)" />
      {glow && <circle className="disc-glow" r={R + 7} fill="none" stroke={AIM} strokeWidth="4" />}
      <circle r={R} fill={`url(#foot-team-${team})`} />
      <circle r={R - 3.5} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2.5" />
      <circle r={R * 0.6} fill="#fff" />
      <text transform={`rotate(${textAngle})`} textAnchor="middle" dominantBaseline="central" fontSize={R * 0.78} y="1">{emoji}</text>
      {onPointerDown && <circle r={R + 12} fill="transparent" />}
    </g>
  );
}

function Ball({ x, y, R, shadow }) {
  const spin = (x + y) * 1.8;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={shadow[0] * 0.7} cy={shadow[1] * 0.7} r={R} fill="rgba(0,0,0,.3)" />
      <g transform={`rotate(${spin})`}>
        <circle r={R} fill="#fff" stroke="#16181D" strokeWidth="1.6" />
        <path d={`M0 ${-R * 0.42} L${R * 0.4} ${-R * 0.13} L${R * 0.25} ${R * 0.34} L${-R * 0.25} ${R * 0.34} L${-R * 0.4} ${-R * 0.13} Z`} fill="#16181D" />
        {[0, 72, 144, 216, 288].map(a => (
          <path key={a} transform={`rotate(${a})`} d={`M${-R * 0.18} ${-R * 0.98} L${R * 0.18} ${-R * 0.98} L${R * 0.1} ${-R * 0.72} L${-R * 0.1} ${-R * 0.72} Z`} fill="#16181D" />
        ))}
      </g>
    </g>
  );
}

// Flèche de visée : direction du tir, longueur selon la puissance, pointillés au-delà.
function Aim({ origin, pull, R }) {
  const len = Math.hypot(pull[0], pull[1]);
  if (len < 2) return null;
  const power = Math.min(1, len / MAX_DRAG);
  const ux = pull[0] / len; const uy = pull[1] / len;
  const [ox, oy] = origin;
  const start = [ox + ux * (R + 4), oy + uy * (R + 4)];
  const tipLen = R + 22 + power * 150;
  const tip = [ox + ux * tipLen, oy + uy * tipLen];
  const head = (s) => {
    const bx = tip[0] - ux * 26 * s; const by = tip[1] - uy * 26 * s;
    return `${tip[0] + ux * 6 * s},${tip[1] + uy * 6 * s} ${bx - uy * 18 * s},${by + ux * 18 * s} ${bx + uy * 18 * s},${by - ux * 18 * s}`;
  };
  const back = Math.min(len, MAX_DRAG);
  return (
    <g pointerEvents="none">
      <circle cx={ox} cy={oy} r={MAX_DRAG} fill="rgba(0,20,40,.2)" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
      {Array.from({ length: Math.floor(back / 20) }, (_, i) => (
        <circle key={`b${i}`} cx={ox - ux * (R + 10 + i * 20)} cy={oy - uy * (R + 10 + i * 20)} r="3.5" fill="rgba(255,255,255,.75)" />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={`f${i}`} cx={tip[0] + ux * (18 + i * 26)} cy={tip[1] + uy * (18 + i * 26)} r="4" fill="#fff" opacity={0.75 - i * 0.09} />
      ))}
      <line x1={start[0]} y1={start[1]} x2={tip[0] - ux * 14} y2={tip[1] - uy * 14} stroke="rgba(0,0,0,.35)" strokeWidth="17" strokeLinecap="round" />
      <polygon points={head(1.15)} fill="rgba(0,0,0,.35)" />
      <line x1={start[0]} y1={start[1]} x2={tip[0] - ux * 14} y2={tip[1] - uy * 14} stroke={AIM} strokeWidth="12" strokeLinecap="round" />
      <polygon points={head(1)} fill={AIM} />
    </g>
  );
}

function Clock({ until }) {
  const left = useTimeLeft(until);
  if (left == null) return <span className="foot-clock">--:--</span>;
  const s = Math.ceil(left / 1000);
  return <span className={`foot-clock${s <= 30 ? ' low' : ''}`}>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

export default function FootGame({ snapshot, me, sendAction, matchId }) {
  const v = snapshot.view;
  const F = v.field;
  const portrait = usePortrait();
  const side = v.players[1] === me ? 1 : 0;
  const view = orientation(portrait, side, F);
  const shadow = shadowOffset(view.angle);
  const textAngle = -view.angle;
  const byId = Object.fromEntries(snapshot.players.map(p => [p.userId, p]));
  const name = (u) => (u === me ? 'Toi' : byId[u]?.username);
  const opp = v.players.find(u => u !== me) || v.players[1];
  const meId = v.players.includes(me) ? me : v.players[0];

  const svgRef = useRef(null);
  const fieldRef = useRef(null);
  const animRef = useRef(null);
  const [frame, setFrame] = useState(null);     // positions pendant l'animation d'un tir
  const [goalFlash, setGoalFlash] = useState(null);
  const [aim, setAim] = useState(null);         // { disc, origin, pointer }
  const [, setTick] = useState(0);

  // Rejoue le tir reçu du serveur, image par image (interpolation entre deux images).
  useGameEvents(matchId, (e) => {
    if (e.type !== 'shot') return;
    const { frames, frameMs, goal } = e.payload;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setAim(null);
    const start = performance.now();
    const step = () => {
      const t = (performance.now() - start) / frameMs;
      const i = Math.floor(t);
      if (i >= frames.length - 1) {
        animRef.current = null;
        setFrame(frames[frames.length - 1]);
        if (goal) {
          setGoalFlash({ scorer: goal, own: goal !== e.payload.userId });
          setTimeout(() => { setGoalFlash(null); setFrame(null); }, 1800);
        } else {
          setFrame(null);
        }
        return;
      }
      const a = frames[i]; const b = frames[i + 1]; const k = t - i;
      setFrame(a.map(([x, y], n) => [x + (b[n][0] - x) * k, y + (b[n][1] - y) * k]));
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  });
  useEffect(() => () => animRef.current && cancelAnimationFrame(animRef.current), []);

  // Réafficher quand le tir s'ouvre (fin de l'animation côté serveur).
  useEffect(() => {
    const wait = (v.turnOpensAt || 0) - serverNow();
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setTick(n => n + 1), wait + 30);
    return () => clearTimeout(t);
  }, [v.turnOpensAt, v.seq]);

  const playing = v.status === 'playing';
  const animating = !!frame || !!goalFlash;
  const myTurn = playing && v.phase === 'play' && v.turn === me;
  const canShoot = myTurn && !animating && serverNow() >= v.turnOpensAt;

  // Positions affichées : animation en cours, sinon état officiel.
  const bodies = frame || [...v.discs[v.players[0]], ...v.discs[v.players[1]], v.ball];
  const discsOf = (teamIdx) => bodies.slice(teamIdx * 5, teamIdx * 5 + 5);
  const ballPos = bodies[10];

  function toField(evt) {
    const pt = svgRef.current.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(fieldRef.current.getScreenCTM().inverse());
    return [p.x, p.y];
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
    const p = toField(evt);
    setAim(a => (a ? { ...a, pointer: p } : a));
  }
  async function up() {
    if (!aim) return;
    const a = aim;
    setAim(null);
    let dx = (a.origin[0] - a.pointer[0]) / MAX_DRAG;
    let dy = (a.origin[1] - a.pointer[1]) / MAX_DRAG;
    const len = Math.hypot(dx, dy);
    if (len < MIN_POWER) return;
    if (len > 1) { dx /= len; dy /= len; }
    await sendAction({ type: 'shoot', disc: a.disc, dx: Math.round(dx * 1000) / 1000, dy: Math.round(dy * 1000) / 1000 });
  }

  const pull = aim ? [aim.origin[0] - aim.pointer[0], aim.origin[1] - aim.pointer[1]] : null;
  const power = pull ? Math.min(100, Math.round((Math.hypot(pull[0], pull[1]) / MAX_DRAG) * 100)) : 0;

  let status;
  if (!playing) status = <b>Coup de sifflet final</b>;
  else if (v.phase === 'ending') status = <b>Coup de sifflet final !</b>;
  else if (goalFlash) status = <b>{goalFlash.own ? 'Contre son camp !' : `But de ${name(goalFlash.scorer)} !`}</b>;
  else if (animating) status = <>Tir en cours…</>;
  else if (aim) status = <>Puissance <b>{power} %</b> · relâche pour tirer</>;
  else if (canShoot) status = <><b>À toi !</b> Tire un de tes palets vers l'arrière <Seconds deadline={v.turnDeadline} /></>;
  else if (myTurn) status = <><b>À toi</b> dans un instant…</>;
  else status = <><b>{name(v.turn)}</b> prépare son tir…</>;

  const team = (u) => (v.players[0] === u ? 0 : 1);
  const scoreBox = (u, align) => (
    <div className={`foot-team ${align}${playing && v.turn === u && v.phase === 'play' ? ' active' : ''}`}
      style={{ '--team': TEAMS[team(u)].main, '--team-ring': TEAMS[team(u)].ring }}>
      <TurnAvatar player={byId[u]} color={TEAMS[team(u)].main} active={playing && v.phase === 'play' && v.turn === u && !animating}
        deadline={v.turnDeadline} total={v.turnMs} size={36} />
      <span className="foot-name">{name(u)}</span>
      <span className="foot-score">{v.score[u]}</span>
    </div>
  );

  return (
    <div className={`foot${portrait ? ' portrait' : ''}`}>
      <div className="foot-board">
        {scoreBox(meId, 'left')}
        <Clock until={playing ? v.matchEndsAt : null} />
        {scoreBox(opp, 'right')}
      </div>

      <div className="foot-field-wrap">
        <svg ref={svgRef} className="foot-field" viewBox={view.viewBox} role="img" aria-label="Terrain de Yas Foot"
          onPointerMove={move} onPointerUp={up} onPointerCancel={() => setAim(null)}>
          <defs>
            <pattern id="foot-net" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M0 0 L10 10 M10 0 L0 10" stroke="rgba(255,255,255,.4)" strokeWidth="1.2" />
            </pattern>
            {TEAMS.map((t, i) => (
              <radialGradient key={i} id={`foot-team-${i}`} cx="40%" cy="35%" r="70%">
                <stop offset="0%" stopColor={t.light} />
                <stop offset="65%" stopColor={t.main} />
                <stop offset="100%" stopColor={t.dark} />
              </radialGradient>
            ))}
          </defs>
          <g ref={fieldRef} transform={view.transform}>
            <Pitch F={F} />
            {[0, 1].map(t => discsOf(t).map(([x, y], i) => {
              const owner = v.players[t];
              const mine = owner === me && t === side;
              return (
                <Disc key={`${t}-${i}`} x={x} y={y} R={F.discR} team={t} emoji={avatarStyle(byId[owner]?.avatar).emoji}
                  textAngle={textAngle} shadow={shadow} glow={mine && canShoot && !aim}
                  onPointerDown={mine && canShoot ? (e) => down(i, e) : undefined}
                  label={mine && canShoot ? `Tirer le palet ${i + 1}` : undefined} />
              );
            }))}
            <Ball x={ballPos[0]} y={ballPos[1]} R={F.ballR} shadow={shadow} />
            {aim && <Aim origin={aim.origin} pull={pull} R={F.discR} />}
          </g>
        </svg>
        {goalFlash && (
          <div className="foot-goal" role="status">
            <b>{goalFlash.own ? 'Contre son camp !' : 'BUT !'}</b>
            <span>{goalFlash.own ? `Le but compte pour ${name(goalFlash.scorer)}` : `${name(goalFlash.scorer)} marque`}</span>
          </div>
        )}
      </div>

      <p className="game-status" aria-live="polite">
        <span className="dot" style={{ background: v.turn ? TEAMS[team(v.turn)].main : '#3BA55C' }} /><span>{status}</span>
      </p>
    </div>
  );
}
