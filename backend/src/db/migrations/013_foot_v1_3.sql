-- Yas Foot 1.3 : belle passe contrôlée (le ballon s'arrête collé au receveur,
-- côté but adverse, sans rebond) et replacement du receveur autour du ballon
-- avant de tirer. Les parties déjà jouées gardent leur version de règles.
UPDATE game_rules_versions SET is_current = false WHERE game_id = 'foot' AND version <> '1.3.0';
INSERT INTO game_rules_versions (game_id, version, is_current, rules) VALUES
  ('foot', '1.3.0', true, '{"discsPerTeam":5,"goalsToWin":3,"matchSeconds":300,"ownGoalCounts":true,"setupSeconds":15,"maxPasses":2,"goalWidth":260,"ballRadius":18,"controlledPass":true,"placeAfterPass":true}')
ON CONFLICT (game_id, version) DO UPDATE SET is_current = true;
