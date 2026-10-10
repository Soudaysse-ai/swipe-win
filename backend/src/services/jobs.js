// Tâches périodiques : instantanés des classements (évolution des rangs),
// cohortes de rétention, levée des suspensions expirées, purge des liens de réinitialisation expirés.
const pool = require('../db/pool');
const leaderboards = require('./leaderboards');

let timers = [];

async function liftExpiredSuspensions() {
  await pool.query(
    `UPDATE users SET status = 'active', suspended_until = NULL
      WHERE status = 'suspended' AND suspended_until IS NOT NULL AND suspended_until <= NOW()`);
}

async function purgeResetTokens() {
  await pool.query(`DELETE FROM password_reset_tokens WHERE created_at < NOW() - INTERVAL '7 days'`);
}

// Cohortes : pour chaque jour d'inscription, combien d'inscrits ont été actifs
// (match terminé ou connexion) J+1, J+7, J+30.
async function computeRetention() {
  const { TZ } = require('../lib/time');
  await pool.query(
    `INSERT INTO retention_cohorts (cohort_date, day_offset, cohort_size, retained_users, computed_at)
     SELECT c.cohort_date, o.day_offset, c.size,
            COUNT(DISTINCT a.user_id) FILTER (WHERE (a.created_at AT TIME ZONE $1)::date = c.cohort_date + o.day_offset)::int,
            NOW()
       FROM (SELECT (created_at AT TIME ZONE $1)::date AS cohort_date, COUNT(*)::int AS size, array_agg(id) AS ids
               FROM users WHERE created_at > NOW() - INTERVAL '120 days' GROUP BY 1) c
      CROSS JOIN (VALUES (1), (7), (30)) AS o(day_offset)
       LEFT JOIN analytics_events a ON a.user_id = ANY(c.ids)
            AND a.event_name IN ('user_logged_in','match_completed','match_started','room_joined')
            AND a.created_at >= (c.cohort_date + o.day_offset)::timestamp AT TIME ZONE $1
            AND a.created_at <  (c.cohort_date + o.day_offset + 1)::timestamp AT TIME ZONE $1
      WHERE c.cohort_date + o.day_offset <= (NOW() AT TIME ZONE $1)::date
      GROUP BY c.cohort_date, o.day_offset, c.size
     ON CONFLICT (cohort_date, day_offset) DO UPDATE
       SET cohort_size = EXCLUDED.cohort_size, retained_users = EXCLUDED.retained_users, computed_at = NOW()`,
    [TZ]);
}

async function runAll() {
  for (const [name, fn] of [['suspensions', liftExpiredSuspensions], ['liens de réinitialisation', purgeResetTokens],
    ['classements', leaderboards.snapshot], ['rétention', computeRetention]]) {
    try { await fn(); } catch (err) { console.error(`tâche ${name} échouée`, err.message); }
  }
}

function start() {
  if (process.env.DISABLE_JOBS === 'true') return;
  setTimeout(runAll, 5_000).unref();
  timers.push(setInterval(runAll, 60 * 60_000));
  timers.forEach(t => t.unref());
}

function stop() {
  timers.forEach(clearInterval);
  timers = [];
}

module.exports = { start, stop, runAll, computeRetention, liftExpiredSuspensions };
