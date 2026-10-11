// Migration d'une base Swipe & Win existante vers Défi Yas 2.0 :
// aucune donnée perdue, rôles admin convertis, ancien joueur relié à son nouveau compte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://defiyas:defiyas@localhost:5432/defiyas_test';
process.env.DISABLE_RATE_LIMIT = 'true';
const pool = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');

test.after(() => pool.end());

test('migration additive d\'une base existante', async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  // Ancien schéma, tel qu'en production (avant tiers 1er/2ème/3ème prix compris).
  await pool.query(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  await pool.query(`INSERT INTO admins (email, password_hash, role) VALUES ('boss@yas.km','x','superadmin'), ('ed@yas.km','x','editor')`);
  const p = await pool.query(`INSERT INTO players (phone, name) VALUES ('+2694123456', 'Ancien') RETURNING id`);
  const s = await pool.query(`INSERT INTO sessions (player_id, score, ended_at) VALUES ($1, 42, NOW()) RETURNING id`, [p.rows[0].id]);
  await pool.query(`INSERT INTO questions (id, text_fr, answer) VALUES ('q1', 'Question ?', true)`);
  // Doublon historique (faille S3) : la migration ne doit pas échouer ni supprimer.
  await pool.query(`INSERT INTO answers (session_id, question_id, is_correct, response_time_ms) VALUES ($1,'q1',true,100), ($1,'q1',true,100)`, [s.rows[0].id]);

  const applied = await migrate(pool, { log: () => {} });
  assert.deepEqual(applied, ['001_legacy_baseline.sql', '002_platform.sql', '003_reference_data.sql', '004_email_reset.sql', '005_training_bots.sql', '006_longer_turns.sql', '007_yas_foot.sql', '008_retire_penalty.sql', '009_quiz_visibility.sql', '010_foot_v1_1.sql']);
  assert.deepEqual(await migrate(pool, { log: () => {} }), [], 'ré-exécution sans effet');

  const counts = await pool.query(`SELECT (SELECT COUNT(*) FROM players)::int AS players, (SELECT COUNT(*) FROM sessions)::int AS sessions,
    (SELECT COUNT(*) FROM answers)::int AS answers, (SELECT COUNT(*) FROM questions)::int AS questions`);
  assert.deepEqual(counts.rows[0], { players: 1, sessions: 1, answers: 2, questions: 1 });
  const roles = await pool.query('SELECT email, role FROM admins ORDER BY email');
  assert.deepEqual(roles.rows, [{ email: 'boss@yas.km', role: 'super_admin' }, { email: 'ed@yas.km', role: 'platform_admin' }]);

  // L'ancien joueur crée son compte Défi Yas avec le même numéro → lien conservé.
  const auth = require('../../src/services/authService');
  const { user } = await auth.register({ phone: '+2694123456', password: 'motdepasse123', username: 'Ancien', acceptTerms: true });
  assert.equal(user.legacy_player_id, p.rows[0].id);
});
