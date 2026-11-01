# CryptoKeep desktop — prototype du Lot B

> Évolution après les essais du Lot C : le canal de production est maintenant
> activé dans une configuration de compilation distincte. Les mentions de
> production interdite ci-dessous décrivent l'état historique du Lot B.
> Voir [DESKTOP-LOT-C.md](DESKTOP-LOT-C.md) pour l'état courant.

## Compilation Windows du 1er novembre 2026

Compilation native Windows x64 réussie depuis `main`, base `0c6d1ce`, avec
Rust/Cargo 1.90.0, Visual Studio Build Tools 2022, Windows SDK 10.0.26100.0,
WebView2 156.0.4314.58, Node 26.13.0 et npm 11.20.0.

Le premier `src-tauri/Cargo.lock` a été généré par Cargo : 406 paquets
verrouillés. `cargo test --locked` réussit (1 test : refus des profils de
production et inconnus). `npm test` et `npm run test:desktop` réussissent ;
`npm run lint` termine avec 0 erreur et 108 avertissements.
Le test Chromium conserve désormais l'export synthétique hors du répertoire
de téléchargement du navigateur avant sa fermeture, pour permettre le réimport
sur Windows.

Commande de compilation exécutée avec le verrou :

```powershell
npm.cmd run desktop:build -- -- --locked
```

Exécutable produit :
`src-tauri/target/x86_64-pc-windows-msvc/release/cryptokeep-desktop.exe`.
Il utilise la configuration test, sans bundle ni installateur. Aucun coffre
réel n'a été ouvert par les contrôles automatisés. Après compilation, le
démarrage natif a été confirmé : fenêtre « CryptoKeep — tests synthétiques »,
processus répondant et moteur WebView2 enfant utilisant exclusivement le canal
`fr.giscolab.cryptokeep.test` (répertoire `WebView2/EBWebView`). Cela ne prouve
pas le bon fonctionnement des commandes de l'interface. La persistance native
WebView2, l'export/import natif et l'ergonomie Windows restent à valider
manuellement avec des données synthétiques. Le Lot C reste hors de ce contrôle.

### Retour du test manuel Windows — 1er novembre 2026

L'utilisateur a confirmé le parcours demandé : création d'un coffre synthétique,
ajout d'une entrée fictive, export `.vault`, fermeture complète, relance du
prototype test et présence de l'entrée après déverrouillage. Ce résultat est
déclaré par l'utilisateur ; les interactions n'ont pas été observées ni
automatisées par Codex.

La persistance après redémarrage de l'application est donc confirmée par ce
test manuel. Le réimport natif de l'export, la restauration sur profil vierge,
la veille, le presse-papiers et les vérifications réseau restent non validés.
La compilation et ce test ne valident pas l'installation/désinstallation du
Lot C ni l'utilisation avec des coffres réels.

## Rapport initial de préparation Linux

Le socle Tauri 2 est préparé pour Windows x64, en conservant la version web.
Il n'est pas validé nativement dans l'environnement Linux de préparation.
Aucun installateur, mise à jour automatique ou test de désinstallation n'est
fourni dans ce lot. Ces travaux appartiennent au Lot C.

## État de départ et outillage

Base vérifiée avant édition : commit
`0eafb5f74e6a35baa4d91690844a6fb93c18c699`, branche locale `work`, état propre.
Aucun AGENTS.md trouvé dans le dépôt et ses parents accessibles.

Versions directes figées : CLI npm Tauri 2.12.4, crate Tauri 2.12.5,
tauri-build 2.7.4, Rust 1.90.0. La CLI est une dépendance de développement ;
aucune bibliothèque JavaScript applicative ni framework n'a été ajouté.
Les dépendances Rust transitives ne sont pas encore verrouillées : Cargo est
absent de la machine Linux et aucun verrou Rust n'a été inventé. Le premier
contrôle Windows devra générer et examiner ce verrou avant de prétendre à une
compilation reproductible.

## Ressources et séparation web/desktop

`npm run desktop:prepare` produit le répertoire ignoré `dist/desktop` depuis
une liste explicite dans [assets.json](../desktop/assets.json). Aucun balayage
des journaux, profils ou coffres n'est effectué. Les sources cryptographiques
sont copiées à l'identique. Le HTML généré possède une entrée desktop et une
CSP hors ligne ; le HTML web original est conservé.

