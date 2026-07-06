-- Migration : remplacement des anciens tiers par 1er_prix / 2eme_prix / 3eme_prix
-- À exécuter UNE SEULE FOIS sur la base Neon via l'éditeur SQL de neon.tech

-- 1. Supprimer l'ancienne contrainte CHECK (avant la migration des valeurs,
--    sinon les nouveaux tiers sont rejetés par l'ancienne contrainte)
ALTER TABLE prizes DROP CONSTRAINT IF EXISTS prizes_tier_check;

-- 2. Migrer les anciens lots existants vers les nouveaux tiers
UPDATE prizes SET tier = '1er_prix'  WHERE tier = 'grand';
UPDATE prizes SET tier = '2eme_prix' WHERE tier = 'monthly';
UPDATE prizes SET tier = '3eme_prix' WHERE tier IN ('weekly', 'daily');

-- 3. Ajouter la nouvelle contrainte CHECK
ALTER TABLE prizes
  ADD CONSTRAINT prizes_tier_check
  CHECK (tier IN ('1er_prix', '2eme_prix', '3eme_prix'));

-- 4. Changer la valeur par défaut
ALTER TABLE prizes ALTER COLUMN tier SET DEFAULT '1er_prix';
