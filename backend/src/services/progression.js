// Règles de progression (XP, niveaux, ligues, points de saison) — fonctions pures.

// XP total nécessaire pour atteindre le niveau N : 100 × (N − 1)².
const xpForLevel = (n) => 100 * (n - 1) ** 2;

function levelForXp(xp) {
  let n = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  // garde-fou contre les arrondis flottants
  while (xpForLevel(n + 1) <= xp) n++;
  while (n > 1 && xpForLevel(n) > xp) n--;
  return n;
}

function levelProgress(xp) {
  const level = levelForXp(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, levelStartXp: start, nextLevelXp: next, progress: (xp - start) / (next - start) };
}

const XP = {
  MATCH_COMPLETED: 10,
  WIN_BONUS: 20,
  DRAW_BONUS: 10,
  FIRST_MATCH_OF_DAY: 5,
  DAILY_CHALLENGE: 15,
};

// Points de saison (classement global).
// placement : 1..4 ; isDraw pour un nul en 1v1 ; playerCount pour savoir si 1v1.
function seasonPointsFor({ placement, isDraw, playerCount }) {
  if (isDraw) return 10;
  if (placement === 1) return 30;
  if (playerCount <= 2) return 0; // en 1v1 : victoire ou défaite seulement
  return { 2: 15, 3: 8, 4: 3 }[placement] || 0;
}

const SEASON_DAILY_CAP_PER_GAME = 10;

const LEAGUES = [
  { name: 'Bronze', min: -Infinity },
  { name: 'Silver', min: 900 },
  { name: 'Gold', min: 1100 },
  { name: 'Platinum', min: 1300 },
  { name: 'Diamond', min: 1500 },
  { name: 'Legend', min: 1800 },
];

// leagues : liste [{name, min_rating}] issue de la base (seuils calibrables par jeu).
function leagueFor(rating, leagues) {
  const list = leagues && leagues.length
    ? leagues.map(l => ({ name: l.name, min: Number(l.min_rating) })).sort((a, b) => a.min - b.min)
    : LEAGUES;
  let current = list[0].name;
  for (const l of list) if (rating >= l.min) current = l.name;
  return current;
}

// Défi quotidien : jeu du jour déterministe (rotation sur les 4 jeux), objectif = gagner 1 partie.
const CHALLENGE_ROTATION = ['connect', 'ludo', 'cards', 'foot'];
// localDay : 'YYYY-MM-DD' (jour local des Comores, cf. lib/time.js)
function dailyChallenge(localDay) {
  const day = Math.floor(Date.parse(`${localDay}T00:00:00Z`) / 86400000);
  const gameId = CHALLENGE_ROTATION[day % CHALLENGE_ROTATION.length];
  return { date: localDay, gameId, goal: 'win', label: 'Gagne une partie' };
}

module.exports = {
  xpForLevel, levelForXp, levelProgress, XP, seasonPointsFor, SEASON_DAILY_CAP_PER_GAME, leagueFor, LEAGUES, dailyChallenge,
};
