// Illustrations originales et légères (SVG) des jeux. Fond de chaque jeu dans
// une couleur de la charte (les secondaires sont réservées aux illustrations) :
// Cards Sunset, Connect Sky Blue, Penalty Twilight, Ludo Berry, Foot Sea Green.
// fit="meet" : illustration entière, centrée sur sa couleur de fond (vignettes verticales).
export default function GameArt({ gameId, height = 110, fit = 'slice' }) {
  const common = { width: '100%', height, viewBox: '0 0 200 110', preserveAspectRatio: `xMidYMid ${fit}`, 'aria-hidden': true };
  if (gameId === 'connect') {
    const cols = [0, 1, 2, 3, 4, 5, 6];
    const filled = { '1-0': 'y', '2-0': 'b', '2-1': 'y', '3-0': 'y', '3-1': 'b', '3-2': 'y', '4-0': 'b', '4-1': 'y', '4-2': 'b', '4-3': 'y', '5-0': 'b' };
    return (
      <svg {...common} style={{ background: '#5F99D2' }}>
        <rect x="30" y="14" width="140" height="92" rx="14" fill="#00377D" />
        {cols.map(c => [0, 1, 2, 3, 4].map(r => {
          const k = filled[`${c}-${r}`];
          return <circle key={`${c}-${r}`} cx={44 + c * 18.6} cy={94 - r * 17} r="7" fill={k === 'y' ? '#FFD100' : k === 'b' ? '#AFCCE9' : '#002a60'} />;
        }))}
      </svg>
    );
  }
  if (gameId === 'cards') {
    const card = (x, rot, color, label) => (
      <g transform={`translate(${x} 58) rotate(${rot})`}>
        <rect x="-22" y="-32" width="44" height="64" rx="8" fill="#fff" stroke="#00377D" strokeWidth="2" />
        <rect x="-17" y="-27" width="34" height="54" rx="6" fill={color} />
        <text x="0" y="8" textAnchor="middle" fontFamily="Figtree" fontStyle="italic" fontWeight="800" fontSize="22" fill="#fff">{label}</text>
      </g>
    );
    return (
      <svg {...common} style={{ background: '#FFA602' }}>
        {card(68, -14, '#E5484D', '7')}
        {card(100, 0, '#2F6FD6', '+2')}
        {card(132, 14, '#2FA35A', '⟲')}
      </svg>
    );
  }
  if (gameId === 'penalty') {
    return (
      <svg {...common} style={{ background: '#58508C' }}>
        <rect x="0" y="80" width="200" height="30" fill="#3CB167" />
        <rect x="40" y="18" width="120" height="64" fill="none" stroke="#fff" strokeWidth="5" />
        {[...Array(6)].map((_, i) => <line key={i} x1={40 + i * 24} y1="18" x2={40 + i * 24} y2="82" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />)}
        {[...Array(3)].map((_, i) => <line key={`h${i}`} x1="40" y1={34 + i * 16} x2="160" y2={34 + i * 16} stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />)}
        <circle cx="100" cy="96" r="9" fill="#fff" stroke="#00377D" strokeWidth="2" />
        <path d="M96 92l4 3 4-3M97 100l3-2 3 2" stroke="#00377D" strokeWidth="1.5" fill="none" />
        <rect x="118" y="40" width="14" height="30" rx="7" fill="#FFD100" />
        <circle cx="125" cy="34" r="7" fill="#FFD100" />
      </svg>
    );
  }
  if (gameId === 'foot') {
    const disc = (x, y, c, ring) => (
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx="1.5" cy="3" rx="11" ry="10" fill="rgba(0,0,0,.25)" />
        <circle r="11" fill={c} stroke="#fff" strokeWidth="2.5" />
        <circle r="5" fill={ring} />
      </g>
    );
    return (
      <svg {...common} style={{ background: '#3CB167' }}>
        <rect x="22" y="14" width="156" height="82" rx="6" fill="#2E9A57" stroke="#fff" strokeWidth="2.5" />
        {[0, 1, 2, 3, 4, 5].map(i => i % 2 === 0 && <rect key={i} x={22 + i * 26} y="14" width="26" height="82" fill="rgba(255,255,255,.07)" />)}
        <line x1="100" y1="14" x2="100" y2="96" stroke="#fff" strokeWidth="2" />
        <circle cx="100" cy="55" r="15" fill="none" stroke="#fff" strokeWidth="2" />
        <rect x="12" y="40" width="10" height="30" fill="none" stroke="#fff" strokeWidth="2.5" />
        <rect x="178" y="40" width="10" height="30" fill="none" stroke="#fff" strokeWidth="2.5" />
        {disc(52, 36, '#FFD100', '#00377D')}{disc(70, 72, '#FFD100', '#00377D')}
        {disc(140, 40, '#00377D', '#FFD100')}{disc(128, 78, '#00377D', '#FFD100')}
        <circle cx="96" cy="58" r="6.5" fill="#fff" stroke="#16181D" strokeWidth="1.5" />
        <path d="M96 55.2l2.6 1.9-1 3h-3.2l-1-3z" fill="#16181D" />
        <path d="M70 72 L88 62" stroke="#C6F432" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  // ludo
  const base = (x, y, c) => <rect x={x} y={y} width="34" height="34" rx="8" fill={c} />;
  return (
    <svg {...common} style={{ background: '#BC4F90' }}>
      <rect x="55" y="8" width="94" height="94" rx="12" fill="#fff" />
      {base(60, 13, '#E5484D')}{base(110, 13, '#2FA35A')}{base(60, 63, '#2F6FD6')}{base(110, 63, '#FFC400')}
      <rect x="96" y="49" width="12" height="12" fill="#00377D" />
      <g transform="translate(26 70) rotate(-12)">
        <rect x="-14" y="-14" width="28" height="28" rx="7" fill="#fff" stroke="#00377D" strokeWidth="2" />
        <circle cx="-6" cy="-6" r="3" fill="#00377D" /><circle cx="6" cy="6" r="3" fill="#00377D" /><circle cx="0" cy="0" r="3" fill="#00377D" />
      </g>
    </svg>
  );
}
