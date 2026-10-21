// Stades de Yas Foot : choix purement visuel, propre à chaque joueur et mémorisé
// sur son appareil. Le terrain est dessiné dans le repère du moteur (W × H).
import { useEffect, useState } from 'react';

export const STADIUMS = [
  {
    id: 'standard', name: 'Standard', grass: ['#3FAE60', '#379B54'], bg: '#2A8547', stands: '#1C5F35',
    crowd: ['#FFFFFF', '#FFD100', '#E5484D', '#5F99D2', '#2FA35A'], lines: 'rgba(255,255,255,.9)',
  },
  {
    id: 'nuit', name: 'Nocturne', grass: ['#2E8049', '#29723F'], bg: '#071629', stands: '#0C2238',
    crowd: ['#FFFFFF', '#FFD100', '#5F99D2'], lines: 'rgba(255,255,255,.88)', lights: true,
  },
  {
    id: 'plage', name: 'Plage de Moroni', grass: ['#EBD39C', '#E3C688'], bg: '#1FAFC4', stands: '#1798AB',
    crowd: ['#FFFFFF', '#FFD100', '#F77F00', '#E5484D'], lines: 'rgba(255,255,255,.96)', sand: true,
  },
  {
    id: 'yas', name: 'Arène Yas', grass: ['#3FAE60', '#369A52'], bg: '#00377D', stands: '#002B63',
    crowd: ['#FFD100', '#FFFFFF', '#5F99D2'], lines: 'rgba(255,255,255,.92)', boards: true,
  },
];

const KEY = 'dy_foot_stadium';
const listeners = new Set();
let current = (() => {
  try { const v = localStorage.getItem(KEY); return STADIUMS.some(s => s.id === v) ? v : 'standard'; } catch { return 'standard'; }
})();

export function useStadium() {
  const [id, setId] = useState(current);
  useEffect(() => { listeners.add(setId); return () => { listeners.delete(setId); }; }, []);
  const set = (v) => {
    current = v;
    try { localStorage.setItem(KEY, v); } catch { /* stockage indisponible */ }
    listeners.forEach(fn => fn(v));
  };
  return [STADIUMS.find(s => s.id === id) || STADIUMS[0], set];
}

// Marges autour du terrain (unités du terrain) : tribunes le long des touches,
// cages et un peu d'herbe derrière les lignes de but.
export const MARGIN_SIDE = 58;
export const MARGIN_END = 24;

