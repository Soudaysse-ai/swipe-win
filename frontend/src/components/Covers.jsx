// Illustrations « couverture » : accueil, liste des jeux et page de chaque jeu.
// Scènes vectorielles originales (aucune image externe), dans la palette du jeu,
// animées en douceur (animations coupées si l'appareil demande moins de mouvement).
// Toutes les scènes partagent le cadre 480 × 300 ; la mise en page est dans covers.css.
import { useId } from 'react';
import { CardFace, CardBack } from '../games/cards/CardFace';

const NAVY = '#00377D';
const INK = '#16181D';
const VIEW = { viewBox: '0 0 480 300', 'aria-hidden': true, focusable: 'false' };

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9]/g, '');
}

// ── Éléments communs ─────────────────────────────────────────────────────────

const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.24], [0.27, 0.5], [0.27, 0.76], [0.73, 0.24], [0.73, 0.5], [0.73, 0.76]],
};

// Dé en perspective isométrique (dessus, face gauche, face droite), arête `a`.
function IsoDie({ a = 36, faces = [5, 3, 6] }) {
  const k = 0.866 * a;
  const h = 0.5 * a;
  const sides = [
    { m: [k, h, -k, h, 0, -a], fill: '#FFFFFF' },
    { m: [k, h, 0, a, -k, -h], fill: '#EAF0F8' },
    { m: [-k, h, 0, a, k, -h], fill: '#CFDBEB' },
  ];
  return (
    <g>
      <ellipse cx="2" cy={a + 4} rx={k * 1.1} ry={h * 0.5} fill="rgba(0,0,0,.22)" />
      {sides.map((s, i) => (
        <g key={i} transform={`matrix(${s.m.join(' ')})`}>
          <rect width="1" height="1" rx="0.16" fill={s.fill} stroke="rgba(0,55,125,.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {PIPS[faces[i]].map(([u, v], j) => <circle key={j} cx={u} cy={v} r="0.1" fill={NAVY} />)}
        </g>
      ))}
    </g>
  );
}

