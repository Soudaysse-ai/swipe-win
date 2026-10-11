// Plectre (« holding shape ») officiel — tracé de assets/brand/Play_CMYK.svg.
// Proportions toujours conservées (viewBox d'origine 863,8 × 1080) ; seule la
// rotation peut varier. Couleurs : Midnight Blue ou Sunshine Yellow.
export const PLECTRE_PATH = 'M269.1,826.6c146.2-39.4,290.4-106.8,416.8-192.4,85.9-58.2,79.3-149,25-196.9-69.8-61.6-224.5-144.5-343.6-181.3-96.7-29.9-186.1,29-212.3,121.6-15.4,54.4-27.8,109.7-36.9,165.8-8.6,53.2-14.1,101.7-16.4,153.3-4.4,97.3,70.9,155.8,167.3,129.8h.1Z';
export const PLECTRE_VIEWBOX = '0 0 863.8 1080';
const COLORS = { blue: '#00377D', yellow: '#FFD100' };

export default function Plectre({ color = 'blue', size = 200, rotate = 0, style = {}, className }) {
  return (
    <svg className={className} width={size} height={size * (1080 / 863.8)} viewBox={PLECTRE_VIEWBOX} aria-hidden
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }}>
      <path fill={COLORS[color] || color} d={PLECTRE_PATH} />
    </svg>
  );
}
