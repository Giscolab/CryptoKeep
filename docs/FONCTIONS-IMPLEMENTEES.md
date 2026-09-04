# Inventaire des fonctions RÉELLEMENT implémentées

> **Document de référence, priorité haute.** Créé au Lot 10.
>
> Chaque ligne renvoie au fichier qui l'implémente et au test qui le prouve.
> Une fonction absente de ce tableau n'existe pas, même si elle est mentionnée
> ailleurs dans le dépôt. Les documents historiques annonçaient des fonctions
> jamais écrites — c'est précisément ce que ce fichier corrige.

Statuts employés :

| Statut | Signification |
|---|---|
| **Disponible** | Implémenté, câblé à l'interface, testé |
| **Disponible (sans interface)** | Implémenté et testé, mais sans commande dédiée dans l'écran |
| **Expérimental** | Implémenté, mais désactivé par défaut ou soumis à consentement |
| **Absent** | Pas de code. Voir `docs/FONCTIONS-PREVUES.md` |

---

## 1. Coffre et cycle de vie

| Fonction | Statut | Implémentation | Test |
|---|---|---|---|
| Création du coffre au premier lancement | Disponible | `core/vault/manager.js` → `createVault` | `L1`–`L4` |
| Déverrouillage par mot de passe maître | Disponible | `manager.js` → `unlock` | `L7`, `B7` |
| Refus d'un mauvais mot de passe, message générique | Disponible | `manager.js`, `app.js` | `L8`–`L10`, `B6` |
| Politique de mot de passe maître | Disponible | `security/master-password-policy.js` | `tests/master-password-policy.spec.js`, `L5`, `L6` |
| Changement du mot de passe maître (17 étapes) | Disponible | `core/vault/master-password-change.js` | `tests/master-password-change.spec.js` (22) |
| Verrouillage automatique sur inactivité | Disponible | `security/autolock-controller.js` | `tests/autolock-controller.spec.js` |
| Verrouillage quand l'onglet passe en arrière-plan | Disponible | `security/autolock-controller.js` | idem |
| Verrouillage manuel / purge de session | Disponible | `security/session-lock.js` | `L14`–`L17`, `B12` |
| Déconnexion | Disponible | `security/logout.js` | `tests/logout-session.spec.js`, `B13` |
| Suppression volontaire (coffre / profil / tout) | Disponible | `core/vault/vault-destruction.js`, `ui/vault-destruction-modal.js` | `tests/vault-destruction*.spec.js` (46) |

## 2. Entrées

| Fonction | Statut | Implémentation | Test |
|---|---|---|---|
| Ajout d'une entrée | Disponible | `core/vault/entry-operations.js` | `tests/entry-operations.spec.js`, `B4` |
| Modification | Disponible | idem | idem, `B8` |
| Suppression | Disponible | idem | idem |
| Validation des champs | Disponible | `core/vault/entry-validation.js` | `tests/entry-validation.spec.js` |
| Catégories | Disponible | `utils/vault-filters.js` → `inferCategory` | `F1`, `F3` |
| Recherche insensible aux accents et à la casse | Disponible | `utils/vault-filters.js` | `F2`, `F6`, `F7` |
| Tris (alphabétique, récent) | Disponible | `utils/vault-filters.js` | `F4`, `F5`, `F10` |
| Accès récents | Disponible | `app.js` → `renderRecentAccesses` | `tests/lot3b-integration.spec.js` |
| Générateur de mots de passe | Disponible | `utils/password-generator.js`, `ui/entry-modal.js` | `M4b` |
| Étiquettes (tags), collections | **Absent** | — | — |

## 3. Chiffrement et stockage

| Fonction | Statut | Implémentation | Test |
|---|---|---|---|
| AES-GCM 256, IV unique, AAD | Disponible | `core/crypto/aes-gcm.js` | `C1`–`C11` |
| PBKDF2-HMAC-SHA-512, 220 000 itérations | Disponible | `core/crypto/pbkdf2.js` | `tests/crypto.spec.js` |
| Clé maître non extractible | Disponible | `core/crypto/pbkdf2.js` | `C14` |
| Format de coffre versionné (v1, v2) | Disponible | `core/storage/vault-format.js` | `tests/vault-format.spec.js` |
| Migration v1 → v2 à l'ouverture | Disponible | `core/vault/manager.js` | `tests/vault-manager-migration.spec.js` |
| Écriture vérifiée par relecture canonique | Disponible | `core/storage/vault-transaction.js` | `tests/lot3b-integration.spec.js` (`A1`–`A8`) |
| Distinction « illisible » / « absent » | Disponible | `core/storage/manager.js` | `D5`, `A5`, `A6` |
| Sauvegarde secondaire versionnée | Disponible | `core/storage/local-backup.js` | `tests/local-backup.spec.js` |
| Restauration sur proposition explicite | Disponible | `core/storage/backup-restore-service.js` | `tests/restore-race.spec.js` |
| Sonde de persistance du stockage | Disponible | `security/storage-persistence.js` | `tests/storage-persistence.spec.js` |

## 4. Import et export

