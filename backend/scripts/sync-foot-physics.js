// Génère frontend/src/games/foot/sim.js à partir de src/games/foot/physics.js :
// même code, exporté en module ES pour le navigateur. À relancer après toute
// modification de la physique (`npm run sync:foot`) ; un test vérifie la copie.
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '../src/games/foot/physics.js');
const TARGET = path.join(__dirname, '../../frontend/src/games/foot/sim.js');

function toEsm(code) {
  const marker = 'module.exports = {';
  if (code.split(marker).length !== 2) throw new Error('physics.js : export attendu « module.exports = { … } » unique');
  if (/\brequire\(/.test(code)) throw new Error('physics.js ne doit rien importer');
  return '// FICHIER GÉNÉRÉ — ne pas modifier : copie de backend/src/games/foot/physics.js\n'
    + '// (npm run sync:foot dans backend/).\n'
    + code.replace(marker, 'export {').replace(/export \{([^}]*)\};\s*$/, (m, names) => `export {${names}};\n`);
}

if (require.main === module) {
  fs.writeFileSync(TARGET, toEsm(fs.readFileSync(SOURCE, 'utf8')));
  console.log(`écrit : ${path.relative(process.cwd(), TARGET)}`);
}

module.exports = { toEsm, SOURCE, TARGET };