Les chemins sortants, liens symboliques, fichiers inattendus et modifications
manuelles dans une sortie générée existante entraînent un refus. La préparation
ne supprime aucun fichier préexistant. Les chemins sont relatifs au projet :
le déplacement hors OneDrive n'exige pas de modification du code.

La CSP garde `default-src 'none'`, sans unsafe-inline ni unsafe-eval. Les seules
destinations de connexion sont l'origine locale et les transports IPC locaux
de Tauri. HIBP reste disponible et facultatif dans la version web ; le desktop
le désactive avant tout appel réseau, y compris avec un consentement préexistant.
Le moteur WebView2 lui-même reste un composant système dont le trafic de fond
ne peut pas être certifié par un test du frontend Linux.

Python et les lanceurs existants restent disponibles pour la version web.
Le desktop charge des ressources embarquées, sans Python ni serveur de production.
Les en-têtes natifs configurés comprennent nosniff, COOP, CORP et la politique
du presse-papiers. La CSP vient de Tauri ; la page possède aussi un repli CSP
et une politique de référent. Leur combinaison avec les injections Tauri doit
être contrôlée dans WebView2 : le test Chromium n'injecte pas le pont natif.

## Contrat de stockage

| Canal | Identifiant | Profil Windows |
|---|---|---|
| Production réservée, démarrage interdit au Lot B | fr.giscolab.cryptokeep | %LOCALAPPDATA%\fr.giscolab.cryptokeep\WebView2 |
| Développement | fr.giscolab.cryptokeep.dev | %LOCALAPPDATA%\fr.giscolab.cryptokeep.dev\WebView2 |
| Tests natifs synthétiques | fr.giscolab.cryptokeep.test | %LOCALAPPDATA%\fr.giscolab.cryptokeep.test\WebView2 |

L'origine Windows attendue est `https://tauri.localhost`, avec useHttpsScheme
explicitement activé dans chaque configuration et dans le constructeur natif.
Le chemin de données est résolu par Tauri avant création de la WebView, sans
numéro de version ni dépendance au dossier d'installation. La fenêtre ne peut
pas naviguer vers une origine distante ; aucune commande Rust personnalisée,
capacité de fichiers, plugin shell ou API globale Tauri n'est exposé.

Le profil de production est refusé par le code Rust ET par le précontrôle JS.
Les tests Chromium utilisent un profil temporaire et un marqueur synthétique
sur la boucle locale. Ce marqueur n'est pas une preuve d'exécution native.
Ne jamais utiliser un coffre personnel avec ce prototype, même dans le canal test.

Conservés : IndexedDB VaultDB version 1, store vault, clé current ; copie
secondaire cryptokeep.backup.v1 dans localStorage ; format chiffré v2,
PBKDF2-HMAC-SHA512 à 220 000 itérations, AES-GCM et AAD existantes.
La copie secondaire partage le profil : elle ne protège pas de sa suppression.

Le desktop refuse l'ouverture, l'import et la restauration nécessitant une
migration de format/KDF ou d'horodatages. Il ne réécrit pas ces coffres.
La version web conserve ses migrations existantes. Aucun paramètre
cryptographique n'est modifié et aucun transfert de clé vers Rust n'est ajouté.

## Contrôles disponibles

```sh
npm test
npm run test:security
npm run test:browser
npm run test:desktop
npm run lint
```

[desktop.spec.js](../tests/desktop.spec.js) vérifie la préparation, les canaux,
le refus des migrations sans écriture, le mode hors ligne et la borne d'import.
[browser.spec.mjs](../tests/desktop/browser.spec.mjs) utilise des processus
Chromium réellement arrêtés puis relancés sur le même profil temporaire.
Il vérifie l'export effectif d'un fichier synthétique, son réimport, IndexedDB,
localStorage, Web Locks, la clé non extractible, le refus de script inline et
l'absence de requête distante du frontend. Tout appel distant serait intercepté
et refusé, même si la CSP régressait. Aucun profil réel n'est recherché.

Les vérifications Node/Chromium Linux ne certifient ni WebView2 ni les dialogues
Windows, la veille, le verrouillage système ou le presse-papiers natif.
Les tests existants d'atomicité et de conflits restent dans npm test.

Résultats constatés sur Linux pour ce lot :

