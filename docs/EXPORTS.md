# Exporter vers VAULT, Chrome/Edge ou JSON

Dans **Paramètres → Exporter les données**, choisissez le format puis cliquez
sur **Exporter** depuis le coffre déverrouillé.

| Format | Contenu | Usage |
|---|---|---|
| **VAULT**, par défaut | Coffre complet chiffré, format existant | Sauvegarder et restaurer dans CryptoKeep avec le mot de passe maître |
| **CSV Chrome/Edge** | `name,url,username,password` en clair, entrées compatibles seulement | Importer dans Google Password Manager ou Microsoft Edge |
| **JSON** | Tous les champs des entrées en clair | Export générique vers un outil compatible avec ce schéma ; aucun import JSON dans CryptoKeep |

## Fichiers en clair : confirmation et précautions

CSV et JSON nécessitent une confirmation explicite indiquant que les mots de
passe seront lisibles. La session doit être déverrouillée et toujours valide,
y compris après cette confirmation. Le verrouillage annule le dialogue et
empêche le téléchargement.

Le contenu est préparé en mémoire pour le téléchargement demandé. CryptoKeep
ne l'enregistre pas dans IndexedDB, `localStorage`, `sessionStorage` ou les
journaux et ne l'envoie pas sur le réseau. Le fichier téléchargé, lui, **n'est
pas chiffré** : toute personne qui y accède peut lire les mots de passe.

**Ne l'ouvrez pas dans un tableur.** Les caractères réels sont conservés,
y compris `=`, `+`, `-` et `@` en début de cellule. Aucune apostrophe ni autre
transformation de protection des tableurs n'est ajoutée : elle modifierait les
identifiants importés. Un tableur peut interpréter ces valeurs comme des
formules ; importez directement le CSV dans le gestionnaire de mots de passe.

Après utilisation, supprimez le fichier en clair et ses éventuelles copies.
L'application ne peut ni retrouver ni effacer les fichiers déjà téléchargés ;
leur suppression ne garantit pas l'effacement des copies ou sauvegardes du
système. Voir aussi [les limites de sécurité](../SECURITY.md).

## Contenu et limites du CSV

L'en-tête est exactement `name,url,username,password`. Le fichier utilise
UTF-8, la virgule comme séparateur et CRLF comme fin de ligne, avec échappement
RFC 4180 des guillemets, virgules et retours à la ligne. Les accents et autres
caractères sont conservés.

Une entrée est incluse seulement si son URL est valide et utilise HTTP ou
HTTPS, et si son mot de passe n'est pas vide. Un nom d'utilisateur vide est
accepté. Le nombre d'entrées ignorées est affiché dans la confirmation,
même s'il est nul, et rappelé dans le message de réussite si des entrées
ont été exclues.

Le CSV omet les notes, catégories, étiquettes et horodatages. Il ne constitue
donc pas une sauvegarde complète. Conservez un **VAULT** pour une restauration
chiffrée complète, ou un **JSON** pour tous les champs en clair.

## Importer dans un autre gestionnaire

Exporter le CSV puis utiliser la fonction d'import de mots de passe du
gestionnaire cible. Les menus, tailles maximales et nombres d'entrées acceptés
varient selon sa version ; les vérifier dans sa documentation au moment du transfert.
L'export CryptoKeep ne garantit pas l'acceptation de toutes les entrées par ce logiciel.

L'import dans un service associé à un compte peut synchroniser les données sur
ses serveurs : ce transfert est extérieur à CryptoKeep. Vérifier les identifiants
importés, puis supprimer le fichier en clair et ses copies inutiles.

## Structure du JSON

L'enveloppe est versionnée séparément du format chiffré du coffre :

```json
{
  "format": "cryptokeep-plaintext",
  "version": 1,
  "entries": []
}
```

`entries` contient les entrées complètes, avec leurs champs présents : titre,
URL, nom d'utilisateur, mot de passe, notes, catégorie, étiquettes, identifiants
et horodatages. Le mot de passe maître, la clé et les métadonnées
cryptographiques du coffre (sel, KDF, IV, ciphertext, validation) ne font pas
partie de l'enveloppe. Ce JSON n'est pas un format d'import natif Chrome/Edge
et ne se réimporte pas dans CryptoKeep ; utilisez VAULT pour restaurer.
