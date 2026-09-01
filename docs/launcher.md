# Mode de lancement retenu — CryptoKeep

> Document ajouté au Lot 1. Il décrit le mode de lancement **réellement**
> implémenté, sans promesse au-delà de ce que le code fait.

## 1. Résumé

| Élément | Valeur réelle |
|---|---|
| Transport | **HTTP en clair** sur `127.0.0.1:8000` — **aucun TLS** |
| Serveur | `scripts/secure_local_server.py` (`ThreadingHTTPServer`, en-têtes de sécurité) |
| Lanceur recommandé | `start_vault_secure.bat` |
| Lanceur historique | `start_vault_local.bat` (conservé, corrigé) |
| Profil navigateur | `%LOCALAPPDATA%\CryptoKeep\browser-profile` — **persistant**, dédié |
| État du serveur | `%LOCALAPPDATA%\CryptoKeep\run\server.json` (PID + heure de démarrage) |
| Journaux | `logs\vault_<horodatage>.log` et `.log.err` |

L'URL locale ne doit jamais être présentée comme `https://`. Le serveur
n'implémente pas TLS. La confidentialité au repos repose exclusivement sur le
chiffrement applicatif AES-GCM, pas sur le transport.

## 2. Pourquoi le mode navigation privée a été retiré

L'application stocke le coffre chiffré dans **IndexedDB**, et une copie de
sauvegarde chiffrée plus les préférences non sensibles dans **`localStorage`**.

En navigation privée (`--incognito`, InPrivate), Chromium et Edge allouent un
profil éphémère : ces deux zones de stockage sont détruites à la fermeture de
la dernière fenêtre. Ouvrir le coffre ainsi revient à perdre le coffre à chaque
fermeture du navigateur.

Les deux lanceurs utilisent désormais :

```
--user-data-dir=%LOCALAPPDATA%\CryptoKeep\browser-profile
--no-first-run --no-default-browser-check
```

Conséquences :

- le profil est **déterministe** et propre au projet ;
- il est **distinct du profil navigateur personnel** de l'utilisateur, qui
  n'est ni lu ni modifié ;
- IndexedDB et `localStorage` y survivent à la fermeture et au redémarrage.

> ⚠️ Ce dossier de profil contient le coffre chiffré. Le supprimer supprime le
> coffre local. Exportez un `.vault` avant toute manipulation.

Si ni Edge ni Chrome ne sont trouvés, `start_vault_secure.bat` ouvre le
navigateur par défaut **et affiche un avertissement** : dans ce cas seulement,
c'est à l'utilisateur de ne pas utiliser une fenêtre privée.

## 3. Vérification de persistance côté application

`scripts/security/storage-persistence.js` exécute une sonde au démarrage :

1. si `indexedDB` est absent → statut `unavailable`, message d'erreur affiché ;
2. si l'ouverture ou l'écriture est refusée → statut `blocked`, message d'erreur ;
3. si l'écriture réussit mais qu'aucune session antérieure n'est retrouvée →
   statut **`unknown`** ;
4. si un marqueur d'une session antérieure est retrouvé → statut `survived`.

Le statut `unknown` est volontaire : au premier lancement, **aucune donnée n'a
été observée**, donc aucun résultat positif n'est affiché. Aucune API navigateur
ne permet de garantir à l'avance la survie des données ; la sonde observe des
indices, elle ne promet rien. `navigator.storage.persisted()` est relevé à titre
indicatif : il renseigne sur l'éviction sous pression disque, pas sur le mode de
navigation.

Le marqueur écrit est un identifiant aléatoire (`crypto.randomUUID`) et un
horodatage. Il ne contient aucun secret.

## 4. Cycle de vie du serveur local

### Démarrage — `scripts/start_secure_server.ps1`

1. vérifie la présence de `scripts/secure_local_server.py` ;
2. si un serveur déjà enregistré par ce lanceur tourne encore (PID **et** heure
   de démarrage concordants), le réutilise au lieu d'en démarrer un second ;
3. sinon, vérifie que le port est libre par **correspondance exacte**
   adresse:port (`Get-NetTCPConnection`, repli `netstat` avec ancrage de motif).
   L'ancienne détection `findstr ":8000"` se déclenchait aussi sur `18000`,
   `80001` ou une adresse distante ;
4. si le port est occupé par un tiers : **échec explicite, aucun processus
   n'est arrêté**, l'utilisateur décide ;
5. démarre le serveur avec `Start-Process -PassThru` et enregistre
   `{ Pid, StartTime, Port, Bind, Root, Scheme: "http", LogFile, ErrorFile }`
   dans `server.json`.

### Arrêt — `scripts/stop_secure_server.ps1`

Trois vérifications sont **toutes** exigées avant tout arrêt :

1. le PID enregistré correspond à un processus vivant ;
2. son heure de démarrage correspond à celle enregistrée — protection contre la
   réattribution de PID par le système ;
3. sa ligne de commande référence `secure_local_server.py`.

Si l'une échoue, **aucun processus n'est arrêté** et un avertissement est émis.

Le comportement précédent — `netstat` sur le port, puis `taskkill /F` sur tout
processus Python en écoute — est supprimé des deux lanceurs. Il pouvait tuer un
serveur Python sans aucun rapport avec ce projet.

## 5. Ce qui reste hors de portée

- Ce lanceur ne durcit pas le navigateur lui-même : une extension disposant
  d'un accès à la page reste hors périmètre de défense (voir `THREAT_MODEL.md`).
- Le profil dédié n'est **pas** chiffré au niveau du disque. La protection au
  repos vient du chiffrement applicatif du coffre, pas du profil.
- Aucun TLS n'est ajouté. Un certificat auto-signé sur `127.0.0.1` n'apporterait
  rien contre les menaces réellement modélisées ici (accès local, extension).
- Le lanceur n'est pas un empaquetage `.exe`. Voir la feuille de route.
