// Drapeaux des équipes de Yas Foot, dessinés en vectoriel (repère 60 × 40) pour
// rester nets sur les palets. Les codes viennent du serveur (`view.options.teams`).
import { useId } from 'react';

export const TEAM_NAMES = {
  km: 'Comores', mg: 'Madagascar', sn: 'Sénégal', ma: 'Maroc', ci: "Côte d'Ivoire", cm: 'Cameroun',
  ng: 'Nigeria', dz: 'Algérie', gh: 'Ghana', eg: 'Égypte', tn: 'Tunisie', fr: 'France',
  br: 'Brésil', ar: 'Argentine', it: 'Italie', jp: 'Japon',
};

// Couleur principale de chaque équipe (bandeau des scores, pastilles).
export const TEAM_COLOR = {
  km: '#3D8E33', mg: '#FC3D32', sn: '#00853F', ma: '#C1272D', ci: '#F77F00', cm: '#007A5E',
  ng: '#008751', dz: '#006233', gh: '#CE1126', eg: '#CE1126', tn: '#E70013', fr: '#0055A4',
  br: '#009C3B', ar: '#74ACDF', it: '#009246', jp: '#BC002D',
};

function star(cx, cy, r, inner = 0.4) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

const vertical = (a, b, c) => (
  <>
    <rect width="20" height="40" fill={a} /><rect x="20" width="20" height="40" fill={b} /><rect x="40" width="20" height="40" fill={c} />
  </>
);
const horizontal = (a, b, c) => (
  <>
    <rect width="60" height="13.4" fill={a} /><rect y="13.3" width="60" height="13.4" fill={b} /><rect y="26.6" width="60" height="13.4" fill={c} />
  </>
);

// Contenu du drapeau dans le repère 0..60 × 0..40.
export function FlagArt({ code }) {
  switch (code) {
    case 'km': return (
      <>
        <rect width="60" height="10" fill="#FFC61E" /><rect y="10" width="60" height="10" fill="#fff" />
        <rect y="20" width="60" height="10" fill="#CE1126" /><rect y="30" width="60" height="10" fill="#3A75C4" />
        <polygon points="0,0 27,20 0,40" fill="#3D8E33" />
        <circle cx="9" cy="20" r="7.2" fill="#fff" /><circle cx="11.6" cy="20" r="6.3" fill="#3D8E33" />
        {[13.6, 17.9, 22.1, 26.4].map(y => <polygon key={y} points={star(12.5, y, 1.3)} fill="#fff" />)}
      </>
    );
    case 'mg': return (<><rect width="60" height="40" fill="#fff" /><rect x="20" width="40" height="20" fill="#FC3D32" /><rect x="20" y="20" width="40" height="20" fill="#007E3A" /></>);
    case 'sn': return (<>{vertical('#00853F', '#FDEF42', '#E31B23')}<polygon points={star(30, 20, 6)} fill="#00853F" /></>);
    case 'ma': return (<><rect width="60" height="40" fill="#C1272D" /><polygon points={star(30, 20, 9, 0.38)} fill="none" stroke="#006233" strokeWidth="1.6" strokeLinejoin="round" /></>);
    case 'ci': return vertical('#F77F00', '#fff', '#009E60');
    case 'cm': return (<>{vertical('#007A5E', '#CE1126', '#FCD116')}<polygon points={star(30, 20, 5.5)} fill="#FCD116" /></>);
    case 'ng': return vertical('#008751', '#fff', '#008751');
    case 'dz': return (
      <>
        <rect width="30" height="40" fill="#006233" /><rect x="30" width="30" height="40" fill="#fff" />
        {/* Croissant : arc extérieur (r 9) puis arc intérieur (r 7,3) entre leurs deux intersections. */}
        <path d="M36.63 13.91 A9 9 0 1 0 36.63 26.09 A7.3 7.3 0 1 1 36.63 13.91 Z" fill="#D21034" />
        <polygon points={star(34.5, 20, 4, 0.42)} fill="#D21034" />
      </>
    );
    case 'gh': return (<>{horizontal('#CE1126', '#FCD116', '#006B3F')}<polygon points={star(30, 20, 6)} fill="#000" /></>);
    case 'eg': return (
      <>
        {horizontal('#CE1126', '#fff', '#000')}
        <path d="M30 14.5 l3 3.5 h-2 v5 h-2 v-5 h-2 z" fill="#C09300" />
        <rect x="27" y="23" width="6" height="2" rx="1" fill="#C09300" />
      </>
    );
    case 'tn': return (
      <>
        <rect width="60" height="40" fill="#E70013" /><circle cx="30" cy="20" r="10" fill="#fff" />
        <circle cx="28.6" cy="20" r="7.4" fill="#E70013" /><circle cx="30.6" cy="20" r="5.9" fill="#fff" />
        <polygon points={star(31.8, 20, 4.2, 0.42)} fill="#E70013" />
      </>
    );
    case 'fr': return vertical('#0055A4', '#fff', '#EF4135');
    case 'br': return (
      <>
        <rect width="60" height="40" fill="#009C3B" /><polygon points="30,4 56,20 30,36 4,20" fill="#FFDF00" />
        <circle cx="30" cy="20" r="9" fill="#002776" />
        <path d="M21.3 18 Q30 15.5 38.8 21.5" stroke="#fff" strokeWidth="1.4" fill="none" />
      </>
    );
    case 'ar': return (<>{horizontal('#74ACDF', '#fff', '#74ACDF')}<circle cx="30" cy="20" r="4" fill="#F6B40E" stroke="#85340A" strokeWidth=".5" /></>);
    case 'it': return vertical('#009246', '#fff', '#CE2B37');
    case 'jp': return (<><rect width="60" height="40" fill="#fff" /><circle cx="30" cy="20" r="11" fill="#BC002D" /></>);
    default: return <rect width="60" height="40" fill="#AFCCE9" />;
  }
}

// Palet vu de dessus : drapeau dans un cercle, cerclage blanc, reflet.
// À placer dans un SVG ; (0, 0) est le centre, r le rayon.
export function FlagDisc({ code, r }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const k = (r * 2) / 40;
  return (
    <g>
      <defs>
        <clipPath id={`fd${id}`}><circle r={r * 0.84} /></clipPath>
        <radialGradient id={`fg${id}`} cx="35%" cy="28%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".28" />
        </radialGradient>
      </defs>
      <circle r={r} fill="#E9EEF5" />
      <circle r={r} fill="none" stroke="#9AA7B8" strokeWidth={r * 0.06} />
      <g clipPath={`url(#fd${id})`}>
        <g transform={`scale(${k * 0.84}) translate(-30 -20)`}><FlagArt code={code} /></g>
      </g>
      <circle r={r * 0.84} fill={`url(#fg${id})`} />
      <circle r={r * 0.84} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={r * 0.04} />
    </g>
  );
}

// Badge rond autonome (sélection d'équipe, écran VS, bandeau des scores).
export function FlagBadge({ code, size = 48, title }) {
  return (
    <svg width={size} height={size} viewBox="-22 -22 44 44" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <FlagDisc code={code} r={21} />
    </svg>
  );
}
