const { Pool } = require('pg');
require('dotenv').config();

const useSSL = /sslmode=require/.test(process.env.DATABASE_URL || '') || process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
});

// Une erreur sur un client inactif (coupure réseau Neon, etc.) ne doit pas
// arrêter tout le serveur de jeu : on journalise, le pool recrée la connexion.
pool.on('error', (err) => {
  console.error('Erreur PostgreSQL (client inactif)', err.message);
});

// Exécute fn(client) dans une transaction.
pool.tx = async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = pool;
