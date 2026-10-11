-- Yas Penalty est retiré des jeux proposés (remplacé par Yas Foot).
-- Aucune donnée n'est supprimée : l'historique des parties et des statistiques reste
-- en base. Le jeu est désactivé, et son badge n'est plus montré qu'aux joueurs qui
-- l'ont déjà obtenu.
UPDATE games SET is_active = false, sort_order = 99 WHERE id = 'penalty';
ALTER TABLE badges ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT false;
UPDATE badges SET retired = true WHERE id = 'penalty_wall';
