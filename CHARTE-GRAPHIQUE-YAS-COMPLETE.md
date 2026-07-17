# Charte graphique — Univers visuel "Swipe & Win" (Yas Comores)

> Document de référence design, à usage de partage. Décrit l'identité visuelle,
> les composants d'interface et le langage graphique d'une web app gamifiée Yas.
> Ce document ne contient **aucune information technique** (code, base de données,
> routes API, infrastructure) — uniquement du design, pour servir de socle visuel
> à d'autres applications de la marque, de façon totalement indépendante.

---

## 1. Palette de couleurs

| Rôle | Couleur | Code hex |
|---|---|---|
| **Bleu Yas** (couleur de marque, fond principal) | Bleu profond | `#00377D` |
| **Jaune Yas** (couleur d'accent, CTA, surbrillance) | Jaune vif | `#FFD100` / `#FFD109` |
| Bleu clair (variante de texte sur fond bleu) | Bleu pâle | `#5f99d2` |
| Fond d'écran de jeu | Bleu très clair | `#F0F4FF` |
| Fond de carte / surface | Blanc | `#ffffff` |
| Texte foncé sur fond clair | Bleu nuit | `#1a2238` |
| Texte secondaire | Gris ardoise | `#374151` / `#64748b` / `#6b7280` |
| Texte discret / placeholder | Gris clair | `#94a3b8` / `#9ca3af` |
| Fond neutre (champs, zones) | Bleu-gris très clair | `#eef1f8` / `#dbe3f4` |
| Succès / bonne réponse | Vert | `#22C55E` (fond translucide `rgba(34,197,94,0.12)`) |
| Erreur / mauvaise réponse / suppression | Rouge | `#EF4444` (fond translucide `rgba(239,68,68,0.12)`) |

> ❌ **Pas d'orange** dans la charte Yas — le duo signature est **bleu + jaune**.

### Dégradés
- Fond de carte de jeu : `linear-gradient(160deg, #004aa3 0%, #00377D 60%, #002452 100%)`
- Voile de lisibilité (bas d'image) : `linear-gradient(to top, rgba(0,20,46,0.92) 18%, rgba(0,20,46,0.55) 55%, rgba(0,20,46,0) 100%)`

---

## 2. Typographie

- **Police de marque** : **Figtree** (sans-serif géométrique, moderne) — à charger via Google Fonts ou en self-hosted
- **Titres principaux** : `font-weight: 900`, parfois en *italique*, `letter-spacing` large, taille fluide `clamp(30px, 9vw, 52px)`
- **Titres de section / back-office** : `font-weight: 900`, `letter-spacing: 2px`, taille `clamp(24px, 6vw, 32px)`, couleur bleue
- **Corps de texte** : graisses de `400` à `800` selon l'importance
- **Valeurs chiffrées (scores)** : police de marque, gros corps (`20-26px`), couleur jaune ou bleue selon le fond
- **Petits textes (mentions, hints)** : `10-13px`, souvent en blanc translucide sur fond bleu

---

## 3. Logo & forme signature : le "Plectrum" (médiator)

L'élément graphique le plus identifiable de la marque est une **forme de médiator de guitare (plectrum)**, stylisée et arrondie, déclinée en deux couleurs :

- **Variante bleue** : remplissage `#00377D`
- **Variante jaune** : remplissage `#FFD109`

### Usage du plectrum
- Utilisé comme **grand "blob" décoratif en arrière-plan**, généralement positionné en haut à droite de l'écran d'accueil
- Toujours **légèrement pivoté** (rotation ~ -35°) pour donner du dynamisme
- Affiché en grand format (ex. 520px), avec une ombre portée douce : `drop-shadow(0 8px 24px rgba(0,0,0,0.2))`
- Le **logo Yas** est ensuite superposé par-dessus, en blanc/clair, pour ressortir sur la couleur vive du plectrum
- Peut être décliné à plusieurs échelles comme motif récurrent (texture de fond, séparateurs, accents décoratifs)

### Logo Yas
- Format vectoriel (SVG), fond transparent
- Toujours utilisé sur une surface contrastée (le plectrum coloré, ou un fond uni bleu/blanc)
- Tailles d'usage courantes : ~60px (en-têtes), ~190px (écran d'accueil, mis en avant)

---

## 4. Mise en page & structure

- **Format mobile-first** : interface conçue pour un cadre vertical étroit (max-width ~460px), centré sur grand écran, fond bleu de marque débordant autour
- **Construction en couches** : fond uni de marque → forme décorative (plectrum) en arrière-plan → contenu (titres, cartes) au premier plan
- **Cartes blanches flottantes** : grande carte arrondie en bas/centre de l'écran contenant le formulaire ou contenu interactif, avec une ombre portée prononcée qui la détache du fond coloré
  - `border-radius: 22px`, `box-shadow: 0 16px 48px rgba(0,0,0,0.22)`
- **Hiérarchie visuelle forte** : titre très grand et expressif (italique, bicolore bleu/jaune) au-dessus de la carte d'action

---

## 5. Composants d'interface

### Boutons
- **Bouton principal (CTA)** : fond jaune `#FFD100`, texte bleu `#00377D`, `font-weight: 900`, grand corps de texte (`20px`), coins très arrondis (`14px`), pleine largeur, padding généreux (`18px`)
- **Bouton lien / secondaire** : transparent, texte gris-bleu discret, soulignement, plus petit
- **Boutons de jeu (swipe vrai/faux)** : grands boutons ronds/carrés blancs, icône centrale colorée (rouge `❌` / vert `✅`), ombre douce colorée assortie, bordure fine de la même teinte pâle

### Champs de formulaire
- Fond gris-bleu clair `#eef1f8`, coins arrondis `14px`, pas de bordure visible, texte généreux (`18px`)
- Préfixe (ex. indicatif téléphonique) en gras à gauche du champ

### Cases à cocher personnalisées
- Carré aux coins arrondis (`7px`), bordure jaune `2px`, fond blanc par défaut
- Devient **plein jaune avec coche bleue** à la sélection — transition douce

### Cartes de contenu (jeu)
- Grand format, coins très arrondis (`24-28px`), fond en dégradé bleu profond
- Superposition d'une image avec voile dégradé pour assurer la lisibilité du texte
- **Tampons ("stamps") d'estampillage** rotatifs aux coins (vrai/faux), avec couleur translucide (vert/rouge), légèrement pivotés pour un effet "tampon encreur"
- **Overlay de feedback** plein écran semi-transparent (vert = bonne réponse, rouge = mauvaise réponse) avec gros emoji central

### Barres de progression / minuteur
- Piste fine (`10px`) aux coins arrondis, fond gris-bleu clair, remplissage coloré dynamique (vert → orange → rouge selon le temps restant)
- Transition fluide de largeur et de couleur

### Badges / pastilles de classement
- Cercle (`28px`), fond doré pour la 1ère place, dégradés de gris/jaune pâle pour les rangs suivants
- Texte en gras, petite taille

### Tableaux (interfaces de gestion)
- En-têtes en majuscule discrète, fond gris très clair `#f9fafb`, texte gris foncé en gras
- Lignes alternées avec un fond bleu-blanc très pâle `#fafbff`
- Séparateurs fins `#f3f4f6`
- Boutons d'action discrets (contour bleu) ou plus marqués (fond rouge pour les actions destructives)

---

## 6. Iconographie & ton

- Usage généreux d'**émojis expressifs** comme éléments graphiques à part entière (🏆 ⚡ ✅ ❌ 👥 🗑 📥 ⏱)
- Univers thématique **sport / football / compétition** (ballon, terrain, score, chronomètre)
- Ton : énergique, jeune, convivial, orienté mobile et interaction rapide
- Microcopy en français, chaleureuse et directe : *"Content de te revoir !"*, *"Continuer"*, *"Jouer"*

---

## 7. Mouvement & interactions

- **Swipe / glissement** comme interaction centrale (gauche = faux, droite = vrai), avec retour visuel immédiat (tampon, overlay coloré)
- Transitions douces et courtes (`0.15s` à `0.4s`) sur les changements d'état (cases à cocher, barres de progression, couleurs de feedback)
- Effets de profondeur via ombres portées plutôt que par des bordures dures

---

## 8. Principes de cohérence à respecter

1. **Toujours le duo bleu/jaune** comme signature chromatique — jamais d'orange
2. **Le plectrum** comme motif décoratif récurrent et reconnaissable de la marque
3. **Figtree** comme unique police de marque, pour une cohérence typographique totale
4. **Cartes blanches sur fond coloré** comme structure de base de toute interface
5. **Feedback visuel immédiat et coloré** (vert/rouge) pour toute action de l'utilisateur
6. **Microcopy en français**, ton jeune et engageant
7. Respect du **mobile-first** : composants larges, lisibles, pensés pour le tactile

---

*Ce document décrit uniquement le langage visuel et peut être transmis librement à
toute équipe travaillant sur une autre application de la marque Yas, afin d'en
harmoniser l'apparence — sans créer de lien technique, fonctionnel ou de données
entre les produits.*
