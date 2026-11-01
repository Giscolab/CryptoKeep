/** Real Chromium processes, disposable synthetic profile and actual .vault
 * downloads. This is a frontend check, NEVER a Windows/WebView2 validation. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createPortServer } from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { stageDesktop } from '../../scripts/desktop/prepare.mjs';
import { DESKTOP_CSP } from '../../desktop/contract.mjs';
import { ClientCdp, trouverNavigateur } from '../browser/cdp-client.mjs';

const { output } = stageDesktop();
const assets = JSON.parse(readFileSync(join(output, 'desktop-manifest.json'))).files;
const temporary = mkdtempSync(join(tmpdir(), 'cryptokeep-desktop-synthetic-'));
const profile = join(temporary, 'profile');
const downloads = join(temporary, 'downloads');
mkdirSync(downloads);
const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.mjs', 'text/javascript'], ['.css', 'text/css'], ['.json', 'application/json'], ['.png', 'image/png'], ['.ico', 'image/x-icon'], ['.webmanifest', 'application/manifest+json']]);
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html';
  if (!Object.hasOwn(assets, path)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': mime.get(extname(path)) || 'application/octet-stream', 'Content-Security-Policy': DESKTOP_CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  response.end(readFileSync(join(output, path)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const password = 'Desktop-SYNTHETIC-only-2026!';
let active = null;
let remoteAttempts = 0;

async function waitFor(test, description) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await test()) return;
    await delay(100);
  }
  throw new Error('Timeout: ' + description);
}

async function stop() {
  if (!active) return;
  const browser = active;
  active = null;
  await Promise.race([browser.cdp.envoyer('Browser.close').catch(() => {}), delay(1500)]);
  await Promise.race([browser.exited, delay(4000)]);
  if (browser.process.exitCode === null && browser.process.signalCode === null) {
    browser.process.kill();
    await browser.exited;
  }
  browser.cdp.fermer();
}

async function start(injectMarker = true, dataDirectory = profile) {
  const executable = trouverNavigateur();
  assert.ok(executable, 'Chromium is required; no optional skip');
  const portServer = createPortServer();
  await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const process = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${dataDirectory}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  process.stderr.resume();
  const exited = once(process, 'exit');
  let websocket;
  try {
    await waitFor(async () => {
      try { websocket = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; return Boolean(websocket); }
      catch { return false; }
    }, 'Chromium startup');
  } catch (error) { process.kill(); await exited; throw error; }
  const cdp = await ClientCdp.connecter(websocket);
  active = { process, exited, cdp };
  const { targetId } = await cdp.envoyer('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.envoyer('Target.attachToTarget', { targetId, flatten: true });
  const exceptions = [];
  cdp.ecouter((event) => {
    if (event.method === 'Runtime.exceptionThrown') {
      exceptions.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    }
    if (event.method !== 'Fetch.requestPaused') return;
    const local = event.params.request.url.startsWith(origin + '/');
    if (!local) remoteAttempts++;
    void cdp.envoyer(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
      requestId: event.params.requestId, ...(!local ? { errorReason: 'BlockedByClient' } : {})
    }, sessionId);
  });
  await cdp.envoyer('Runtime.enable', {}, sessionId);
  await cdp.envoyer('Page.enable', {}, sessionId);
  await cdp.envoyer('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] }, sessionId);
  if (injectMarker) {
    await cdp.envoyer('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(globalThis, '__CRYPTOKEEP_DESKTOP__', { value: Object.freeze({ channel: 'test', synthetic: true, expectedOrigin: ${JSON.stringify(origin)} }) });`
    }, sessionId);
  }
  const evaluate = async (expression) => {
    const result = await cdp.envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await cdp.envoyer('Page.navigate', { url: origin + '/index.html' }, sessionId);
  try {
    await waitFor(() => evaluate(injectMarker
      ? "!!document.getElementById('unlock-vault') && !document.getElementById('unlock-vault').disabled && document.getElementById('settings-view').dataset.settingsControlsBound === 'true'"
      : "!!document.querySelector('[role=alert]')"), 'desktop bootstrap');
  } catch (error) {
    console.error('Synthetic bootstrap diagnostics:', exceptions,
      await evaluate("({ready:document.readyState,alert:document.querySelector('[role=alert]')?.textContent,disabled:document.getElementById('unlock-vault')?.disabled,settings:document.getElementById('settings-view')?.dataset.settingsControlsBound})"));
    throw error;
  }
  return { cdp, evaluate };
}

try {
  let browser = await start(false, join(temporary, 'refused-profile'));
  assert.deepEqual(await browser.evaluate('(async () => (await indexedDB.databases()).map(db => db.name))()'), []);
  console.log('PASS desktop refuses a missing native marker before opening any vault database');
  await stop();
  browser = await start();
  const response = await fetch(origin + '/index.html');
  assert.equal(response.headers.get('content-security-policy'), DESKTOP_CSP);
  assert.equal(await browser.evaluate("document.getElementById('setting-hibp').disabled"), true);
  const record = await browser.evaluate(`(async () => {
    const {vaultManager:m} = await import('/scripts/core/vault/manager.js');
    await m.createVault(${JSON.stringify(password)});
    await m.addEntry({title:'Desktop synthetic',username:'synthetic',password:'Synthetic-entry-only!',url:'https://example.invalid'});
    return m.exportVaultRecord();
  })()`);
  await browser.cdp.envoyer('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await browser.evaluate(`(async () => {
    const {vaultManager} = await import('/scripts/core/vault/manager.js');
    const {exportVaultFile} = await import('/scripts/core/storage/vault-export-service.js');
    const report = await exportVaultFile('vault',{vaultManager});
    const a = document.createElement('a'); a.href = URL.createObjectURL(report.blob); a.download='desktop-synthetic.vault'; document.body.append(a); a.click(); a.remove(); return true;
  })()`);
  const download = join(downloads, 'desktop-synthetic.vault');
  await waitFor(() => existsSync(download), 'synthetic download');
  // Preserve the completed export outside Chromium's download directory:
  // Windows Chromium can remove browser-managed downloads on shutdown.
  const file = join(temporary, 'exported-synthetic.vault');
  copyFileSync(download, file);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), record);
  console.log('PASS real .vault download equals the encrypted IndexedDB record');
  await stop();
  browser = await start();
  const persisted = await browser.evaluate(`(async () => {
    const {vaultManager:m} = await import('/scripts/core/vault/manager.js');
    const before = await m.storage.loadVault();
    const backup = JSON.parse(localStorage.getItem('cryptokeep.backup.v1')).record;
    await m.unlock(${JSON.stringify(password)});
    return {record:before,backup,count:m.getEntries().length,extractable:m.masterKey.extractable,locks:typeof navigator.locks.request==='function'};
  })()`);
  assert.deepEqual(persisted.record, record);
  assert.deepEqual(persisted.backup, record);
  assert.equal(persisted.count, 1);
  assert.equal(persisted.extractable, false);
  assert.equal(persisted.locks, true);
  console.log('PASS synthetic vault and secondary copy survive a full Chromium process restart');
  const imported = await browser.evaluate(`(async () => {
    const {vaultManager:m} = await import('/scripts/core/vault/manager.js');
    const {importVaultFile} = await import('/scripts/core/storage/vault-import-service.js');
    const file = new File([${JSON.stringify(readFileSync(file, 'utf8'))}], 'desktop-synthetic.vault');
    const result = await importVaultFile(file,{storage:m.storage,requestPassword:async()=>${JSON.stringify(password)},confirmImport:async()=>true});
    return result.summary.entryCount;
  })()`);
  assert.equal(imported, 1);
  await browser.evaluate(`(async () => {
    globalThis.__inlineExecuted = false; globalThis.__cspBlocked = false;
    document.addEventListener('securitypolicyviolation',e=>{if(e.violatedDirective.startsWith('script-src')) globalThis.__cspBlocked=true;});
    const s=document.createElement('script');s.textContent='globalThis.__inlineExecuted=true';document.body.append(s);s.remove();
    const {isPasswordPwned}=await import('/scripts/security/hibp-service.js');
    const result=await isPasswordPwned('Synthetic-entry-only!');if(result.checked)throw new Error('Unexpected network result');return true;
  })()`);
  await waitFor(() => browser.evaluate('globalThis.__cspBlocked === true'), 'CSP rejection');
  assert.equal(await browser.evaluate('globalThis.__inlineExecuted'), false);
  assert.equal(remoteAttempts, 0, 'No remote frontend requests; interceptor would block any attempt');
  console.log('PASS .vault reimport, Web Locks, strict CSP and zero remote frontend requests');
  console.log('LIMIT: Linux Chromium with injected TEST marker; Windows/Tauri/WebView2 NOT executed.');
} catch (error) {
  console.error('FAIL desktop browser:', error);
  process.exitCode = 1;
} finally {
  await stop();
  await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
