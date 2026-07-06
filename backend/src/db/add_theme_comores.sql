-- Nouveau thème "comores" : 16 questions (Indépendance & Histoire, Culture générale, Yas)
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL de neon.tech
-- Idempotent : relançable sans doublons.

INSERT INTO questions (id, text_fr, answer, category, difficulty, is_active, image_url) VALUES
-- Indépendance & Histoire
('km_01', 'Les Comores ont proclamé leur indépendance le 6 juillet 1965', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80'),
('km_02', 'Ahmed Abdallah était le président qui a proclamé l''indépendance des Comores', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&q=80'),
('km_03', 'Les Comores étaient une colonie portugaise avant leur indépendance', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80'),
('km_04', 'Le 6 juillet est un jour férié national aux Comores', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80'),
-- Culture générale
('km_05', 'Les Comores sont surnommées "les îles de la Lune"', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800&q=80'),
('km_06', 'Les Comores se trouvent dans l''océan Pacifique', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80'),
('km_07', 'Le drapeau comorien comporte un croissant et quatre étoiles', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80'),
('km_08', 'La monnaie des Comores est le FCFA', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800&q=80'),
('km_09', 'Les Comores sont un grand producteur mondial d''ylang-ylang', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800&q=80'),
('km_10', 'Les Comores se situent entre l''Afrique et l''Australie', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&q=80'),
-- Yas
('km_11', 'Yas Comores a lancé ses activités dans le pays en 2016', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80'),
('km_12', 'Yas Comores a été le premier opérateur à lancer la 5G aux Comores', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800&q=80'),
('km_13', 'Le Pass Voyage permet de rester connecté à l''étranger', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80'),
('km_14', 'Le slogan de Yas est "Yas, vivons connectés."', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&q=80'),
('km_15', 'DagoNet est une offre internet mobile', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80'),
('km_16', 'Yas Comores n''a aucun lien avec d''autres pays africains', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80')
ON CONFLICT (id) DO UPDATE SET
  text_fr = EXCLUDED.text_fr,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  difficulty = EXCLUDED.difficulty,
  is_active = true;
