// Règles résumées affichées aux joueurs (V1).
export const RULES = {
  connect: [
    'Deux joueurs, une grille de 7 colonnes et 6 lignes.',
    'À ton tour, touche une colonne : ton jeton tombe dans la case libre la plus basse.',
    'Aligne 4 jetons horizontalement, verticalement ou en diagonale pour gagner.',
    'Grille pleine sans alignement : match nul.',
    '30 secondes par coup : au-delà, tu perds par forfait.',
  ],
  ludo: [
    '2 à 4 joueurs, 4 pions chacun.',
    'Fais 6 pour sortir un pion de ta base. Un 6 donne un lancer supplémentaire, trois 6 d\'affilée annulent le tour.',
    'Tombe sur un pion adverse (hors case protégée ⭐) pour le renvoyer à sa base et rejouer.',
    'Il faut le nombre exact pour entrer dans la zone d\'arrivée.',
    'Le premier à ramener ses 4 pions gagne ; les autres continuent pour les places suivantes.',
    '30 secondes par action : sinon le serveur joue automatiquement le premier coup possible.',
  ],
  cards: [
    '2 à 4 joueurs, 7 cartes chacun, paquet de 108 cartes.',
    'Pose une carte de la même couleur, du même chiffre ou du même symbole, ou une carte Joker.',
    'Aucune carte jouable ? Pioche : si la carte piochée est jouable, tu peux la poser.',
    'Passe ⦸ : le suivant passe son tour. Inverse ⟲ : change de sens (à 2 : comme Passe). +2 : le suivant pioche 2 et passe.',
    'Joker : choisis la couleur. Joker +4 : choisis la couleur, le suivant pioche 4 — autorisé seulement sans carte de la couleur demandée. Le suivant peut contester !',
    'À une carte, appuie sur « Dernière carte » avant qu\'un adversaire ne te signale (+2 cartes).',
    'Le premier sans carte gagne. Pas de cumul des +2 / +4 en V1.',
  ],
  foot: [
    'Deux joueurs, 5 palets chacun, un ballon : du football de table.',
    'À ton tour, pose le doigt sur un de tes palets et tire vers l\'arrière, comme une fronde : la flèche montre la direction, le cercle la puissance. Relâche pour tirer.',
    'Le palet file, rebondit sur les bords et les autres palets, et pousse le ballon. Une fois tout arrêté, c\'est à l\'adversaire.',
    'But : le ballon franchit entièrement la ligne entre les poteaux. Contre son camp, le but compte pour l\'adversaire. L\'équipe qui encaisse engage.',
    'Le premier à 3 buts gagne. Sinon, à la fin des 5 minutes, le score décide (match nul possible).',
    '20 secondes pour tirer : sinon la main passe ; 3 fois de suite, c\'est forfait.',
  ],
};
