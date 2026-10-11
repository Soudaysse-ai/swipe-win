-- Données de référence : jeux, règles, rôles/permissions, ligues, badges, saison 1.
-- Ré-exécutable sans effet de bord (ON CONFLICT).

INSERT INTO games (id, name, description, min_players, max_players, rating_system, sort_order, config) VALUES
  ('cards',   'Yas Cards',   'Débarrasse-toi de toutes tes cartes avant les autres.', 2, 4, 'openskill', 1,
   '{"turnSeconds":20,"reconnectSeconds":60,"maxTimeouts":3,"minActionsForValid":2}'),
  ('connect', 'Yas Connect', 'Aligne 4 jetons avant ton adversaire.',               2, 2, 'elo',       2,
   '{"turnSeconds":20,"networkToleranceSeconds":3,"reconnectSeconds":60,"minActionsForValid":2}'),
  ('penalty', 'Yas Penalty', 'Séance de tirs au but : tire, plonge, gagne.',          2, 2, 'elo',       3,
   '{"decisionSeconds":10,"reconnectSeconds":60,"maxShotsPerPlayer":20,"minActionsForValid":2}'),
  ('ludo',    'Yas Ludo',    'Fais le tour du plateau avec tes 4 pions.',             2, 4, 'openskill', 4,
   '{"turnSeconds":20,"reconnectSeconds":60,"maxTimeouts":3,"minActionsForValid":2}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_rules_versions (game_id, version, is_current, rules) VALUES
  ('cards',   '1.0.0', true, '{"deck":108,"handSize":7,"stacking":false,"lastCardPenalty":2,"challenge":true}'),
  ('connect', '1.0.0', true, '{"columns":7,"rows":6,"align":4}'),
  ('penalty', '1.0.0', true, '{"zones":5,"shotsPerPlayer":5,"suddenDeath":true,"maxShotsPerPlayer":20}'),
  ('ludo',    '1.0.0', true, '{"tokens":4,"sixToExit":true,"maxConsecutiveSixes":2,"captureBonusRoll":true,"blocks":false}')
ON CONFLICT (game_id, version) DO NOTHING;

INSERT INTO roles (id, label) VALUES
  ('super_admin',       'Super Admin'),
  ('platform_admin',    'Platform Admin'),
  ('game_manager',      'Game Manager'),
  ('marketing_manager', 'Marketing Manager'),
  ('data_analyst',      'Data Analyst'),
  ('moderator',         'Moderator')
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO permissions (id, description) VALUES
  ('dashboard.view',          'Voir les tableaux de bord'),
  ('analytics.view',          'Voir les analyses détaillées (engagement, rétention, jeux)'),
  ('players.view',            'Consulter les joueurs'),
  ('players.view_private',    'Voir les données privées (téléphone)'),
  ('players.moderate',        'Suspendre / réactiver un joueur'),
  ('players.ban',             'Bannir un joueur'),
  ('players.anonymize',       'Anonymiser un compte'),
  ('leaderboards.view',       'Consulter les classements'),
  ('leaderboards.recalculate','Recalculer les classements'),
  ('leaderboards.correct',    'Corriger un score (journalisé)'),
  ('matches.review',          'Examiner les résultats suspects'),
  ('reports.manage',          'Traiter les signalements'),
  ('chat.moderate',           'Modérer le chat'),
  ('tournaments.manage',      'Gérer les tournois'),
  ('games.manage',            'Configurer les jeux'),
  ('seasons.manage',          'Gérer les saisons'),
  ('quiz.manage',             'Gérer le quiz Swipe & Win (questions, lots, thèmes)'),
  ('quiz.reset',              'Réinitialiser les données du quiz (destructif)'),
  ('exports',                 'Exporter des données (CSV / Excel)'),
  ('audit.view',              'Consulter le journal d''audit'),
  ('admins.manage',           'Gérer les administrateurs')
ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description;

-- Super Admin : toutes les permissions.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 'super_admin', id FROM permissions
ON CONFLICT DO NOTHING;

-- Platform Admin : tout sauf la gestion des administrateurs et le reset destructif.
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 'platform_admin', id FROM permissions WHERE id NOT IN ('admins.manage','quiz.reset')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('game_manager','dashboard.view'), ('game_manager','analytics.view'), ('game_manager','players.view'),
  ('game_manager','leaderboards.view'), ('game_manager','leaderboards.recalculate'), ('game_manager','matches.review'),
  ('game_manager','tournaments.manage'), ('game_manager','games.manage'), ('game_manager','seasons.manage'),
  ('game_manager','quiz.manage'), ('game_manager','exports'),
  ('marketing_manager','dashboard.view'), ('marketing_manager','analytics.view'), ('marketing_manager','players.view'),
  ('marketing_manager','leaderboards.view'), ('marketing_manager','tournaments.manage'), ('marketing_manager','exports'),
  ('marketing_manager','quiz.manage'),
  ('data_analyst','dashboard.view'), ('data_analyst','analytics.view'), ('data_analyst','players.view'),
  ('data_analyst','leaderboards.view'), ('data_analyst','exports'), ('data_analyst','audit.view'),
  ('moderator','dashboard.view'), ('moderator','players.view'), ('moderator','players.moderate'),
  ('moderator','reports.manage'), ('moderator','chat.moderate'), ('moderator','matches.review'),
  ('moderator','leaderboards.view')
ON CONFLICT DO NOTHING;

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_fk;
ALTER TABLE admins ADD CONSTRAINT admins_role_fk FOREIGN KEY (role) REFERENCES roles(id);

-- Ligues : seuils par jeu (ajustables par jeu dans le back-office).
INSERT INTO leagues (game_id, name, min_rating, sort_order)
  SELECT g.id, l.name, l.min_rating, l.sort_order
  FROM games g
  CROSS JOIN (VALUES
    ('Bronze', 0, 1), ('Silver', 900, 2), ('Gold', 1100, 3),
    ('Platinum', 1300, 4), ('Diamond', 1500, 5), ('Legend', 1800, 6)
  ) AS l(name, min_rating, sort_order)
ON CONFLICT (game_id, name) DO NOTHING;

INSERT INTO badges (id, name, description, icon, criteria, sort_order) VALUES
  ('first_win',     'Première victoire', 'Remporte ta première partie.',                    '🏆', '{"wins":1}', 1),
  ('wins_10',       'Compétiteur',       'Remporte 10 parties.',                            '🥇', '{"wins":10}', 2),
  ('wins_50',       'Champion',          'Remporte 50 parties.',                            '👑', '{"wins":50}', 3),
  ('matches_25',    'Habitué',           'Termine 25 parties.',                             '🎮', '{"matches":25}', 4),
  ('matches_100',   'Pilier de Défi Yas','Termine 100 parties.',                            '💯', '{"matches":100}', 5),
  ('streak_5',      'En feu',            'Enchaîne 5 victoires dans un même jeu.',          '🔥', '{"streak":5}', 6),
  ('all_games',     'Touche-à-tout',     'Termine au moins une partie de chacun des 4 jeux.','🧩', '{"allGames":true}', 7),
  ('level_5',       'Niveau 5',          'Atteins le niveau 5.',                            '⭐', '{"level":5}', 8),
  ('level_10',      'Niveau 10',         'Atteins le niveau 10.',                           '🌟', '{"level":10}', 9),
  ('penalty_wall',  'Le Mur',            'Arrête 3 tirs dans un même match de Yas Penalty.','🧤', '{"penaltySaves":3}', 10),
  ('connect_quick', 'Éclair',            'Gagne une partie de Yas Connect en 10 coups ou moins.', '⚡', '{"connectQuickWin":10}', 11)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
  icon = EXCLUDED.icon, criteria = EXCLUDED.criteria, sort_order = EXCLUDED.sort_order;

INSERT INTO seasons (name, starts_at, ends_at, is_active)
  SELECT 'Saison 1', date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '3 months', true
  WHERE NOT EXISTS (SELECT 1 FROM seasons);

INSERT INTO settings (key, value) VALUES ('platform_paused', 'false') ON CONFLICT (key) DO NOTHING;
