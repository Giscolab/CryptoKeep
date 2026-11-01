# Fonctions disponibles dans CryptoKeep

Cet inventaire résume le code courant ; le code source fait autorité. Une
interface présente ou une ancienne feuille de route ne prouve pas une fonction.

| Fonction | Implémentation principale | Limite ou différence de canal |
|---|---|---|
| Créer, ouvrir et verrouiller un coffre | `scripts/core/vault/manager.js`, `scripts/app.js` | Mot de passe maître choisi par l'utilisateur |
| Ajouter, modifier et supprimer des entrées | `scripts/core/vault/entry-operations.js` | Session déverrouillée |
| Validation des champs | `scripts/core/vault/entry-validation.js` | Bornes et validation des données |
| Chiffrement AES-GCM et dérivation PBKDF2 | `scripts/core/crypto/aes-gcm.js`, `scripts/core/crypto/pbkdf2.js` | Voir le format v2 |
| Stockage et copie secondaire chiffrés | `scripts/core/storage/manager.js`, `scripts/core/storage/local-backup.js` | Même profil ; sauvegarde externe nécessaire |
| Import `.vault` | `scripts/core/storage/vault-import-service.js` | Validation, mot de passe et confirmation avant remplacement |
| Import CSV | `scripts/utils/csv-import-service.js`, `scripts/utils/csv-parser.js` | Limites de taille, de lignes et de champs |
| Exports VAULT, CSV et JSON | `scripts/core/storage/vault-export-service.js`, `scripts/ui/vault-export.js` | CSV/JSON en clair après consentement ; aucun import JSON |
| Recherche, catégories et tris | `scripts/utils/vault-filters.js` | Catégories et champs disponibles dans les entrées |
| Génération et analyse de mots de passe | `scripts/utils/password-generator.js`, `scripts/security/password-policy.js` | Estimation locale, pas une certification |
| Analyse de réutilisation et rapport | `scripts/security/audit-engine.js`, `scripts/ui/audit-report-view.js` | Analyse des données effectivement disponibles |
| HIBP | `scripts/security/hibp-service.js` | Web : facultatif ; desktop : bloqué |
| Verrouillage automatique | `scripts/security/autolock-controller.js` | Configurable ; veille Windows non garantie |
| Copie et tentative d'effacement du presse-papiers | `scripts/utils/clipboard.js` | Permissions et focus nécessaires |
| Paramètres et thèmes | `scripts/utils/app-settings.js`, `scripts/ui/theme-selector.js` | Préférences locales |
| Changement du mot de passe maître | `scripts/core/vault/master-password-change.js` | Rechiffrement et vérification |
| Suppression volontaire du coffre | `scripts/core/vault/vault-destruction.js` | Pas d'effacement sécurisé ni de suppression des exports |
| Application Windows et installateur | `src-tauri/`, `desktop/` | Release 0.1.0 en préversion |
| Version web locale | `scripts/secure_local_server.py`, `start_vault_secure.bat` | Serveur local HTTP, profil navigateur dédié |

Le desktop refuse les migrations automatiques. Il n'existe pas de parcours
direct de restauration `.vault` sur le premier écran d'un profil vierge.
Voir [MIGRATIONS.md](MIGRATIONS.md) et [les fonctions absentes](FONCTIONS-PREVUES.md).
