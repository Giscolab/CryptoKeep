# 🧾 Changelog — CryptoKeep

> Journal par lot. Le projet s'appelle **CryptoKeep** ; `Vault` et
> `vault-personal` sont d'anciens noms encore présents dans des entrées
> antérieures au Lot 10. Elles sont **conservées telles quelles** : un
> journal se lit tel qu'il a été écrit.

---

## 📚 [Lot 10] Documentation et cohérence – *4 septembre 2026*

**Résumé :** aucune documentation supprimée. Les documents historiques sont
marqués, la documentation en vigueur est créée et rendue prioritaire, et les
incohérences relevées sont corrigées puis verrouillées par des tests.

### Documents créés
- `SECURITY.md` — référencé deux fois par le README et **inexistant**.
  Protections implémentées avec le test qui prouve chaque ligne, et sept
  limites réelles énoncées sans euphémisme.
- `docs/LANCEMENT-SECURISE.md`, `docs/FONCTIONS-IMPLEMENTEES.md`,
  `docs/FONCTIONS-PREVUES.md`, `docs/FORMATS-DE-COFFRE.md`,
  `docs/MIGRATIONS.md`, `docs/DECISION-APPLICATION-DESKTOP.md`,
  `docs/MODULES-HISTORIQUES.md`, `docs/SITE-HISTORIQUE.md`.

### Incohérences corrigées
- **Arborescence fictive** dans le README : `core/crypto-engine.js`,
  `ui/biometric-auth/`, `ui/emergency-kit/`, `tests/stress-tests/`,
  `tests/penetration-tests/` — aucun n'existe. Remplacée par la structure réelle.
- **Onze fonctions annoncées sans code** : WebAuthn, biométrie, kit de secours,
  synchronisation, étiquettes, retour haptique, canaux auxiliaires, détection
  d'environnement compromis, « nettoyage automatique des buffers mémoire ».
- **Feuille de route datée et périmée** (2025-2026) retirée ; renvoi vers
  `docs/FONCTIONS-PREVUES.md`, qui explique pourquoi.
- **Licence MIT** : clause de permission et clause de garantie présentes
  **deux fois**, dont une tronquée. Rétablie en MIT standard.
- **Manifeste PWA** : `start_url` absolu, cassant l'installation depuis un
  sous-répertoire. Rendu relatif ; `short_name` aligné sur le nom du projet.
- **`docs/index.html`** : site compilé obsolète pointant vers
  `giscolab.github.io/vault-personal/` alors que le dépôt est
  `Giscolab/CryptoKeep`. **Conservé**, avec bandeau de statut.
- **Image `docs/vault-demo.gif`** référencée et absente : référence retirée.
- **`start.bat`** : n'a jamais existé ; les deux lanceurs réels sont nommés.
- **`docs/launcher.md`** : chemin `secure_local_server.py` complété.
- **Nom du projet** : CryptoKeep retenu, l'ambiguïté avec `vault-personal`
  expliquée au lieu d'être laissée au lecteur.
- **CHANGELOG** : BOM retiré, titre aligné, lots 3 à 10 ajoutés.

### Tests
- `tests/documentation.spec.js` — **16 scénarios** : liens locaux, chemins
  cités, images, constantes cryptographiques comparées au code, absence de
  HTTPS pour l'accès local, fonctions inexistantes, licence, manifeste, site
  historique, modules historiques recensés.

---

## 🧪 [Lot 9] Tests et qualité – *4 septembre 2026*

**Défaut de démarrage corrigé.** `storage-persistence.js` capturait
`timers = { setTimeout, clearTimeout }` — donc sans receveur. En navigateur,
`timers.setTimeout()` lève « Illegal invocation » : la sonde échouait à
**chaque** démarrage et affichait « Le navigateur refuse d'écrire dans
IndexedDB — relancez avec `start_vault_secure.bat` » sur un coffre parfaitement
enregistré, en renvoyant vers le lanceur déjà utilisé. Sous Node, une fonction
détachée reste appelable : les tests unitaires passaient.

- Classification des pannes : un échec de la **sonde** ne peut plus être
  présenté comme un refus **d'IndexedDB** (`probe_failed`, avertissement).
- `console.assert` éliminé — il écrivait un message sans jamais changer le code
  de sortie. Douze suites converties à `node:assert/strict`.