// Ballon de football : pentagones noirs, coutures, relief par dégradé.
function Ball({ r = 14 }) {
  const id = useSvgId();
  const pent = (cx, cy, R, rot) => Array.from({ length: 5 }, (_, j) => {
    const t = ((rot + j * 72) * Math.PI) / 180;
    return `${(cx + R * Math.cos(t)).toFixed(2)},${(cy + R * Math.sin(t)).toFixed(2)}`;
  }).join(' ');
  const outer = [0, 1, 2, 3, 4].map(k => (-90 + 36 + k * 72));
  return (
    <g>
      <defs>
        <clipPath id={`bc${id}`}><circle r={r} /></clipPath>
        <radialGradient id={`bg${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#C2CCDA" />
        </radialGradient>
      </defs>
      <circle r={r} fill={`url(#bg${id})`} />
      <g clipPath={`url(#bc${id})`} fill={INK}>
        <polygon points={pent(0, 0, r * 0.36, -90)} />
        {outer.map(a => {
          const t = (a * Math.PI) / 180;
          return <polygon key={a} points={pent(Math.cos(t) * r * 1.02, Math.sin(t) * r * 1.02, r * 0.38, a + 180)} />;
        })}
        {[0, 1, 2, 3, 4].map(k => {
          const t = ((-90 + k * 72) * Math.PI) / 180;
          return <line key={k} x1={Math.cos(t) * r * 0.36} y1={Math.sin(t) * r * 0.36} x2={Math.cos(t) * r * 0.72} y2={Math.sin(t) * r * 0.72} stroke={INK} strokeWidth={r * 0.07} />;
        })}
      </g>
      <circle r={r} fill="none" stroke={INK} strokeWidth={r * 0.06} />
    </g>
  );
}

// Coupe dorée (Sunshine Yellow) frappée d'une étoile Midnight Blue.
function Trophy() {
  const id = useSvgId();
  return (
    <g>
      <defs>
        <linearGradient id={`tg${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#FFE77A" /><stop offset=".45" stopColor="#FFD100" /><stop offset="1" stopColor="#E3A600" />
        </linearGradient>
      </defs>
      <ellipse cx="0" cy="58" rx="46" ry="8" fill="rgba(0,0,0,.25)" />
      <path d="M-34 -40 C-62 -40 -60 -6 -26 -2" fill="none" stroke="#E3A600" strokeWidth="8" strokeLinecap="round" />
      <path d="M34 -40 C62 -40 60 -6 26 -2" fill="none" stroke="#E3A600" strokeWidth="8" strokeLinecap="round" />
      <path d="M-36 -48 H36 V-30 C36 -2 19 14 0 16 C-19 14 -36 -2 -36 -30 Z" fill={`url(#tg${id})`} />
      <ellipse cx="0" cy="-48" rx="36" ry="7" fill="#FFEFA8" />
      <ellipse cx="0" cy="-47" rx="29" ry="4.2" fill="#E3A600" />
      <path d="M0 -36 l4.1 8.3 9.2 1.3 -6.6 6.5 1.6 9.1 -8.3 -4.3 -8.3 4.3 1.6 -9.1 -6.6 -6.5 9.2 -1.3z" fill={NAVY} />
      <rect x="-7" y="15" width="14" height="20" fill="#E3A600" />
      <rect x="-22" y="33" width="44" height="8" rx="3" fill="#FFD100" />
      <rect x="-30" y="40" width="60" height="16" rx="5" fill={NAVY} />
      <rect x="-14" y="45" width="28" height="5" rx="2.5" fill="#FFD100" />
      <path d="M-27 -44 C-27 -20 -20 -6 -12 2" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

// Pion de Ludo debout (base à l'origine).
function Pawn({ color, dark }) {
  return (
    <g>
      <ellipse cx="2" cy="3" rx="14" ry="5" fill="rgba(0,0,0,.28)" />
      <path d="M-12 0 C-12 -7 -6 -11 -4.5 -18 H4.5 C6 -11 12 -7 12 0 Z" fill={color} />
      <ellipse cx="0" cy="0" rx="12" ry="4.2" fill={dark} />
      <ellipse cx="0" cy="-18" rx="6.5" ry="2.4" fill={dark} />
      <circle cx="0" cy="-25" r="8.5" fill={color} />
      <ellipse cx="-3" cy="-28" rx="3" ry="2" fill="#fff" opacity=".6" />
    </g>
  );
}

// Jeton de Yas Connect.
function Token({ r = 14, color = 'yellow' }) {
  const fill = color === 'yellow' ? '#FFD100' : '#5F99D2';
  const ring = color === 'yellow' ? '#E0AE00' : '#3B78B8';
  return (
    <g>
      <circle r={r} fill={fill} />
      <circle r={r * 0.68} fill="none" stroke={ring} strokeWidth={r * 0.12} />
      <ellipse cx={-r * 0.35} cy={-r * 0.4} rx={r * 0.28} ry={r * 0.18} fill="#fff" opacity=".55" />
    </g>
  );
}

function Sparkle({ x, y, s = 1, color = '#fff', className = 'cv-twinkle', delay = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className={className} style={{ animationDelay: `${delay}s` }} d="M0 -9 C1 -2 2 -1 9 0 C2 1 1 2 0 9 C-1 2 -2 1 -9 0 C-2 -1 -1 -2 0 -9Z" fill={color} />
    </g>
  );
}

// Carte posée (centrée sur x, y), inclinée de `rot` degrés.
function PlacedCard({ x, y, rot = 0, width = 64, card, back = false }) {
  const h = width * 1.5;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) translate(${-width / 2} ${-h / 2})`}>
      {back ? <CardBack width={width} /> : <CardFace card={card} width={width} />}
    </g>
  );
}

// Groupe animé : la position reste sur le <g> parent, l'animation CSS sur l'enfant.
function Float({ x, y, kind = 'cv-f1', delay = 0, children }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={kind} style={delay ? { animationDelay: `${delay}s` } : undefined}>{children}</g>
    </g>
  );
}

const CONFETTI = [
  [118, 46, 10, 4, 24, '#FFD100'], [168, 268, 9, 4, -30, '#AFCCE9'], [205, 30, 7, 7, 15, '#fff'],
  [262, 58, 10, 4, 60, '#5F99D2'], [458, 160, 9, 4, -45, '#FFD100'], [300, 280, 8, 4, 35, '#fff'],
  [470, 26, 7, 7, 20, '#AFCCE9'], [140, 150, 8, 4, 70, '#FFD100'], [380, 205, 6, 6, 10, '#fff'],
  [96, 238, 8, 4, -20, '#5F99D2'], [250, 300, 9, 4, 50, '#FFD100'], [420, 290, 8, 4, -60, '#AFCCE9'],
];

// ── Accueil et liste des jeux : la coupe entourée des quatre jeux ────────────

export function HomeScene({ className }) {
  const id = useSvgId();
  return (
    <svg className={className} {...VIEW} preserveAspectRatio="xMaxYMid meet">
      <defs>
        <radialGradient id={`hg${id}`}>
          <stop offset="0" stopColor="#5F99D2" stopOpacity=".55" /><stop offset="1" stopColor="#5F99D2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="338" cy="150" r="170" fill={`url(#hg${id})`} />
      {CONFETTI.map(([x, y, w, h, r, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="1.5" fill={c} transform={`rotate(${r} ${x} ${y})`} className="cv-twinkle" style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
      ))}
      <Float x={242} y={104} kind="cv-f2"><PlacedCard x={0} y={0} rot={-16} width={62} card={{ kind: 'number', color: 'red', value: 7 }} /></Float>
      <Float x={444} y={96} kind="cv-f3" delay={0.8}><PlacedCard x={0} y={0} rot={14} width={54} card={{ kind: 'wild4' }} /></Float>
      <Float x={168} y={206} kind="cv-f3" delay={0.4}><Token r={15} color="yellow" /></Float>
      <Float x={398} y={34} kind="cv-f2" delay={1.2}><Token r={11} color="blue" /></Float>
      <Float x={338} y={168} kind="cv-f1"><g transform="scale(1.28)"><Trophy /></g></Float>
      <Float x={246} y={234} kind="cv-f2" delay={0.6}><IsoDie a={28} /></Float>
      <Float x={440} y={232} kind="cv-f1" delay={1}><g className="cv-spin-slow"><Ball r={25} /></g></Float>
      <Float x={392} y={276} kind="cv-f3" delay={0.3}><Pawn color="#2FA35A" dark="#1E7A40" /></Float>
      <Sparkle x={282} y={82} s={1.2} color="#FFD100" />
      <Sparkle x={398} y={146} s={0.8} delay={0.9} />
      <Sparkle x={196} y={64} s={0.7} delay={1.6} />
    </svg>
  );
}

// ── Yas Foot : stade, pelouse en perspective, tir vers le but ────────────────

const CROWD = Array.from({ length: 96 }, (_, i) => {
  const row = Math.floor(i / 24);
  const col = i % 24;
  const c = ['#FFFFFF', '#FFD100', '#AFCCE9', '#FFFFFF', '#5F99D2'][(i * 7 + row) % 5];
  return [8 + col * 20 + (row % 2) * 10, 12 + row * 13, c];
});

function FootDisc({ x, y, r, team }) {
  const main = team === 'home' ? '#FFD100' : NAVY;
  const side = team === 'home' ? '#C99A00' : '#00224F';
  const ring = team === 'home' ? NAVY : '#FFD100';
  return (
    <g>
      <ellipse cx={x + 3} cy={y + r * 0.42 + 3} rx={r * 1.02} ry={r * 0.42} fill="rgba(0,0,0,.3)" />
      <ellipse cx={x} cy={y + r * 0.18} rx={r} ry={r * 0.5} fill={side} />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.5} fill={main} stroke="#fff" strokeWidth="2" />
      <ellipse cx={x} cy={y} rx={r * 0.5} ry={r * 0.25} fill={ring} />
      <ellipse cx={x - r * 0.4} cy={y - r * 0.2} rx={r * 0.22} ry={r * 0.08} fill="#fff" opacity=".6" />
    </g>
  );
}

export function FootScene({ className }) {
  const id = useSvgId();
  const bands = [80, 98, 119, 143, 171, 203, 240, 282, 330];
  const net = [];
  for (let x = 258; x < 308; x += 7) net.push(<line key={`v${x}`} x1={x} y1="56" x2={x} y2="80" />);
  for (let y = 62; y < 80; y += 6) net.push(<line key={`h${y}`} x1="252" y1={y} x2="308" y2={y} />);
  return (
    <svg className={className} {...VIEW} preserveAspectRatio="xMidYMid slice">
      <defs>
        <clipPath id={`pc${id}`}><polygon points="110,80 450,80 600,330 -40,330" /></clipPath>
        <radialGradient id={`fl${id}`}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".9" /><stop offset=".25" stopColor="#FFF6C2" stopOpacity=".45" /><stop offset="1" stopColor="#FFF6C2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="72" fill="#0E4F2A" />
      {CROWD.map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="2.6" fill={c} opacity=".38" className={i % 9 === 0 ? 'cv-twinkle' : undefined} style={i % 9 === 0 ? { animationDelay: `${(i % 4) * 0.7}s` } : undefined} />)}
      <g>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <g key={i}>
            <rect x={110 + i * 42.5} y="68" width="42.5" height="12" fill={i % 2 ? '#FFD100' : NAVY} />
            <text x={110 + i * 42.5 + 21.25} y="77.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fontStyle="italic" fontFamily="var(--yas-font)" fill={i % 2 ? NAVY : '#FFD100'}>DÉFI YAS</text>
          </g>
        ))}
      </g>
      <g clipPath={`url(#pc${id})`}>
        {bands.slice(0, -1).map((y, i) => <rect key={y} x="-60" y={y} width="600" height={bands[i + 1] - y} fill={i % 2 ? '#2E9A57' : '#36A862'} />)}
      </g>
      <g fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2.2">
        <polyline points="-40,330 110,80 450,80 600,330" />
        <polygon points="208,80 352,80 360.8,112 199.2,112" />
        <line x1="31.8" y1="200" x2="528" y2="200" />
        <ellipse cx="280" cy="200" rx="80" ry="28" />
      </g>
      <ellipse cx="280" cy="200" rx="3.5" ry="1.6" fill="#fff" />
      <ellipse cx="280" cy="98" rx="2.6" ry="1.2" fill="#fff" />
      <g>
        <rect x="252" y="56" width="56" height="24" fill="rgba(255,255,255,.14)" />
        <g stroke="#fff" strokeOpacity=".45" strokeWidth="1">{net}</g>
        <polyline points="252,80 252,56 308,56 308,80" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" />
      </g>
      <FootDisc x={282} y={93} r={12} team="away" />
      <FootDisc x={232} y={132} r={17} team="away" />
      <FootDisc x={338} y={126} r={16} team="away" />
      <path className="cv-dash" d="M300 224 Q 296 192 290 170" fill="none" stroke="#C6F432" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" />
      <FootDisc x={300} y={232} r={27} team="home" />
      <FootDisc x={422} y={276} r={31} team="home" />
      <g transform="translate(290 165)"><g className="cv-shot"><Ball r={10} /></g></g>
      <circle cx="40" cy="8" r="70" fill={`url(#fl${id})`} />
      <circle cx="440" cy="8" r="70" fill={`url(#fl${id})`} />
    </svg>
  );
}

// ── Yas Cards : éventail de cartes, pioche, soleil tournant ─────────────────

export function CardsScene({ className }) {
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a = (i * 20 * Math.PI) / 180;
    const d = (4 * Math.PI) / 180;
    const R = 460;
    return `0,0 ${(R * Math.cos(a - d)).toFixed(1)},${(R * Math.sin(a - d)).toFixed(1)} ${(R * Math.cos(a + d)).toFixed(1)},${(R * Math.sin(a + d)).toFixed(1)}`;
  });
  const fan = [
    [-32, { kind: 'number', color: 'yellow', value: 3 }],
    [-16, { kind: 'skip', color: 'green' }],
    [0, { kind: 'number', color: 'red', value: 7 }],
    [16, { kind: 'draw2', color: 'blue' }],
    [32, { kind: 'wild4' }],
  ];
  return (
    <svg className={className} {...VIEW} preserveAspectRatio="xMidYMid slice">
      <g transform="translate(330 175)"><g className="cv-spin">{rays.map((p, i) => <polygon key={i} points={p} fill="#fff" opacity=".1" />)}</g></g>
      <PlacedCard x={438} y={214} rot={20} width={72} back />
      <PlacedCard x={432} y={208} rot={14} width={72} back />
      <PlacedCard x={426} y={202} rot={8} width={72} back />
      <g className="cv-sway" style={{ transformOrigin: '336px 318px' }}>
        {fan.map(([rot, card]) => (
          <g key={rot} transform={`translate(336 318) rotate(${rot}) translate(-44 -238)`}>
            <CardFace card={card} width={88} />
          </g>
        ))}
      </g>
      <Float x={214} y={70} kind="cv-f2"><PlacedCard x={0} y={0} rot={-20} width={58} card={{ kind: 'reverse', color: 'blue' }} /></Float>
      <Float x={128} y={132} kind="cv-f3" delay={0.7}><PlacedCard x={0} y={0} rot={12} width={44} card={{ kind: 'wild' }} /></Float>
      <Sparkle x={262} y={40} s={1.1} />
      <Sparkle x={460} y={110} s={0.8} delay={0.8} />
      <Sparkle x={160} y={120} s={0.7} color="#FFF3B0" delay={1.4} />
    </svg>
  );
}

