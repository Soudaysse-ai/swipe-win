// Dé : le résultat vient toujours du serveur ; l'animation n'est que visuelle.
// Pendant le lancer, les faces défilent puis le dé se pose sur la valeur reçue.
import { useEffect, useState } from 'react';

// Positions des points dans une grille 3 × 3 (colonne, ligne).
const PIPS = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};

function Face({ value, ghost }) {
  return (
    <span className={`die-face${ghost ? ' ghost' : ''}`} aria-hidden>
      {PIPS[value || 6].map(([c, r], i) => <i key={i} style={{ gridColumn: c, gridRow: r }} />)}
    </span>
  );
}

export default function Dice({ value, rolling = false, size = 56, accent = '#00377D', onClick, active = false, disabled = false, label }) {
  const [spin, setSpin] = useState(1);
  useEffect(() => {
    if (!rolling) return undefined;
    const t = setInterval(() => setSpin((n) => {
      let x;
      do { x = 1 + Math.floor(Math.random() * 6); } while (x === n);
      return x;
    }), 90);
    return () => clearInterval(t);
  }, [rolling]);
  const shown = rolling ? spin : value;
  const aria = label || (rolling ? 'Lancer du dé en cours' : value ? `Dé : ${value}` : 'Dé');
  const cls = `die${rolling ? ' rolling' : ''}${value && !rolling ? ' landed' : ''}${active ? ' active' : ''}`;
  const style = { '--die': `${size}px`, '--accent': accent };
  if (onClick) {
    return (
      <button type="button" className={`${cls} as-button`} style={style} onClick={onClick} disabled={disabled} aria-label={label || 'Lancer le dé'}>
        <Face value={shown} ghost={!shown} />
      </button>
    );
  }
  return (
    <span className={cls} style={style} role="img" aria-label={aria} key={rolling ? 'r' : `v${value}`}>
      <Face value={shown} ghost={!shown} />
    </span>
  );
}
