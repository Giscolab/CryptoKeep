/**
 * Pilote de navigateur par CDP (Chrome DevTools Protocol) - Lot 9.
 *
 * POURQUOI PAS PLAYWRIGHT OU PUPPETEER
 * Le projet interdit toute dependance applicative, tout CDN, et toute
 * installation reseau non autorisee. Playwright telecharge de surcroit son
 * propre navigateur (plusieurs centaines de Mo). Ce pilote n utilise que des
 * modules natifs de Node — `child_process`, `fetch`, `WebSocket` — et le
 * navigateur DEJA installe sur la machine, celui-la meme que
 * `start_vault_secure.bat` sait deja localiser.
 *
 * Le fichier `tests/browser/README.md` documente l alternative Playwright,
 * avec sa liste exacte de dependances et sa commande, si vous preferez la
 * retenir. Rien n est installe sans votre accord.
 *
 * `WebSocket` est disponible globalement depuis Node 21 ; `runBrowserJourney`
 * verifie sa presence et REFUSE de conclure si elle manque, plutot que de
 * rapporter un succes qu il n a pas obtenu.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Emplacements usuels d un navigateur Chromium, par plateforme.
 * Les memes que ceux testes par `start_vault_secure.bat`.
 */
export function candidatsNavigateur(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const pf = env.ProgramFiles || 'C:\\Program Files';
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const lad = env.LOCALAPPDATA || '';
    return [
      join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(lad, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ].filter(Boolean);
  }

  if (platform === 'darwin') {
    return [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }

  return [
    env.CRYPTOKEEP_BROWSER,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
}

/** Premier navigateur reellement present, ou `null`. */
export function trouverNavigateur(env = process.env, platform = process.platform) {
  if (env.CRYPTOKEEP_BROWSER && existsSync(env.CRYPTOKEEP_BROWSER)) return env.CRYPTOKEEP_BROWSER;
  return candidatsNavigateur(env, platform).find((chemin) => existsSync(chemin)) || null;
}

/** Port libre choisi par le systeme, puis relache. */
async function portLibre() {
  const { createServer } = await import('node:net');
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

/**
 * Lance le navigateur en mode sans interface, dans un profil TEMPORAIRE.
 *
 * Le profil est jetable et distinct de celui de `start_vault_secure.bat` :
 * un test ne doit jamais ecrire dans le profil qui contient le coffre reel.
 */
export async function lancerNavigateur(options = {}) {
  const executable = options.executable || trouverNavigateur();
  if (!executable) return { ok: false, reason: 'browser_not_found' };

  const profil = mkdtempSync(join(tmpdir(), 'cryptokeep-test-'));
  const port = await portLibre();

  const processus = spawn(executable, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const echeance = Date.now() + (options.timeoutMs || 30000);
  let wsUrl = null;
  while (!wsUrl && Date.now() < echeance) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await r.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((res) => setTimeout(res, 200));
    }
  }

  if (!wsUrl) {
    processus.kill();
    rmSync(profil, { recursive: true, force: true });
    return { ok: false, reason: 'debugger_unreachable' };
  }

  return {
    ok: true,
    executable,
    wsUrl,
    async close() {
      processus.kill();
      try { rmSync(profil, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  };
}

/** Connexion CDP minimale, sur le `WebSocket` natif de Node. */
export class ClientCdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.attente = new Map();
    this.ecouteurs = [];
  }

  static async connecter(url) {
    if (typeof WebSocket !== 'function') {
      throw new Error('WebSocket global absent : Node 21 ou plus est requis.');
    }
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    const client = new ClientCdp(ws);
    ws.onmessage = (evenement) => {
      const message = JSON.parse(evenement.data);
      if (message.id && client.attente.has(message.id)) {
        const { res, rej } = client.attente.get(message.id);
        client.attente.delete(message.id);
        if (message.error) rej(new Error(JSON.stringify(message.error)));
        else res(message.result);
      } else {
        client.ecouteurs.forEach((ecouteur) => ecouteur(message));
      }
    };
    return client;
  }

  envoyer(methode, params = {}, sessionId) {
    const id = this.id + 1;
    this.id = id;
    return new Promise((res, rej) => {
      this.attente.set(id, { res, rej });
      const trame = sessionId ? { id, method: methode, params, sessionId }
        : { id, method: methode, params };
      this.ws.send(JSON.stringify(trame));
    });
  }

  ecouter(fn) { this.ecouteurs.push(fn); }
  fermer() { this.ws.close(); }
}

export default { trouverNavigateur, lancerNavigateur, ClientCdp, candidatsNavigateur };
