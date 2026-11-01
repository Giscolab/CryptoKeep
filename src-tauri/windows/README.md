# Installateurs CryptoKeep

Le modèle `installer-preserve-data.nsi` provient de Tauri CLI **2.12.4** :
https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi

Source sous MIT OU Apache-2.0 (licences jointes). Les seules modifications
fonctionnelles sont la suppression de la case de suppression des données et
du bloc de suppression des profils APPDATA/LOCALAPPDATA du désinstalleur.
Le désinstalleur conserve les profils, y compris en mode silencieux et pendant
une mise à jour. Revoir le modèle et les tests avant toute mise à jour de la CLI.

La commande `desktop:installer` produit CryptoKeep Test sur le canal
`fr.giscolab.cryptokeep.test`. La commande `desktop:production` produit
CryptoKeep sur le canal `fr.giscolab.cryptokeep`. Les données des deux canaux
sont séparées. Aucun profil, coffre ou mot de passe n'est embarqué dans
l'installateur. L'application web est indépendante de ces configurations.

Compilation depuis la racine du projet, après installation des dépendances :

```powershell
npm.cmd run desktop:installer
# Version destinée à une Release GitHub :
npm.cmd run desktop:production
```

Le fichier est généré sous
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.
WebView2 est téléchargé par l'installateur uniquement s'il manque.