// ── Yas Ludo : plateau en perspective, pions debout, deux dés ───────────────

const LUDO = { red: '#E5484D', green: '#2FA35A', yellow: '#FFC400', blue: '#2F6FD6' };

export function LudoScene({ className }) {
  const s = 1.22;
  const X = 312;
  const Y = 36;
  const iso = (x, y) => [X + 0.866 * s * (x - y), Y + 0.5 * s * (x + y)];
  const cells = [];
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const inV = c >= 6 && c <= 8;
      const inH = r >= 6 && r <= 8;
      if ((inV || inH) && !(inV && inH)) {
        let fill = '#fff';
        if (c === 7 && r >= 1 && r <= 5) fill = LUDO.green;
        if (c === 7 && r >= 9 && r <= 13) fill = LUDO.blue;
        if (r === 7 && c >= 1 && c <= 5) fill = LUDO.red;
        if (r === 7 && c >= 9 && c <= 13) fill = LUDO.yellow;
        if (r === 6 && c === 1) fill = LUDO.red;
        if (r === 1 && c === 8) fill = LUDO.green;
        if (r === 8 && c === 13) fill = LUDO.yellow;
        if (r === 13 && c === 6) fill = LUDO.blue;
        cells.push(<rect key={`${r}-${c}`} x={c * 10} y={r * 10} width="10" height="10" fill={fill} stroke="#D5DCE6" strokeWidth=".8" />);
      }
    }
  }
  const base = (x, y, color) => (
    <g key={color}>
      <rect x={x} y={y} width="60" height="60" fill={color} />
      <rect x={x + 9} y={y + 9} width="42" height="42" rx="6" fill="#fff" />
      {[[21, 21], [39, 21], [21, 39], [39, 39]].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={x + dx} cy={y + dy} r="5.5" fill={color} opacity=".85" />)}
    </g>
  );
  const L = iso(0, 150); const B = iso(150, 150); const R = iso(150, 0);
  const pawns = [
    [20, 20, 'red'], [35, 65, 'red'], [85, 25, 'green'], [118, 75, 'yellow'], [75, 112, 'blue'], [20, 120, 'blue'],
  ].map(([x, y, c]) => [...iso(x, y), c]).sort((a, b) => a[1] - b[1]);
  const dark = { red: '#B4282D', green: '#1E7A40', yellow: '#D49F00', blue: '#1D4FA6' };
  return (
    <svg className={className} {...VIEW} preserveAspectRatio="xMidYMid slice">
      <polygon points={`${L[0]},${L[1]} ${B[0]},${B[1]} ${B[0]},${B[1] + 12} ${L[0]},${L[1] + 12}`} fill="#E6D3DF" />
      <polygon points={`${B[0]},${B[1]} ${R[0]},${R[1]} ${R[0]},${R[1] + 12} ${B[0]},${B[1] + 12}`} fill="#C9AFC0" />
      <g transform={`matrix(${0.866 * s} ${0.5 * s} ${-0.866 * s} ${0.5 * s} ${X} ${Y})`}>
        <rect width="150" height="150" fill="#fff" />
        {base(0, 0, LUDO.red)}{base(90, 0, LUDO.green)}{base(90, 90, LUDO.yellow)}{base(0, 90, LUDO.blue)}
        {cells}
        <polygon points="60,60 60,90 75,75" fill={LUDO.red} />
        <polygon points="60,60 90,60 75,75" fill={LUDO.green} />
        <polygon points="90,60 90,90 75,75" fill={LUDO.yellow} />
        <polygon points="60,90 90,90 75,75" fill={LUDO.blue} />
        <rect width="150" height="150" fill="none" stroke="#fff" strokeWidth="3" />
      </g>
      {pawns.map(([x, y, c], i) => (
        <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
          <g className={i === 3 ? 'cv-hop' : undefined}><Pawn color={LUDO[c]} dark={dark[c]} /></g>
        </g>
      ))}
      <Float x={128} y={226} kind="cv-tumble"><IsoDie a={34} faces={[6, 2, 4]} /></Float>
      <Float x={204} y={258} kind="cv-tumble" delay={0.5}><IsoDie a={30} faces={[5, 3, 1]} /></Float>
      <Sparkle x={96} y={150} s={1} color="#FFD100" />
      <Sparkle x={460} y={52} s={0.8} delay={0.7} />
      <Sparkle x={248} y={196} s={0.6} delay={1.3} />
    </svg>
  );
}

