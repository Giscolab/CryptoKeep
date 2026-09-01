# 🧾 Changelog Complet du Projet `Vault`

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
