// color : couleur d'illustration du jeu (charte Yas) ; tint : sa teinte 20-30 %
// pour les halos et fonds légers (Sunset 30, Sky Blue 20, Berry 30, Sea Green 20).
export const GAME_META = {
  cards:   { name: 'Yas Cards',   players: '2–4 joueurs', color: '#FFA602', tint: '#FFE4B3', art: 'cards' },
  connect: { name: 'Yas Connect', players: '2 joueurs',   color: '#5F99D2', tint: '#DFEBF6', art: 'connect' },
  ludo:    { name: 'Yas Ludo',    players: '2–4 joueurs', color: '#BC4F90', tint: '#EBCADE', art: 'ludo' },
  foot:    { name: 'Yas Foot',    players: '2 joueurs',   color: '#3CB167', tint: '#CDEFD9', art: 'foot' },
};

export const PERIOD_LABELS = { week: 'Cette semaine', month: 'Ce mois', season: 'Saison', all: 'Historique' };

// Jeux retirés : seul leur nom reste, pour l'historique des parties.
const RETIRED = { penalty: 'Yas Penalty' };

export function gameName(id) { return GAME_META[id]?.name || RETIRED[id] || id; }

export function formatDuration(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m) return `${m} min ${String(s % 60).padStart(2, '0')}`;
  return `${s} s`;
}

export function percent(x) {
  return x == null ? '—' : `${Math.round(x * 100)} %`;
}

export function timeAgo(date) {
  const d = (Date.now() - new Date(date).getTime()) / 1000;
  if (d < 60) return 'à l\'instant';
  if (d < 3600) return `il y a ${Math.floor(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function formatDate(date) {
  return new Date(date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const OUTCOME_LABEL = { win: 'Victoire', loss: 'Défaite', draw: 'Nul', placed: 'Classé' };

export function placeLabel(n) { return n === 1 ? '1er' : `${n}e`; }
