// Élément « Pulse » de la charte Yas : le contour du plectre décalé
// proportionnellement trois fois (version fine). Réservé aux accents de fond,
// au mouvement et aux interactions ; toujours au moins 2 côtés et un angle
// visibles, jamais déformé. Couleur Yas : Sunshine Yellow (100 / 55 / 45 / 25 %).
const PLECTRUM = 'M 309.48 764.36 C 441.15 728.86 571.02 668.14 684.86 591.02 C 762.22 538.59 756.27 456.78 707.37 413.63 C 644.51 358.13 505.18 283.44 397.92 250.29 C 310.83 223.34 230.32 276.41 206.72 359.84 C 192.86 408.85 181.69 458.67 173.49 509.21 C 165.75 557.14 160.79 600.84 158.72 647.33 C 154.76 734.99 222.57 787.70 309.39 764.27 Z';
const CX = 440;
const CY = 505;

export default function Pulse({ size = 320, color = '#FFD100', rotate = 0, opacities = [0.55, 0.45, 0.25], style, className }) {
  const scales = [1.22, 1.46, 1.7];
  return (
    <svg className={className} width={size} height={size} viewBox="-70 0 1080 1020" fill="none" aria-hidden
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, pointerEvents: 'none', ...style }}>
      {scales.map((k, i) => (
        <path key={k} d={PLECTRUM} stroke={color} strokeOpacity={opacities[i]} strokeWidth={34 / k}
          transform={`translate(${CX} ${CY}) scale(${k}) translate(${-CX} ${-CY})`} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
