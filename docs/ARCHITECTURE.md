# Architecture de CryptoKeep

## Deux modes, un frontend partagé

La version web charge `index.html` et `scripts/app.js` depuis le serveur local
Python fourni. Le desktop Tauri 2 embarque les ressources de la même application
et les charge dans Microsoft WebView2. Le traitement cryptographique reste dans
Web Crypto ; il n'est pas remplacé par une implémentation Rust.

Les modules JavaScript organisent l'interface, le coffre en mémoire, la
cryptographie et le stockage. Ces modules ne sont pas des processus isolés :
un script exécuté dans l'origine possède les privilèges du frontend.

## Entrée desktop et ressources

`desktop/bootstrap.js` applique d'abord les précontrôles et la politique desktop.
`scripts/desktop/prepare.mjs` construit `dist/desktop` depuis
`desktop/assets.json`, puis crée un manifeste de hachages. Les fichiers non
autorisés, profils, tests, journaux et coffres ne sont pas embarqués.

`src-tauri/src/main.rs` sélectionne le canal à partir de l'identifiant, crée la
fenêtre et un profil WebView2 persistant. L'origine attendue est
`https://tauri.localhost`. Les navigations distantes et nouvelles fenêtres sont
refusées. Aucune commande Rust applicative personnalisée ni API globale Tauri
n'est exposée ; les capacités explicites sont vides.

Les canaux production, développement et test sont séparés par leurs identifiants
et leurs répertoires. Ne pas changer l'origine, le schéma ou l'identifiant d'une
version distribuée sans plan de migration : le stockage est lié à l'origine
et au profil. Voir [INSTALLATION.md](INSTALLATION.md).

## Stockage et cryptographie

`scripts/core/vault/manager.js` gère le coffre et la session. Les primitives sont
dans `scripts/core/crypto/`. IndexedDB conserve le record chiffré ; localStorage
reçoit une copie secondaire chiffrée. Les paramètres et certaines informations
de profil ne sont pas chiffrés et ne doivent pas contenir de secrets.

Le format v2 associe chaque entrée à son identifiant par AAD et possède un bloc
de validation chiffré. Les écritures s'appuient sur Web Locks, des transactions
IndexedDB et une vérification après écriture. Ces mécanismes réduisent les
risques de concurrence ; ils ne protègent pas contre la perte du disque ou du profil.
Voir [les formats](FORMATS-DE-COFFRE.md) et [le modèle de menace](../THREAT_MODEL.md).

## Réseau et compatibilité

Le frontend desktop applique une CSP locale et bloque HIBP. Le frontend web
autorise la consultation HIBP après consentement explicite. Le trafic propre à
WebView2, Windows ou à l'installation du moteur ne peut pas être déduit de la
seule politique réseau du JavaScript.

La version web permet des migrations historiques ; le desktop refuse les
coffres nécessitant une migration automatique. Ce choix est implémenté dans
`scripts/core/runtime-policy.js`, indépendamment du nom de la version distribuée.

## Dépendances

Le frontend ne déclare aucune dépendance npm de production ; il comprend
néanmoins des ressources tierces locales. L'outillage npm et les crates Rust
sont verrouillés dans leurs fichiers de dépendances. Tauri, WebView2 et le
système restent des composants de confiance. L'absence de CDN n'équivaut pas
à une absence de dépendances.
