-- Yas Foot : football de table à deux joueurs (5 palets chacun, tir à la fronde).
-- Premier à 3 buts ou 5 minutes de jeu ; 20 s pour tirer à chaque tour.
INSERT INTO games (id, name, description, min_players, max_players, rating_system, sort_order, config) VALUES
  ('foot', 'Yas Foot', 'Tire tes palets, pousse le ballon et marque avant ton adversaire.', 2, 2, 'elo', 5,
   '{"turnSeconds":20,"matchSeconds":300,"goalsToWin":3,"reconnectSeconds":60,"maxTimeouts":3,"minActionsForValid":2}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_rules_versions (game_id, version, is_current, rules) VALUES
  ('foot', '1.0.0', true, '{"discsPerTeam":5,"goalsToWin":3,"matchSeconds":300,"ownGoalCounts":true}')
ON CONFLICT (game_id, version) DO NOTHING;
