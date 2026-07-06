require('dotenv').config();
const pool = require('./pool');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const questions = [
  { id: 'wc_01', text_fr: 'La Coupe du Monde 2026 se jouera aux USA, au Canada et au Mexique', answer: true },
  { id: 'wc_02', text_fr: 'Le Brésil a remporté la Coupe du Monde 5 fois', answer: true },
  { id: 'wc_03', text_fr: 'La France a gagné sa première Coupe du Monde en 1998', answer: true },
  { id: 'wc_04', text_fr: 'Lionel Messi a remporté la Coupe du Monde 2022 au Qatar', answer: true },
  { id: 'wc_05', text_fr: "L'Allemagne a battu le Brésil 7-1 en demi-finale de 2014", answer: true },
  { id: 'wc_06', text_fr: "Ronaldo est le meilleur buteur de l'histoire des Coupes du Monde", answer: false },
  { id: 'wc_07', text_fr: 'La première Coupe du Monde a eu lieu en Uruguay en 1930', answer: true },
  { id: 'wc_08', text_fr: "Pelé a inscrit son 1er but en Coupe du Monde à l'âge de 17 ans", answer: true },
  { id: 'wc_09', text_fr: "L'Italie n'a jamais remporté la Coupe du Monde", answer: false },
  { id: 'wc_10', text_fr: 'La Coupe du Monde 2018 s\'est jouée en Russie', answer: true },
  { id: 'wc_11', text_fr: 'Zidane a reçu un carton rouge lors de la finale de la Coupe du Monde 2006', answer: true },
  { id: 'wc_12', text_fr: "L'Espagne a remporté la Coupe du Monde 2010 en Afrique du Sud", answer: true },
  { id: 'wc_13', text_fr: "Maradona a inscrit la Main de Dieu contre l'Angleterre en 1986", answer: true },
  { id: 'wc_14', text_fr: 'Les Comores ont participé à une Coupe du Monde FIFA', answer: false },
  { id: 'wc_15', text_fr: 'Un match de Coupe du Monde se joue en deux mi-temps de 45 minutes', answer: true },

  // --- Règles & bases du football (faciles) ---
  { id: 'wc_16', text_fr: 'Une équipe de football aligne 11 joueurs sur le terrain', answer: true, difficulty: 'easy' },
  { id: 'wc_17', text_fr: 'Le gardien peut prendre le ballon avec les mains dans sa surface de réparation', answer: true, difficulty: 'easy' },
  { id: 'wc_18', text_fr: 'Un carton rouge signifie l\'expulsion du joueur', answer: true, difficulty: 'easy' },
  { id: 'wc_19', text_fr: 'Le carton jaune est un simple avertissement', answer: true, difficulty: 'easy' },
  { id: 'wc_20', text_fr: 'Un match de football se joue avec deux ballons en même temps', answer: false, difficulty: 'easy' },
  { id: 'wc_21', text_fr: 'Un but compte pour un point', answer: true, difficulty: 'easy' },
  { id: 'wc_22', text_fr: 'Le hors-jeu est une règle du football', answer: true, difficulty: 'easy' },
  { id: 'wc_23', text_fr: 'Le terrain de football est de forme rectangulaire', answer: true, difficulty: 'easy' },
  { id: 'wc_24', text_fr: 'Le capitaine d\'une équipe porte un brassard', answer: true, difficulty: 'easy' },
  { id: 'wc_25', text_fr: 'Un joueur de champ peut toucher le ballon avec les mains volontairement', answer: false, difficulty: 'easy' },
  { id: 'wc_26', text_fr: 'Un penalty se tire à 11 mètres du but', answer: true, difficulty: 'medium' },
  { id: 'wc_27', text_fr: 'Une victoire rapporte 3 points en championnat', answer: true, difficulty: 'easy' },
  { id: 'wc_28', text_fr: 'Un match nul rapporte 1 point à chaque équipe', answer: true, difficulty: 'easy' },
  { id: 'wc_29', text_fr: 'La VAR est l\'assistance vidéo à l\'arbitrage', answer: true, difficulty: 'medium' },
  { id: 'wc_30', text_fr: 'Le ballon doit franchir entièrement la ligne pour qu\'un but soit valable', answer: true, difficulty: 'medium' },
  { id: 'wc_31', text_fr: 'Il y a normalement un seul arbitre central sur le terrain', answer: true, difficulty: 'medium' },
  { id: 'wc_32', text_fr: 'Le gardien peut utiliser ses mains partout sur le terrain', answer: false, difficulty: 'easy' },
  { id: 'wc_33', text_fr: 'Les tirs au but départagent deux équipes à égalité en élimination directe', answer: true, difficulty: 'medium' },
  { id: 'wc_34', text_fr: 'Un coup franc direct peut être marqué directement sans toucher un autre joueur', answer: true, difficulty: 'medium' },
  { id: 'wc_35', text_fr: 'Un match de football dure 120 minutes en temps réglementaire', answer: false, difficulty: 'easy' },

  // --- Compétitions & calendrier ---
  { id: 'wc_36', text_fr: 'La Coupe du Monde a lieu tous les 4 ans', answer: true, difficulty: 'easy' },
  { id: 'wc_37', text_fr: 'La Coupe du Monde a lieu tous les 2 ans', answer: false, difficulty: 'easy' },
  { id: 'wc_38', text_fr: 'La FIFA est l\'organisation qui gère le football mondial', answer: true, difficulty: 'easy' },
  { id: 'wc_39', text_fr: 'L\'UEFA gère le football en Europe', answer: true, difficulty: 'medium' },
  { id: 'wc_40', text_fr: 'La Coupe du Monde féminine existe', answer: true, difficulty: 'easy' },
  { id: 'wc_41', text_fr: 'La Ligue des Champions est une compétition européenne de clubs', answer: true, difficulty: 'medium' },
  { id: 'wc_42', text_fr: 'La CAN est la Coupe d\'Afrique des Nations', answer: true, difficulty: 'medium' },
  { id: 'wc_43', text_fr: 'Le Ballon d\'Or récompense le meilleur joueur de l\'année', answer: true, difficulty: 'easy' },

  // --- Vainqueurs & éditions ---
  { id: 'wc_44', text_fr: 'La France a remporté la Coupe du Monde 2018', answer: true, difficulty: 'easy' },
  { id: 'wc_45', text_fr: 'Le Brésil a remporté la Coupe du Monde 2018', answer: false, difficulty: 'easy' },
  { id: 'wc_46', text_fr: 'L\'Argentine a remporté la Coupe du Monde 2022', answer: true, difficulty: 'easy' },
  { id: 'wc_47', text_fr: 'L\'Allemagne a remporté la Coupe du Monde 2014', answer: true, difficulty: 'medium' },
  { id: 'wc_48', text_fr: 'L\'Italie a remporté la Coupe du Monde 2006', answer: true, difficulty: 'medium' },
  { id: 'wc_49', text_fr: 'La Coupe du Monde 2014 s\'est jouée au Brésil', answer: true, difficulty: 'easy' },
  { id: 'wc_50', text_fr: 'La Coupe du Monde 2022 a eu lieu en France', answer: false, difficulty: 'easy' },
  { id: 'wc_51', text_fr: 'Le Qatar a accueilli la Coupe du Monde 2022', answer: true, difficulty: 'easy' },
  { id: 'wc_52', text_fr: 'La Coupe du Monde 1998 a eu lieu en France', answer: true, difficulty: 'medium' },
  { id: 'wc_53', text_fr: 'L\'Uruguay a remporté la toute première Coupe du Monde en 1930', answer: true, difficulty: 'medium' },
  { id: 'wc_54', text_fr: 'La finale de la Coupe du Monde 2010 opposait l\'Espagne aux Pays-Bas', answer: true, difficulty: 'medium' },
  { id: 'wc_55', text_fr: 'La France a perdu la finale de la Coupe du Monde 2022', answer: true, difficulty: 'medium' },
  { id: 'wc_56', text_fr: 'Le Maroc a atteint les demi-finales de la Coupe du Monde 2022', answer: true, difficulty: 'medium' },

  // --- Joueurs & nationalités ---
  { id: 'wc_57', text_fr: 'Lionel Messi est argentin', answer: true, difficulty: 'easy' },
  { id: 'wc_58', text_fr: 'Cristiano Ronaldo est portugais', answer: true, difficulty: 'easy' },
  { id: 'wc_59', text_fr: 'Kylian Mbappé est français', answer: true, difficulty: 'easy' },
  { id: 'wc_60', text_fr: 'Neymar joue pour l\'équipe nationale du Brésil', answer: true, difficulty: 'easy' },
  { id: 'wc_61', text_fr: 'Pelé était un joueur argentin', answer: false, difficulty: 'easy' },
  { id: 'wc_62', text_fr: 'Diego Maradona était argentin', answer: true, difficulty: 'easy' },
  { id: 'wc_63', text_fr: 'Zinédine Zidane est un ancien joueur français', answer: true, difficulty: 'easy' },
  { id: 'wc_64', text_fr: 'Lionel Messi est brésilien', answer: false, difficulty: 'easy' },
  { id: 'wc_65', text_fr: 'Mbappé a marqué en finale de la Coupe du Monde 2022', answer: true, difficulty: 'medium' },

  // --- Clubs & championnats ---
  { id: 'wc_66', text_fr: 'Le Real Madrid est un club espagnol', answer: true, difficulty: 'easy' },
  { id: 'wc_67', text_fr: 'Le FC Barcelone est un club espagnol', answer: true, difficulty: 'easy' },
  { id: 'wc_68', text_fr: 'Manchester United est un club anglais', answer: true, difficulty: 'easy' },
  { id: 'wc_69', text_fr: 'Le Paris Saint-Germain est un club français', answer: true, difficulty: 'easy' },
  { id: 'wc_70', text_fr: 'Le Bayern Munich est un club allemand', answer: true, difficulty: 'medium' },
  { id: 'wc_71', text_fr: 'La Juventus est un club italien', answer: true, difficulty: 'medium' },
  { id: 'wc_72', text_fr: 'Le Real Madrid est un club anglais', answer: false, difficulty: 'easy' },
  { id: 'wc_73', text_fr: 'La Premier League est le championnat anglais', answer: true, difficulty: 'medium' },
  { id: 'wc_74', text_fr: 'La Liga est le championnat espagnol', answer: true, difficulty: 'medium' },
  { id: 'wc_75', text_fr: 'La Ligue 1 est le championnat français', answer: true, difficulty: 'easy' },
  { id: 'wc_76', text_fr: 'La Serie A est le championnat italien', answer: true, difficulty: 'medium' },

  // --- Culture foot ---
  { id: 'wc_77', text_fr: 'Le football est le sport le plus populaire au monde', answer: true, difficulty: 'easy' },
  { id: 'wc_78', text_fr: 'Le gardien porte généralement un maillot de couleur différente de ses coéquipiers', answer: true, difficulty: 'easy' },
  { id: 'wc_79', text_fr: 'Une équipe peut effectuer des remplacements pendant un match', answer: true, difficulty: 'easy' },
  { id: 'wc_80', text_fr: 'Un match nul est possible lors de la phase de groupes d\'une Coupe du Monde', answer: true, difficulty: 'medium' },
  { id: 'wc_81', text_fr: 'Le corner est accordé quand un défenseur fait sortir le ballon par sa propre ligne de but', answer: true, difficulty: 'medium' },
  { id: 'wc_82', text_fr: 'Au football, un carton vert permet d\'expulser un joueur', answer: false, difficulty: 'easy' },
  { id: 'wc_83', text_fr: 'Le Brésil est le pays qui a gagné le plus de Coupes du Monde', answer: true, difficulty: 'medium' },
  { id: 'wc_84', text_fr: 'La Coupe du Monde 2022 s\'est jouée en fin d\'année (novembre-décembre)', answer: true, difficulty: 'medium' },
  { id: 'wc_85', text_fr: 'Messi a soulevé le trophée de la Coupe du Monde 2022', answer: true, difficulty: 'easy' },

  // --- Lot de questions FAUX (pour équilibrer le jeu) ---
  { id: 'wc_86', text_fr: 'La Coupe du Monde se joue tous les 3 ans', answer: false, difficulty: 'easy' },
  { id: 'wc_87', text_fr: 'Le Portugal a remporté la Coupe du Monde 2016', answer: false, difficulty: 'medium' },
  { id: 'wc_88', text_fr: 'Une équipe de football aligne 9 joueurs sur le terrain', answer: false, difficulty: 'easy' },
  { id: 'wc_89', text_fr: 'Le gardien de but n\'a jamais le droit d\'utiliser ses mains', answer: false, difficulty: 'easy' },
  { id: 'wc_90', text_fr: 'Un match de football dure 60 minutes', answer: false, difficulty: 'easy' },
  { id: 'wc_91', text_fr: 'Le Brésil n\'a jamais remporté la Coupe du Monde', answer: false, difficulty: 'easy' },
  { id: 'wc_92', text_fr: 'La France n\'a jamais remporté la Coupe du Monde', answer: false, difficulty: 'easy' },
  { id: 'wc_93', text_fr: 'Cristiano Ronaldo est brésilien', answer: false, difficulty: 'easy' },
  { id: 'wc_94', text_fr: 'Kylian Mbappé est espagnol', answer: false, difficulty: 'easy' },
  { id: 'wc_95', text_fr: 'Le FC Barcelone est un club allemand', answer: false, difficulty: 'easy' },
  { id: 'wc_96', text_fr: 'La Premier League est le championnat français', answer: false, difficulty: 'medium' },
  { id: 'wc_97', text_fr: 'La Coupe du Monde 2018 a eu lieu au Qatar', answer: false, difficulty: 'medium' },
  { id: 'wc_98', text_fr: 'L\'Espagne a remporté la Coupe du Monde 2022', answer: false, difficulty: 'medium' },
  { id: 'wc_99', text_fr: 'Un penalty se tire à 20 mètres du but', answer: false, difficulty: 'medium' },
  { id: 'wc_100', text_fr: 'Maradona était un joueur brésilien', answer: false, difficulty: 'easy' },
  { id: 'wc_101', text_fr: 'Le Ballon d\'Or récompense la meilleure équipe de club', answer: false, difficulty: 'medium' },
  { id: 'wc_102', text_fr: 'Le Bayern Munich est un club italien', answer: false, difficulty: 'medium' },
  { id: 'wc_103', text_fr: 'Le hors-jeu n\'existe pas au football', answer: false, difficulty: 'easy' },
  { id: 'wc_104', text_fr: 'La Coupe du Monde 1998 a été remportée par le Brésil', answer: false, difficulty: 'medium' },
  { id: 'wc_105', text_fr: 'Pelé n\'a jamais joué en Coupe du Monde', answer: false, difficulty: 'medium' },
  { id: 'wc_106', text_fr: 'Neymar est un joueur portugais', answer: false, difficulty: 'easy' },
  { id: 'wc_107', text_fr: 'La Ligue des Champions est réservée aux équipes nationales', answer: false, difficulty: 'medium' },
  { id: 'wc_108', text_fr: 'Un match nul est impossible en phase de groupes', answer: false, difficulty: 'medium' },
  { id: 'wc_109', text_fr: 'Le carton jaune signifie l\'expulsion immédiate du joueur', answer: false, difficulty: 'easy' },

  // --- Lot de questions vérifiées (medium / hard uniquement) ---
  { id: 'wc_110', text_fr: 'Miroslav Klose est le meilleur buteur de l\'histoire des Coupes du Monde avec 16 buts', answer: true, difficulty: 'hard' },
  { id: 'wc_111', text_fr: 'Just Fontaine détient le record de buts en une seule Coupe du Monde avec 13 buts en 1958', answer: true, difficulty: 'hard' },
  { id: 'wc_112', text_fr: 'Lionel Messi est le meilleur buteur de l\'histoire de la Coupe du Monde', answer: false, difficulty: 'hard' },
  { id: 'wc_113', text_fr: 'L\'Allemagne a remporté 4 Coupes du Monde', answer: true, difficulty: 'medium' },
  { id: 'wc_114', text_fr: 'Le Brésil est la seule équipe à avoir participé à toutes les phases finales de Coupe du Monde', answer: true, difficulty: 'hard' },
  { id: 'wc_115', text_fr: 'La Coupe du Monde 2026 comptera 48 équipes', answer: true, difficulty: 'medium' },
  { id: 'wc_116', text_fr: 'La Coupe du Monde 2022 au Qatar a été la première organisée dans un pays arabe', answer: true, difficulty: 'medium' },
  { id: 'wc_117', text_fr: 'Le Maroc a été la première équipe africaine à atteindre les demi-finales d\'une Coupe du Monde en 2022', answer: true, difficulty: 'medium' },
  { id: 'wc_118', text_fr: 'Le Cameroun a été la première équipe africaine à atteindre les quarts de finale, en 1990', answer: true, difficulty: 'hard' },
  { id: 'wc_119', text_fr: 'Le Sénégal a battu la France lors du match d\'ouverture de la Coupe du Monde 2002', answer: true, difficulty: 'hard' },
  { id: 'wc_120', text_fr: 'Andrés Iniesta a inscrit le but vainqueur de l\'Espagne en prolongation de la finale 2010', answer: true, difficulty: 'hard' },
  { id: 'wc_121', text_fr: 'Kylian Mbappé a inscrit un triplé lors de la finale de la Coupe du Monde 2022', answer: true, difficulty: 'medium' },
  { id: 'wc_122', text_fr: 'L\'Argentine a remporté 3 Coupes du Monde', answer: true, difficulty: 'medium' },
  { id: 'wc_123', text_fr: 'Roberto Baggio a manqué son tir au but lors de la finale de la Coupe du Monde 1994', answer: true, difficulty: 'hard' },
  { id: 'wc_124', text_fr: 'La toute première Coupe du Monde, en 1930, ne comptait que 13 équipes', answer: true, difficulty: 'hard' },
  { id: 'wc_125', text_fr: 'L\'Angleterre a remporté 2 Coupes du Monde', answer: false, difficulty: 'medium' },
  { id: 'wc_126', text_fr: 'Le Mexique a déjà remporté une Coupe du Monde', answer: false, difficulty: 'medium' },
  { id: 'wc_127', text_fr: 'Cristiano Ronaldo a remporté la Coupe du Monde avec le Portugal', answer: false, difficulty: 'medium' },
  { id: 'wc_128', text_fr: 'Le Portugal a remporté la Coupe du Monde 2006', answer: false, difficulty: 'medium' },
  { id: 'wc_129', text_fr: 'Le Brésil a remporté la Coupe du Monde 1966', answer: false, difficulty: 'hard' },
  { id: 'wc_130', text_fr: 'Les Pays-Bas ont déjà remporté une Coupe du Monde', answer: false, difficulty: 'hard' },
  { id: 'wc_131', text_fr: 'Le Brésil a remporté la Coupe du Monde 2014 organisée à domicile', answer: false, difficulty: 'medium' },
  { id: 'wc_132', text_fr: 'La France a remporté la Coupe du Monde 2022', answer: false, difficulty: 'medium' },
  { id: 'wc_133', text_fr: 'L\'Italie n\'a remporté que 2 Coupes du Monde', answer: false, difficulty: 'hard' },
  { id: 'wc_134', text_fr: 'La première Coupe du Monde de l\'histoire a eu lieu en 1950', answer: false, difficulty: 'medium' },
  { id: 'wc_135', text_fr: 'Diego Maradona a remporté la Coupe du Monde 1986 avec le Brésil', answer: false, difficulty: 'medium' },
  { id: 'wc_136', text_fr: 'Pelé n\'a remporté qu\'une seule Coupe du Monde dans sa carrière', answer: false, difficulty: 'hard' },
  { id: 'wc_137', text_fr: 'Emiliano Martínez a remporté le Gant d\'or de meilleur gardien de la Coupe du Monde 2022', answer: true, difficulty: 'hard' },

  // --- Thème Comores : Indépendance & Histoire ---
  // Images liées aux Comores (île, océan, lune…) — jamais la banque football.
  { id: 'km_01', text_fr: 'Les Comores ont proclamé leur indépendance le 6 juillet 1965', answer: false, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1518623489648-a173ef7824f3?w=800&q=80' },
  { id: 'km_02', text_fr: 'Ahmed Abdallah était le président qui a proclamé l\'indépendance des Comores', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80' },
  { id: 'km_03', text_fr: 'Les Comores étaient une colonie portugaise avant leur indépendance', answer: false, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80' },
  { id: 'km_04', text_fr: 'Le 6 juillet est un jour férié national aux Comores', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80' },

  // --- Thème Comores : Culture générale ---
  { id: 'km_05', text_fr: 'Les Comores sont surnommées "les îles de la Lune"', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=800&q=80' },
  { id: 'km_06', text_fr: 'Les Comores se trouvent dans l\'océan Pacifique', answer: false, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1559825481-12a05cc00344?w=800&q=80' },
  { id: 'km_07', text_fr: 'Le drapeau comorien comporte un croissant et quatre étoiles', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1476673160081-cf065607f449?w=800&q=80' },
  { id: 'km_08', text_fr: 'La monnaie des Comores est le FCFA', answer: false, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=800&q=80' },
  { id: 'km_09', text_fr: 'Les Comores sont un grand producteur mondial d\'ylang-ylang', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80' },
  { id: 'km_10', text_fr: 'Les Comores se situent entre l\'Afrique et l\'Australie', answer: false, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1509233725247-49e657c54213?w=800&q=80' },

  // --- Thème Comores : Yas ---
  { id: 'km_11', text_fr: 'Yas Comores a lancé ses activités dans le pays en 2016', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80' },
  { id: 'km_12', text_fr: 'Yas Comores a été le premier opérateur à lancer la 5G aux Comores', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1516044734145-07ca8eef8731?w=800&q=80' },
  { id: 'km_13', text_fr: 'Le Pass Voyage permet de rester connecté à l\'étranger', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80' },
  { id: 'km_14', text_fr: 'Le slogan de Yas est "Yas, vivons connectés."', answer: true, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80' },
  { id: 'km_15', text_fr: 'DagoNet est une offre internet mobile', answer: false, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1516044734145-07ca8eef8731?w=800&q=80' },
  { id: 'km_16', text_fr: 'Yas Comores n\'a aucun lien avec d\'autres pays africains', answer: false, difficulty: 'medium', category: 'comores', image_url: 'https://images.unsplash.com/photo-1518623489648-a173ef7824f3?w=800&q=80' },
];

// Banque de photos football pour donner une image à chaque carte
const FOOTBALL_IMAGES = [
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80',
  'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&q=80',
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80',
  'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
  'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800&q=80',
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80',
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80',
  'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800&q=80',
  'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800&q=80',
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&q=80',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80',
  'https://images.unsplash.com/photo-1551280857-2b9e0a93f6f4?w=800&q=80',
  'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80',
  'https://images.unsplash.com/photo-1493924191657-9b0c2a0e9b3a?w=800&q=80',
];

async function seed() {
  const client = await pool.connect();
  try {
    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    // Seed admin
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'changeme123', 10);
    await client.query(`
      INSERT INTO admins (email, password_hash, role)
      VALUES ($1, $2, 'superadmin')
      ON CONFLICT (email) DO UPDATE SET password_hash = $2
    `, [process.env.ADMIN_EMAIL || 'admin@yas.km', hash]);

    // Seed questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const difficulty = q.difficulty || 'medium';
      // image fournie, sinon on en assigne une depuis la banque football
      const image_url = q.image_url || FOOTBALL_IMAGES[i % FOOTBALL_IMAGES.length];
      const category = q.category || 'coupe_du_monde';
      await client.query(`
        INSERT INTO questions (id, text_fr, answer, category, difficulty, image_url, is_active)
        VALUES ($1, $2, $3, $6, $4, $5, true)
        ON CONFLICT (id) DO UPDATE SET text_fr = $2, answer = $3, difficulty = $4, category = $6, image_url = COALESCE(questions.image_url, $5)
      `, [q.id, q.text_fr, q.answer, difficulty, image_url, category]);
    }

    // Seed prize
    await client.query(`
      INSERT INTO prizes (label, tier, quantity, is_active)
      VALUES ('Samsung Galaxy S25+', '1er_prix', 1, true)
      ON CONFLICT DO NOTHING
    `);

    console.log('✅ Seed terminé avec succès !');
    console.log(`Admin: ${process.env.ADMIN_EMAIL || 'admin@yas.km'} / ${process.env.ADMIN_PASSWORD || 'changeme123'}`);
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
