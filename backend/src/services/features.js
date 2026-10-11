// Fonctionnalités activables depuis le back-office (table clé/valeur `settings`).
const pool = require('../db/pool');

// « Swipe & gagne » (quiz historique) : masqué tant qu'un administrateur ne l'a pas rendu visible.
async function quizVisible(db = pool) {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'quiz_visible'");
  return rows[0]?.value === 'true';
}

async function setQuizVisible(visible, db = pool) {
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('quiz_visible', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [visible ? 'true' : 'false']);
}

// Ce que l'application joueur a besoin de savoir pour afficher ou masquer ses entrées.
async function publicFeatures() {
  return { quiz: await quizVisible() };
}

module.exports = { quizVisible, setQuizVisible, publicFeatures };