// ── Yas Connect : grille, diagonale gagnante, jeton qui tombe ───────────────

export function ConnectScene({ className }) {
  const cx = (c) => 196 + 7 + 17 + c * 34;
  const cy = (r) => 26 + 7 + 17 + r * 34;
  const filled = {
    '0-5': 'blue', '1-5': 'yellow', '2-5': 'yellow', '3-5': 'blue', '4-5': 'blue', '5-5': 'blue', '6-5': 'yellow',
    '1-4': 'blue', '3-4': 'yellow', '4-4': 'blue', '5-4': 'yellow',
    '4-3': 'yellow', '5-3': 'blue',
  };
  const holes = [];
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 6; r++) {
      const k = filled[`${c}-${r}`];
      holes.push(k
        ? <g key={`${c}-${r}`} transform={`translate(${cx(c)} ${cy(r)})`}><Token r={12.5} color={k} /></g>
        : <circle key={`${c}-${r}`} cx={cx(c)} cy={cy(r)} r="12.5" fill="#0A2C5E" />);
    }
  }
  return (
    <svg className={className} {...VIEW} preserveAspectRatio="xMidYMid slice">
      <rect x="202" y="32" width="252" height="218" rx="20" fill="#002456" />
      <rect x="196" y="26" width="252" height="218" rx="20" fill={NAVY} />
      <rect x="202" y="30" width="240" height="5" rx="2.5" fill="#fff" opacity=".12" />
      <path d="M214 244 L204 270 H240 L246 244 Z M430 244 L440 270 H404 L398 244 Z" fill="#002456" />
      {holes}
      <g transform={`translate(${cx(5)} ${cy(2)})`}>
        <g className="cv-drop"><Token r={12.5} color="yellow" /></g>
      </g>
      <g className="cv-win" fill="none" stroke="#fff" strokeLinecap="round">
        <line x1={cx(2)} y1={cy(5)} x2={cx(5)} y2={cy(2)} strokeWidth="5" strokeOpacity=".75" />
        {[[2, 5], [3, 4], [4, 3], [5, 2]].map(([c, r]) => <circle key={c} cx={cx(c)} cy={cy(r)} r="15.5" strokeWidth="3" />)}
      </g>
      <Float x={126} y={70} kind="cv-f2"><Token r={18} color="blue" /></Float>
      <Float x={150} y={170} kind="cv-f3" delay={0.6}><Token r={13} color="yellow" /></Float>
      <Sparkle x={140} y={40} s={1} color="#FFD100" />
      <Sparkle x={470} y={30} s={0.8} delay={0.9} />
      <Sparkle x={60} y={150} s={0.6} delay={1.5} />
    </svg>
  );
}

const SCENES = { foot: FootScene, cards: CardsScene, ludo: LudoScene, connect: ConnectScene };

export function GameScene({ gameId, className }) {
  const Scene = SCENES[gameId] || HomeScene;
  return <Scene className={className} />;
}
