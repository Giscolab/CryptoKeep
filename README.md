# 🔐 CryptoKeep - Gestionnaire de mots de passe chiffré 100% local  
**Votre coffre-fort numérique personnel et ultra-sécurisé**  

<p align="center">
  <img src="https://img.shields.io/badge/Chiffrement-AES--GCM_256--bit-green?style=flat&logo=lock">
  <img src="https://img.shields.io/badge/Stockage-100%25_local-blue?style=flat&logo=hard-drive">
  <img src="https://img.shields.io/badge/Zero_Cloud-Zero_Tracking-success?style=flat&logo=privacy">
  <img src="https://img.shields.io/github/last-commit/Giscolab/CryptoKeep?color=blue">
  <img src="https://img.shields.io/badge/Licence-MIT-brightgreen">
</p>

---

## 🌟 Présentation

**CryptoKeep** est un gestionnaire local de mots de passe chiffre dans le navigateur. Il fonctionne hors ligne par defaut; la verification HIBP reste desactivee tant que l'utilisateur ne l'active pas explicitement.

```mermaid
graph TD
  A[Master Password] --> B[PBKDF2-HMAC-SHA512]
  B --> C[Clé de chiffrement unique]
  C --> D[AES-GCM 256-bit]
  D --> E[(IndexedDB - Stockage local)]
  E --> F[Données chiffrées]
  F --> G[Interface sécurisée]
  G --> H[Web Crypto API]
  style A fill:#2E7D32,stroke:#1B5E20
  style D fill:#EF6C00,stroke:#E65100
  style E fill:#0277BD,stroke:#01579B
```

---

## 🚀 Fonctionnalités Avancées

### 🛡️ Architecture de securite
| Composant | Technologie | Protection |
|-----------|-------------|------------|
| **Chiffrement** | AES-GCM 256-bit | IV unique par entrée |
| **Dérivation de clé** | PBKDF2-HMAC-SHA512 | 220,000 iterations et metadata versionnee par coffre |
| **Gestion de clé** | Web Crypto `CryptoKey` | Cle AES-GCM non extractible |
| **Verrouillage** | Auto-détection d'inactivité | Configurable (1-60 min) |

### 💼 Gestion Professionnelle
<div align="center">

| Fonction | Description | Avantage Clé |
|----------|-------------|--------------|
| **🔍 Audit de sécurité** | Analyse en temps réel des vulnérabilités | Détection des mots de passe faibles/réutilisés |
| **🗂️ Organisation hiérarchique** | Catégories, tags et collections | Structure personnalisable |
| **🔄 Synchronisation chiffrée** | Export .vault (AES-256) | Transfert sécurisé entre appareils |
| **⌛ Presse-papiers** | Effacement conditionnel apres 30 s | N'ecrase pas une copie plus recente |

</div>

### ✨ Expérience Utilisiteur Premium
- **Thèmes dynamiques** : Dark Mode certifié WCAG AA+ et Light Mode
- **Design néumorphique** : Interface tactile avec ombres portées
- **Animations fluides** : Transitions CSS hardware-accelerated
- **Feedback haptique** : Retour tactile sur les actions critiques (mobile)

---

### Stack technologique
```mermaid
pie
  title Technologies Clés (pondération réelle)
  "Web Crypto API" : 40
  "IndexedDB" : 30
  "Vanilla JS" : 15
  "CSS3 Variables" : 5
  "CSP et en-tetes locaux" : 10

```

![Présentation CryptoKeep](docs/vault-demo.gif)  
*Interface principale avec navigation sécurisée*

---

## 🚀 Installation Rapide

### Prérequis Système
```bash
✅ Navigateur moderne (Chromium 90+, Firefox 87+, Safari 15+)
✅ 50MB d'espace de stockage
✅ Accès Web Crypto API activé
```

### Lancement Local
```bash
# Cloner le dépôt
git clone https://github.com/Giscolab/CryptoKeep.git
cd CryptoKeep

# Windows - lanceur recommande (profil navigateur persistant)
start_vault_secure.bat

# Windows - lanceur historique, conserve
start_vault_local.bat

# macOS/Linux
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

> **Accès local** : http://127.0.0.1:8000/index.html
>
> Le serveur local sert le projet en **HTTP en clair** sur l'interface de bouclage. Il n'y a **aucun TLS** : ne pas décrire cet accès comme HTTPS. La confidentialité au repos repose sur le chiffrement applicatif AES-GCM, pas sur le transport.
>
> **Ne pas lancer le coffre en navigation privée.** L'application dépend d'IndexedDB et de `localStorage` : en mode éphémère, le coffre est détruit à la fermeture du navigateur. `start_vault_secure.bat` ouvre un **profil navigateur dédié et persistant** (`%LOCALAPPDATA%\CryptoKeep\browser-profile`), distinct de votre profil personnel.

---

## 🏗️ Architecture Technique

### Structure Avancée du Projet
```bash
CryptoKeep/
├── core/
│   ├── crypto-engine.js       # Moteur cryptographique
│   ├── vault-manager.js       # Gestionnaire de coffre
│   └── security-monitor.js    # Surveillance en temps réel
├── ui/
│   ├── biometric-auth/        # Intégration WebAuthn/FIDO2
│   ├── password-meter/        # Analyseur de robustesse
│   └── emergency-kit/         # Gestion de secours
├── security/                  # Verrouillage, politique de mot de passe et audit
└── tests/
    ├── stress-tests/          # Tests de performance
    └── penetration-tests/     # Scénarios d'attaque
