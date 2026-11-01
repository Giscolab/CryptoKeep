# Historique des versions — CryptoKeep

Ce journal présente les livraisons et changements du produit. L'historique
complet des commits reste disponible dans Git. Les anciens comptes rendus de
développement ne constituent pas une description du comportement courant.

## 0.1.0 — préversion Windows — 1er novembre 2026

- Première Release Windows x64, construite avec Tauri 2 et WebView2.
- Installateur pour l'utilisateur courant, raccourcis et désinstalleur configuré
  pour conserver les données locales.
- Profils distincts de production, développement et test, origine desktop stable.
- Ressources applicatives embarquées à partir d'un inventaire explicite ; aucun
  coffre, journal, profil ou mot de passe de démonstration inclus.
- Desktop hors ligne au niveau applicatif ; HIBP et migrations automatiques
  désactivés dans ce canal. La version web conserve ses comportements.
- Dépendances Rust verrouillées ; commandes de compilation du prototype et de
  l'installateur de production disponibles dans `package.json`.

Le binaire n'est pas signé. Les contrôles complémentaires restent à mener ;
la livraison demeure une préversion. Sources : commits `0c6d1ce` et `57cce84`.

## Exports CSV et JSON — 25 octobre 2026

- Export VAULT chiffré conservé comme choix par défaut.
- Export CSV Chrome/Edge et JSON en clair après confirmation explicite.
- Contrôle de validité de la session et annulation du téléchargement au verrouillage.
- CSV limité aux entrées compatibles ; nombre d'entrées ignorées annoncé.

Source : commit `0eafb5f`. Voir [le guide des exports](docs/EXPORTS.md).

## Évolutions antérieures

Le code intègre le format de coffre v2 avec AAD, les écritures vérifiées,
la coordination Web Locks, le verrouillage de session et la validation stricte
des imports. Les formats et limites actuels sont décrits dans
[FORMATS-DE-COFFRE.md](docs/FORMATS-DE-COFFRE.md).
Les dates, auteurs et descriptions originales des changements sont conservés
dans l'historique Git, sans réécriture rétroactive.
