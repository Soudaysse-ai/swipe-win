// Logo Yas officiel (plectre Midnight Blue, « yas » Sunshine Yellow), rendu depuis
// assets/yas-logo.svg puis recadré au plus près de la forme : `size` est la largeur
// réellement visible du logo (proportions officielles conservées, ≈ 1,1 : 1).
import webpSmall from '../assets/yas-mark-128.webp';
import webpLarge from '../assets/yas-mark-480.webp';
import pngSmall from '../assets/yas-mark-128.png';
import pngLarge from '../assets/yas-mark-480.png';

const RATIO = 434 / 480;

export default function YasLogo({ size = 56, style = {}, className }) {
  const large = size > 64;
  return (
    <picture className={className} style={{ display: 'block', flexShrink: 0, lineHeight: 0 }}>
      <source srcSet={large ? webpLarge : webpSmall} type="image/webp" />
      <img
        src={large ? pngLarge : pngSmall}
        alt="Yas"
        width={size}
        height={Math.round(size * RATIO)}
        style={{ display: 'block', width: size, height: 'auto', ...style }}
        draggable={false}
        decoding="async"
      />
    </picture>
  );
}