```

### Workflow de Chiffrement
```mermaid
sequenceDiagram
  Utilisateur->>+Application: Saisie master password
  Application->>+Crypto API: PBKDF2-HMAC-SHA512
  Crypto API-->>-Application: CryptoKey AES-GCM non extractible
  Application->>+Crypto API: Chiffrement AES-GCM
  Crypto API-->>-Application: Données chiffrées
  Application->>+IndexedDB: Stockage sécurisé
```

---

## 🔮 Roadmap Stratégique 2025-2026

```mermaid
gantt
    title Feuille de Route CryptoKeep
    dateFormat  YYYY-MM-DD
    section Q3 2025
    Intégration WebAuthn       :active, 2025-07-01, 60d
    Application Desktop        :2025-08-15, 45d
    section Q4 2025
    Partage Chiffré            :2025-10-01, 45d
    Audit Sécurité             :2025-11-15, 30d
    section 2026
    Sync P2P E2EE             :2026-01-15, 90d
    Modules Plugins            :2026-04-01, 120d
```

---

## 🛡️ Philosophie de Sécurité

> **"La véritable sécurité naît de la transparence et du contrôle absolu"**

**Principes fondamentaux :**
1. 🔒 **Zero-Knowledge Architecture** : Aucune donnée lisible ne quitte votre appareil
2. 🔍 **Auditabilité totale** : Code 100% inspectable ([SECURITY.md](SECURITY.md))
3. ⚡ **Minimalisme cryptographique** : Algorithmes standardisés (NIST, BSI)
4. 🧩 **Isolation des processus** : Séparation stricte UI/crypto/storage

**Protections avancées :**
- Nettoyage automatique des buffers mémoire
- Protection contre les attaques par canaux auxiliaires
- Détection d'environnements compromis (DevTools non sécurisés)
- Verrouillage cryptographique lors du changement d'onglet

---

## 💡 Pourquoi Choisir CryptoKeep?

<table>
<tr>
  <th width="30%">Solution</th>
  <th>Stockage</th>
  <th>Chiffrement</th>
  <th>Open Source</th>
  <th>Local First</th>
</tr>
<tr>
  <td><b>CryptoKeep</b></td>
  <td align="center">✅ 100% Local</td>
  <td align="center">✅ AES-256</td>
  <td align="center">✅ MIT License</td>
  <td align="center">✅ Native</td>
</tr>
<tr>
  <td>Solutions Cloud</td>
  <td align="center">❌ Serveurs tiers</td>
  <td align="center">⚠️ Dépend du fournisseur</td>
  <td align="center">❌ Propriétaire</td>
  <td align="center">❌</td>
</tr>
</table>

---

## 🤝 Contribution & Support

> ℹ️ **Artefacts locaux non versionnés** : les exports HTML de logs (ex. `export-log.html`) sont générés localement et ne doivent pas être commités. Le script `export_log.py` est conservé pour produire ces exports à la demande.

**contributions appréciées !**  
```bash
# Workflow recommandé :
1. Fork du projet
2. Création d'une branche (`feature/ma-fonctionnalite`)
3. Commit des modifications
4. Push vers la branche
5. Ouverture d'une Pull Request
```

**Support technique :**    
🐛 [Signaler un bug](https://github.com/Giscolab/CryptoKeep/issues)  
💡 [Soumettre une idée](https://github.com/Giscolab/CryptoKeep/discussions)

---

<p align="center">
  Développé avec ❤️ par <b>Franck</b> | 
  <a href="https://github.com/Giscolab/CryptoKeep">⭐ GitHub</a> •
  <a href="https://github.com/Giscolab/CryptoKeep/blob/main/SECURITY.md">🛡️ Documentation Sécurité</a> •
  <a href="https://github.com/Giscolab/CryptoKeep/releases">📦 Téléchargements</a>
</p>

<p align="center">
  ⚠️ <b>Avertissement crucial</b> : Votre master password n'est jamais stocké. <br>
  Sa perte entraîne l'<b>irrécupérabilité définitive</b> de vos données.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs bienvenus">
  <img src="https://img.shields.io/github/contributors/Giscolab/CryptoKeep" alt="Contributeurs">
</p>
