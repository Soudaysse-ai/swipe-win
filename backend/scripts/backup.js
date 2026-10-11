// Sauvegarde de la base avant migration : pg_dump au format custom.
// Usage : DATABASE_URL=... npm run db:backup   (fichier écrit dans ./backups)
require('dotenv').config();
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL manquant'); process.exit(1); }
const dir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
execFileSync('pg_dump', ['--format=custom', '--no-owner', `--file=${file}`, url], { stdio: 'inherit' });
console.log(`✅ Sauvegarde écrite : ${file}`);
