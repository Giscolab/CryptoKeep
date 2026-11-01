# Lot C — installateurs Windows

## Préparation de la production — 1er novembre 2026

Après confirmation des essais par l'utilisateur, l'installateur de production
**CryptoKeep 0.1.0** a été compilé pour Windows x64. La confirmation des essais
est un retour utilisateur et non une observation automatisée de Codex.

La production utilise `fr.giscolab.cryptokeep`, séparé de
`fr.giscolab.cryptokeep.test`. Le profil de test n'est ni copié ni transféré.
La fenêtre s'intitule CryptoKeep. L'origine de stockage reste
`https://tauri.localhost`, avec le profil WebView2 sous
`%LOCALAPPDATA%\fr.giscolab.cryptokeep\WebView2`.

Le logiciel distribué ne contient aucun coffre précréé, mot de passe maître,
entrée de démonstration, journal ni donnée de profil. L'utilisateur crée son
propre coffre au premier lancement sur un profil de production vierge. Une
réinstallation sur une machine ayant déjà un profil conserve ce profil.

Le préparateur embarque 133 ressources autorisées et un manifeste de leurs
empreintes. Les dossiers tests, coffres, journaux et profils ne font pas partie
de cet inventaire. Le script NSIS généré confirme le nom et l'identifiant de
production ainsi que l'absence de suppression récursive des données.

Commande : `npm.cmd run desktop:production`.
Sortie : `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/CryptoKeep_0.1.0_x64-setup.exe`.
Tests Rust et desktop réussis. Les contrôles fonctionnels et de sécurité
complémentaires sont reportés à la demande de l'utilisateur. Le paquet n'est
pas signé. La distribution initiale est prévue sous forme de préversion
GitHub `v0.1.0`, avec l'installateur et son empreinte SHA256. Le statut de
préversion conserve explicitement la réserve sur les contrôles reportés.

## Historique de l'installateur de test

## Résultat du 1er novembre 2026

Installateur NSIS Windows x64 construit avec succès :
`CryptoKeep Test_0.1.0_x64-setup.exe` (environ 2,30 Mio).
Il n'est pas signé. Aucun installateur n'a été exécuté pendant cette étape.

Le produit s'appelle **CryptoKeep Test** et conserve l'identifiant
`fr.giscolab.cryptokeep.test`, l'origine HTTPS locale et le profil WebView2 du
prototype déjà essayé. Le profil de production reste refusé par Rust et JS.
La compilation utilise `Cargo.lock` et ne change ni le chiffrement ni la
version web. Aucune mise à jour automatique n'est activée.

L'installation est limitée à l'utilisateur courant. Elle crée les fichiers
de l'application, les raccourcis et le désinstalleur. Si WebView2 est absent,
l'installateur peut télécharger son bootstrapper Microsoft.

## Conservation des coffres

Le modèle NSIS de Tauri CLI 2.12.4 est conservé dans
`src-tauri/windows/installer-preserve-data.nsi`, avec attribution et licences.
La case permettant d'effacer les données et le bloc de suppression des profils
APPDATA/LOCALAPPDATA ont été supprimés. Il ne reste aucune suppression
récursive dans ce modèle. La désinstallation doit donc conserver les données,
en mode interactif comme silencieux. Une désinstallation/réinstallation réelle
reste à tester ; la vérification statique ne remplace pas cet essai.

## Vérifications effectuées

- Construction optimisée Tauri/NSIS terminée avec le verrou Cargo.
- Tests de contrat desktop, Chromium synthétique et conservation des profils
  dans le modèle NSIS réussis.
- Contrôle du script NSIS généré : canal test et absence de suppression des
  profils, de case de suppression et de suppression récursive.
- Tests de documentation et de syntaxe réussis.
- Lint du nouveau test : 0 erreur, 2 avertissements de chemins de fichiers.

## Reconstruction

```powershell
npm.cmd run desktop:installer
```

Sortie dans
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.

## Étapes restantes

Installer le programme, vérifier le raccourci et la réouverture du coffre
synthétique. Exporter ce coffre avant l'essai, désinstaller puis réinstaller,
et vérifier sa conservation. Le réimport natif et la restauration sur profil
vierge restent à valider séparément. Ce premier installateur ne qualifie pas
le prototype pour des coffres réels.