- `tests/test-harness.spec.js` — le harnais vérifié par un canari qui échoue
  par construction et doit sortir en code 1.
- `tests/crypto-integrity.spec.js` (16) — unicité des IV sur 500 tirages,
  altération du ciphertext, du tag, de l'IV, de l'AAD, clé non extractible.
- `tests/vault-lifecycle.spec.js` (19) — création, mauvais mot de passe,
  verrouillage, purge, coffre altéré.
- `tests/syntax-all-files.spec.js` — 139 fichiers, **modules historiques inclus**.
- `tests/browser/` — parcours navigateur en **16 étapes**, sans aucune
  dépendance installée : pilotage CDP d'Edge/Chrome/Chromium déjà présent.
- Mutations M68–M79. Batterie : **79/79**.

---

## 🗑️ [Lot 8] Suppression volontaire du coffre – *3 septembre 2026*

Le bouton « Supprimer le compte » n'avait ni identifiant ni gestionnaire, et
parlait d'un compte qui n'existe pas.

- `scripts/core/vault/vault-destruction.js` — portées **coffre / profil / tout**,
  correspondant à deux bases IndexedDB réellement distinctes (`VaultDB` et
  `vault-db`). Effacement vérifié par relecture ; une transaction échouée laisse
  les données en place et le rapport le dit.
- `scripts/ui/vault-destruction-modal.js` — phrase de confirmation exacte,
  double verrou, annonce de ce qui est **conservé** autant que de ce qui part.
- Retour à l'état de première utilisation **uniquement** si le coffre a
  réellement disparu.
- 46 scénarios, mutations M53–M67.

---

## ⚙️ [Lot 7, 7b, 7c] Réglages et fonctions annoncées – *2-3 septembre 2026*

- Cinq bascules sans identifiant ni gestionnaire, dont trois cochées par
  défaut, présentaient des protections inactives comme actives.
- `app-settings.js` — schéma **fermé**, validé dans les deux sens.
- **7c** : `writeSettings()` renvoyait `{written:false}` et le résultat était
  ignoré ; l'interface affichait la valeur demandée alors que le réglage
  enregistré n'avait pas bougé. Corrigé pour tous les réglages.
- Thème : le menu réaffichait une valeur refusée par la liste blanche.
- Minuterie de notification annulable : suite de tests 30 078 ms → 87 ms.

---

## 📊 [Lot 6] Rapport de sécurité véridique – *2 septembre 2026*

- Le rapport affichait des valeurs **fictives** codées dans le markup, et des
  simulations GPU/PBKDF2 inventées. Moteur remplacé par `audit-engine.js`.
- Une compromission non vérifiée n'est plus comptée comme « non compromis ».
- La portée de l'audit dit ce qui **n'a pas** été examiné.

---

## 🔑 [Lot 5] Politique et analyse des mots de passe – *2 septembre 2026*

- Politique de mot de passe maître, estimateur d'entropie plafonné par
  alphabet observé (Lot 7b), pénalités de répétition.
- Réutilisation détectée par **égalité exacte** après regroupement par
  condensat — l'ancien hachage 32 bits regroupait `Aa` et `BB`.
- HIBP : désactivé par défaut, consentement explicite, préfixe de 5 caractères,
  échec jamais présenté comme « non compromis ».

---

## 🔐 [Lot 4] Gestion réelle du mot de passe maître – *2 septembre 2026*

- `master-password-change.js` — 17 étapes : nouveau sel, nouvelle clé,
  re-chiffrement complet avec IV neufs, écriture vérifiée, relecture du coffre
  écrit. En cas d'échec, l'ancien coffre reste ouvrable avec l'ancien mot de
  passe.

---

## 🧱 [Lot 3, 3b, 3c] Entrées, vues et atomicité – *1-2 septembre 2026*

- Ajout, modification, suppression, catégories, recherche insensible aux
  accents, tris.
- **3b** : `saveVault` levait sans restaurer. Écriture par transaction unique,
  relecture et comparaison **canonique**, restauration de l'instantané chiffré
  seulement si l'écriture a été validée mais que la relecture diverge.
- **3c** : une lecture qui **échoue** n'est pas un coffre absent. Quatre sites
  confondaient les deux et pouvaient écrire sans rollback possible.

