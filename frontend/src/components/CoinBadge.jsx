// Pastille « pièce » Sunshine Yellow (comme « +2 secousses » dans l'appli Yas) :
// valeur en Figtree ExtraBold Italic, libellé court, légère inclinaison.
import Icon from './Icon';

export default function CoinBadge({ value, label, size = 96, className }) {
  return (
    <span className={`coin-badge ${className || ''}`} style={{ width: size, height: size, fontSize: size / 96 * 16 }}>
      <Icon name="star" size={Math.round(size * 0.14)} className="coin-spark" />
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}
