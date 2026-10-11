// Journal des événements analytiques (table analytics_events).
// Ne lève jamais d'erreur : une panne analytics ne doit pas casser le jeu.
const pool = require('../db/pool');

const EVENTS = new Set([
  'user_registered', 'user_logged_in', 'game_opened', 'matchmaking_started', 'room_created',
  'room_joined', 'match_started', 'match_completed', 'match_abandoned', 'friend_invited',
  'invite_accepted', 'tournament_joined', 'leaderboard_viewed', 'training_started',
]);

async function track(eventName, { userId = null, gameId = null, matchId = null, properties = {} } = {}, db = pool) {
  if (!EVENTS.has(eventName)) {
    console.warn(`analytics: événement inconnu ${eventName}`);
    return;
  }
  try {
    await db.query(
      `INSERT INTO analytics_events (event_name, user_id, game_id, match_id, properties)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventName, userId, gameId, matchId, JSON.stringify(properties)]
    );
  } catch (err) {
    console.error('analytics: échec d\'enregistrement', eventName, err.message);
  }
}

module.exports = { track, EVENTS };
