# Formats de coffre — v1 et v2

> **Document de référence, priorité haute.** Créé au Lot 10.
> Les valeurs citées viennent de `scripts/core/storage/vault-format.js`, et un
> test échoue si elles divergent (`tests/documentation.spec.js`).

## 1. Où vit le coffre

| Emplacement | Base | Store | Clé | Contenu |
|---|---|---|---|---|
| Coffre chiffré | IndexedDB `VaultDB` | `vault` | `current` | Le coffre entier |
| Profil local | IndexedDB `vault-db` | `settings` | `user-profile` | Nom, courriel, langue — **non chiffré**, non sensible |
| Sauvegarde secondaire | `localStorage` | — | `cryptokeep.backup.v1` | Copie du coffre **déjà chiffré** |
| Sauvegarde historique | `localStorage` | — | `vaultBackup` | Deux formats antérieurs, migrés puis conservés |

Les deux bases IndexedDB sont **distinctes** malgré la ressemblance de leurs
noms. La suppression volontaire (Lot 8) les traite séparément.

## 2. Structure d'un enregistrement

```json
{
  "id": "current",
  "entries": [
    { "id": "<identifiant>", "iv": "<base64, 12 octets>", "ciphertext": "<base64>" }
  ],
  "meta": {
    "salt": "<base64, 16 octets>",
    "kdf": "PBKDF2-HMAC-SHA512",
    "iterations": 220000,
    "version": 2,
    "created_at": "<ISO 8601>",
    "last_modified": "<ISO 8601>",
    "validation": { "iv": "<base64>", "ciphertext": "<base64>" }
  }
}
```

Le **tag d'authentification GCM n'est pas un champ séparé** : Web Crypto le
place en fin de `ciphertext`. Un fichier importé qui présenterait un champ
`authTag` est refusé.

## 3. Ce qui distingue v1 de v2

| | **v1 — historique** | **v2 — courant** |
|---|---|---|
| `meta.version` | absent, `1`, `"1"` ou `"1.0.0"` | `2`, `"2"` ou `"2.0.0"` |
| Itérations PBKDF2 | 150 000 | **220 000** |
| AAD sur les entrées | **aucune** | `vault-entry:2:<id>` |
| AAD sur la validation | **aucune** | `vault-validation:2` |
| Lecture | supportée | supportée |
| Écriture | **jamais** — toute écriture migre en v2 | oui |

Un coffre v1 reste ouvrable. À la première ouverture réussie, il est migré ;
voir [`MIGRATIONS.md`](MIGRATIONS.md).

## 4. Pourquoi l'AAD compte

En v1, une entrée chiffrée pouvait être déplacée sous un autre identifiant sans
que rien ne le détecte : le contenu se déchiffrait correctement, simplement
rattaché à la mauvaise entrée. En v2, l'identifiant fait partie des **données
authentifiées** : le déchiffrement échoue si l'entrée a été déplacée.

Le bloc `validation` suit la même logique avec `vault-validation:2`. Il
contient `{ "check": "ok" }` chiffré. À l'ouverture, son déchiffrement **et**
son contenu sont vérifiés : un coffre fabriqué dont le bloc se déchiffre mais
ne dit pas `ok` est refusé.

## 5. Bornes de validation

| Borne | Valeur | Constante |
|---|---|---|
| Sel | 16 octets exactement | `VAULT_SALT_BYTES` |
| IV | 12 octets exactement | — |
| Itérations acceptées à la lecture | 100 000 à 1 000 000 | `MIN_PBKDF2_ITERATIONS`, `MAX_PBKDF2_ITERATIONS` |
| Entrées par coffre | 5 000 | `MAX_VAULT_ENTRIES` |
| Ciphertext par entrée | 1 Mio | `MAX_ENTRY_CIPHERTEXT_BYTES` |
| Fichier `.vault` importé | 10 Mio | `MAX_VAULT_FILE_BYTES` |
| Fichier CSV importé | 10 Mio, 5 000 lignes | `MAX_CSV_FILE_BYTES`, `MAX_CSV_ROWS` |
| Champ texte | 4 096 caractères | `MAX_FIELD_LENGTH` |
| Notes | 16 384 caractères | `MAX_NOTES_LENGTH` |

Toute propriété non listée pour la version détectée est **refusée**, jamais
supprimée silencieusement. Les identifiants et les IV sont comparés **décodés**,
pas sous leur forme base64.

## 6. Écriture : ce qui est garanti

Chaque écriture suit la même discipline, sans exception :

1. lecture préalable du coffre — un échec de lecture **n'est pas** un coffre
   absent, et interdit toute écriture ;
2. instantané chiffré de l'état précédent ;
3. écriture dans une transaction unique, validation attendue ;
4. relecture et comparaison **canonique** (clés triées) ;
5. restauration de l'instantané **uniquement** si l'écriture a été validée mais
   que la relecture diverge — jamais après une transaction annulée ;
6. vérification de la restauration.

La sauvegarde secondaire n'est mise à jour qu'**après** succès de l'écriture
principale, et n'est **jamais** restaurée automatiquement.

## 7. Fichier `.vault` exporté

Même structure que l'enregistrement ci-dessus. Il est **chiffré** : ni titre, ni
identifiant de connexion, ni mot de passe, ni URL n'y apparaissent en clair.
Son ouverture exige le mot de passe maître du coffre qui l'a produit.

Un `.vault` exporté est un **secret** : sa confidentialité ne tient qu'à la
force du mot de passe maître et aux 220 000 itérations. Traitez-le comme le
coffre lui-même.
