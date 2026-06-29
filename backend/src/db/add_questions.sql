-- Ajout de 28 questions vérifiées (difficulté medium / hard uniquement)
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL de neon.tech
-- Idempotent : ON CONFLICT met à jour le texte/réponse si l'id existe déjà.

INSERT INTO questions (id, text_fr, answer, category, difficulty, is_active, image_url) VALUES
('wc_110', 'Miroslav Klose est le meilleur buteur de l''histoire des Coupes du Monde avec 16 buts', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80'),
('wc_111', 'Just Fontaine détient le record de buts en une seule Coupe du Monde avec 13 buts en 1958', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&q=80'),
('wc_112', 'Lionel Messi est le meilleur buteur de l''histoire de la Coupe du Monde', false, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80'),
('wc_113', 'L''Allemagne a remporté 4 Coupes du Monde', true, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80'),
('wc_114', 'Le Brésil est la seule équipe à avoir participé à toutes les phases finales de Coupe du Monde', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800&q=80'),
('wc_115', 'La Coupe du Monde 2026 comptera 48 équipes', true, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80'),
('wc_116', 'La Coupe du Monde 2022 au Qatar a été la première organisée dans un pays arabe', true, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80'),
('wc_117', 'Le Maroc a été la première équipe africaine à atteindre les demi-finales d''une Coupe du Monde en 2022', true, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800&q=80'),
('wc_118', 'Le Cameroun a été la première équipe africaine à atteindre les quarts de finale, en 1990', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800&q=80'),
('wc_119', 'Le Sénégal a battu la France lors du match d''ouverture de la Coupe du Monde 2002', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&q=80'),
('wc_120', 'Andrés Iniesta a inscrit le but vainqueur de l''Espagne en prolongation de la finale 2010', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80'),
('wc_121', 'Kylian Mbappé a inscrit un triplé lors de la finale de la Coupe du Monde 2022', true, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80'),
('wc_122', 'L''Argentine a remporté 3 Coupes du Monde', true, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80'),
('wc_123', 'Roberto Baggio a manqué son tir au but lors de la finale de la Coupe du Monde 1994', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800&q=80'),
('wc_124', 'La toute première Coupe du Monde, en 1930, ne comptait que 13 équipes', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&q=80'),
('wc_125', 'L''Angleterre a remporté 2 Coupes du Monde', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80'),
('wc_126', 'Le Mexique a déjà remporté une Coupe du Monde', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&q=80'),
('wc_127', 'Cristiano Ronaldo a remporté la Coupe du Monde avec le Portugal', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80'),
('wc_128', 'Le Portugal a remporté la Coupe du Monde 2006', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80'),
('wc_129', 'Le Brésil a remporté la Coupe du Monde 1966', false, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800&q=80'),
('wc_130', 'Les Pays-Bas ont déjà remporté une Coupe du Monde', false, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80'),
('wc_131', 'Le Brésil a remporté la Coupe du Monde 2014 organisée à domicile', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80'),
('wc_132', 'La France a remporté la Coupe du Monde 2022', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800&q=80'),
('wc_133', 'L''Italie n''a remporté que 2 Coupes du Monde', false, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800&q=80'),
('wc_134', 'La première Coupe du Monde de l''histoire a eu lieu en 1950', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&q=80'),
('wc_135', 'Diego Maradona a remporté la Coupe du Monde 1986 avec le Brésil', false, 'coupe_du_monde', 'medium', true, 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80'),
('wc_136', 'Pelé n''a remporté qu''une seule Coupe du Monde dans sa carrière', false, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80'),
('wc_137', 'Emiliano Martínez a remporté le Gant d''or de meilleur gardien de la Coupe du Monde 2022', true, 'coupe_du_monde', 'hard', true, 'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80')
ON CONFLICT (id) DO UPDATE SET
  text_fr = EXCLUDED.text_fr,
  answer = EXCLUDED.answer,
  difficulty = EXCLUDED.difficulty,
  is_active = true;
