# CryptoKeep

CryptoKeep est un gestionnaire de mots de passe local : une application Windows
construite avec Tauri 2 et WebView2, et une version web utilisable avec le serveur
local fourni. Les entrées du coffre sont chiffrées sur l'appareil avec Web Crypto.

## Télécharger et installer

La [préversion Windows x64 0.1.0](https://github.com/Giscolab/CryptoKeep/releases/tag/v0.1.0)
contient l'installateur et son empreinte SHA256. Le binaire n'est pas signé.
Les contrôles complémentaires de la configuration de production restent à mener ;
la présence d'un installateur ne vaut pas validation de sécurité complète.

L'installateur ne contient aucun coffre, mot de passe ni compte de démonstration.
Sur un profil vierge, chaque utilisateur crée son propre coffre et choisit son
mot de passe maître. Les profils CryptoKeep et CryptoKeep Test sont séparés.

- [Installation Windows, profils et désinstallation](docs/INSTALLATION.md)
- [Prise en main et usage quotidien](docs/UTILISATION.md)
- [Version web et lancement local](docs/LANCEMENT-SECURISE.md)

## Fonctions disponibles

- Création, déverrouillage, verrouillage et suppression volontaire d'un coffre.
- Ajout, modification, suppression, recherche et tri des entrées.
- Générateur de mots de passe, analyse locale de robustesse et de réutilisation.
- Export chiffré `.vault`, import `.vault` et import CSV.
- Export CSV compatible Chrome/Edge et JSON, en clair après confirmation.
- Préférences d'affichage, thèmes et verrouillage automatique configurable.

Le desktop bloque les requêtes applicatives distantes et les migrations
automatiques. Dans la version web, la vérification HIBP est facultative et
désactivée par défaut. Il n'existe ni synchronisation entre appareils, ni compte
en ligne, ni 2FA/WebAuthn, ni remplissage automatique dans d'autres applications.

## Sécurité et sauvegarde

Le format courant utilise AES-GCM 256 bits et PBKDF2-HMAC-SHA512 à 220 000
itérations, avec un sel de 16 octets et des IV de 12 octets. La clé dérivée est
non extractible par l'API Web Crypto. Le coffre chiffré est enregistré dans
IndexedDB ; une copie secondaire chiffrée est conservée dans le même profil.

Exportez régulièrement un fichier `.vault` et conservez-le séparément du profil.
La copie secondaire ne protège pas contre la suppression du profil. Le mot de
passe maître n'est pas récupérable par le projet. Les exports CSV/JSON sont en
clair ; ils ne doivent pas être confondus avec une sauvegarde chiffrée.

Le système, le moteur WebView2 et la mémoire du processus font partie de la base
de confiance. Aucune certification, invulnérabilité ou garantie d'effacement
sécurisé n'est annoncée. Voir [SECURITY.md](SECURITY.md) et
[le modèle de menace](THREAT_MODEL.md).

## Documentation et développement

- [Index de la documentation](docs/README.md)
- [Architecture et séparation des canaux](docs/ARCHITECTURE.md)
- [Fonctions et sources correspondantes](docs/FONCTIONS-IMPLEMENTEES.md)
- [Compilation Windows](docs/DEVELOPPEMENT-WINDOWS.md)
- [Contribuer](CONTRIBUTING.md) et [historique des versions](CHANGELOG.md)

Le code source est la référence sur le comportement implémenté. Les résultats
d'une analyse automatique doivent toujours être rapportés au commit analysé.
Les contrôles du dépôt sont visibles dans
[GitHub Actions](https://github.com/Giscolab/CryptoKeep/actions).

## Support et licence

[Signaler un problème](https://github.com/Giscolab/CryptoKeep/issues), sans joindre
de mot de passe, de coffre personnel ni de journal sensible. Licence
[MIT](LICENSE) ; les composants tiers conservent leurs licences respectives.
