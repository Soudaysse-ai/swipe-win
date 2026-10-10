// Logo Yas officiel. Les images sont des rendus du fichier source
// assets/yas-logo.svg (280 Ko, raster intégré) aux tailles affichées :
// ~2 Ko et ~7 Ko au lieu de 280 Ko sur mobile.
import webpSmall from '../assets/yas-logo-96.webp';
import webpLarge from '../assets/yas-logo-400.webp';
import pngSmall from '../assets/yas-logo-96.png';
import pngLarge from '../assets/yas-logo-400.png';

export default function YasLogo({ size = 60, style = {} }) {
  const large = size > 48;
  return (
    <picture style={{ display: 'block', flexShrink: 0 }}>
      <source srcSet={large ? webpLarge : webpSmall} type="image/webp" />
      <img
        src={large ? pngLarge : pngSmall}
        alt="Yas"
        width={size}
        height={Math.round(size * 1.25)}
        style={{ height: 'auto', display: 'block', ...style }}
        draggable={false}
        decoding="async"
      />
    </picture>
  );
}