---

## 📦 [Lot 2] Import, sauvegarde et intégrité – *1er septembre 2026*

**Résumé :** approche additive. Aucun fichier supprimé, aucune donnée réelle
touchée, tous les tests sur coffres et stockages synthétiques.

### Import `.vault` sécurisé
- Le coffre courant n'est plus JAMAIS remplacé avant validation structurelle
  **et** cryptographique complète, puis confirmation explicite.
- Nouveau `scripts/core/storage/import-limits.js` : toutes les limites
  (10 Mio, 5 000 entrées, tailles de champ, totaux) centralisées et testées.
- Nouveau `vault-import-validator.js` : liste **exacte** de propriétés par
  version, refus (jamais suppression silencieuse) des propriétés inattendues,
  identifiants et IV uniques comparés **décodés**, v1 historique préservé.
- Aucun champ `authTag` séparé n'est exigé ni toléré : avec AES-GCM via Web
  Crypto, le tag est inclus dans `ciphertext`.
- Nouveau `plaintext-validator.js` : type, structure et taille vérifiés après
  déchiffrement, avant toute persistance.
- Nouveau `vault-crypto-verify.js` : source unique partagée avec la
  restauration. v1 sans AAD, v2 avec les AAD exactes du format. Mot de passe
  incorrect, AAD incorrecte et altération produisent le **même** message.
- Nouveau `vault-transaction.js` : écriture atomique, vérification
  post-écriture par **sérialisation canonique** (pas une comparaison de
  taille), restauration vérifiée uniquement si l'écriture a été validée mais
  diverge. Aucune restauration après une transaction annulée, aucune boucle.
- Nouveau `vault-import-service.js` : les 18 étapes du cahier des charges.
- `backup.js` : `importVault()` **conservée**, délègue au service sécurisé.
- `StorageManager.putVaultRecord()` ajouté ; `saveVault`, `importFullVault`,
  `saveToLocalBackup` et `restoreFromLocalBackup` **tous conservés**.

### Sauvegarde locale
- Nouvelle enveloppe versionnée `cryptokeep.backup.v1` : version d'enveloppe
  distincte de `meta.version`, horodatage, record chiffré normalisé.
- Migration rétrocompatible des **deux** formats historiques partageant
  `vaultBackup` (JSON direct et base64). L'ancienne clé n'est supprimée
  qu'après écriture, relecture et vérification de la nouvelle enveloppe.
- Il est documenté explicitement que **ni le JSON ni le base64 ne chiffrent**.
- Quota `localStorage` géré : un échec de sauvegarde secondaire n'invalide
  pas le coffre principal, mais l'utilisateur est averti.
- **Plus aucune restauration automatique au démarrage.** Nouveau
  `backup-restore-service.js` : détection, validation, information,
  confirmation, mot de passe, vérification complète, transaction unique,
  relecture vérifiée. Un coffre principal valide est toujours prioritaire.
- `clearLocalBackup()` implémentée et testée, **volontairement non raccordée**
  au bouton de suppression : ce flux appartient au Lot 8.

### Import CSV
- Nouveau `csv-parser.js` : parseur local sans dépendance — BOM, CRLF/LF/CR,
  guillemets, virgules internes, `""` échappés, champs multilignes. La limite
  de lignes est appliquée **pendant** le parsing.
- Lecture via `TextDecoder('utf-8', { fatal: true })` : les séquences UTF-8
  invalides sont refusées au lieu d'être silencieusement remplacées.
- Nouveau `csv-import-service.js` : en-têtes dans un ordre quelconque, mot de
  passe obligatoire, au moins un champ identifiant parmi titre/URL/utilisateur.
- Chaque ligne acceptée reçoit un `crypto.randomUUID()`. L'import **ajoute**
  et ne remplace jamais implicitement. Les ressemblances sont signalées.
- Aperçu avec mapping, lignes acceptées/ignorées/rejetées et motifs de rejet,
  **sans jamais afficher un mot de passe**.
- Ajout atomique : tout est chiffré et assemblé en mémoire avant la moindre
  transaction. Aucune persistance partielle possible.
- `import-csv.js` **conservé**, délègue désormais au service.

