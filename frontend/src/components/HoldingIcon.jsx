// Icône dans une forme de maintien (plectre officiel) : Sunshine Yellow + icône
// Midnight Blue ; au survol, inversion (plectre bleu, icône jaune). Le viewBox est
// recadré sur la forme (zone vide retirée), sans changer ses proportions.
import { PLECTRE_PATH } from './Plectre';
import Icon from './Icon';

export default function HoldingIcon({ icon, size = 64, tone = 'yellow', className }) {
  return (
    <span className={`holding-icon ${tone} ${className || ''}`} style={{ width: size, height: size }} aria-hidden>
      <svg className="hi-shape" viewBox="112 218 640 630" width={size} height={size}><path d={PLECTRE_PATH} /></svg>
      <Icon name={icon} size={Math.round(size * 0.42)} className="hi-icon" />
    </span>
  );
}
