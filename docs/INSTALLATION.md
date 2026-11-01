# Installer CryptoKeep sous Windows

## Distribution disponible

La [Release v0.1.0](https://github.com/Giscolab/CryptoKeep/releases/tag/v0.1.0)
est une préversion Windows x64. Télécharger
`CryptoKeep-0.1.0-windows-x64-setup.exe` et, si souhaité, le fichier SHA256 associé.
Le binaire n'est pas signé ; les contrôles complémentaires de la version de
production restent à effectuer. Ce statut doit être conservé lors d'une redistribution.

## Installation et premier lancement

1. Lancer l'installateur et suivre ses indications. L'installation concerne
   l'utilisateur courant.
2. Le moteur Microsoft WebView2 est nécessaire. L'installateur peut télécharger
   son bootstrapper Microsoft si le moteur est absent.
3. Ouvrir CryptoKeep depuis son raccourci.
4. Sur un profil vierge, créer un coffre en choisissant son propre mot de passe
   maître. Aucun compte, coffre ni mot de passe n'est fourni dans le programme.

Node.js, Python et Rust sont des outils de développement ; ils ne sont pas
nécessaires à l'utilisation de l'application Windows installée.
Voir [le guide d'utilisation](UTILISATION.md).

## Profils de données

| Application | Identifiant | Répertoire WebView2 |
|---|---|---|
| CryptoKeep | `fr.giscolab.cryptokeep` | `%LOCALAPPDATA%\fr.giscolab.cryptokeep\WebView2` |
| Développement | `fr.giscolab.cryptokeep.dev` | `%LOCALAPPDATA%\fr.giscolab.cryptokeep.dev\WebView2` |
| CryptoKeep Test | `fr.giscolab.cryptokeep.test` | `%LOCALAPPDATA%\fr.giscolab.cryptokeep.test\WebView2` |

WebView2 peut créer ses propres sous-répertoires, notamment `EBWebView`.
Les coffres de ces profils sont indépendants. L'installation ne copie pas les
données de CryptoKeep Test ni celles d'un navigateur personnel.
Un profil de production déjà existant est réutilisé, pas vidé.

## Mise à jour et désinstallation

Exporter d'abord une sauvegarde chiffrée `.vault`, avec son mot de passe maître
conservé séparément. Fermer CryptoKeep avant une mise à jour ou une désinstallation.
Le désinstalleur retire les fichiers de l'application et ses raccourcis ; le
modèle NSIS est configuré pour conserver les profils utilisateur, y compris
en mode silencieux. Une réinstallation reprend le même identifiant de stockage.

La conservation par le désinstalleur n'empêche pas la suppression du profil par
un autre outil, une réinitialisation Windows ou une panne de disque. La copie
secondaire locale n'est pas une sauvegarde indépendante.

## Version web

La procédure et les données de la version web sont distinctes : voir
[LANCEMENT-SECURISE.md](LANCEMENT-SECURISE.md). Aucun transfert de coffre entre
les canaux n'est automatique. Voir [les limites des migrations](MIGRATIONS.md).
