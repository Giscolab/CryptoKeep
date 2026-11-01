# Compiler et distribuer CryptoKeep sous Windows

## Prérequis

Utiliser un checkout du dépôt et un Windows x64 avec Node.js, npm, Rust 1.90.0
MSVC, les outils C++ Microsoft et le Windows SDK. La chaîne Rust est définie
dans `src-tauri/rust-toolchain.toml`. WebView2 est nécessaire pour l'exécution.
Les workflows JavaScript du projet utilisent Node.js 24.

Le script de diagnostic ne modifie ni les profils ni les coffres :

```powershell
powershell -NoProfile -File scripts/desktop/check-windows.ps1
npm.cmd ci
npm.cmd run desktop:prepare
```

La préparation génère uniquement les ressources de l'inventaire autorisé.
Elle refuse les liens et les sorties modifiées manuellement plutôt que les
effacer. Ne pas ajouter de données utilisateur à l'inventaire.

## Commandes

| Commande | Résultat |
|---|---|
| `npm.cmd run desktop:dev` | Développement sur le profil `.dev` |
| `npm.cmd run desktop:build` | Exécutable optimisé du profil `.test`, sans installateur |
| `npm.cmd run desktop:installer` | Installateur CryptoKeep Test |
| `npm.cmd run desktop:production` | Installateur CryptoKeep de production |
| `npm.cmd run test:desktop` | Contrôles de contrat, installateur et frontend Chromium |

Les commandes d'installateur passent `--locked` à Cargo. Les sorties sont dans
`src-tauri/target/x86_64-pc-windows-msvc/release/`, avec l'installateur sous
`bundle/nsis/`. La compilation ne copie aucun profil existant.

```powershell
Push-Location src-tauri
cargo test --locked
Pop-Location
npm.cmd run desktop:production
```

Conserver les fichiers de verrouillage. Un verrou fixe la résolution des
dépendances ; il ne démontre pas à lui seul une reproductibilité binaire exacte.
L'outillage et les dépendances peuvent être téléchargés pendant la compilation.

## Installateur et données

Le modèle NSIS est conservé dans `src-tauri/windows/`, avec ses licences et
sa provenance. Le bloc et la case de suppression des profils ont été retirés.
La conservation des données concerne aussi le mode silencieux. Revoir cette
personnalisation à chaque mise à jour de la CLI Tauri.

La configuration de production utilise `fr.giscolab.cryptokeep`. Les essais ne
doivent pas ouvrir un coffre personnel : utiliser le canal test et des données
synthétiques. Le canal test et la production ne partagent pas leur stockage.

## Publier une version

Créer un commit identifié, construire l'installateur à partir de ce contenu,
puis calculer son SHA256. Joindre l'installateur, l'empreinte et les notes à une
Release GitHub dont le tag désigne ce commit. Les exécutables générés ne sont
pas à commiter dans les sources. Vérifier que la Release indique fidèlement
les contrôles effectués, les limites et l'état de signature.

La version 0.1.0 est une préversion non signée. Ne pas la présenter comme une
version stable ou certifiée sur la seule base de sa compilation. Une validation
Chromium du frontend ne remplace pas les essais natifs WebView2.
