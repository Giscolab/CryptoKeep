# Sauvegardes, imports et migrations

## Sauvegarder

Depuis une session déverrouillée, choisir **VAULT** dans les paramètres d'export.
Le fichier `.vault` conserve le coffre chiffré et s'ouvre avec le mot de passe
maître du coffre exporté. Le garder séparément du profil local.

La clé `cryptokeep.backup.v1` dans localStorage est une copie secondaire déjà
chiffrée, pas une sauvegarde indépendante. Elle partage le profil du coffre
principal. Elle peut être proposée si le principal est absent ; elle n'est
pas rétablie automatiquement et ne doit pas remplacer silencieusement un coffre.

Les préférences et les informations du profil local ne font pas partie du
fichier `.vault`. CSV et JSON sont des exports en clair ; JSON n'est pas
réimportable dans CryptoKeep. Voir [EXPORTS.md](EXPORTS.md).

## Importer un fichier `.vault`

L'interface actuelle donne accès à l'import depuis un coffre déverrouillé.
Il n'existe pas de parcours direct « Restaurer » sur le premier écran d'un
profil vierge. Sur une installation réellement vierge, un coffre vide doit
donc d'abord être initialisé pour accéder à cette interface.

Avant tout remplacement d'un coffre existant, en exporter une sauvegarde.
L'import contrôle la taille avant lecture, valide la structure, demande le
mot de passe du fichier, vérifie son chiffrement, puis exige une confirmation.
La limite du fichier importé est 10 Mio ; le format et les autres bornes sont
décrits dans [FORMATS-DE-COFFRE.md](FORMATS-DE-COFFRE.md).

Après l'import, rouvrir le coffre avec le mot de passe du fichier importé.
Un fichier bien formé mais indéchiffrable n'est pas un import valide.

## Différence entre web et desktop

| Situation | Version web | Application Windows |
|---|---|---|
| Coffre courant v2 compatible | Ouverture et import | Ouverture et import |
| Format historique v1 ou paramètres nécessitant une migration | Migration prévue après vérification | Refus sans migration automatique |
| Entrées sans horodatages nécessitant la migration correspondante | Migration prévue | Refus de migration automatique |
| Ancienne sauvegarde `vaultBackup` | Parcours de migration vérifiée | Politique desktop restrictive |

La politique vient de `scripts/core/runtime-policy.js`. Ne pas annoncer la
compatibilité de tous les anciens coffres avec le desktop sur la seule base
de leur extension `.vault`. Conserver l'original avant toute migration.

Le changement de mot de passe maître implique un nouveau sel, une nouvelle clé
et un rechiffrement vérifié. Il ne crée pas de possibilité de récupération en
cas d'oubli du mot de passe.

## En cas de disparition du coffre

Vérifier d'abord le canal, le profil et l'origine. Un coffre web, un coffre de
test et un coffre de production sont distincts. Ne pas supprimer un profil
pour résoudre un problème d'affichage. La copie secondaire ne protège pas
contre la suppression de tout le profil. Sans mot de passe maître, le projet
ne fournit pas de déchiffrement de secours.