| Vérification | Résultat |
|---|---|
| npm test | 45 suites, dont les 9 scénarios du contrat desktop, terminées sans échec |
| npm run test:security | Contrôles JavaScript et 5 tests Python réussis |
| npm run test:browser | 22 étapes du parcours web réussies |
| npm run test:desktop | Contrat et parcours Chromium desktop synthétiques réussis |
| npm run test:python et npm run fuzz:properties | Réussis |
| Schéma JSON de la CLI 2.12.4 | Trois configurations valides : production réservée, dev, test |
| npm run lint | 0 erreur, 108 avertissements (55 préexistants, 53 supplémentaires dans l'outillage et les tests) |
| Compilation Rust et exécution Windows/WebView2 | Non exécutées ; prérequis absents de cette instance Linux |

## Vérification et compilation sur Windows, sans installateur

Depuis PowerShell dans le dossier local du projet :

```powershell
Set-Location 'C:\Users\cadet\Documents\github\CryptoKeep'
powershell -NoProfile -File scripts/desktop/check-windows.ps1
```

Ce script est en lecture seule : il vérifie l'outillage et les métadonnées
d'installation système, jamais le contenu d'un profil. Il n'installe rien.
Si nécessaire, installer les Build Tools avec développement desktop C++, le
Windows SDK, Rust x64 MSVC et WebView2 depuis leurs sources officielles, puis
relancer ce contrôle. Node 24 est la référence du projet.

Après installation autorisée des prérequis et de la chaîne Rust figée :

```powershell
npm ci
npm run desktop:prepare
Push-Location src-tauri
cargo generate-lockfile
cargo test --locked
Pop-Location
npm run test:desktop
npm run desktop:dev
```

Examiner le verrou et les diagnostics Rust ; corriger toute incompatibilité
nativement observée avant de continuer. Les appels Cargo peuvent télécharger
des dépendances : ils ne sont pas exécutés sur Linux dans ce lot.

Pour compiler uniquement le prototype test, sans NSIS, MSI ni bundle :

```powershell
npm run desktop:build
```

Cette commande sélectionne le canal test et --no-bundle. L'exécutable Cargo
se trouvera sous le dossier target de src-tauri, dans le sous-dossier de la
cible x86_64-pc-windows-msvc puis release. Il n'a pas été produit ici.

Dans l'application Windows de test : créer un coffre synthétique, ajouter une
entrée, exporter VAULT, fermer TOUS les processus de l'application, relancer le
même binaire, déverrouiller et vérifier les données, puis importer l'export.
Vérifier l'origine attendue, le refus des navigations distantes, les en-têtes
effectifs, Web Locks, les permissions du presse-papiers, la réduction/veille
et l'absence de réseau superflu. Ne jamais substituer le profil de production.

## Restauration initiale et limite de 10 Mio : préparation uniquement

La borne d'import reste exactement 10 Mio, avant lecture. Le test couvre la
borne et le refus à un octet au-delà. La taille exportée doit être confrontée
à toutes les limites d'import avant une distribution, car le chemin d'export
n'impose pas actuellement cette borne au fichier produit.

Le futur parcours « Restaurer un coffre » devra partir de l'écran de première
utilisation, sans créer de coffre vide. Il faudra garder le service de validation,
demander le mot de passe du fichier, confirmer, recontrôler l'absence du principal
dans la transaction et ne rien écrire en cas d'échec, annulation ou concurrence.
Tests prévus : profil vierge, fichier altéré, mauvais mot de passe, annulation,
coffre apparu entre-temps, limite de taille et réouverture après restauration.
Ce parcours n'est PAS implémenté au Lot B ; l'interface d'import actuelle exige
toujours une session déverrouillée.

## Limites et Lot C

Aucun installateur ni test de désinstallation n'est créé. La conservation après
mise à jour, désinstallation/réinstallation reste NON démontrée. Un installateur
NSIS standard peut proposer de supprimer les données : le Lot C devra empêcher
cette suppression si leur conservation est impérative. Un profil stable ne
protège pas d'une suppression externe ; un VAULT indépendant reste indispensable.

Le prototype utilise une seule fenêtre et refuse les fenêtres supplémentaires.
La preuve Windows de persistance et la
compilation Rust sont requises avant de qualifier le socle de validé nativement.
Le lint de référence avant ce lot avait déjà 55 avertissements, contre 24 dans
CONTRIBUTING. Les avertissements supplémentaires de ce lot concernent surtout
les chemins de fichiers variables dans le préparateur et les fixtures temporaires :
ces accès sont bornés par une liste explicite, des vérifications de liens et un
répertoire temporaire de test. Aucune règle n'est désactivée et aucun avertissement
n'est assimilé à une preuve automatique de vulnérabilité.
