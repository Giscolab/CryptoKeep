# CryptoKeep Android : aperçu de test

Branche dédiée `android/initial-port`, issue de `358c4b7bab570be7bafba0bdb6364a68ff5bb50a`.
Aucune fusion vers `main`, aucune publication en boutique ni release automatique.

## Construction

Le workflow `.github/workflows/android.yml` construit un APK ARM64 de débogage,
signé avec la clé de test générée par Android. Il démarre sur les modifications
`android/**`, les PR vers main ou manuellement depuis Actions.
L'archive `cryptokeep-android-synthetic-preview` contient APK, SHA256SUMS,
commit et version des outils. Les artefacts expirent après sept jours.
Les dépendances npm et Cargo sont verrouillées, les actions sont épinglées par
commit, Rust 1.90.0, Node 24.11.0, Temurin 17.0.17+10, NDK 27.2.12479018,
SDK 36 et build-tools 36.0.0 sont sélectionnés explicitement.
Le projet Android est régénéré avec la CLI Tauri 2.12.4 verrouillée puis durci.
Les valeurs compileSdk/targetSdk 36 et buildToolsVersion 36.0.0 sont imposées
dans le projet généré pour ne pas dépendre de l’inventaire SDK du serveur.
L'image Ubuntu, platform-tools, les téléchargements Gradle/Maven et la clé de
débogage restent des sources de variation : aucune identité binaire entre deux
compilations n'est garantie. Pour distribuer des mises à jour durables, il faudra
une clé de signature stable conservée hors dépôt et un verrouillage/vérification
supplémentaire des artefacts Gradle, de l'image et des composants SDK.

En local, installer Java 17, SDK/NDK correspondants, Rust 1.90.0, Node 24 et Python 3,
puis définir JAVA_HOME, ANDROID_HOME et NDK_HOME :

```sh
npm ci --ignore-scripts
rustup target add aarch64-linux-android
npm run android:init
npm run android:build
```

Les fichiers natifs générés restent ignorés par Git. Pour initialiser un émulateur
x86_64, installer aussi la cible Rust correspondante et remplacer `aarch64` par
`x86_64` dans la commande Tauri. Les scripts Windows et leurs profils sont conservés.

## Compatibilité et protections

Le démarrage Rust partagé possède une entrée mobile. Le répertoire WebView2 est
réservé à Windows. CryptoKeep Mobile utilise le profil `fr.giscolab.cryptokeep.dev` et
l'origine locale HTTPS `https://tauri.localhost`; aucun site distant n'est chargé.
Le précontrôle exige Web Crypto, Web Locks, IndexedDB et localStorage. Un WebView
Android ancien ou incompatible doit refuser de démarrer, jamais abaisser les contrôles.
Android 9 minimum est configuré, mais un Android System WebView récent est requis.
La CSP, les capacités Tauri vides et la politique hors ligne sont conservées.
Le manifeste généré désactive les sauvegardes et le trafic HTTP non chiffré;
des exclusions explicites couvrent le cloud et le transfert entre appareils
sous Android 12+. Voir la documentation Android officielle :
https://developer.android.com/identity/data/autobackup .
FLAG_SECURE protège captures d'écran et aperçus sur les appareils qui le respectent.
Le passage en arrière-plan signalé par le WebView verrouille la session et purge
les données rendues; ce mécanisme dépend des événements du système et ne constitue
pas une garantie d'effacement de toute la mémoire JavaScript.

Le format courant v2 reste inchangé : AES-256-GCM, PBKDF2-HMAC-SHA512,
220000 itérations pour les nouveaux coffres, sel de 16 octets, IV de 12 octets,
clés non extractibles. Les métadonnées de structure ne sont pas toutes chiffrées.
L'import est limité à 10 Mio et vérifie toutes les entrées avant confirmation
et remplacement atomique. Les anciens formats nécessitant une migration sont
refusés par cette politique; les convertir avec une version PC appropriée et
conserver l'original. Aucun vrai coffre n'est nécessaire aux tests.

## Essai sur téléphone : données fictives uniquement

1. Télécharger et décompresser l'artefact Actions, vérifier le SHA256 de l'APK.
2. Installer l'APK de test ARM64 sur un appareil compatible.
3. Sur une installation PC de test, créer une entrée entièrement fictive,
   exporter son coffre chiffré v2, puis transférer uniquement ce fichier fictif.
4. Sur Android, sélectionner l'import `.vault`, choisir le fichier et saisir
   son mot de passe fictif. Confirmer après vérification du résumé.