// Public des tribunes : gradins et spectateurs répartis de façon déterministe.
function Stand({ x, y, w, h, colors, seed, theme, flip }) {
  const rows = 3;
  const rh = (h - 6) / rows;
  const dots = [];
  for (let r = 0; r < rows; r++) {
    const cy = flip ? y + h - 6 - rh * (r + 0.5) : y + 6 + rh * (r + 0.5);
    for (let c = 0, cx = x + 8 + (r % 2) * 5; cx < x + w - 6; c++, cx += 10.5) {
      const k = (c * 7 + r * 13 + seed * 5) % 19;
      if (k > 15) continue;
      dots.push(<circle key={`${r}-${c}`} cx={cx} cy={cy - 1.5} r="3.6" fill={colors[k % colors.length]} opacity={0.62 + (k % 3) * 0.12} />);
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="7" fill={theme.stands} />
      {Array.from({ length: rows - 1 }, (_, r) => (
        <line key={r} x1={x + 4} x2={x + w - 4} y1={y + 3 + rh * (r + 1)} y2={y + 3 + rh * (r + 1)} stroke="rgba(0,0,0,.25)" strokeWidth="2" />
      ))}
      {dots}
      <rect x={x} y={y} width={w} height={h} rx="7" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="2.5" />
    </g>
  );
}

export function Pitch({ F, theme }) {
  const { W, H, goalTop: GT, goalBottom: GB, goalDepth: D, postR } = F;
  const M = MARGIN_SIDE; const E = MARGIN_END;
  const id = theme.id;
  const line = { stroke: theme.lines, strokeWidth: 3.5, fill: 'none' };
  // Cage métallique façon Soccer Stars : filet quadrillé, gros cadre gris clair cerné, poteaux ronds.
  const goal = (x0, dir) => {
    const back = x0 + dir * D;
    const net = [];
    for (let k = 1; k < 5; k++) net.push(<line key={`d${k}`} x1={x0 + (dir * D * k) / 5} y1={GT} x2={x0 + (dir * D * k) / 5} y2={GB} />);
    for (let y = GT + 18; y < GB; y += 18) net.push(<line key={`h${y}`} x1={x0} y1={y} x2={back} y2={y} />);
    const frame = `M${x0} ${GT} H${back} V${GB} H${x0}`;
    return (
      <g>
        <rect x={Math.min(x0, back)} y={GT} width={D} height={GB - GT} fill="rgba(0,0,0,.18)" />
        <g stroke="rgba(255,255,255,.78)" strokeWidth="1.8">{net}</g>
        <path d={frame} stroke="#5E6874" strokeWidth="14" fill="none" strokeLinejoin="round" />
        <path d={frame} stroke="#E9ECF0" strokeWidth="8.5" fill="none" strokeLinejoin="round" />
        <path d={frame} stroke="#fff" strokeWidth="2.5" fill="none" strokeLinejoin="round" opacity=".8" transform={`translate(${dir * -1.5} -1.5)`} />
        {[GT, GB].map(y => (
          <g key={y}>
            <circle cx={x0} cy={y} r={postR + 5} fill="#5E6874" />
            <circle cx={x0} cy={y} r={postR + 2} fill="#F4F6F8" />
            <circle cx={x0 - 1.5} cy={y - 1.5} r={postR * 0.6} fill="#fff" />
          </g>
        ))}
      </g>
    );
  };
  // Une seule surface devant chaque but, avec son arc, comme dans Soccer Stars.
  const half = (mirror) => {
    const x = (v) => (mirror ? W - v : v);
    const bw = 300; const bd = 96;
    return (
      <g>
        <rect x={Math.min(x(0), x(bd))} y={H / 2 - bw / 2} width={bd} height={bw} {...line} />
        <path d={`M${x(bd)} ${H / 2 - 62} A 62 62 0 0 ${mirror ? 0 : 1} ${x(bd)} ${H / 2 + 62}`} {...line} />
      </g>
    );
  };
  // Bordures grises en relief autour du terrain (ouvertes devant les buts), en panneaux.
  const T = 13;
  const board = (x, y, w, h, key) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={`url(#board-${id})`} stroke="#7D8794" strokeWidth="2" />
    </g>
  );
  const boards = [
    board(-T, -T, W + 2 * T, T, 'top'), board(-T, H, W + 2 * T, T, 'bottom'),
    board(-T, -T, T, GT - postR + T, 'l1'), board(-T, GB + postR, T, H - GB - postR + T, 'l2'),
    board(W, -T, T, GT - postR + T, 'r1'), board(W, GB + postR, T, H - GB - postR + T, 'r2'),
  ];
  const joints = [];
  for (let x = 125; x < W; x += 125) {
    joints.push(<line key={`t${x}`} x1={x} x2={x} y1={-T + 2} y2={-2} stroke="#8F99A5" strokeWidth="1.6" />);
    joints.push(<line key={`b${x}`} x1={x} x2={x} y1={H + 2} y2={H + T - 2} stroke="#8F99A5" strokeWidth="1.6" />);
  }
  // Petit drapeau de coin, planté sur la bordure.
  const corner = (cx, cy) => {
    const sx = cx === 0 ? 1 : -1; const sy = cy === 0 ? 1 : -1;
    const fx = cx - sx * T * 0.5; const fy = cy - sy * T * 0.5;
    return (
      <g>
        <path d={`M${cx} ${cy + sy * 16} A16 16 0 0 ${sx * sy > 0 ? 0 : 1} ${cx + sx * 16} ${cy}`} {...line} strokeWidth="2.5" />
        <line x1={fx} y1={fy} x2={fx} y2={fy - sy * 24} stroke="#fff" strokeWidth="3" />
        <polygon points={`${fx},${fy - sy * 24} ${fx - sx * 15},${fy - sy * 18} ${fx},${fy - sy * 12}`} fill={cy === 0 ? '#E5484D' : '#3D8BFF'} />
      </g>
    );
  };
  const bands = 12;
  const bw = W / bands;
  const stripes = [];
  for (let i = 0; i < bands; i++) stripes.push(<rect key={i} x={i * bw} y="0" width={bw + 0.5} height={H} fill={theme.grass[i % 2]} />);
  return (
    <g>
      <defs>
        {/* Herbe tondue : léger motif en losanges, comme les terrains de Soccer Stars */}
        <pattern id={`grain-${id}`} width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="17" height="17" fill="#fff" opacity=".055" />
          <rect x="17" y="17" width="17" height="17" fill="#fff" opacity=".055" />
        </pattern>
        <pattern id={`turf-${id}`} width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="1" fill="#000" opacity=".08" /><circle cx="7" cy="7" r=".9" fill="#fff" opacity=".06" />
        </pattern>
        <radialGradient id={`vig-${id}`} cx="50%" cy="50%" r="70%">
          <stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".26" />
        </radialGradient>
        <linearGradient id={`board-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2F4F7" /><stop offset=".55" stopColor="#D3D8DF" /><stop offset="1" stopColor="#B4BCC6" />
        </linearGradient>
      </defs>
      <rect x={-D - E} y={-M} width={W + 2 * (D + E)} height={H + 2 * M} fill={theme.bg} />
      <rect x={-D - E} y={-M} width={W + 2 * (D + E)} height={H + 2 * M} fill={`url(#turf-${id})`} />
      {/* Tribunes le long des deux touches */}
      <Stand x={-8} y={-M + 3} w={W + 16} h={M - T - 9} colors={theme.crowd} seed={1} theme={theme} />
      <Stand x={-8} y={H + T + 6} w={W + 16} h={M - T - 9} colors={theme.crowd} seed={2} theme={theme} flip />
      {stripes}
      {theme.sand && Array.from({ length: 70 }, (_, i) => (
        <circle key={i} cx={(i * 173) % W} cy={(i * 97) % H} r="2" fill="#C9A866" opacity=".5" />
      ))}
      <rect x="0" y="0" width={W} height={H} fill={`url(#grain-${id})`} />
      <rect x="0" y="0" width={W} height={H} fill={`url(#turf-${id})`} />
      <rect x="0" y="0" width={W} height={H} fill={`url(#vig-${id})`} />
      <rect x="0" y="0" width={W} height={H} {...line} />
      <line x1={W / 2} y1="0" x2={W / 2} y2={H} {...line} />
      <circle cx={W / 2} cy={H / 2} r="122" {...line} />
      <circle cx={W / 2} cy={H / 2} r="8" fill={theme.lines} />
      {half(false)}{half(true)}
      {boards}
      {joints}
      {theme.boards && [0, 1].map(side => Array.from({ length: 8 }, (_, i) => (
        <rect key={`${side}-${i}`} x={i * 125 + 8} y={side ? H + 4 : -T + 4} width="109" height="5" rx="2" fill={i % 2 ? '#FFD100' : '#5F99D2'} />
      )))}
      {corner(0, 0)}{corner(W, 0)}{corner(0, H)}{corner(W, H)}
      {goal(0, -1)}{goal(W, 1)}
      {theme.lights && [[-D, -M], [W + D, -M], [-D, H + M], [W + D, H + M]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="260" fill="url(#foot-light)" />
      ))}
    </g>
  );
}

// Aperçu miniature d'un stade (choix du stade).
export function StadiumThumb({ theme }) {
  return (
    <svg viewBox="-20 -24 240 168" aria-hidden className="stadium-thumb">
      <defs>
        <radialGradient id="foot-light-thumb">
          <stop offset="0" stopColor="#FFF6C2" stopOpacity=".8" /><stop offset="1" stopColor="#FFF6C2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="-20" y="-24" width="240" height="168" fill={theme.bg} />
      <rect x="-4" y="-20" width="208" height="14" rx="4" fill={theme.stands} />
      <rect x="-4" y="126" width="208" height="14" rx="4" fill={theme.stands} />
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={i * 20} y="0" width="20" height="120" fill={theme.grass[i % 2]} />)}
      <rect x="0" y="0" width="200" height="120" fill="none" stroke={theme.lines} strokeWidth="2" />
      <line x1="100" y1="0" x2="100" y2="120" stroke={theme.lines} strokeWidth="2" />
      <circle cx="100" cy="60" r="18" fill="none" stroke={theme.lines} strokeWidth="2" />
      <rect x="-9" y="40" width="9" height="40" fill="none" stroke="#fff" strokeWidth="2" />
      <rect x="200" y="40" width="9" height="40" fill="none" stroke="#fff" strokeWidth="2" />
      {theme.boards && <rect x="0" y="-6" width="200" height="4" fill="#FFD100" />}
      {theme.lights && <circle cx="-10" cy="-14" r="40" fill="url(#foot-light-thumb)" />}
    </svg>
  );
}
