# Contribuer à CryptoKeep

Le code source est la référence sur le fonctionnement du logiciel. Toute
modification de comportement doit être accompagnée d'une documentation cohérente.
Voir [l'architecture](docs/ARCHITECTURE.md) et [SECURITY.md](SECURITY.md).
Les échanges et contributions relèvent du [code de conduite](CODE_OF_CONDUCT.md).

## Organisation

| Chemin | Rôle |
|---|---|
| `index.html`, `scripts/`, `public/` | Application web et ressources partagées |
| `desktop/`, `scripts/desktop/` | Entrée desktop et préparation des ressources |
| `src-tauri/` | Application Windows, configurations et installateur |
| `docs/` | Guides utilisateur et documentation de maintenance |
| `tests/` | Suites et données synthétiques |
| `.github/workflows/` | Contrôles automatisés |

## Environnement

Node.js 24 est la référence des workflows JavaScript. Installer les dépendances
de développement avec `npm ci`. Le frontend n'a pas de dépendances npm de
production ; le desktop dépend en revanche de crates Rust, de Tauri et de
WebView2. Conserver `package-lock.json` et `src-tauri/Cargo.lock`.
La [procédure Windows](docs/DEVELOPPEMENT-WINDOWS.md) décrit la compilation.

## Règles d'implémentation

- Ne jamais commiter de coffre personnel, mot de passe, clé, profil ni journal.
- Employer exclusivement des données synthétiques pour les essais.
- Préserver le format chiffré, l'AAD, les IV aléatoires et les clés non extractibles.
- Ne pas afficher les données importées par `innerHTML` ; utiliser du texte
  et des nœuds DOM créés explicitement.
- Ne pas affaiblir la CSP ni ajouter de CDN à l'application.
- Ne pas journaliser de secrets. Les exports en clair exigent un consentement.
- Distinguer code actif et modules legacy ; vérifier les appelants avant un retrait.
- Conserver les licences et attributions des composants tiers.

## Vérifier une modification

```sh
npm test
npm run test:security
npm run test:desktop
npm run lint
```

Les contrôles navigateur et Python exigent leurs environnements respectifs.
Une suite doit échouer avec un code non nul lorsqu'une assertion échoue.
Les avertissements doivent être qualifiés ; ne pas les masquer en désactivant
globalement une règle. Les résultats actuels sont dans GitHub Actions : un ancien
nombre d'avertissements ne constitue pas une référence immuable.

## Proposer un changement

Décrire le problème, le comportement obtenu, les vérifications effectuées et
les limites restantes. Mettre à jour les guides concernés et leurs liens.
Archiver ou retirer une documentation sans valeur actuelle plutôt que conserver
des affirmations contradictoires. Les informations historiques utiles restent
explicitement contextualisées ; les métadonnées et l'historique Git sont préservés.
