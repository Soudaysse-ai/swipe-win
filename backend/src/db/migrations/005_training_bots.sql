-- Parties d'entraînement contre des bots (mode 'bot').
-- Les bots ne sont pas des comptes joueurs : ils sont décrits ici, jamais dans
-- users ni match_players. Ces parties ne produisent aucune ligne match_results
-- (aucun XP, aucune cote, aucun point de saison, aucune statistique).
ALTER TABLE matches ADD COLUMN IF NOT EXISTS bots JSONB;