| Fonction | Statut | Implémentation | Test |
|---|---|---|---|
| Export `.vault` chiffré | Disponible | `core/vault/manager.js` → `exportVaultRecord` | `B9` |
| Import `.vault` validé puis confirmé | Disponible | `core/storage/vault-import-service.js` | `tests/vault-import-service.spec.js` |
| Validation structurelle stricte | Disponible | `core/storage/vault-import-validator.js` | `tests/vault-import-validator.spec.js`, `B10`, `B11` |
| Limites de taille centralisées | Disponible | `core/storage/import-limits.js` | `tests/vault-import-*`, `tests/csv-import-service.spec.js` |
| Import CSV | Disponible | `core/storage/csv-import-service.js`, `utils/csv-parser.js` | `tests/csv-parser.spec.js`, `tests/csv-import-service.spec.js` |
| Synchronisation entre appareils | **Absent** | — | — |

## 5. Analyse de sécurité

| Fonction | Statut | Implémentation | Test |
|---|---|---|---|
| Moteur d'audit véridique | Disponible | `security/audit-engine.js` | `tests/audit-engine.spec.js` |
| Rapport d'audit affiché | Disponible | `ui/audit-report-view.js` | `tests/lot3b-integration.spec.js` (`N1`–`N7`) |
| Politique de robustesse (entropie plafonnée) | Disponible | `security/password-policy.js` | `tests/password-policy.spec.js` (15) |
| Détection de réutilisation par égalité exacte | Disponible | `security/password-reuse.js` | `tests/password-reuse.spec.js` (11) |
| Regroupement historique de réutilisation | Disponible (sans interface) | `security/password-reuse-groups.js` | `tests/password-reuse-groups.spec.js` (9) |
| Vérification de compromission (HIBP) | **Expérimental** | `security/hibp-service.js` | `tests/hibp-consent.spec.js` (12) |

> **HIBP** est la **seule** fonction réseau du projet. Elle est désactivée par
> défaut et n'émet aucune requête tant que l'utilisateur n'a pas coché la case
> après lecture du texte de consentement. Activée, elle envoie un préfixe de
> 5 caractères de condensat par mot de passe, et l'adresse IP est visible du
> service.

## 6. Réglages et confort

| Fonction | Statut | Implémentation | Test |
|---|---|---|---|
| Préférences à schéma fermé | Disponible | `utils/app-settings.js` | `tests/app-settings.spec.js` |
| Réglages câblés à l'état réellement persisté | Disponible | `ui/settings-controls.js` | `tests/settings-controls.spec.js` (11) |
| Effacement conditionnel du presse-papiers | Disponible | `utils/clipboard.js` | `tests/clipboard-clear.spec.js` |
| Thèmes (15) | Disponible | `ui/theme-selector.js`, `utils/theme-loader.js` | `7C.10`, `7C.11` |
| Préférences d'affichage | Disponible | `utils/view-preferences.js` | `J1` |
| Profil local (nom, courriel, langue) | Disponible | `utils/idb-helper.js`, `ui/settings.js` | `8.6`, `8.15` |
| Double authentification (2FA) | **Absent** — bascule désactivée et documentée | `index.html`, `docs/2FA-WEBAUTHN-AUTOFILL.md` | `M6`, `M39` |
| Remplissage automatique | **Absent** — bascule désactivée et documentée | idem | `M6` |
| Retour haptique | **Absent** | — | — |

## 7. Lancement

| Fonction | Statut | Implémentation | Test |
|---|---|---|---|
| Lanceur Windows avec profil persistant | Disponible | `start_vault_secure.bat` | `tests/launcher-persistence.spec.js` |
| Lanceur historique | Disponible (conservé) | `start_vault_local.bat` | idem |
| Serveur local avec en-têtes de sécurité | Disponible | `scripts/secure_local_server.py` | `npm run test:python` |
| Arrêt ciblé du serveur | Disponible | `scripts/stop_secure_server.ps1` | — |
| Export HTML des journaux | Disponible (sans interface) | `export_log.py` | `npm run test:python` |
| Application desktop | **Absent** | — | `docs/DECISION-APPLICATION-DESKTOP.md` |
| Installation PWA | **Absent** — manifeste présent, aucun service worker | `public/icons/site.webmanifest` | — |

---

## Ce que le dépôt annonçait sans l'implémenter

Relevé au Lot 10 dans `README.md`, et corrigé depuis. Aucune de ces fonctions
n'existe dans le code :

- WebAuthn / FIDO2, authentification biométrique (`ui/biometric-auth/`) ;
- « emergency kit » / gestion de secours (`ui/emergency-kit/`) ;
- synchronisation chiffrée entre appareils ;
- étiquettes et collections ;
- retour haptique ;
- protection contre les canaux auxiliaires ;
- détection d'environnements compromis ;
- « nettoyage automatique des buffers mémoire » — contredit par
  `SECURITY.md` §4.2, qui explique pourquoi c'est impossible en JavaScript ;
- tests de charge (`tests/stress-tests/`) et tests d'intrusion
  (`tests/penetration-tests/`) ;
- modules `core/crypto-engine.js`, `core/vault-manager.js`,
  `core/security-monitor.js` — l'arborescence réelle est différente.
