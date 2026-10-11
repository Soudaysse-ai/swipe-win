// Yas Foot — interface. Toute la physique est calculée par le serveur : l'écran
// rejoue les images du tir reçues (événement « shot ») puis affiche l'état officiel.
// Avant-match : équipe (drapeau), formation et stade, puis écran « VS ».
// Visée à la fronde : pose le doigt sur un de tes palets, tire vers l'arrière
// (la flèche montre la direction, le guide la trajectoire prévue), relâche pour tirer.
// Passe : si ton tir envoie le ballon sur un coéquipier, tu rejoues.
// Ta cage est toujours en bas (téléphone en portrait) ou à gauche (paysage).
import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { Sheet } from '../../components/ui';
import { serverNow } from '../../lib/socket';
import { sfx, useSoundEnabled } from '../../lib/sound';
import { useGameEvents } from '../../player/pages/Match';
import { TurnAvatar, Seconds, useTimeLeft } from '../common/Turn';
import { FlagDisc, FlagBadge, TEAM_NAMES, TEAM_COLOR } from './flags';
import { STADIUMS, Pitch, StadiumThumb, useStadium, MARGIN_SIDE, MARGIN_END } from './stadiums';
import { predict } from './physics';

const MAX_DRAG = 170;   // traction (unités du terrain) pour la pleine puissance
const MIN_POWER = 0.08;
const AIM = '#C6F432';
const PASS = '#7CF0A6';
const VS_MS = 2400;
// Palets neutres tant qu'une équipe n'est pas choisie.
const NEUTRAL = [
  { light: '#FFE566', main: '#FFD100', dark: '#C99A00' },
  { light: '#5F99D2', main: '#1D5FB4', dark: '#00377D' },
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

function Disc({ x, y, R, team, neutral, upright, shadow, glow, onPointerDown, label }) {
  return (
    <g transform={`translate(${x} ${y})`} onPointerDown={onPointerDown} className={onPointerDown ? 'foot-disc mine' : 'foot-disc'}
      role={onPointerDown ? 'button' : undefined} aria-label={label}>
      <circle cx={shadow[0]} cy={shadow[1]} r={R} fill="rgba(0,0,0,.32)" />
      {glow && <circle className="disc-glow" r={R + 8} fill="none" stroke={AIM} strokeWidth="5" />}
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
}

function Ball({ x, y, R, shadow }) {
  const spin = (x + y) * 1.6;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={shadow[0] * 0.7} cy={shadow[1] * 0.7} r={R} fill="rgba(0,0,0,.32)" />
      <g transform={`rotate(${spin})`}>
        <circle r={R} fill="#fff" stroke="#16181D" strokeWidth="1.8" />
        <path d={`M0 ${-R * 0.42} L${R * 0.4} ${-R * 0.13} L${R * 0.25} ${R * 0.34} L${-R * 0.25} ${R * 0.34} L${-R * 0.4} ${-R * 0.13} Z`} fill="#16181D" />
        {[0, 72, 144, 216, 288].map(a => (
          <path key={a} transform={`rotate(${a})`} d={`M${-R * 0.18} ${-R * 0.98} L${R * 0.18} ${-R * 0.98} L${R * 0.1} ${-R * 0.72} L${-R * 0.1} ${-R * 0.72} Z`} fill="#16181D" />
        ))}
      </g>
      <circle r={R} fill="url(#foot-ball-shade)" />
    </g>
  );
}

// Flèche de visée (direction, puissance) et guide de trajectoire prévue.
function Aim({ origin, pull, R, pred, ballR, upright }) {
  const len = Math.hypot(pull[0], pull[1]);
  if (len < 2) return null;
  const power = Math.min(1, len / MAX_DRAG);
  const ux = pull[0] / len; const uy = pull[1] / len;
  const [ox, oy] = origin;
  const start = [ox + ux * (R + 4), oy + uy * (R + 4)];
  const tipLen = R + 22 + power * 130;
  const tip = [ox + ux * tipLen, oy + uy * tipLen];
  const head = (s) => {
    const bx = tip[0] - ux * 26 * s; const by = tip[1] - uy * 26 * s;
    return `${tip[0] + ux * 6 * s},${tip[1] + uy * 6 * s} ${bx - uy * 18 * s},${by + ux * 18 * s} ${bx + uy * 18 * s},${by - ux * 18 * s}`;
  };
  const back = Math.min(len, MAX_DRAG);
  const ballPath = pred?.ball?.length > 1 ? pred.ball : null;
  const end = ballPath ? ballPath[ballPath.length - 1] : null;
  const pathColor = pred?.mate ? PASS : '#fff';
  return (
    <g pointerEvents="none">
      <circle cx={ox} cy={oy} r={MAX_DRAG} fill="rgba(0,20,40,.18)" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
      {Array.from({ length: Math.floor(back / 20) }, (_, i) => (
        <circle key={`b${i}`} cx={ox - ux * (R + 10 + i * 20)} cy={oy - uy * (R + 10 + i * 20)} r="3.5" fill="rgba(255,255,255,.75)" />
      ))}
      {/* Trajet prévu du palet jusqu'au ballon (ou jusqu'à l'arrêt). */}
      {pred?.shooter?.filter((_, i) => i % 3 === 2).map(([x, y], i) => (
        <circle key={`s${i}`} cx={x} cy={y} r="4" fill="#fff" opacity=".65" />
      ))}
      {/* Puis le ballon. */}
      {ballPath && (
        <g>
          <polyline points={ballPath.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="rgba(0,0,0,.3)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 16" />
          <polyline points={ballPath.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={pathColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 16" />
          <circle cx={end[0]} cy={end[1]} r={ballR} fill="none" stroke={pathColor} strokeWidth="3" strokeDasharray="5 5" />
          {pred.mate && (
            <g transform={`translate(${end[0]} ${end[1]}) rotate(${upright}) translate(0 ${-ballR - 22})`}>
              <rect x="-38" y="-15" width="76" height="28" rx="14" fill="#0B5A2E" />
              <text textAnchor="middle" dominantBaseline="central" y="-1" fontSize="17" fontWeight="800" fill="#fff" fontFamily="var(--yas-font)">PASSE</text>
            </g>
          )}
        </g>
      )}
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
  const name = (u) => (u === me ? 'Toi' : byId[u]?.username);
  const opp = v.players.find(u => u !== me) || v.players[1];
  const meId = v.players.includes(me) ? me : v.players[0];
  const [theme, setStadium] = useStadium();
  const [soundOn, setSoundOn] = useSoundEnabled();

  const svgRef = useRef(null);
  const fieldRef = useRef(null);
  const animRef = useRef(null);
  const timers = useRef([]);
  const [frame, setFrame] = useState(null);     // positions pendant l'animation d'un tir
  const [goalFlash, setGoalFlash] = useState(null);
  const [passFlash, setPassFlash] = useState(null);
  const [vsUntil, setVsUntil] = useState(() => (
    v.phase === 'play' && !v.shots[v.players[0]] && !v.shots[v.players[1]] && serverNow() < (v.turnOpensAt || 0) ? v.turnOpensAt : 0));
  const [aim, setAim] = useState(null);         // { disc, origin, pointer }
  const [pred, setPred] = useState(null);
  const [menu, setMenu] = useState(false);
  const [, setTick] = useState(0);

  const later = (ms, fn) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    timers.current.forEach(clearTimeout);
  }, []);

  useGameEvents(matchId, (e) => {
    if (e.type === 'kickoff') {
      setVsUntil(Date.now() + VS_MS);
      sfx.whistle();
      return;
    }
    if (e.type === 'final_whistle') { sfx.whistle(true); return; }
    if (e.type !== 'shot') return;
    // Rejoue le tir reçu du serveur, image par image (interpolation entre deux images).
    const { frames, frameMs, goal, pass, hits = [], power, userId } = e.payload;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setAim(null); setPred(null);
    sfx.kick(power);
    hits.forEach(([f, kind, i]) => later(f * frameMs, () => sfx[kind]?.(i)));
    const start = performance.now();
    const step = () => {
      const t = (performance.now() - start) / frameMs;
      const i = Math.floor(t);
      if (i >= frames.length - 1) {
        animRef.current = null;
        setFrame(frames[frames.length - 1]);
        if (goal) {
          setGoalFlash({ scorer: goal, own: goal !== userId });
          sfx.goal();
          later(1900, () => { setGoalFlash(null); setFrame(null); });
        } else {
          setFrame(null);
          if (pass != null) {
            setPassFlash({ userId, n: (v.passes || 0) + 1 });
            sfx.pass();
            later(1500, () => setPassFlash(null));
          }
        }
        return;
      }
      const a = frames[i]; const b = frames[i + 1]; const k = t - i;
      setFrame(a.map(([x, y], n) => [x + (b[n][0] - x) * k, y + (b[n][1] - y) * k]));
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
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
  const animating = !!frame || !!goalFlash;
  const myTurn = playing && v.phase === 'play' && v.turn === me;
  const canShoot = myTurn && !animating && !vsUntil && serverNow() >= v.turnOpensAt;

  // Petit signal sonore quand la main revient.
  const wasMine = useRef(false);
  useEffect(() => {
    if (canShoot && !wasMine.current) sfx.turn();
    wasMine.current = canShoot;
  }, [canShoot]);

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
  function shotOf(a) {
    let dx = (a.origin[0] - a.pointer[0]) / MAX_DRAG;
    let dy = (a.origin[1] - a.pointer[1]) / MAX_DRAG;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy, len };
  }
  function down(disc, evt) {
    if (!canShoot) return;
    evt.preventDefault();
    svgRef.current.setPointerCapture?.(evt.pointerId);
    const origin = discsOf(side)[disc];
    setAim({ disc, origin, pointer: toField(evt) });
    setPred(null);
  }
  function move(evt) {
    if (!aim) return;
    const a = { ...aim, pointer: toField(evt) };
    setAim(a);
    const { dx, dy, len } = shotOf(a);
    setPred(len >= MIN_POWER ? predict(v, me, a.disc, dx, dy) : null);
  }
  async function up() {
    if (!aim) return;
    const a = aim;
    setAim(null); setPred(null);
    const { dx, dy, len } = shotOf(a);
    if (len < MIN_POWER) return;
    await sendAction({ type: 'shoot', disc: a.disc, dx: Math.round(dx * 1000) / 1000, dy: Math.round(dy * 1000) / 1000 });
  }

  const pull = aim ? [aim.origin[0] - aim.pointer[0], aim.origin[1] - aim.pointer[1]] : null;
  const power = pull ? Math.min(100, Math.round((Math.hypot(pull[0], pull[1]) / MAX_DRAG) * 100)) : 0;
  const team = (u) => v.teams?.[u] || null;
  const color = (u) => TEAM_COLOR[team(u)] || NEUTRAL[v.players[0] === u ? 0 : 1].main;
  const passesLeft = (v.maxPasses || 2) - (v.passes || 0);

  let status;
  if (!playing) status = <b>Coup de sifflet final</b>;
  else if (setup) status = <><b>Avant-match</b> : choisis ton équipe, ta formation et ton stade</>;
  else if (vsUntil) status = <b>Coup d'envoi !</b>;
  else if (v.phase === 'ending') status = <b>Coup de sifflet final !</b>;
  else if (goalFlash) status = <b>{goalFlash.own ? 'Contre son camp !' : `But de ${name(goalFlash.scorer)} !`}</b>;
  else if (animating) status = <>Tir en cours…</>;
  else if (aim) status = <>Puissance <b>{power} %</b>{pred?.mate ? <> · <b>passe</b> en vue</> : null} · relâche pour tirer</>;
  else if (canShoot) status = <><b>{v.passes ? 'Passe réussie, rejoue !' : 'À toi !'}</b> Tire un palet vers l'arrière <Seconds deadline={v.turnDeadline} /></>;
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
      <span className="foot-score">{v.score[u]}</span>
    </div>
  );

  return (
    <div className={`foot${portrait ? ' portrait' : ''}`}>
      <div className="foot-top">
        {onResign && <button type="button" className="foot-icon" onClick={onResign} aria-label="Abandonner"><Icon name="flag" size={20} /></button>}
        <div className="foot-board">
          {scoreBox(meId, 'left')}
          <Clock until={playing && v.phase !== 'setup' ? v.matchEndsAt : null} />
          {scoreBox(opp, 'right')}
        </div>
        <button type="button" className="foot-icon" onClick={() => setMenu(true)} aria-label="Options : son, stade, chat"><Icon name="settings" size={20} /></button>
      </div>

      <div className="foot-field-wrap">
        <svg ref={svgRef} className="foot-field" viewBox={view.viewBox} role="img" aria-label="Terrain de Yas Foot"
          onPointerMove={move} onPointerUp={up} onPointerCancel={() => { setAim(null); setPred(null); }}>
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
            <Pitch F={F} theme={theme} />
            {[0, 1].map(t => discsOf(t).map(([x, y], i) => {
              const owner = v.players[t];
              const mine = owner === me && t === side;
              return (
                <Disc key={`${t}-${i}`} x={x} y={y} R={F.discR} team={team(owner)} neutral={t} upright={upright}
                  shadow={shadow} glow={mine && canShoot && !aim}
                  onPointerDown={mine && canShoot ? (e) => down(i, e) : undefined}
                  label={mine && canShoot ? `Tirer le palet ${i + 1}` : undefined} />
              );
            }))}
            <Ball x={ballPos[0]} y={ballPos[1]} R={F.ballR} shadow={shadow} />
            {aim && <Aim origin={aim.origin} pull={pull} R={F.discR} pred={pred} ballR={F.ballR} upright={upright} />}
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
        {passFlash && (
          <div className="foot-pass" role="status">
            <b>Passe réussie !</b>
            <span>{passFlash.userId === me ? 'Tu rejoues' : `${name(passFlash.userId)} rejoue`}{passesLeft > 0 ? '' : ' (dernière passe)'}</span>
          </div>
        )}
      </div>

      <p className="game-status foot-status" aria-live="polite">
        {snapshot.training && <span className="chip sky foot-training"><Icon name="bot" size={14} /> Entraînement</span>}
        <span className="dot" style={{ background: v.turn ? color(v.turn) : '#3BA55C' }} /><span>{status}</span>
      </p>

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
