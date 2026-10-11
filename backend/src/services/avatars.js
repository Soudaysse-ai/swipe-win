// Avatars prédéfinis (rendus côté client : emoji + couleur de fond Yas).
const AVATARS = Array.from({ length: 16 }, (_, i) => `yas-${String(i + 1).padStart(2, '0')}`);
module.exports = { AVATARS, isValidAvatar: (a) => AVATARS.includes(a) };
