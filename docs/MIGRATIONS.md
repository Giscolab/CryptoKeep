# Migrations, sauvegarde et restauration

> **Document de référence, priorité haute.** Créé au Lot 10.
> Complète [`FORMATS-DE-COFFRE.md`](FORMATS-DE-COFFRE.md).

---

## Partie A — Sauvegarder

### A.1 Exporter le coffre (recommandé)

Réglages → Export. Produit un fichier `.vault` **chiffré**, ouvrable avec le
mot de passe maître du coffre qui l'a produit.

**Faites-le régulièrement.** Le mot de passe maître n'est stocké nulle part :
si vous le perdez, ni vous ni personne ne peut ouvrir le coffre. Une sauvegarde
ne protège pas contre l'oubli du mot de passe — elle protège contre la perte du
navigateur, du profil ou de la machine.

### A.2 Ce que la sauvegarde secondaire n'est pas

`cryptokeep.backup.v1` dans `localStorage` est une copie du coffre **déjà
chiffré**, mise à jour après chaque écriture principale réussie. Ce n'est
**pas** une sauvegarde au sens usuel :

- elle vit dans le même profil navigateur que le coffre ; si le profil
  disparaît, elle disparaît avec ;
- elle n'est **jamais** restaurée automatiquement ;
- le base64 qu'utilisaient les formats historiques n'apporte **aucun**
  chiffrement : c'est un encodage. La confidentialité repose entièrement sur
  le fait que le contenu est déjà chiffré par AES-GCM.

Elle sert à un seul cas : le coffre principal a disparu d'IndexedDB alors que
le profil est intact. L'application le **propose** alors, sans jamais l'imposer.

### A.3 Ce qui n'est pas sauvegardé

Le profil local (nom, courriel, langue) et les préférences ne sont pas inclus
dans l'export `.vault`. Ils ne contiennent aucun secret ; les reconfigurer prend
quelques secondes.

---

## Partie B — Restaurer

### B.1 Depuis un fichier `.vault`

Réglages → Import. La procédure, dans cet ordre :

1. contrôle de taille avant toute lecture du contenu ;
2. validation **structurelle** stricte — liste exacte de propriétés autorisées
   pour la version détectée, refus de toute propriété inattendue ;
3. demande du mot de passe maître du fichier, dans une fenêtre dédiée
   (jamais `prompt()`), champ vidé en réussite comme en échec ;
4. vérification **cryptographique** complète : le bloc de validation doit se
   déchiffrer et dire `ok` ;
5. **confirmation explicite** de remplacement du coffre courant ;
6. écriture vérifiée par relecture canonique.

Le coffre courant n'est **jamais** remplacé avant l'étape 5. L'absence de
rappel de confirmation ne vaut jamais consentement implicite : sans réponse,
l'import est abandonné.

### B.2 Depuis la sauvegarde secondaire

Proposée au démarrage **uniquement** si le coffre principal est absent — pas
illisible : une lecture en échec interdit toute écriture. La restauration exige
le mot de passe et une vérification cryptographique complète.

### B.3 Import CSV

Destiné à reprendre un export d'un autre gestionnaire. Le fichier est traité
comme **hostile** : limites de taille et de lignes, longueurs de champ,
neutralisation des formules, aucune interprétation de balisage. Les entrées
importées sont chiffrées comme les autres.

---

## Partie C — Migrations

### C.1 v1 → v2, à l'ouverture

Déclenchée automatiquement à la première ouverture **réussie** d'un coffre v1.

| Étape | Effet |
|---|---|
| 1 | Déchiffrement de toutes les entrées avec la clé v1 (150 000 itérations, sans AAD) |
| 2 | Tirage d'un **nouveau sel** de 16 octets |
| 3 | Dérivation d'une nouvelle clé à **220 000** itérations |
| 4 | Re-chiffrement de chaque entrée avec un **IV neuf** et l'AAD `vault-entry:2:<id>` |
| 5 | Nouveau bloc de validation avec l'AAD `vault-validation:2` |
| 6 | Écriture vérifiée par relecture canonique |

Le mot de passe maître **ne change pas**. Un coffre v1 dont l'ouverture échoue
n'est pas migré : rien n'est écrit.

Si la migration échoue à une étape quelconque, aucune écriture partielle n'est
laissée : le coffre v1 reste intact et ouvrable.

### C.2 Migration des horodatages d'entrée

Les entrées anciennes sans `createdAt` / `updatedAt` en reçoivent à l'ouverture.
Cette migration est silencieuse et sans risque : elle n'affecte que des
métadonnées non sensibles.

### C.3 Migration de la sauvegarde historique

La clé `vaultBackup` a porté deux formats incompatibles : un JSON direct, et le
même JSON encodé en base64. Les deux sont reconnus et migrés vers l'enveloppe
versionnée `cryptokeep.backup.v1`.

Cette migration exige le mot de passe et une **vérification cryptographique
complète**. Une sauvegarde bien formée mais indéchiffrable n'est jamais promue.
En cas d'échec, `vaultBackup` est **conservée**.

### C.4 Changement du mot de passe maître

Ce n'est pas une migration de format, mais la procédure est du même ordre :
nouveau sel, nouvelle clé, re-chiffrement de toutes les entrées avec des IV
neufs, nouveau bloc de validation, écriture vérifiée, puis relecture du coffre
écrit pour confirmer qu'il s'ouvre avec le **nouveau** mot de passe. En cas
d'échec à n'importe quelle étape, l'ancien coffre reste en place et ouvrable
avec l'ancien mot de passe.

---

## Partie D — Si quelque chose tourne mal

| Symptôme | Ce que cela signifie | Que faire |
|---|---|---|
| « Impossible de déverrouiller ou migrer le coffre » | Mot de passe erroné, ou coffre altéré. Le message est volontairement générique et ne dit pas lequel. | Vérifier la casse et la disposition du clavier. Si le doute persiste, importer votre dernier `.vault`. |
| Le bouton propose « Créer » alors qu'un coffre existait | Le profil navigateur a changé, ou le coffre a disparu. | **Ne pas créer de nouveau coffre.** Vérifier que le lanceur ouvre bien le profil dédié, puis importer votre `.vault`. |
| Une alerte annonce que la persistance n'a pas pu être vérifiée | Le contrôle lui-même a échoué. Il ne dit rien sur votre coffre. | Aucune action. Signaler si cela se répète. |
| « Le navigateur refuse d'écrire dans IndexedDB » | Refus **observé**. Souvent : navigation privée. | Fermer les fenêtres privées, relancer avec `start_vault_secure.bat`. |
| Suppression signalée « INCOMPLÈTE » | Une partie des données est toujours présente. | Lire le détail affiché : chaque cible y est nommée avec son état. |

En cas de doute sur l'état d'un coffre, **exportez avant toute autre action**.
Un export est sans risque : il ne modifie rien.
