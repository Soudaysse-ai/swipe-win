// Logo Yas officiel, rendu depuis assets/yas-logo.svg puis recadré au plus près
// de la forme, couleurs ramenées aux valeurs exactes de la charte (le fichier
// source était légèrement terni). Variantes (guide « App Design », §3.1) :
//  - variant="secondary" (défaut) : plectre Midnight Blue, « yas » jaune → fond jaune ou clair
//  - variant="primary" : plectre Sunshine Yellow, « yas » bleu → fond Midnight Blue
// `size` = largeur visible ; proportions d'origine conservées (jamais déformé).
import secWebpS from '../assets/yas-mark-128.webp';
import secWebpL from '../assets/yas-mark-480.webp';
import secPngS from '../assets/yas-mark-128.png';
import secPngL from '../assets/yas-mark-480.png';
import priWebpS from '../assets/yas-mark-primary-128.webp';
import priWebpL from '../assets/yas-mark-primary-480.webp';
import priPngS from '../assets/yas-mark-primary-128.png';
import priPngL from '../assets/yas-mark-primary-480.png';

const SRC = {
  secondary: { s: [secWebpS, secPngS], l: [secWebpL, secPngL] },
  primary: { s: [priWebpS, priPngS], l: [priWebpL, priPngL] },
};
const RATIO = 434 / 480;

export default function YasLogo({ size = 56, variant = 'secondary', style = {}, className }) {
  const [webp, png] = (SRC[variant] || SRC.secondary)[size > 64 ? 'l' : 's'];
  return (
    <picture className={className} style={{ display: 'block', flexShrink: 0, lineHeight: 0 }}>
      <source srcSet={webp} type="image/webp" />
      <img src={png} alt="Yas" width={size} height={Math.round(size * RATIO)}
        style={{ display: 'block', width: size, height: 'auto', ...style }} draggable={false} decoding="async" />
    </picture>
  );
}
