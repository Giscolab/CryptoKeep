# 🧾 Changelog Complet du Projet `Vault`

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
