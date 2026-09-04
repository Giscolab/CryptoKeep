# Site de documentation historique (`docs/index.html`)

> **Statut : HISTORIQUE, OBSOLÈTE, CONSERVÉ.** Marqué au Lot 10.
> La documentation en vigueur est celle du dépôt, listée dans
> [`README.md`](../README.md) et [`SECURITY.md`](../SECURITY.md).

## Ce que c'est

`docs/index.html` et `docs/assets/` forment un site compilé, servi par GitHub
Pages. Ce n'est pas l'application : c'est une ancienne page de présentation.

| Fichier | Taille | Nature |
|---|---|---|
| `docs/index.html` | 29 lignes | Page hôte |
| `docs/assets/index-q6yya6Gb.js` | ~360 Ko | **Bundle compilé**, code source absent du dépôt |
| `docs/assets/index-2t0zffAG.css` | ~75 Ko | Feuille compilée |

## Pourquoi il est marqué obsolète

1. **Les URL sont fausses.** La page déclare
   `https://giscolab.github.io/vault-personal/` en `og:url` et `og:image`,
   alors que le dépôt est `Giscolab/CryptoKeep`. Le nom `vault-personal` est
   celui du dossier local, pas celui du dépôt publié.
2. **L'image d'aperçu n'existe pas.** `assets/vault-personal-preview.png` est
   référencée deux fois et absente du dépôt.
3. **C'est un bundle compilé sans source.** Le projet interdit toute
   dépendance applicative et tout framework ; ce bundle est du code que
   personne ne peut relire ni auditer dans ce dépôt.
4. **Le discours est celui que les lots 6 à 9 ont corrigé.** « Sécurité
   militaire », « architecture zero-knowledge » : des formules invérifiables,
   du même registre que les fonctions annoncées et jamais écrites.

## Ce qui a été fait, et ce qui ne l'a pas été

**Fait au Lot 10** : un bandeau visible en haut de `docs/index.html` annonce le
statut historique et renvoie vers la documentation en vigueur. La page continue
de se charger normalement.

**Pas fait** : rien n'a été supprimé. Ni la page, ni les bundles, ni les
métadonnées. La règle de conservation du projet s'applique intégralement.

## Décision à prendre par le mainteneur

Trois options, à trancher hors de ce document :

| Option | Effet |
|---|---|
| Laisser en l'état | Le bandeau suffit ; la page reste servie telle quelle |
| Remplacer par une page statique écrite à la main | Cohérent avec « zéro framework », mais demande du travail |
| Désactiver GitHub Pages | Supprime la page publique sans rien retirer du dépôt |

Aucune n'est appliquée : la publication d'un site est une décision de
publication, pas une correction de documentation.
