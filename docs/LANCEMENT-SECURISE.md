# Guide de lancement sécurisé

> **Document de référence, priorité haute.** Créé au Lot 10.
> [`launcher.md`](launcher.md) reste valable et décrit les décisions techniques
> du lanceur ; ce guide-ci s'adresse à l'usage quotidien.

## 1. En une ligne

Sous Windows, lancez **`start_vault_secure.bat`**, puis choisissez **1**.

Il n'existe pas de fichier `start.bat`. Ce nom apparaissait dans d'anciennes
notes ; les deux lanceurs réels sont `start_vault_secure.bat` (recommandé) et
`start_vault_local.bat` (historique, conservé).

## 2. Ce que fait le lanceur

1. détecte Python dans le `PATH` ;
2. démarre `scripts/secure_local_server.py` sur `127.0.0.1:8000` ;
3. attend une réponse HTTP réelle avant d'aller plus loin ;
4. ouvre Edge ou Chrome sur un **profil dédié et persistant** ;
5. journalise dans `logs\vault_<horodatage>.log` et `.log.err` ;
6. enregistre le PID dans `%LOCALAPPDATA%\CryptoKeep\run\server.json`, pour
   pouvoir arrêter **son** serveur sans toucher à un autre processus.

| Élément | Valeur |
|---|---|
| Adresse | `http://127.0.0.1:8000/index.html` |
| Transport | **HTTP en clair — aucun TLS** |
| Profil navigateur | `%LOCALAPPDATA%\CryptoKeep\browser-profile` |
| État du serveur | `%LOCALAPPDATA%\CryptoKeep\run\server.json` |
| Journaux | `logs\vault_<horodatage>.log` |

## 3. Deux règles à ne pas contourner

### 3.1 Ne jamais lancer le coffre en navigation privée

Le coffre vit dans IndexedDB, et ses préférences dans `localStorage`. En mode
privé, le navigateur **détruit tout à la fermeture** : le coffre est perdu, sans
avertissement et sans récupération possible. C'est pour cela que le lanceur
ouvre un profil persistant dédié, distinct de votre profil personnel.

### 3.2 L'accès local n'est pas HTTPS

L'adresse est `http://`, jamais `https://`. Le serveur local n'implémente aucun
TLS et ne doit jamais être décrit autrement. La confidentialité **au repos**
repose exclusivement sur le chiffrement AES-GCM appliqué aux données — pas sur
le transport.

Le serveur n'écoute que sur l'interface de bouclage : rien n'est exposé au
réseau local.

## 4. Le menu

| Choix | Effet |
|---|---|
| 1 | Démarre le serveur et ouvre le navigateur |
| 2 | Arrête **le serveur de ce lanceur** — jamais un autre processus |
| 3 | Exporte les journaux en HTML (`export_log.py`) |
| 4 | Affiche l'emplacement du profil navigateur |
| 5 | Quitte, en arrêtant le serveur |

## 5. Le profil navigateur contient votre coffre

`%LOCALAPPDATA%\CryptoKeep\browser-profile` contient IndexedDB et
`localStorage`, donc **le coffre chiffré**.

**Ne supprimez jamais ce dossier sans avoir exporté votre coffre au
préalable.** Un « nettoyage » de profil équivaut à une suppression définitive.

## 6. En cas de problème

| Message | Cause | Action |
|---|---|---|
| `[ERREUR] Python introuvable dans le PATH` | Python absent ou non déclaré | Installer Python 3 en cochant « Add to PATH » |
| `[ERREUR] Le serveur n a pas demarre` | Port occupé, ou erreur Python | Lire `logs\vault_<horodatage>.log.err` |
| `[ERREUR] Timeout demarrage` | Le serveur ne répond pas en 20 s | Même journal ; vérifier qu'aucun pare-feu ne bloque la boucle locale |
| Le navigateur ne s'ouvre pas | Ni Edge ni Chrome trouvé | Ouvrir manuellement `http://127.0.0.1:8000/index.html` — **hors navigation privée** |

## 7. macOS et Linux

Aucun lanceur n'est fourni. Servez le dépôt vous-même :

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

Puis ouvrez `http://127.0.0.1:8000/index.html` dans une fenêtre **normale**.

`http.server` ne pose pas les en-têtes de sécurité de
`scripts/secure_local_server.py`. Pour un usage régulier, préférez :

```bash
python3 scripts/secure_local_server.py
```

## 8. Développement local

```bash
npm test              # suite complète, sortie non nulle en cas d'échec
npm run test:security # contrôles de non-régression sécurité
npm run test:syntax   # syntaxe de tous les fichiers JS internes
npm run test:python   # compilation des scripts Python
npm run test:browser  # parcours navigateur complet (voir tests/browser/README.md)
npm run lint          # ESLint — 0 erreur exigée
```

`npm install` n'installe que des outils de développement. L'application
elle-même n'a **aucune** dépendance : `dependencies: null`, aucun CDN, aucun
appel réseau hors HIBP, qui reste désactivé par défaut.
