-- Temps de jeu plus confortables (retours des joueurs) : 30 s par tour pour Cards,
-- Connect et Ludo, 15 s par décision pour Penalty. Seules les valeurs d'origine sont
-- modifiées : un réglage déjà changé depuis le back-office est conservé.
UPDATE games SET config = config || '{"turnSeconds":30}'::jsonb
 WHERE id IN ('cards', 'connect', 'ludo') AND config->>'turnSeconds' = '20';
UPDATE games SET config = config || '{"decisionSeconds":15}'::jsonb
 WHERE id = 'penalty' AND config->>'decisionSeconds' = '10';
