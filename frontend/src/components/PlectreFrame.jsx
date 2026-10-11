// Plectre officiel tourné, avec un halo (le même plectre agrandi, Sunshine Yellow clair) —
// motif des pages web Yas (ex. « Des prix exceptionnels »). Le plectre peut :
//  - « tenir » une image (children = illustration, recadrée par la forme du plectre) ;
//  - ou être plein (fill) avec une icône centrée.
// Boîte carrée + mise à l'échelle uniforme : la forme n'est jamais déformée.
import { useId } from 'react';
import { PLECTRE_PATH } from './Plectre';

// Centre de la boîte englobante du tracé officiel (102, 248, 650 × 585).
const CX = 427;
const CY = 540.5;
const S = 0.74 / 740; // le plectre tourné occupe ~74 % de la boîte, le halo ~96 %

function shape(rotate, k) {
  return `translate(.5 .5) rotate(${rotate}) scale(${S * k}) translate(${-CX} ${-CY})`;
}

export default function PlectreFrame({ size = 160, rotate = 100, fill, halo = '#FFF1B4', children, className }) {
  const id = `pf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <span className={`pframe ${className || ''}`} style={{ width: size, height: size }} aria-hidden>
      {halo && (
        <svg className="pf-layer" viewBox="0 0 1 1"><path d={PLECTRE_PATH} fill={halo} transform={shape(rotate, 1.3)} /></svg>
      )}
      {fill ? (
        <svg className="pf-layer" viewBox="0 0 1 1"><path d={PLECTRE_PATH} fill={fill} transform={shape(rotate, 1)} /></svg>
      ) : (
        <span className="pf-clip" style={{ clipPath: `url(#${id})` }}>{children}</span>
      )}
      {fill && children && <span className="pf-icon">{children}</span>}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <clipPath id={id} clipPathUnits="objectBoundingBox"><path d={PLECTRE_PATH} transform={shape(rotate, 1)} /></clipPath>
      </svg>
    </span>
  );
}
