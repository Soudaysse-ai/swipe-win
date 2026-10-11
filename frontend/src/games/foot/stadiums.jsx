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
export const MARGIN_SIDE = 44;
export const MARGIN_END = 16;

// Public des tribunes : points de couleur répartis de façon déterministe.
function Crowd({ x, y, w, h, colors, seed }) {
  const dots = [];
  const cols = Math.floor(w / 11);
  const rows = Math.max(1, Math.floor(h / 10));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = (c * 7 + r * 13 + seed * 3) % 17;
      if (k > 13) continue;
      dots.push(<circle key={`${r}-${c}`} cx={x + 6 + c * 11 + (r % 2) * 5} cy={y + 5 + r * 10} r="3.3" fill={colors[k % colors.length]} opacity={0.55 + (k % 3) * 0.15} />);
    }
  }
  return <g>{dots}</g>;
}

export function Pitch({ F, theme }) {
  const { W, H, goalTop: GT, goalBottom: GB, goalDepth: D, postR } = F;
  const M = MARGIN_SIDE; const E = MARGIN_END;
  const line = { stroke: theme.lines, strokeWidth: 3, fill: 'none' };
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
        {rect(0, 150, 105, 495)}
        {rect(0, 60, 165, 435)}
        <circle cx={x(112)} cy={H / 2} r="4" fill={theme.lines} />
        <path d={`M${x(150)} ${H / 2 - 55} A 75 75 0 0 ${mirror ? 0 : 1} ${x(150)} ${H / 2 + 55}`} {...line} />
      </g>
    );
  };
  // Arc de coin (vers l'intérieur) et petit drapeau planté vers l'extérieur.
  const corner = (cx, cy) => {
    const sx = cx === 0 ? 1 : -1; const sy = cy === 0 ? 1 : -1;
    return (
      <g>
        <path d={`M${cx} ${cy + sy * 14} A14 14 0 0 ${sx * sy > 0 ? 0 : 1} ${cx + sx * 14} ${cy}`} {...line} strokeWidth="2.5" />
        <line x1={cx} y1={cy} x2={cx} y2={cy - sy * 22} stroke="#fff" strokeWidth="2.5" />
        <polygon points={`${cx},${cy - sy * 22} ${cx - sx * 13},${cy - sy * 17} ${cx},${cy - sy * 12}`} fill="#E5484D" />
      </g>
    );
  };
  const stripes = [];
  for (let i = 0; i < 10; i++) stripes.push(<rect key={i} x={i * 100} y="0" width="100" height={H} fill={theme.grass[i % 2]} />);
  return (
    <g>
      <rect x={-D - E} y={-M} width={W + 2 * (D + E)} height={H + 2 * M} fill={theme.bg} />
      {/* Tribunes le long des deux touches */}
      <rect x="-6" y={-M + 2} width={W + 12} height={M - 12} rx="8" fill={theme.stands} />
      <rect x="-6" y={H + 10} width={W + 12} height={M - 12} rx="8" fill={theme.stands} />
      <Crowd x={-2} y={-M + 5} w={W + 4} h={M - 18} colors={theme.crowd} seed={1} />
      <Crowd x={-2} y={H + 13} w={W + 4} h={M - 18} colors={theme.crowd} seed={2} />
      {theme.boards && [0, 1].map(side => Array.from({ length: 10 }, (_, i) => (
        <g key={`${side}-${i}`}>
          <rect x={i * 100} y={side ? H + 3 : -9} width="100" height="6" fill={i % 2 ? '#FFD100' : '#5F99D2'} />
        </g>
      )))}
      {stripes}
      {theme.sand && Array.from({ length: 60 }, (_, i) => (
        <circle key={i} cx={(i * 173) % W} cy={(i * 97) % H} r="2" fill="#C9A866" opacity=".5" />
      ))}
      <rect x="0" y="0" width={W} height={H} {...line} />
      <line x1={W / 2} y1="0" x2={W / 2} y2={H} {...line} />
      <circle cx={W / 2} cy={H / 2} r="90" {...line} />
      <circle cx={W / 2} cy={H / 2} r="5" fill={theme.lines} />
      {half(false)}{half(true)}
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
