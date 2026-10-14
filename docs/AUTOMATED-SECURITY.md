# Audit de sécurité automatisé — Kryptokeep

## Périmètre

Le dépôt utilise déjà **CodeQL** (`.github/workflows/codeql.yml`) sur
JavaScript, Python et les workflows GitHub Actions. Les workflows ajoutés sont
complémentaires et ne modifient pas le chiffrement ni le stockage applicatif.

| Fréquence | Workflow | Vérifications |
| --- | --- | --- |
| Push / PR `main`, manuel | `security-checks.yml` | ESLint Security, tests existants, propriétés cryptographiques, régression Jazzer.js, test réel Chromium, Semgrep CE, Gitleaks |
| Chaque nuit 02:37 UTC, manuel | `security-fuzz.yml` | Jazzer.js guidé par couverture pendant 120 s et propriétés fast-check |
| Push / PR `main`, chaque lundi 10:46 UTC, manuel | `osv-dependencies.yml` | Dépendances npm vulnérables (OSV-Scanner) |
| Push / PR, chaque dimanche, manuel | `codeql.yml` (existant) | CodeQL security-extended |

Dependabot est configuré dans `.github/dependabot.yml` : propositions de mises
à jour npm chaque lundi et GitHub Actions chaque mardi, trois PR maximum par
écosystème, sans fusion automatique.

## Exécution locale

Le projet utilise Node.js 24 et des dépendances de développement épinglées
dans `package-lock.json`.

```bash
npm ci
node -e "require('node:crypto').randomBytes(16); console.log('CSPRNG OK')"
npm run lint:security
npm test
npm run test:security
npm run test:browser
npm run fuzz:properties
npm run fuzz:regression
npm run fuzz:jazzer
```

Les fichiers `tests/fuzz/` sont strictement **synthétiques**.
Le harness Jazzer.js cible `scripts/core/storage/vault-format.js`.
Les propriétés fast-check exercent le véritable chiffrement AES-GCM, sa
vérification d'intégrité, la liaison des identifiants via AAD, les bornes KDF
et les conversions Base64.

Le fuzzing par propriétés utilise une graine fixe pour des régressions
reproductibles. Jazzer.js mesure des couvertures internes et explore
dynamiquement le format du coffre ; les valeurs `cov` et `ft` de libFuzzer
ne sont pas des pourcentages de couverture du dépôt.

## Confidentialité et limites

- Ne jamais utiliser les profils Chrome/Edge personnels, `IndexedDB` réel,
  les sauvegardes, journaux utilisateurs, exports `.vault`, ou secrets réels.
- Les tests navigateur utilisent un profil temporaire et un coffre factice.
- Ne jamais publier un corpus construit à partir d'un coffre personnel dans
  GitHub, même privé ; le dépôt CryptoKeep est **public**.
- Les GitHub Actions de test n'utilisent pas de secrets de l'utilisateur ;
  Gitleaks reçoit seulement le `GITHUB_TOKEN` limité à la lecture du dépôt.
- Aucune restauration, migration ou modification de données réelles n'est
  exécutée par les workflows.
- Une campagne de 120 secondes ne garantit ni l'absence de vulnérabilités
  ni une couverture complète : augmenter les budgets uniquement après
  revue des métriques et en utilisant une sandbox appropriée.
- CodeQL et OSV exploitent les fonctionnalités GitHub disponibles pour
  remonter leurs résultats dans les onglets Actions et, selon les paramètres
  du dépôt, Security. Les échecs et rapports des autres outils sont lisibles
  dans les journaux Actions.

Les contrôles sur le mot de passe maître réel et la mémoire d'une session
personnelle ne font **pas** partie de la CI. Ils nécessitent une campagne
distincte, locale et expressément bornée, avec des données factices.

## Activation

Les nouveaux workflows ont été publiés sur `main` dans le commit `bf03f19`
(le 14 octobre 2026). Leur première exécution GitHub a été vérifiée.
Les modifications locales ultérieures nécessitent un nouveau commit/push
après revue ; aucune modification des règles du dépôt n'est nécessaire.

Dans GitHub : **Actions** pour lancer les workflows manuellement, puis
**Security → Code scanning** pour les analyses compatibles.

Si une analyse échoue, ne pas simplement désactiver son étape :
vérifier le journal, reproduire le défaut sur une fixture et documenter
le faux positif éventuel.

## Première vérification locale — 14 octobre 2026

- `npm run fuzz:properties` : OK, 500 cas générés sur trois propriétés.
- `npm run fuzz:regression` : OK, 2 graines synthétiques rejouées.
- Jazzer.js 15 secondes sur corpus temporaire : 330 478 exécutions, `cov: 96`,
  aucun crash signalé. `cov` n'est PAS un pourcentage de code couvert.
- `npm run test:security` : OK.
- `npm run test:browser` : OK, 16 étapes dans un profil Edge jetable.
- `npm run lint:security` : succès avec 24 avertissements à qualifier.
- `npm audit` : deux avis de gravité élevée et deux modérés dans l'outillage ;
  `npm audit --omit=dev --audit-level=high` : aucune vulnérabilité signalée.
- `npm test` : interrompu après le passage du balayage de syntaxe (143 fichiers)
  par une assertion interne Node/Undici dans `tests/local-server.spec.js` sur
  Windows avec Node 24.19.0. Le problème reste à reproduire sous Linux.
- YAML des workflows et de Dependabot analysé localement avec `js-yaml` : OK.
- Premier push GitHub du commit `bf03f19` : **Security checks OK**, **CodeQL OK**.
- **OSV Scanner en échec attendu**, car il a trouvé 8 avis de vulnérabilité
  (5 High, 3 Medium), correspondant à 4 instances de paquets de développement.
  Les résultats SARIF ont été transmis à GitHub Security.
- Le nouveau fuzzing planifié n'a pas encore eu sa première exécution planifiée.
- Cette mise à jour du bilan reste locale tant qu'elle n'est pas publiée.
