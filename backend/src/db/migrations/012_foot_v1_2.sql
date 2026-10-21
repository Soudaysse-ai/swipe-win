-- Yas Foot 1.2 : proportions de Soccer Stars (grands buts : 260 de large, 66 de profondeur,
-- ballon plus gros) et placement « Classique » par défaut (gardien sur sa ligne,
-- deux défenseurs, deux attaquants écartés). Les parties déjà jouées gardent
-- leur version de règles.
UPDATE game_rules_versions SET is_current = false WHERE game_id = 'foot' AND version <> '1.2.0';
INSERT INTO game_rules_versions (game_id, version, is_current, rules) VALUES
  ('foot', '1.2.0', true, '{"discsPerTeam":5,"goalsToWin":3,"matchSeconds":300,"ownGoalCounts":true,"setupSeconds":15,"maxPasses":2,"goalWidth":260,"ballRadius":18}')
ON CONFLICT (game_id, version) DO UPDATE SET is_current = true;
