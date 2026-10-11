// Avatars prédéfinis (aucune photo personnelle stockée) : emoji + fond aux couleurs Yas.
const EMOJI = ['🦁', '🐬', '🦅', '🐢', '⚽', '🎮', '🌴', '🌋', '🐠', '🦉', '🐆', '🌙', '⭐', '🎯', '🚀', '👑'];
const BG = ['#FFD100', '#5F99D2', '#00377D', '#BC4F90', '#3CB167', '#58508C', '#FFE369', '#AFCCE9'];

export const AVATAR_IDS = EMOJI.map((_, i) => `yas-${String(i + 1).padStart(2, '0')}`);

export function avatarStyle(id) {
  if (id === 'bot') return { emoji: '🤖', bg: '#00377D' }; // bots des parties d'entraînement
  const i = Math.max(0, AVATAR_IDS.indexOf(id));
  return { emoji: EMOJI[i], bg: BG[i % BG.length] };
}

export default function Avatar({ id, size = 44, online = false, ring = false, title }) {
  const { emoji, bg } = avatarStyle(id);
  return (
    <span className="avatar" title={title} style={{
      width: size, height: size, background: bg, fontSize: size * 0.52,
      boxShadow: ring ? '0 0 0 3px #FFD100' : undefined,
    }}>
      <span aria-hidden="true">{emoji}</span>
      {online && <span className="online" aria-label="en ligne" />}
    </span>
  );
}
