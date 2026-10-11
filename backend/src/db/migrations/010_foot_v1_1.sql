-- Yas Foot 1.1 : avant-match (équipe et formation, 15 s), passes entre coéquipiers
-- (on rejoue, deux fois de suite au plus), palets et ballon plus grands.
-- Les parties déjà jouées gardent leur version de règles (1.0.0).
UPDATE game_rules_versions SET is_current = false WHERE game_id = 'foot' AND version <> '1.1.0';
INSERT INTO game_rules_versions (game_id, version, is_current, rules) VALUES
  ('foot', '1.1.0', true, '{"discsPerTeam":5,"goalsToWin":3,"matchSeconds":300,"ownGoalCounts":true,"setupSeconds":15,"maxPasses":2}')
ON CONFLICT (game_id, version) DO UPDATE SET is_current = true;
-- Durée de l'avant-match réglable dans le back-office (Réglages des jeux).
UPDATE games SET config = config || '{"setupSeconds":15}'::jsonb
 WHERE id = 'foot' AND NOT (config ? 'setupSeconds');
