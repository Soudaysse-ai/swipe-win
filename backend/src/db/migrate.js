// Runner de migrations SQL versionnées (backend/src/db/migrations/NNN_nom.sql).
// Chaque fichier est appliqué une seule fois, dans une transaction, et tracé
// dans schema_migrations. Un verrou consultatif empêche deux instances de
// migrer en même temps.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'migrations');
const LOCK_ID = 727274; // arbitraire, propre à Défi Yas

async function migrate(pool, { log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(200) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    const files = fs.readdirSync(DIR).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        err.message = `Migration ${file} échouée : ${err.message}`;
        throw err;
      }
      applied.push(file);
      log(`✅ migration appliquée : ${file}`);
    }
    if (!applied.length) log('Base à jour, aucune migration à appliquer.');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrate };

if (require.main === module) {
  require('dotenv').config();
  const pool = require('./pool');
  migrate(pool)
    .then(() => pool.end())
    .catch(err => { console.error(err.message); pool.end(); process.exit(1); });
}
