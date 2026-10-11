// « Yas-clamation mark » (le y! seul), découpé dans le logo officiel.
// Navigation de l'application (guide §3.1) : marque Midnight Blue sur barre
// Sunshine Yellow, ou marque jaune sur barre Midnight Blue. Proportions conservées.
import blueS from '../assets/y-mark-blue-48.png';
import blueL from '../assets/y-mark-blue-160.png';
import yellowS from '../assets/y-mark-yellow-48.png';
import yellowL from '../assets/y-mark-yellow-160.png';

const RATIO = 229 / 160;

export default function YasMark({ height = 28, color = 'blue', className, style }) {
  const width = Math.round(height / RATIO);
  const src = color === 'yellow' ? (height > 60 ? yellowL : yellowS) : (height > 60 ? blueL : blueS);
  return <img className={className} src={src} alt="Yas" width={width} height={height} style={{ display: 'block', flexShrink: 0, ...style }} draggable={false} decoding="async" />;
}