5. Contrôler l'entrée, verrouiller, fermer et rouvrir l'application, puis
   redéverrouiller pour vérifier la persistance. Tester un mauvais mot de passe,
   un fichier altéré, une annulation et un second import sans perte du précédent.
6. Tester rotation, clavier, défilement, arrière-plan, sélecteur de fichiers,
   captures d'écran et presse-papiers avec les données fictives.

Le sélecteur peut masquer le WebView et donc verrouiller une session en cours :
revenir à l'écran verrouillé et relancer l'import si nécessaire. L'export par
liens de téléchargement WebView, le presse-papiers, la persistance après arrêt
forcé et les événements natifs doivent être validés sur un vrai téléphone.
Il n'y a ni service Android Autofill, ni biométrie, ni synchronisation distante.
Une clé debug différente peut empêcher une mise à jour APK; ne pas désinstaller
une application contenant l'unique copie d'un coffre. La désinstallation efface
ses données locales. Ce paquet est réservé à la validation synthétique.

## Vérifications

`tests/android.spec.js` utilise un véritable objet File synthétique et le service
partagé : import, ouverture, clé non extractible, verrouillage, mauvais mot de
passe, altération, annulation et refus v1 sans écrasement du coffre courant.
Les suites existantes couvrent crypto, transactions, import, sauvegardes et bureau.
Le parcours `npm run test:android:browser` vérifie aussi dans Chromium l’import
dès le premier accueil, la confirmation, le déverrouillage, la purge après un
événement de visibilité simulé et la persistance après redémarrage complet.
Ces tests ne prouvent pas le comportement du sélecteur ou du WebView Android.
La compilation APK ne remplace pas un essai sur appareil.
La suite générale de documentation comporte déjà des références manquantes dans
le commit de départ; ne pas présenter `npm test` comme intégralement vert.

## Synchronisation chiffrée future

L'actuel `vault-sync.js` informe des onglets locaux; ce n'est pas une synchronisation
PC/téléphone. L'import remplace un instantané, sans fusion automatique.

1. Ajouter identité stable du coffre, révisions et lien à la révision parente,
   authentifiés cryptographiquement, ainsi qu'un contrôle de rejeu/retour arrière.
2. Définir un stockage distant de blobs chiffrés et une authentification distincte
   du mot de passe maître. Conserver dérivation et déchiffrement sur les appareils;
   ne jamais transmettre le mot de passe maître ni les entrées en clair.
3. Utiliser écriture conditionnelle (ETag/révision attendue), téléchargement dans
   une zone temporaire, validation complète puis remplacement atomique et copie
   chiffrée de récupération. Refuser l'écrasement silencieux d'une révision inconnue.
4. Présenter les conflits entre appareils pour résolution explicite. Une future
   fusion par entrée nécessitera versions et suppressions authentifiées.
5. Tester hors ligne, interruptions, modifications simultanées, corruption,
   restauration ancienne, rotation de clés et révocation d'appareil avec des
   fixtures fictives avant toute utilisation réelle.

La signature stable, les tests d'appareil, la revue des dépendances et la validation
mobile restent des préalables à un usage quotidien avec de vrais mots de passe.

## Interface Android adaptée

L’interface Android possède son propre habillage, activé par le marqueur natif :
barre inférieure Accueil/Coffre/Sécurité/Réglages, ouverture directe du coffre,
commandes tactiles de 44 pixels minimum, fiches verticales, filtres à faire glisser,
recherche pleine largeur, formulaires défilants et adaptations tablette/paysage.
Le thème Android par défaut est bleu nuit et menthe ; les autres thèmes restent
sélectionnables. Les feuilles et la structure de présentation PC sont conservées.
Les tests vérifient les quatre vues à 360×800, 390×844, 412×915, 768×1024 et 844×390.
Les captures et essais utilisent exclusivement un coffre fictif.

Les commandes Android utilisent désormais `tauri.android-mobile.conf.json`,
qui complète la configuration Android avec le nom **CryptoKeep Mobile** et
l’identifiant `fr.giscolab.cryptokeep.dev`. L’application s’installe à côté de
la première préversion `fr.giscolab.cryptokeep.test`, avec son propre stockage.
Cela préserve l’installation existante, dont la signature de débogage ne peut
pas être réutilisée depuis l’APK seul. Ne pas désinstaller l’ancienne application
pour essayer cette version : importer une copie chiffrée dans la nouvelle.
Une signature de distribution stable reste nécessaire pour les mises à jour durables.