### Interface
- Nouveau `scripts/ui/secure-dialogs.js` : fenêtre dédiée avec
  `<input type="password">`, vidée dans un `finally`. **`prompt()` n'est plus
  utilisé nulle part**, ni le `confirm()` natif pour l'import.

### Tests
- 5 nouveaux specs (`node:assert/strict`) ajoutés à `npm test` :
  `vault-import-validator`, `vault-import-service`, `local-backup`,
  `csv-parser`, `csv-import-service`, plus les fixtures synthétiques
  `tests/helpers/vault-fixtures.js`.

---

## 🧹 [Lot 1 — clôture] Qualité et cohérence – *1er septembre 2026*

**Résumé :** aucune suppression de fichier, aucune règle de lint désactivée,
aucune dépendance applicative ajoutée. Le projet reste 100 % Vanilla.

- `package-lock.json` conservé et indexé (installations reproductibles).
  Outillage de développement uniquement, aucun impact sur le code navigateur.
- **13 erreurs ESLint préexistantes corrigées, une par une, selon leur
  contexte** — 0 erreur restante :
  - liaisons de capture inutilisées → `catch {}` sans liaison
    (`backup.js`, `audit-crypto.js` ×2) ;
  - brouillons historiques non raccordés → classes **exportées** et statut
    documenté en tête de fichier, aucun raccordement, aucun comportement
    modifié (`crypto.js`, `storage.js`, `security.js`) ;
  - `getStrengthLevel()` (`security/audit.js`) → exportée comme utilitaire
    public ; l'échelle de `updatePasswordEntropyBar()` reste inchangée pour
    ne pas altérer les classes CSS rendues ;
  - `audit-runner.js` est un outil Node en ligne de commande → globales Node
    déclarées pour ce seul fichier (environnement réel, pas de règle levée) ;
  - `AuditCrypto` et `Chart` sont des globales de scripts classiques →
    déclarées par fichier dans la configuration ESLint ;
  - `modal.js` : paramètre inutilisé retiré d'un gestionnaire vide ;
  - `password-meter.js` : palette conservée, hissée et exportée
    (`STRENGTH_COLORS`) ; elle ne peut pas être appliquée en style inline,
    la CSP interdisant `unsafe-inline` ;
  - `toggle-password.js` : espace insécable étroit (U+202F) remplacé.
- **Correction de bug** : `audit-panel.js` relançait `requestAnimationFrame`
  sans limite. Si `#launch-audit-ui` était absent, la boucle tournait
  indéfiniment et `createAuditButton()` n'était jamais appelée, rendant
  l’audit inaccessible. Boucle bornée à 300 trames, bouton de secours
  historique raccordé en repli.
- `index.html` : la balise `<script src="scripts/vendor/chart.min.js">`
  pointait sur un nom inexistant. Corrigé en `Chart.min.js` (casse réelle).
- `index.html` : `</div>` orphelin ligne 818 retiré. Il ne fermait aucun
  élément (analyse de pile de balises : pile `html > body > main`).
  Structure désormais parfaitement équilibrée. Aucun composant supprimé.

---

## 🔒 [Lot 1] Sécurisation du cycle de vie – *1er septembre 2026*

**Résumé :** approche additive. Aucun fichier, dossier, test, écran ni
fonctionnalité n'a été supprimé.

### Lanceur et persistance
- **Correction critique** : les lanceurs n'ouvrent plus le coffre en
  navigation privée (`--incognito`). IndexedDB et `localStorage` y étaient
  détruits à la fermeture du navigateur, donc le coffre avec.
- Nouveau lanceur `start_vault_secure.bat` : profil navigateur **persistant**
  et dédié (`%LOCALAPPDATA%\CryptoKeep\browser-profile`), distinct du profil
  personnel.
- `start_vault_local.bat` **conservé** et corrigé : profil persistant,
  détection de port par correspondance exacte, plus aucun arrêt de processus
  tiers par simple occupation du port.
- Nouveaux scripts `scripts/start_secure_server.ps1` et
  `scripts/stop_secure_server.ps1` : le PID du processus enfant est conservé,
  et l'arrêt exige PID + heure de démarrage + ligne de commande concordants.
