# Tests navigateur — Lot 9

## Ce qui est livré, et pourquoi

Le parcours navigateur tourne **sans aucune dépendance installée**.

`tests/browser/cdp-client.mjs` pilote un navigateur déjà présent sur la
machine — Edge, Chrome ou Chromium — via le **Chrome DevTools Protocol**,
en n'utilisant que des modules natifs de Node (`child_process`, `fetch`,
`WebSocket`, `http`). `tests/browser/static-server.mjs` sert le dépôt sur
`127.0.0.1` avec `node:http`.

Ce choix découle directement des règles du projet : aucune dépendance
applicative, aucun CDN, aucune installation réseau sans autorisation.
Playwright et Puppeteer téléchargent en plus leur **propre** navigateur
(plusieurs centaines de mégaoctets) au moment de l'installation.

## Lancer le parcours

```
npm run test:browser
```

Prérequis : **Node 21 ou plus** (le `WebSocket` global est utilisé) et un
navigateur Chromium installé. Node 22.23 est la version en place.

Le navigateur est cherché aux emplacements que `start_vault_secure.bat`
teste déjà :

| Plateforme | Emplacements testés, dans l'ordre |
|---|---|
| Windows | `%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`, `%ProgramFiles%\...\msedge.exe`, `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`, puis les deux `Program Files` de Chrome |
| macOS | Microsoft Edge, Google Chrome, Chromium dans `/Applications` |
| Linux | `$CRYPTOKEEP_BROWSER`, `microsoft-edge`, `google-chrome`, `chromium`, `chromium-browser` |

Pour imposer un binaire précis :

```
set CRYPTOKEEP_BROWSER=C:\chemin\vers\msedge.exe   ..\.. (Windows)
CRYPTOKEEP_BROWSER=/usr/bin/chromium npm run test:browser   (Linux, macOS)
```

**Si aucun navigateur n'est trouvé, la suite sort en ÉCHEC**, elle ne se
déclare pas réussie. Un parcours qui n'a rien parcouru ne prouve rien —
c'est la même règle que pour les rapports de sécurité. Pour l'ignorer
volontairement : `CRYPTOKEEP_BROWSER_OPTIONAL=1`.

## Isolement des données

Le navigateur démarre dans un profil **temporaire**, créé puis supprimé par
le test, distinct de `%LOCALAPPDATA%\CryptoKeep\browser-profile` qui
contient le coffre réel. Le mot de passe maître et les entrées sont
fabriqués dans le test. Aucun `.vault` réel n'est lu.

## Parcours couvert (16 étapes)

première ouverture → création du coffre → ajout d'une entrée → fermeture →
redémarrage → mauvais mot de passe → déverrouillage → modification →
export → import contrôlé (hostile puis valide) → verrouillage →
déconnexion, plus trois contrôles transverses : aucun secret dans
`localStorage`/`sessionStorage`, aucun secret journalisé, aucune exception
non rattrapée.

## Alternative Playwright — NON installée, pour décision

Si vous préférez malgré tout Playwright, voici exactement ce qu'il
faudrait. **Rien de tout cela n'a été installé ni exécuté.**

Dépendances à ajouter en `devDependencies` :

| Paquet | Version | Poids approximatif |
|---|---|---|
| `@playwright/test` | `^1.49.0` | ~12 Mo (paquet npm) |
| navigateur Chromium de Playwright | — | ~170 Mo, téléchargé par `playwright install chromium` |

Commandes :

```
npm install --save-dev @playwright/test@^1.49.0
npx playwright install chromium
npx playwright test
```

Configuration à créer (`playwright.config.mjs`) :

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '**/*.pw.mjs',
  fullyParallel: false,
  reporter: 'list',
  use: { headless: true, baseURL: 'http://127.0.0.1:8000' },
  webServer: {
    command: 'python scripts/secure_local_server.py --port 8000',
    url: 'http://127.0.0.1:8000/index.html',
    reuseExistingServer: false
  }
});
```

Conséquences à peser avant d'accepter :

- deux dépendances de développement et un second navigateur sur le disque ;
- `playwright install` fait un téléchargement réseau à chaque machine et à
  chaque montée de version ;
- le fichier `package.json` cesse d'afficher `dependencies: null`, ce qui
  était jusqu'ici une propriété vérifiable du projet ;
- en contrepartie : sélecteurs plus riches, captures d'écran et traces
  automatiques en cas d'échec, exécution parallèle, prise en charge de
  Firefox et WebKit.

Le pilote CDP livré ici ne couvre que les navigateurs Chromium. C'est sa
limite, et elle est assumée : le lanceur du projet ne démarre lui-même que
Edge ou Chrome.
