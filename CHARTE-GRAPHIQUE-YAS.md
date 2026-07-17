# Charte graphique — Yas Comores (jeux gamifiés)

> Document de design partageable. Décrit uniquement l'identité visuelle.
> ⚠️ Ne contient et ne doit contenir aucune référence technique, base de données,
> API ou code reliant ce document à un projet existant. À utiliser comme simple
> référence de style pour harmoniser l'apparence d'applications Yas indépendantes.

---

## 1. Couleurs

| Usage | Couleur | Code hex |
|---|---|---|
| Couleur principale (fond, textes forts) | Bleu Yas | `#00377D` |
| Couleur d'accent (boutons, titres, surbrillance) | Jaune Yas | `#FFD100` |
| Texte secondaire | Gris ardoise | `#374151` / `#6b7280` |
| Texte discret / placeholder | Gris clair | `#9ca3af` |
| Fond de carte / surface | Blanc | `#ffffff` |
| Fond alterné de tableau | Bleu très pâle | `#fafbff` |
| Succès / actif | Vert | `#22C55E` |
| Erreur / suppression | Rouge | `#ef4444` |

> ❌ Pas d'orange dans la charte Yas.

---

## 2. Typographie

- **Police principale** : `Figtree` (sans-serif, à charger via Google Fonts ou self-hosted)
- **Titres** : `font-weight: 900`, lettres espacées (`letter-spacing: 2px`), couleur bleue ou jaune selon le contexte
- **Corps de texte** : `font-weight: 400-700`
- **Tailles courantes** :
  - Titres de page : `clamp(24px, 6vw, 32px)`
  - Score / valeurs chiffrées mises en avant : `18-20px`, bleu `#00377D`
  - Texte de tableau / listes : `14px`
  - Labels / petites infos : `12-13px`

---

## 3. Composants & style général

- **Cartes** : fond blanc, coins très arrondis (`border-radius: 16-22px`), ombre douce (`box-shadow: 0 16px 48px rgba(0,0,0,0.22)` pour les cartes principales, plus légère pour les tableaux : `0 2px 12px rgba(0,0,0,0.06)`)
- **Boutons primaires (CTA)** : fond jaune `#FFD100`, texte bleu `#00377D`, `font-weight: 900`, coins arrondis (`14px`), padding généreux (`16-18px`)
- **Boutons secondaires / liens** : fond transparent ou blanc, bordure bleue, texte bleu
- **Boutons destructifs** (réinitialiser, supprimer) : fond rouge `#ef4444`, texte blanc, `font-weight: 700`, coins arrondis (`10px`)
- **Champs de saisie** : bordure grise claire (`2px solid #e5e7eb`), coins arrondis (`14px` pour formulaires, `10px` pour recherche), focus net sans ombre excessive
- **Cases à cocher personnalisées** : carré à coins arrondis (`7px`), bordure jaune, devient jaune plein avec coche bleue quand actif
- **Tableaux (back-office)** : en-têtes gris clair sur fond `#f9fafb`, lignes alternées `#fafbff`, séparateurs fins `#f3f4f6`
- **Badges de classement** : pastille ronde, fond jaune pour le 1er, dégradés de gris/jaune pâle pour les suivants

---

## 4. Identité graphique

- **Logo** : logo Yas (format SVG), généralement positionné sur une forme décorative
- **Forme décorative signature** : grand "blob" / médiator (plectre) coloré en jaune ou bleu, légèrement pivoté, en arrière-plan des écrans d'accueil — élément reconnaissable de l'identité Yas
- **Ton général** : énergique, jeune, sportif (univers football / Coupe du Monde), interface mobile-first avec grandes zones tactiles

---

## 5. Principes d'usage

- Toujours respecter le contraste bleu/jaune comme duo de couleurs dominant
- Les actions positives et la progression (score, victoire) → jaune sur fond blanc/bleu
- Les actions destructives (réinitialisation de données) → rouge, **toujours avec confirmation utilisateur**
- Interface en français, ton convivial et direct ("Content de te revoir !", "Jouer", etc.)
- Mobile-first : composants larges, lisibles, espacés pour un usage tactile

---

## 6. Notes de mise en œuvre (génériques, non liées à un projet)

- Privilégier des styles simples et auto-portés (pas de dépendance lourde à un framework CSS)
- Garder une cohérence typographique stricte (une seule police d'accent : Figtree)
- Réutiliser le même langage visuel (couleurs, formes, arrondis) pour que les différentes
  applications Yas soient reconnaissables comme appartenant à la même marque,
  **sans pour autant partager de code, de base de données ou d'infrastructure**.

---

*Ce document peut être transmis librement à toute équipe travaillant sur une autre
application Yas (ex. jeu de pronostics) afin d'harmoniser l'apparence, sans créer
de lien technique ou fonctionnel entre les deux produits.*