- Nouveau module `scripts/security/storage-persistence.js` : avertissement
  clair si le navigateur refuse IndexedDB. Aucun résultat positif n'est
  affiché tant qu'aucun redémarrage n'a été réellement observé.
- `README.md` : suppression de la mention `https://localhost:8000`. Le serveur
  local fonctionne en **HTTP en clair**.
- Nouveau document `docs/launcher.md`.

### Mot de passe maître
- Nouveau module `scripts/security/master-password-field.js` : référence du
  champ résolue une seule fois, valeur consommée puis effacée dans un bloc
  `finally` (réussite **comme** échec), retour à `type="password"`,
  réinitialisation de la case d'affichage.
- Nettoyage rejoué au verrouillage, à la déconnexion, au masquage de l'onglet,
  à la fermeture de page et à la réinitialisation du formulaire.

### Déconnexion
- Nouveau module `scripts/security/logout.js`. Le bouton « Déconnexion » de la
  barre latérale, présent dans `index.html` mais raccordé à rien, est
  désormais fonctionnel : purge de la clé, du sel et des entrées déchiffrées,
  fermeture des modales, purge des vues, retour à l'écran d'authentification,
  réinitialisation de la navigation. Le coffre chiffré n'est jamais supprimé.
- Nouveau module `scripts/ui/modal-cleanup.js`, également branché sur le
  verrouillage.

### Verrouillage automatique
- Nouveau module `scripts/security/autolock-controller.js`. Il respecte le
  réglage d'activation, applique le délai choisi, ne maintient qu'un seul
  minuteur, écoute souris, clavier, pointeur, tactile, molette et défilement,
  prend en compte la visibilité de l'onglet, et ne s'arme qu'**après**
  authentification.
- Nouvelle option « Verrouiller en arrière-plan » dans les paramètres.
- `scripts/security/autolock.js` est **conservé**, toujours exporté et
  toujours couvert par un test de non-régression. Son statut historique est
  documenté en tête de fichier.

### Tests
- Ajout de `tests/master-password-field.spec.js`, `tests/logout-session.spec.js`,
  `tests/autolock-controller.spec.js`, `tests/storage-persistence.spec.js`,
  `tests/launcher-persistence.spec.js` et du stub `tests/helpers/dom-stub.js`.
- `tests/password-reuse-groups.spec.js`, jusque-là orphelin, est réintégré à
  `npm test`.

### Divers
- `scripts/security.js` : accolade fermante manquante ajoutée. Le fichier était
  syntaxiquement invalide et bloquait toute analyse portant sur l'ensemble du
  dépôt. Le fichier reste conservé et non raccordé.

---

## 📦 [760faa3] Initialisation complète du projet – *18 mai 2025*

**Auteur :** Franck  
**Résumé :** Mise en place de la structure initiale du projet

- Ajout du système de chiffrement AES-GCM avec PBKDF2 (Web Crypto API)
- Mise en place du stockage sécurisé via IndexedDB (`manager.js`, `schema.js`, etc.)
- Début de l’interface utilisateur (authentification, jauge, liste)
- Mise en place des workers pour AES & PBKDF2
- Création de l’arborescence complète
- Ajout de nombreux utilitaires : `toast.js`, `logger.js`, `password-generator.js`
- Premiers tests unitaires : `crypto.spec.js`, `vault.spec.js`
- Ajout des fichiers de documentation initiaux : `README.md`, `LICENSE`, `CONTRIBUTING.md`

---

## 🛠️ [2f328d3 → c2c1b72] Refonte HTML & Modularisation – *30 mai 2025*

**Auteur :** Franck Da Costa  
**Résumé :** Accessibilité renforcée, structure CSS/JS réorganisée

- Refonte complète de `index.html` (HTML sémantique, responsive, `<noscript>`, CSP stricte)
- Création de dossiers CSS : `/base`, `/components`, `/layout`, `/utilities`
- Migration de `style.css` vers des feuilles CSS modulaires (`main.css` inclusif)
- Amélioration du script `app.js`, séparation UI/logic
- Nouveau module `import-csv.js` pour importer depuis Edge
- Réorganisation des icônes et statiques
- Documentation enrichie : `docs/README.md`, `structure.txt`
- Suppression de `arborescence.txt`

---

## ✨ [8b7cdee] Version 3 (v3) – UI Visuelle & Sécurité – *9 juin 2025*

