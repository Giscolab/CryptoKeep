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

## Importer dans Google Password Manager / Chrome

1. Exportez **CSV Chrome/Edge** depuis CryptoKeep et confirmez le téléchargement.
2. Ouvrez [Google Password Manager](https://passwords.google.com/), puis
   **Paramètres (Settings) → Importer (Import) → Sélectionner un fichier**.
3. Choisissez le CSV et lancez l'import, puis vérifiez les identifiants importés.
4. Supprimez le CSV après utilisation.

Google indique une limite de **3 000 mots de passe par import**. CryptoKeep ne
découpe pas automatiquement l'export ; au-delà, préparez des lots compatibles
avec cette limite à l'aide d'un outil adapté aux mots de passe. Le service
Google peut ensuite synchroniser les identifiants dans votre compte : cette
étape est extérieure à CryptoKeep. [Instructions officielles Google](https://support.google.com/accounts/answer/10500247).

Le code actuel de Chromium impose aussi un fichier d'au plus **1 024 000
octets**, des identifiants et mots de passe d'au plus **1 000 octets UTF-8**,
et une URL normalisée d'au plus **2 048 octets**. Ces limites peuvent varier
selon la version du navigateur. CryptoKeep préserve les valeurs exportées,
sans les tronquer ; un navigateur peut donc refuser des champs trop longs ou
un fichier trop volumineux. Le décompte affiché décrit les entrées du CSV,
pas une garantie d'acceptation par le navigateur cible.
[Importeur Chromium](https://raw.githubusercontent.com/chromium/chromium/main/components/password_manager/core/browser/import/password_importer.cc),
[limites Chromium](https://raw.githubusercontent.com/chromium/chromium/main/components/password_manager/core/common/password_manager_constants.h).

## Importer dans Microsoft Edge

1. Exportez **CSV Chrome/Edge** depuis CryptoKeep et confirmez le téléchargement.
2. Dans Edge, ouvrez **Paramètres (Settings) → Profils (Profiles) → Importer les
   données du navigateur (Import browser data)**.
3. Sous **Autres emplacements d'importation (Other import locations)**,
   choisissez **Importer les mots de passe maintenant (Import passwords now)**,
   puis **Fichier CSV de mots de passe (Passwords CSV file)**.
4. Sélectionnez le CSV, terminez l'import, vérifiez les identifiants et
   supprimez le fichier en clair.

Ces étapes utilisent l'import CSV natif d'Edge.
[Instructions officielles Microsoft](https://support.microsoft.com/en-us/edge/import-your-favorites-and-passwords-in-microsoft-edge).

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
