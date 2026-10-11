// Cartes Yas Cards dessinées comme de vraies cartes de jeu de défausse : bord blanc,
// ovale blanc incliné au centre, grand symbole cerné de noir, index dans les coins,
// Jokers noirs à l'ovale quatre couleurs. Dos noir à l'ovale rouge « YAS ».
import { useId } from 'react';

export const COLOR = { red: '#E53935', yellow: '#FBC02D', green: '#3FA34D', blue: '#1E7FE0' };
export const COLOR_NAME = { yellow: 'Jaune', red: 'Rouge', blue: 'Bleu', green: 'Vert' };
const KIND_NAME = { skip: 'Passe', reverse: 'Inverse', draw2: '+2', wild: 'Joker', wild4: 'Joker +4' };
const INK = '#16181D';

export function cardName(c) {
  if (!c) return '';
  if (c.kind === 'number') return `${c.value} ${COLOR_NAME[c.color]}`;
  if (c.kind === 'wild' || c.kind === 'wild4') return KIND_NAME[c.kind];
  return `${KIND_NAME[c.kind]} ${COLOR_NAME[c.color]}`;
}

// Texte cerné de noir avec une ombre portée, comme sur les cartes imprimées.
function Ink({ x, y, size, fill, children, outline = 3.2 }) {
  const common = { x, y, fontSize: size, fontWeight: 900, fontStyle: 'italic', textAnchor: 'middle', dominantBaseline: 'central', fontFamily: 'var(--yas-font)' };
  return (
    <>
      <text {...common} x={x + size * 0.05} y={y + size * 0.05} fill={INK} stroke={INK} strokeWidth={outline} strokeLinejoin="round">{children}</text>
      <text {...common} fill={fill} stroke={INK} strokeWidth={outline} strokeLinejoin="round" paintOrder="stroke">{children}</text>
    </>
  );
}

// Symbole « Passe » : cercle barré.
function Skip({ fill, s = 1 }) {
  return (
    <g transform={`scale(${s})`}>
      <circle r="17" fill="none" stroke={INK} strokeWidth="12" />
      <line x1="-12" y1="12" x2="12" y2="-12" stroke={INK} strokeWidth="12" />
      <circle r="17" fill="none" stroke={fill} strokeWidth="6.5" />
      <line x1="-12" y1="12" x2="12" y2="-12" stroke={fill} strokeWidth="6.5" />
    </g>
  );
}

// Symbole « Inverse » : deux flèches en sens contraires.
function Reverse({ fill, s = 1 }) {
  const arrow = 'M-15 9 L5 -11 L-2 -13 L14 -16 L11 0 L7 -7 L-9 15 Z';
  return (
    <g transform={`scale(${s})`} strokeLinejoin="round">
      <path d={arrow} transform="translate(-6 -6) scale(.9)" fill={fill} stroke={INK} strokeWidth="2.8" />
      <path d={arrow} transform="translate(6 6) rotate(180) scale(.9)" fill={fill} stroke={INK} strokeWidth="2.8" />
    </g>
  );
}

function WildOval({ id }) {
  return (
    <g>
      <defs><clipPath id={id}><ellipse cx="50" cy="75" rx="31" ry="54" transform="rotate(28 50 75)" /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="0" width="50" height="75" fill={COLOR.red} />
        <rect x="50" y="0" width="50" height="75" fill={COLOR.blue} />
        <rect x="0" y="75" width="50" height="75" fill={COLOR.yellow} />
        <rect x="50" y="75" width="50" height="75" fill={COLOR.green} />
      </g>
      <ellipse cx="50" cy="75" rx="31" ry="54" transform="rotate(28 50 75)" fill="none" stroke="#fff" strokeWidth="2.5" />
    </g>
  );
}

function MiniWild() {
  return (
    <g>
      <path d="M0 0 L0 -7 A7 7 0 0 1 7 0 Z" fill={COLOR.blue} />
      <path d="M0 0 L7 0 A7 7 0 0 1 0 7 Z" fill={COLOR.green} />
      <path d="M0 0 L0 7 A7 7 0 0 1 -7 0 Z" fill={COLOR.yellow} />
      <path d="M0 0 L-7 0 A7 7 0 0 1 0 -7 Z" fill={COLOR.red} />
      <circle r="7" fill="none" stroke="#fff" strokeWidth="1.2" />
    </g>
  );
}

export function CardBack({ width = 64 }) {
  return (
    <svg className="card-svg" width={width} height={width * 1.5} viewBox="0 0 100 150" aria-hidden>
      <rect x="0" y="0" width="100" height="150" rx="11" fill="#fff" />
      <rect x="5" y="5" width="90" height="140" rx="8" fill={INK} />
      <ellipse cx="50" cy="75" rx="31" ry="54" transform="rotate(28 50 75)" fill={COLOR.red} />
      <g transform="rotate(-24 50 75)"><Ink x={50} y={75} size={30} fill="#FFD100" outline={2.6}>YAS</Ink></g>
    </svg>
  );
}

export function CardFace({ card, width = 64 }) {
  const wild = card.kind === 'wild' || card.kind === 'wild4';
  const bg = wild ? INK : COLOR[card.color];
  const id = `w${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const corner = (flip) => {
    const t = flip ? 'translate(84 128) rotate(180)' : 'translate(16 22)';
    let content;
    if (card.kind === 'number') content = <Ink x={0} y={0} size={22} fill="#fff" outline={2.4}>{card.value}</Ink>;
    else if (card.kind === 'draw2') content = <Ink x={0} y={0} size={18} fill="#fff" outline={2.2}>+2</Ink>;
    else if (card.kind === 'wild4') content = <Ink x={0} y={0} size={18} fill="#fff" outline={2.2}>+4</Ink>;
    else if (card.kind === 'skip') content = <Skip fill="#fff" s={0.42} />;
    else if (card.kind === 'reverse') content = <Reverse fill="#fff" s={0.48} />;
    else content = <MiniWild />;
    return <g transform={t}>{content}</g>;
  };
  let center;
  if (card.kind === 'number') {
    center = (
      <>
        <Ink x={50} y={74} size={64} fill={bg} outline={3.6}>{card.value}</Ink>
        {(card.value === 6 || card.value === 9) && <rect x="38" y="104" width="24" height="5" rx="2" fill={bg} stroke={INK} strokeWidth="1.6" />}
      </>
    );
  } else if (card.kind === 'draw2') center = <Ink x={50} y={75} size={46} fill={bg} outline={3.4}>+2</Ink>;
  else if (card.kind === 'skip') center = <g transform="translate(50 75)"><Skip fill={bg} s={1.15} /></g>;
  else if (card.kind === 'reverse') center = <g transform="translate(50 75)"><Reverse fill={bg} s={1.25} /></g>;
  else if (card.kind === 'wild4') center = <><WildOval id={id} /><Ink x={50} y={75} size={40} fill="#fff" outline={3.4}>+4</Ink></>;
  else center = <WildOval id={id} />;
  return (
    <svg className="card-svg" width={width} height={width * 1.5} viewBox="0 0 100 150" aria-hidden>
      <rect x="0" y="0" width="100" height="150" rx="11" fill="#fff" />
      <rect x="5" y="5" width="90" height="140" rx="8" fill={bg} />
      {!wild && <ellipse cx="50" cy="75" rx="31" ry="54" transform="rotate(28 50 75)" fill="#fff" />}
      {center}
      {corner(false)}
      {corner(true)}
    </svg>
  );
}