**Auteur :** Franck  
**Résumé :** Intégration de composants visuels, modularisation avancée

- Ajout de nombreux composants CSS :
  - `header.css`, `metrics.css`, `modal.css`, `score-box.css`, `vault.css`, etc.
- Intégration de `Chart.min.js` pour affichage des scores de sécurité
- Nouveaux scripts UI :
  - `modal.js`, `security-chart.js`, `security-report.js`, `toggle-password.js`, `sidebar.js`
- Refactoring JS : `vault-list.js`, `app.js`, `audit.js`, `autolock.js`, `logger.js`
- Ajout de `vault-stats.js`, `clipboard.js`
- Expérience utilisateur enrichie (toggle-switch, toasts, jauge de sécurité)
- Documentation `README.md` restructurée

---

## 🧹 [38a5d2c → 5573d68] Nettoyage & Finalisation – *15 juin 2025*

**Auteur :** Franck  
**Résumé :** Rationalisation du projet avant mise en ligne

- Ajout de `.stylelintrc.json` et `purgecss.config.cjs`
- Nettoyage et simplification des composants CSS (`vault.css`, `password-tools.css`, etc.)
- Suppression de fichiers obsolètes : `start_vault_local.bat`, `arborescence_vault.md`
- Ajout du schéma graphique de chiffrement : `schema-chiffrement.png`
- Structure optimisée pour la mise en production (taille CSS, accessibilité, lisibilité)
- Ajout de `visibility.css` dans les utilitaires
- MAJ des dépendances : `package.json`, `package-lock.json`

---

## 🗓️ 2025-07-05  
### 🌙 Mise à jour locale : thématisation, composants UI, nettoyage

#### 🧩 Nouveaux fichiers

- **UI & Thèmes** :
  - `scripts/ui/theme-selector.js` – Sélecteur de thème dynamique
  - `scripts/ui/dashboard.js` – Début du tableau de bord
  - `scripts/utils/theme-loader.js` – Chargement des thèmes au runtime
  - `public/components/entropy.css` – Style d'entropie de mot de passe
  - `public/themes/` – Répertoire de thèmes personnalisés (modulaires)
- **Tests & Échantillons** :
  - `tests/vault.sample.json` – Exemple de coffre pour tests
- **Documentation** :
  - `docs/index.html` – Page HTML autonome pour la doc
- **Configuration** :
  - `eslint.config.mjs` – Configuration ESLint moderne
  - `scripts/tools/` – Dossier pour utilitaires internes

#### 📝 Fichiers modifiés

- `CHANGELOG.md` – Ajout de cette entrée
- `index.html` – Intégration des composants de thème
- `package.json`, `package-lock.json` – Mise à jour des dépendances
- `structure.txt` – MAJ de la structure projet
- `public/base/tokens.css`, `public/main.css`, `public/components/password-strength.css`, `public/layout/settings.css` – Adaptation des styles (thèmes, entropie)
- `scripts/app.js`, `core/vault/manager.js`, `core/vault/vault.js` – Logique applicative ajustée
- `scripts/security/audit.js`, `security/autolock.js` – Renforcement sécurité
- `scripts/ui/vault-list/vault-list.js`, `ui/sidebar.js`, `ui/security-report-init.js` – Extensions UI

#### 🧹 Fichiers supprimés

- **Documentation & fichiers de référence** :
  - `docs/README.md`, `docs/schema-chiffrement.png`, `docs/.htaccess`, `docs/deepseek_mermaid_*.svg`
  - `arborescence_vault.md`, `changelog_complet_verifie.txt`, `before.png`, `vault_2025-05-29.vault`
  - `password manager.zip`
- **Développement** :
  - `.vscode/launch.json`, `.vscode/tasks.json`
- **Dépendances** :
  - Suppression complète du dossier `node_modules/` (nettoyage ou réinstallation)

#### 💡 Notes techniques

- ⚠️ Conversion automatique prévue de LF → CRLF sur certains fichiers (`.json`, `CHANGELOG.md`)
- 🔁 Réinstallation des dépendances requise : `npm install`
- 🧱 Réorganisation vers une architecture orientée personnalisation (UI, thèmes, entropie, dashboard)

---

## 🧩 Commits intermédiaires techniques

