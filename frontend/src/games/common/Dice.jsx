// Dé : le résultat vient toujours du serveur ; l'animation n'est que visuelle.
const PIPS = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export default function Dice({ value, rolling, size = 64, color = '#00377D' }) {
  const v = value || 1;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={value ? `Dé : ${value}` : 'Dé'}
      style={{ animation: rolling ? 'dice-roll .6s ease-out' : undefined, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.2))' }}>
      <rect x="4" y="4" width="92" height="92" rx="20" fill="#fff" stroke={color} strokeWidth="5" />
      {value && PIPS[v].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={color} />)}
      {!value && <text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="800" fill={color}>?</text>}
      <style>{'@keyframes dice-roll { 0% { transform: rotate(0) scale(.7) } 60% { transform: rotate(320deg) scale(1.1) } 100% { transform: rotate(360deg) scale(1) } }'}</style>
    </svg>
  );
}
