# Lancer la version web localement

Cette procédure concerne la version navigateur. L'application Windows Tauri
s'utilise sans serveur Python : voir [INSTALLATION.md](INSTALLATION.md).

## Windows

Installer Python 3, cloner le dépôt puis lancer `start_vault_secure.bat`.
Le menu permet de démarrer le serveur, l'arrêter, exporter les journaux,
afficher le chemin du profil et quitter. `start_vault_local.bat` est le lanceur
historique encore disponible ; les deux fichiers sont distincts de l'installateur.

Le lanceur recherche Edge ou Chrome et utilise un profil dédié persistant.
Si ces navigateurs ne sont pas détectés, il ouvre le navigateur par défaut
avec un avertissement : vérifier alors soi-même le profil utilisé.

| Élément | Valeur |
|---|---|
| Adresse | `http://127.0.0.1:8000/index.html` |
| Transport | HTTP en clair sur la boucle locale, aucun TLS |
| Profil navigateur dédié | `%LOCALAPPDATA%\CryptoKeep\browser-profile` |
| État du serveur | `%LOCALAPPDATA%\CryptoKeep\run\server.json` |
| Journaux locaux | Dossier `logs/` du projet |

Ne pas utiliser une fenêtre privée : ses données peuvent disparaître à sa
fermeture. Ne pas supprimer le profil sans export `.vault` indépendant.
La confidentialité au repos vient du chiffrement applicatif AES-GCM, pas du HTTP.

## macOS et Linux

Utiliser le serveur fourni, qui applique les en-têtes de sécurité de l'application :

```sh
python3 scripts/secure_local_server.py --bind 127.0.0.1 --port 8000 --directory .
```

Ouvrir ensuite `http://127.0.0.1:8000/index.html` dans un profil normal persistant.
Le serveur Python générique ne doit pas remplacer le serveur fourni pour cet usage.

## Cycle de vie et diagnostic

`scripts/start_secure_server.ps1` conserve le PID et l'heure de démarrage du
serveur qu'il lance. `scripts/stop_secure_server.ps1` vérifie l'identité du
processus et sa ligne de commande avant l'arrêt. Un port occupé par un autre
programme n'autorise pas à arrêter ce programme.

En cas d'échec, consulter les journaux locaux sans les publier avec des données
personnelles. Vérifier Python, le port et la réponse du serveur. La sonde de
persistance de `scripts/security/storage-persistence.js` observe des indices
de conservation du stockage ; elle ne garantit pas sa survie future.

HIBP peut être activé dans la version web après consentement explicite. Cette
fonction est bloquée dans le desktop. Voir [SECURITY.md](../SECURITY.md).
