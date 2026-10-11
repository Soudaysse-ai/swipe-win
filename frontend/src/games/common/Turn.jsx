// Éléments communs aux écrans de jeu : temps restant du tour et avatar entouré
// d'un anneau qui se vide pendant le tour du joueur.
import { useEffect, useState } from 'react';
import Avatar from '../../components/Avatar';
import { serverNow } from '../../lib/socket';

// Temps restant (millisecondes) avant l'échéance, mis à jour plusieurs fois par seconde.
export function useTimeLeft(deadline) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : null;
}

export function TurnAvatar({ player, color, active, deadline, total, size = 42 }) {
  const left = useTimeLeft(active ? deadline : null);
  const ratio = left == null ? 1 : Math.min(1, left / total);
  return (
    <span className={`seat-avatar${active ? ' timing' : ''}${active && ratio < 0.3 ? ' low' : ''}`}
      style={{ '--p': ratio, ...(color ? { '--pc': color } : {}) }}
      aria-label={active && left != null ? `${Math.ceil(left / 1000)} secondes restantes` : undefined}>
      <Avatar id={player?.avatar} size={size} online={player?.connected} />
    </span>
  );
}

export function Seconds({ deadline }) {
  const left = useTimeLeft(deadline);
  return left == null ? null : <span className={`status-seconds${left < 8000 ? ' low' : ''}`}>{Math.ceil(left / 1000)} s</span>;
}