- `[a3e9acd]` Refonte HTML poussée  
- `[833f54e]` Réorganisation avancée des styles et docs  
- `[b83e8ff]` Ajout de `structure.txt`  
- `[9a1df1b]` Résolution de conflits de merge (pull main)  
- `[3bbc942]` Ajustements du `README.md`

---

﻿## 🎨 [7c2115e] Mise à jour thémes & composants UI – *11 juillet 2025*

**Auteur :** Franck  
**Résumé :** Finalisation de la thématisation complète et ajout de nouveaux composants pour l’audit et les réglages

### ✨ Nouveaux fichiers

- **Composants UI & audit :**
  - `scripts/ui/settings.js` – Panneau de préférences utilisateur
  - `scripts/ui/audit-panel.js` – Interface d’analyse de sécurité
  - `scripts/ui/sidebar-profile.js` – Chargement dynamique du profil utilisateur
  - `public/components/audit-panel.css` – Style visuel pour le panneau d’audit

- **Scripts d’outils :**
  - `scripts/tools/audit-crypto.js` – Analyse cryptographique (préparation)

- **Utilitaires export/log :**
  - `export-log.html`, `export_log.py` – Gabarit pour l’export sécurisé
  - `Page`, `Port` – (fichiers temporaires, à trier/documenter)

- **Journalisation locale :**
  - `vault_local.log` – Fichier de trace (à exclure dans Git si non pertinent)

### 🎨 Thèmes personnalisés finalisés

Ajout ou mise à jour des thèmes suivants dans `public/themes/` :
`ubuntu.css`, `lightsaber.css`, `r2d2.css`, `padawan.css`, `flatdark.css`, `invaders.css`,  
`metallic.css`, `millennium.css`, `leia.css`, `deathstar.css`, `starfighter.css`, `xwing.css`, `sith.css`, `galactic.css`

> Tous héritent proprement de `default.css` via `@layer theme.nom`

### 📝 Fichiers modifiés

- `README.md`, `index.html` – Mise à jour de la présentation et du support thématique
- `public/base/reset.css`, `tokens.css` – Harmonisation des variables de base
- `public/components/*.css` – Ajustements visuels (`header`, `metrics`, `password-tools`, `score-box`, `sidebar`, `vault`)
- `public/layout/auth.css`, `settings.css` – Améliorations UI
- `scripts/app.js`, `scripts/ui/theme-selector.js`, `scripts/utils/theme-loader.js`, `idb-helper.js` – Support JS pour les nouveaux composants

### 🧹 Nettoyage

- Suppression de `purge-analysis.log` (log CSS obsolète)
- Refactoring du `start_vault_local.bat`

### 🛠️ Divers

- Fin de conversion CRLF sur les fichiers de thème (`.gitattributes` recommandé)
- Ajout d’éléments de debug temporaire (`Page`, `Port`, `vault_local.log`) – à exclure via `.gitignore`


## 🚀 [1.0.0] Première version stable – *18 mai 2025*

**Auteur :** Franck  
**Fonctionnalités livrées dans les premiers jours (18–30 mai)**

- 🔐 Chiffrement AES-GCM + dérivation PBKDF2
- 🏦 Stockage sécurisé avec IndexedDB
- 🖥️ Interface utilisateur de base (écran d’authentification, liste, jauge)
- 🔒 Fonctions de sécurité : verrouillage automatique, audit mémoire
- 🔧 Générateur de mots de passe sécurisé
- 📥 Import de mots de passe (Edge)
- 🧪 Tests unitaires : crypto, vault

---

## 📁 Fichiers clés ajoutés au projet

- `scripts/core/crypto/*` – AES-GCM, PBKDF2, workers
- `scripts/core/storage/*` – IndexedDB, gestion, backup
- `scripts/core/vault/*` – Logique métier
- `scripts/security/*` – CSP, audit, autolock, mémoire
- `scripts/utils/*` – Logger, Toast, Générateur, Clipboard, Stats
- `scripts/ui/*` – Auth, Modal, Sidebar, Password Meter, Chart.js
- `public/components/*.css` – Tous les composants visuels
- `public/main.css` – Entrée consolidée des styles
- `README.md`, `LICENSE`, `docs/README.md`, `schema-chiffrement.png`
