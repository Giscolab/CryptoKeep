# Modèle de menace de CryptoKeep

Ce modèle décrit l'architecture actuelle, web et Windows. Le code fait
autorité sur les mécanismes implémentés ; les hypothèses ci-dessous ne sont
pas des garanties démontrées pour tous les environnements.

## Actifs

Mot de passe maître, clé dérivée, entrées déchiffrées en mémoire, coffres chiffrés,
métadonnées KDF, copie secondaire, contenu du presse-papiers et exports demandés
par l'utilisateur. Les informations du profil local sont des données personnelles
non chiffrées ; elles ne doivent pas être confondues avec les entrées du coffre.

## Frontières de confiance

- Sources de l'application et installateur distribués par un canal de confiance.
- Système, moteur du navigateur ou WebView2, Web Crypto et stockage de l'origine.
- Session déverrouillée contenant les références utilisables à la clé et aux entrées.
- Import de données non fiables vers la validation puis vers le stockage.
- Export en clair explicitement demandé vers un fichier contrôlé par le système.
- Consultation HIBP uniquement dans le web, après consentement.
- Chaîne de compilation, dépendances npm/Rust et outils NSIS.

IndexedDB et localStorage ne sont pas une frontière face à un script exécuté
dans l'origine. La non-extractibilité d'une clé ne bloque pas son utilisation
par ce script. Une injection dans une session déverrouillée peut donc être
un compromis complet des données déchiffrables.

## Surfaces à examiner

Formulaires, rendu des entrées, import `.vault` et CSV, export, chargement du
stockage, concurrence entre fenêtres, invalidation de session, changements de
mot de passe maître, presse-papiers, CSP et ressources tierces locales.
Pour Windows : sélection du canal, origine et profil WebView2, navigation,
installateur, mises à jour et conservation des données lors de la désinstallation.
Pour le web : serveur local, en-têtes, chemins servis et gestion des processus
des lanceurs. Aucun serveur de synchronisation n'est fourni.

## Propriétés recherchées

- Pas de secrets en clair dans le stockage applicatif ou les journaux.
- Exports CSV/JSON possibles uniquement sur demande explicite et session valide.
- Paramètres KDF explicites, IV neufs et AAD cohérente avec le format.
- Pas d'écriture partielle ou de remplacement silencieux par une sauvegarde périmée.
- Une opération devenue obsolète après verrouillage ne republie pas de clair.
- Aucune requête HIBP du desktop ; absence de consentement dans le web vaut refus.
- Profils de production, test et développement séparés ; origine stable.
- Aucune donnée utilisateur embarquée dans la distribution.

## Limites acceptées du modèle

Pas de récupération après oubli du mot de passe maître, de protection contre
un système entièrement compromis ou un observateur d'une session volontairement
ouverte. Pas de garantie de zéroïsation mémoire ou d'effacement sécurisé du
disque. Pas de promesse d'absence de trafic propre au système ou à WebView2.
Pas de validation indépendante implicite du seul fait qu'un test ou un scan passe.

Le format et les paramètres actuels sont dans
[FORMATS-DE-COFFRE.md](docs/FORMATS-DE-COFFRE.md). Les différences web/desktop de
migration sont dans [MIGRATIONS.md](docs/MIGRATIONS.md). Les limites destinées
aux utilisateurs sont dans [SECURITY.md](SECURITY.md).
