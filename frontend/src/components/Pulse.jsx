// Pulse officiel (épais) — tracés de assets/brand/Yas_Pulse_Transparent_Wide.svg :
// le plectre décalé proportionnellement trois fois, Sunshine Yellow à 20 / 40 / 70 / 100 %.
// L'ombre verte du fichier d'export est un artefact CMJN : elle n'est pas reprise.
// Jamais étiré : le viewBox d'origine (1043 × 1080) est conservé, seule la rotation varie.
import { PLECTRE_PATH } from './Plectre';

const LAYERS = [
  { o: 0.2, d: 'M410.6,981.8c-87,0-167.2-33.8-225.9-95.2-59.5-62.3-90.1-146-86-235.8,1.8-39.7,5.9-78.3,12.9-121.5,7-43,16.6-86.2,28.6-128.5,42.6-150.6,174.1-251.8,327.1-251.8s68,5.2,101,15.4c104,32.1,229.4,99.5,298.1,160.2,72.3,63.8,110.3,155.2,104.2,250.7-6.3,98.8-57.3,185.4-143.5,243.8-100.5,68.1-213.8,120.3-327.6,150.9-29.4,7.9-59.3,11.9-89,11.9h0Z' },
  { o: 0.4, d: 'M410.6,902.9c-65.3,0-125.2-25.2-168.9-70.8-44.5-46.6-67.3-109.7-64.2-177.7,1.7-36.6,5.5-72.3,12-112.5,6.5-40,15.5-80.3,26.6-119.7,32.9-116.3,133.9-194.4,251.2-194.4s52.3,4,77.7,11.8c93.1,28.8,208.8,90.6,269.2,144,53.9,47.6,82.2,115.6,77.7,186.6-4.7,73.9-43.4,139.1-109,183.5-93.4,63.2-198.5,111.7-303.9,140.1-22.7,6.1-45.8,9.2-68.5,9.2h0Z' },
  { o: 0.7, d: 'M410.6,823.6c-43.4,0-82.9-16.4-111.5-46.3-29.4-30.8-44.4-73.1-42.3-119.3,1.5-33.4,5-66.3,11.1-103.3,6-37,14.3-74.3,24.6-110.8,23.1-81.8,93.4-136.7,174.8-136.7s36.5,2.8,54.3,8.3c82.4,25.5,187.9,81.5,240.1,127.6,35.4,31.2,54,75.7,51,122-3.1,48.9-29.5,92.5-74.3,122.8-86.2,58.4-183,103-280,129.2-16,4.3-32.1,6.5-47.8,6.5h0Z' },
  { o: 1, d: 'M438,741.8c90-24.3,178.8-65.8,256.6-118.4,52.9-35.8,48.8-91.8,15.4-121.2-43-37.9-138.2-89-211.6-111.6-59.5-18.4-114.6,17.9-130.7,74.9-9.5,33.5-17.1,67.6-22.7,102.1-5.3,32.8-8.7,62.6-10.1,94.4-2.7,59.9,43.7,95.9,103,79.9Z' },
];

// Forme pleine (« solid ») : mêmes couches en teintes opaques, identiques au rendu
// du fichier transparent sur fond blanc — lisible aussi sur fond Sunshine Yellow.
const SOLID = ['#FFF6CC', '#FFEDA0', '#FFDF4D', '#FFD100'];

// Le noyau du Pulse est exactement le plectre officiel à l'échelle 400 / 650 :
// boîtes englobantes mesurées — plectre (102, 248, 650 × 585), noyau (335, 386, 400 × 360).
const K = 400 / 650;
const PLECTRE_IN_CORE = `translate(${335 - 102 * K} ${386 - 248 * K}) scale(${K})`;

// core=false : seulement les trois couches extérieures.
// plectre : le noyau devient le plectre Midnight Blue (le Pulse « rayonne » autour).
export default function Pulse({ size = 320, rotate = 0, core = true, solid = false, plectre = false, color = '#FFD100', style, className, animated = false }) {
  return (
    <svg className={`${className || ''}${animated ? ' pulse-anim' : ''}`} width={size} height={size * (1080 / 1043)} viewBox="0 0 1043 1080" aria-hidden
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, pointerEvents: 'none', ...style }}>
      {LAYERS.filter((_, i) => (core && !plectre) || i < 3).map((l, i) => (
        <path key={i} d={l.d} fill={solid ? SOLID[i] : color} fillOpacity={solid ? 1 : l.o} className={`pl-${i}`} />
      ))}
      {plectre && <path d={PLECTRE_PATH} fill="#00377D" transform={PLECTRE_IN_CORE} />}
    </svg>
  );
}
