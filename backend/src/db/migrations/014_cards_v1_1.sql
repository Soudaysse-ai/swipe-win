-- Yas Cards 1.1 : un +4 peut être renvoyé avec un autre +4 (le cumul passe au
-- joueur suivant). Contester porte sur le dernier +4 : bluff → son auteur pioche
-- le cumul ; sinon le contestataire pioche le cumul + 2. Pas de cumul des +2.
-- Les parties déjà jouées gardent leur version de règles.
UPDATE game_rules_versions SET is_current = false WHERE game_id = 'cards' AND version <> '1.1.0';
INSERT INTO game_rules_versions (game_id, version, is_current, rules) VALUES
  ('cards', '1.1.0', true, '{"deck":108,"handSize":7,"stacking":"wild4","lastCardPenalty":2,"challenge":true}')
ON CONFLICT (game_id, version) DO UPDATE SET is_current = true;
