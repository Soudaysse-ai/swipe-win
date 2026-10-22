// Yas Cards — effets visuels de la table (inspirés de Plato « Ocho ») :
//  - Flight : une carte qui vole d'un point à un autre de la table (de la main à
//    la défausse, de la pioche vers un joueur…), en arc, avec rotation, et
//    retournement dos → face si besoin. Animation Web Animations API : fluide,
//    sans re-rendu React pendant le vol.
//  - Burst : l'effet d'une carte spéciale qui vient d'être posée (halo dans sa
//    couleur, grand symbole qui jaillit, étincelles).
//  - DirectionRing : les flèches du sens du jeu autour de la défausse, dans la
//    couleur active, qui tournent doucement.
import { useLayoutEffect, useRef } from 'react';
import { CardFace, CardBack, Ink, Skip, Reverse, MiniWild } from './CardFace';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Rectangle d'un élément dans le repère de la table : centre (x, y) et largeur.
export function rectIn(el, root) {
  if (!el || !root) return null;
  const r = el.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2, w: r.width };
}

/**
 * f = { key, card (null : dos), flip (dos → face), from, to ({ x, y, w, rot }),
 *       delay, duration }. `onDone(key)` à l'arrivée.
 */
export function Flight({ f, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const { from, to } = f;
    const s = from.w / to.w;
    const dx = from.x - to.x; const dy = from.y - to.y;
    const lift = Math.min(60, Math.hypot(dx, dy) * 0.18);
    const r0 = from.rot || 0; const r1 = to.rot || 0;
    const y0 = f.flip ? 180 : 0;
    const t = (x, y, r, sc, ry) => `translate(${x}px, ${y}px) rotate(${r}deg) scale(${sc}) rotateY(${ry}deg)`;
    const timing = { duration: f.duration || 420, delay: f.delay || 0, easing: 'cubic-bezier(.25,.75,.3,1)', fill: 'both' };
    const a = el.animate([
      { transform: t(dx, dy, r0, s, y0), offset: 0 },
      { transform: t(dx * 0.42, dy * 0.42 - lift, (r0 + r1) / 2 + (dx > 0 ? -8 : 8), ((s + 1) / 2) * 1.12, y0 / 2), offset: 0.55 },
      { transform: t(0, 0, r1, 1, 0), offset: 1 },
    ], timing);
    // Retournement : le dos disparaît pile quand la carte est vue de profil (à mi-vol),
    // sans compter sur backface-visibility, mal géré par certains téléphones (la face
    // et le dos y clignotent l'un sur l'autre).
    const swap = (sel, before) => (f.flip && f.card ? el.querySelector(`:scope > ${sel}`) : null)?.animate([
      { opacity: before, offset: 0 }, { opacity: before, offset: 0.549 }, { opacity: 1 - before, offset: 0.55 }, { opacity: 1 - before, offset: 1 },
    ], timing);
    const sides = [swap('.back', 1), swap('.face', 0)];
    a.onfinish = () => onDone(f.key);
    return () => { a.onfinish = null; a.cancel(); sides.forEach(x => x?.cancel()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const w = f.to.w;
  return (
    <div ref={ref} className={`card-flight${f.flip ? ' flip' : ''}`}
      style={{ left: f.to.x - w / 2, top: f.to.y - w * 0.75, width: w, height: w * 1.5 }}>
      {f.card && <span className="face"><CardFace card={f.card} width={w} /></span>}
      {(!f.card || f.flip) && <span className="back"><CardBack width={w} /></span>}
    </div>
  );
}

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7];

// Symbole qui jaillit de la carte spéciale.
function BurstSymbol({ card }) {
  if (card.kind === 'draw2' || card.kind === 'wild4') {
    return (
      <svg viewBox="-60 -40 120 80" className="burst-svg" aria-hidden>
        <Ink x={0} y={0} size={56} fill="#fff" outline={4}>{card.kind === 'draw2' ? '+2' : '+4'}</Ink>
      </svg>
    );
  }
  return (
    <svg viewBox="-40 -40 80 80" className="burst-svg" aria-hidden>
      {card.kind === 'skip' && <Skip fill="#fff" s={1.4} />}
      {card.kind === 'reverse' && <Reverse fill="#fff" s={1.5} />}
      {card.kind === 'wild' && <g transform="scale(4)"><MiniWild /></g>}
    </svg>
  );
}

// Deux couches : `glow` (halo et onde) se place sous la carte, pour qu'elle garde
// sa vraie couleur ; `front` (symbole et étincelles) jaillit au-dessus.
export function Burst({ card, color, layer }) {
  return (
    <div className={`card-burst ${layer}`} style={{ '--c': color }} aria-hidden>
      {layer === 'glow' ? (
        <>
          <span className="burst-halo" />
          <span className="burst-wave" />
        </>
      ) : (
        <>
          <span className="burst-sym"><BurstSymbol card={card} /></span>
          {SPARKS.map(i => <i key={i} className="burst-spark" style={{ '--a': `${i * 45 + 20}deg`, '--d': `${70 + (i % 3) * 18}px` }} />)}
        </>
      )}
    </div>
  );
}

export const isSpecial = (card) => card && card.kind !== 'number';

// Flèches du sens du jeu autour de la défausse.
export function DirectionRing({ color, ccw, spin }) {
  return (
    <svg className={`dir-ring${ccw ? ' ccw' : ''}${spin ? ' spin' : ''}`} viewBox="-100 -100 200 200" style={{ '--c': color }}
      aria-label={ccw ? 'Sens antihoraire' : 'Sens horaire'}>
      <g className="dir-ring-spin">
        <g className="dir-ring-rot">
          <path d="M-62 -48 A78 78 0 0 1 52 -58" />
          <path d="M52 -58 l-14 -2 M52 -58 l-4 13" />
          <path d="M62 48 A78 78 0 0 1 -52 58" />
          <path d="M-52 58 l14 2 M-52 58 l4 -13" />
        </g>
      </g>
    </svg>
  );
}
