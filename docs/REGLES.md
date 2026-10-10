# Règles implémentées (V1 — `rulesVersion 1.0.0`)

Ce document décrit exactement ce que font les moteurs serveur. La version des règles est
enregistrée sur chaque match (`matches.rules_version`).

## Commun

- Le serveur tire au sort le premier joueur et génère tout l'aléatoire (`crypto.randomInt`).
- **Validité d'une partie** : une fin normale est toujours validée. Une fin par abandon,
  forfait ou expirations répétées n'est validée que si les joueurs ont réellement joué
  (≥ 2 actions chacun en 1 contre 1 ; ≥ 2 joueurs engagés à 3–4). Une partie non validée est
  conservée mais ne donne ni victoire, ni XP, ni points, ni cote.
- **Déconnexion** : 60 s pour revenir (réglable) ; sinon forfait. Les chronomètres de tour
  continuent pendant la déconnexion.

## Yas Connect
Grille 7 × 6. Le jeton tombe dans la case libre la plus basse. 4 alignés (horizontal, vertical,
deux diagonales) = victoire ; grille pleine = nul. Refus : hors tour, colonne pleine ou invalide,
après la fin. 20 s par coup ; expiration = défaite par forfait (tolérance réseau : +3 s une fois
par tour si le joueur a subi une coupure reconnue par le serveur).

## Yas Ludo
- Plateau de 52 cases, départs : rouge 0, vert 13, jaune 26, bleu 39 (sens horaire).
  Couleurs : à 2 rouge/jaune, à 3 rouge/vert/jaune, à 4 les quatre.
- Cases protégées : les 4 départs et les étoiles (8, 21, 34, 47). Plusieurs pions peuvent y
  cohabiter, aucune capture. Sur une case ordinaire, arriver sur un adversaire le renvoie à sa
  base (+ lancer supplémentaire). Pas de blocage par deux pions.
- 6 pour sortir un pion (placé sur sa case de départ). Un 6 donne un lancer supplémentaire ;
  le 3ᵉ six consécutif est annulé et termine le tour. Aucun pion déplaçable : le tour passe
  (sauf sur un 6, qui garde son lancer supplémentaire).
- Parcours : 51 cases + 5 cases du couloir d'arrivée + l'arrivée, au nombre exact.
- Classement : ordre d'arrivée des 4 pions ; les autres continuent ; le dernier restant est
  classé automatiquement ; un joueur ayant abandonné est classé après les joueurs restants.
- **Chronomètre (20 s)** : en phase « lancer », le serveur lance le dé puis joue le coup ;
  en phase « déplacer », il joue le coup. **Règle déterministe** : (1) un déplacement qui
  capture ; sinon (2) sortir un pion de la base ; sinon (3) avancer le pion le plus avancé ;
  à égalité, le pion de plus petit numéro. 3 expirations consécutives = forfait (réglable).

## Yas Cards
- 108 cartes : par couleur (jaune, rouge, bleu, vert) un 0, deux 1–9, deux Passe, deux Inverse,
  deux +2 ; 4 Jokers, 4 Jokers +4. Illustrations originales Défi Yas.
- 7 cartes chacun ; la carte de départ est toujours numérotée.
- Jouer : même couleur active, même chiffre, même symbole, ou Joker. **Piocher n'est permis que
  sans carte jouable** ; la carte piochée peut être jouée aussitôt si elle est jouable, sinon le
  tour passe (ou « Passer » si elle est jouable mais que le joueur ne veut pas la poser).
- Passe ; Inverse (à 2 joueurs = Passe) ; +2 (le suivant pioche 2 et passe) ; Joker (couleur) ;
  Joker +4 (couleur, le suivant pioche 4 et passe). Pas de cumul des pénalités.
- **Contestation du +4** : le +4 n'est légal que si son auteur n'avait aucune carte de la couleur
  active. La victime accepte ou conteste. Contestation gagnée → l'auteur pioche 4, le contestataire
  joue normalement ; perdue → le contestataire pioche 6 et passe. Seul le verdict est communiqué.
- **Dernière carte** : annonce possible avec 2 cartes à son tour (avant de jouer) ou juste après
  être passé à 1 carte. Tant que le joueur suivant n'a pas agi, n'importe quel adversaire peut
  signaler un oubli : +2 cartes.
- Pioche vide : la défausse (sauf la carte visible) est remélangée par le serveur.
- Fin : le premier sans carte gagne immédiatement (l'effet de sa dernière carte ne s'applique pas).
  Classement des autres : nombre de cartes, puis valeur (chiffre, actions 20, Jokers 50), rang
  partagé en cas d'égalité parfaite.
- Chronomètre (20 s) : phase « jouer » → le joueur pioche 1 carte et passe ; carte piochée en
  attente → passe ; +4 en attente → accepté. 3 expirations consécutives = forfait ; ses cartes
  retournent sous la pioche.

## Yas Penalty
- Zones : 1 haut gauche, 2 bas gauche, 3 centre, 4 haut droite, 5 bas droite.
- Tireur et gardien choisissent en secret ; choix verrouillés ; révélation simultanée.
  Même zone = arrêt ; zones différentes = but. Les rôles alternent à chaque tir.
- 10 s par décision : tireur sans choix = tir manqué ; gardien sans choix = but, sauf si le tireur
  n'a pas choisi non plus (tir manqué).
- 5 tirs chacun, arrêt anticipé dès qu'un joueur ne peut plus rattraper l'autre ; mort subite par
  paire de tirs ensuite ; au-delà de 20 tirs chacun : match nul (aucune victoire).
- 6 décisions manquées d'affilée = forfait. La fonction `resolveShot` isole le modèle de résolution
  (point d'extension pour puissance / précision, sans avantage payant).

## Progression

| Indicateur | Règle |
|---|---|
| **XP** | Partie terminée 10 · victoire +20 · nul +10 · première partie du jour +5 · défi du jour +15. Jamais retirés au-delà du plafond de points. Niveau N atteint à 100 × (N − 1)² XP. |
| **Cote** | Par jeu, départ 1000. Connect et Penalty : Elo, K = 32. Cards et Ludo : OpenSkill (Plackett-Luce, prise en compte de tout l'ordre d'arrivée), cote affichée = 40 × μ. |
| **Points de saison** | Victoire 30 · 2ᵉ 15 · 3ᵉ 8 · 4ᵉ 3 · nul en 1 contre 1 : 10 (en 1 contre 1, la défaite vaut 0). Plafond : 10 matchs comptés par jeu et par jour. |
| **Ligues** | Par jeu : Bronze < 900 ≤ Silver < 1100 ≤ Gold < 1300 ≤ Platinum < 1500 ≤ Diamond < 1800 ≤ Legend. Seuils réglables par jeu dans le back-office (calibrage Cards / Ludo). |
| **Défi du jour** | Gagner une partie du jeu du jour (rotation Connect → Ludo → Cards → Penalty), heure des Comores. |

## Classements
Global = somme des points de saison des 4 jeux ; par jeu = cote. Périodes : semaine, mois, saison,
historique. Départage : score/cote → victoires → taux de victoire (minimum 10 parties) → date
d'atteinte du score. Penalty : classements secondaires buteurs (buts, ≥ 10 tirs) et gardiens
(% d'arrêts, ≥ 10 tirs subis). Évolution du rang : comparaison avec l'instantané de la veille.
