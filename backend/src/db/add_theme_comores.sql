-- Nouveau thème "comores" : 16 questions (Indépendance & Histoire, Culture générale, Yas)
-- Images liées aux Comores (île, océan, lune, fleurs, télécom…), jamais la banque football.
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL de neon.tech — idempotent.

INSERT INTO questions (id, text_fr, answer, category, difficulty, is_active, image_url) VALUES
-- Indépendance & Histoire
('km_01', 'Les Comores ont proclamé leur indépendance le 6 juillet 1965', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1518623489648-a173ef7824f3?w=800&q=80'),
('km_02', 'Ahmed Abdallah était le président qui a proclamé l''indépendance des Comores', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80'),
('km_03', 'Les Comores étaient une colonie portugaise avant leur indépendance', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80'),
('km_04', 'Le 6 juillet est un jour férié national aux Comores', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80'),
-- Culture générale
('km_05', 'Les Comores sont surnommées "les îles de la Lune"', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=800&q=80'),
('km_06', 'Les Comores se trouvent dans l''océan Pacifique', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1559825481-12a05cc00344?w=800&q=80'),
('km_07', 'Le drapeau comorien comporte un croissant et quatre étoiles', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1476673160081-cf065607f449?w=800&q=80'),
('km_08', 'La monnaie des Comores est le FCFA', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=800&q=80'),
('km_09', 'Les Comores sont un grand producteur mondial d''ylang-ylang', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80'),
('km_10', 'Les Comores se situent entre l''Afrique et l''Australie', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1509233725247-49e657c54213?w=800&q=80'),
-- Yas
('km_11', 'Yas Comores a lancé ses activités dans le pays en 2016', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80'),
('km_12', 'Yas Comores a été le premier opérateur à lancer la 5G aux Comores', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1516044734145-07ca8eef8731?w=800&q=80'),
('km_13', 'Le Pass Voyage permet de rester connecté à l''étranger', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80'),
('km_14', 'Le slogan de Yas est "Yas, vivons connectés."', true, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80'),
('km_15', 'DagoNet est une offre internet mobile', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1516044734145-07ca8eef8731?w=800&q=80'),
('km_16', 'Yas Comores n''a aucun lien avec d''autres pays africains', false, 'comores', 'medium', true, 'https://images.unsplash.com/photo-1518623489648-a173ef7824f3?w=800&q=80')
ON CONFLICT (id) DO UPDATE SET
  text_fr = EXCLUDED.text_fr,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  difficulty = EXCLUDED.difficulty,
  image_url = EXCLUDED.image_url,
  is_active = true;
