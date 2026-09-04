# Contribuer à CryptoKeep

Projet de coffre-fort local, sans dépendance, sans service en ligne.
Lisez d'abord [`SECURITY.md`](SECURITY.md) et
[`docs/FONCTIONS-IMPLEMENTEES.md`](docs/FONCTIONS-IMPLEMENTEES.md).

## Règles non négociables

- **Aucune dépendance applicative**, aucun CDN, aucun framework.
  `dependencies: null` est une propriété vérifiable du projet.
- **Ne jamais affaiblir la CSP** : ni `unsafe-inline`, ni `unsafe-eval`.
- **Jamais `innerHTML`** avec une donnée venue d'un coffre, d'un CSV, d'un
  profil, d'un journal ou d'un import. Utiliser `textContent` et la création
  explicite de nœuds.
- **Jamais de secret** dans `localStorage`, `sessionStorage`, un journal ou un
  message d'erreur.
- **`crypto.getRandomValues` exclusivement.** Aucun `Math.random()` pour un
  sel, un IV, une clé ou un identifiant de sécurité.
- **Jamais de réutilisation d'IV**, jamais de clé extractible.
- **Aucun résultat de sécurité positif** affiché par un contrôle qui n'a
  analysé aucune donnée.
- **Aucune suppression de fichier.** Un module remplacé est conservé,
  documenté dans [`docs/MODULES-HISTORIQUES.md`](docs/MODULES-HISTORIQUES.md),
  et débranché progressivement.
- **Ne jamais modifier `scripts/vendor/`** — bundle tiers.

## Structure réelle

| Dossier | Rôle |
|---|---|
| `scripts/core/crypto/` | PBKDF2, AES-GCM, garde-fous d'exécution |
| `scripts/core/storage/` | IndexedDB, format de coffre, import, sauvegarde |
| `scripts/core/vault/` | Coffre en mémoire, entrées, mot de passe maître, suppression |
| `scripts/security/` | Verrouillage, politique, réutilisation, audit, HIBP |
| `scripts/ui/` | Écrans, fenêtres, rendu |
| `scripts/utils/` | Presse-papiers, filtres, préférences, générateur |
| `tests/` | Suites Node ; `tests/browser/` pour le parcours navigateur |

## Tests

Toute fonction sensible modifiée exige un test.

- `node:assert/strict` uniquement — jamais `console.assert`, qui n'a **jamais**
  fait échouer un test et laissait le code de sortie à 0.
- **Données synthétiques exclusivement.** Jamais un `.vault` réel, un `.env`,
  ni un journal personnel.
- Chaque suite doit sortir avec un **code non nul** en cas d'échec, et être
  enregistrée dans `npm test` — `tests/test-harness.spec.js` le vérifie.

Avant de proposer une modification :

```bash
npm test && npm run test:security && npm run test:syntax \
  && npm run test:python && npm run lint
```

Puis, si un navigateur est disponible : `npm run test:browser`.

Référence ESLint : **0 erreur**, 24 avertissements. Ne pas dépasser sans
justification écrite. Ne jamais désactiver une règle globalement.

## Documentation

Une fonction ajoutée doit apparaître dans
[`docs/FONCTIONS-IMPLEMENTEES.md`](docs/FONCTIONS-IMPLEMENTEES.md) avec le test
qui la prouve. `tests/documentation.spec.js` vérifie que la documentation ne
cite ni fichier absent ni lien cassé.

N'annoncez jamais une fonction qui n'existe pas dans le code : c'est la
principale incohérence que le Lot 10 a eu à corriger.
