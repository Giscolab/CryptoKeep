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

Une fois relus et validés, les nouveaux fichiers doivent être commités et
poussés sur `main`. Aucune modification des règles du dépôt ni aucun push
n'est effectué automatiquement par ce document.

Dans GitHub : **Actions** pour lancer les workflows manuellement, puis
**Security → Code scanning** pour les analyses compatibles.

Si une analyse échoue, ne pas simplement désactiver son étape :
vérifier le journal, reproduire le défaut sur une fixture et documenter
le faux positif éventuel.
