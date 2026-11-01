# Contrôles automatisés de CryptoKeep

Les configurations de `.github/workflows/` font autorité sur les contrôles
exécutés. Leurs résultats sont associés au commit et à l'exécution concernés,
pas à une certification générale du produit.

| Workflow | Déclenchement configuré | Objet |
|---|---|---|
| `security-checks.yml` | Push/PR sur main, manuel | Lint, tests, propriétés, régression de fuzzing, Chromium, Semgrep et détection de secrets |
| `codeql.yml` | Push/PR sur main, dimanche, manuel | Analyse statique CodeQL |
| `osv-dependencies.yml` | Push/PR sur main, lundi, manuel | Avis de vulnérabilité des dépendances prises en charge |
| `security-fuzz.yml` | Quotidien, manuel | Campagne bornée sur données synthétiques |

Dependabot propose les mises à jour configurées dans `.github/dependabot.yml`.
Les versions npm et Rust réellement utilisées sont dans les fichiers de verrouillage.

## Interpréter un résultat

Consulter [GitHub Actions](https://github.com/Giscolab/CryptoKeep/actions) et,
pour les analyses compatibles, l'onglet Security. Un résultat ancien ou un
compte rendu local ne signifie pas qu'une alerte actuelle est close. Ne pas
désactiver un contrôle pour masquer son échec ; qualifier la cause et vérifier
la correction ou le faux positif sur le commit concerné.

Les campagnes utilisent des données synthétiques et des profils jetables.
Les coffres réels et secrets personnels ne doivent pas entrer dans les
journaux, rapports ou corpus publiés. Le fuzzing n'apporte pas de garantie
d'absence de vulnérabilité ; ses métriques ne sont pas une couverture globale.

Les commandes de vérification locales sont dans `package.json` et
[CONTRIBUTING.md](../CONTRIBUTING.md). Les essais natifs WebView2, les permissions
Windows et la conservation après désinstallation demandent des contrôles
distincts du seul parcours Chromium du frontend.
