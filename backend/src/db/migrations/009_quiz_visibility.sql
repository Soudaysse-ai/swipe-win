-- « Swipe & gagne » (quiz historique) : visibilité pilotée depuis le back-office.
-- Masqué par défaut ; l'historique et les données du quiz restent intacts.
INSERT INTO settings (key, value) VALUES ('quiz_visible', 'false') ON CONFLICT (key) DO NOTHING;
