/** Chromium frontend integration with an injected Android TEST marker.
 * All profiles and vaults are disposable and synthetic. This does not execute
 * Android, a native file picker, or Android lifecycle callbacks. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createPortServer } from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { stageDesktop } from '../../scripts/desktop/prepare.mjs';
import { DESKTOP_CSP } from '../../desktop/contract.mjs';
import { ClientCdp, trouverNavigateur } from '../browser/cdp-client.mjs';
import { buildSyntheticVault } from '../helpers/vault-fixtures.js';

const { output } = stageDesktop();
const assets = JSON.parse(readFileSync(join(output, 'desktop-manifest.json'))).files;
const temporary = mkdtempSync(join(tmpdir(), 'cryptokeep-android-browser-synthetic-'));
const profile = join(temporary, 'profile');
const password = 'Android-Browser-SYNTHETIC-only-2026!';
const secret = 'Synthetic-entry-Android-only!';
const { record } = await buildSyntheticVault({ password, entries: [{
  id: 'synthetic-android', title: 'Android synthetic import', username: 'demo@example.invalid',
  password: secret, url: 'https://example.invalid',
  created_at: '2026-01-01T00:00:00.000Z', last_modified: '2026-01-01T00:00:00.000Z'
}] });
const file = join(temporary, 'android-synthetic.vault');
writeFileSync(file, JSON.stringify(record));
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
let active = null;
let remoteAttempts = 0;
const exceptions = [];

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

async function start() {
  const executable = trouverNavigateur();
  assert.ok(executable, 'Chromium is required; no optional skip');
  const portServer = createPortServer();
  await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const process = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  let chooserOpened = false;
  cdp.ecouter((event) => {
    if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    if (event.method === 'Page.fileChooserOpened') chooserOpened = true;
    if (event.method !== 'Fetch.requestPaused') return;
    const local = event.params.request.url.startsWith(origin + '/');
    if (!local) remoteAttempts++;
    void cdp.envoyer(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
      requestId: event.params.requestId, ...(!local ? { errorReason: 'BlockedByClient' } : {})
    }, sessionId);
  });
  await cdp.envoyer('Runtime.enable', {}, sessionId);
  await cdp.envoyer('Page.enable', {}, sessionId);
  await cdp.envoyer('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
  await cdp.envoyer('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] }, sessionId);
  await cdp.envoyer('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
  await cdp.envoyer('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await cdp.envoyer('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(globalThis, '__CRYPTOKEEP_DESKTOP__', { value: Object.freeze({ channel: 'test', platform: 'android', synthetic: true, expectedOrigin: ${JSON.stringify(origin)} }) });`
  }, sessionId);
  const evaluate = async (expression) => {
    const result = await cdp.envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await cdp.envoyer('Page.navigate', { url: origin + '/index.html' }, sessionId);
  await cdp.envoyer('Page.bringToFront', {}, sessionId);
  await waitFor(() => evaluate("!!document.getElementById('btn-import-locked') && !document.getElementById('btn-import-locked').hidden && !document.getElementById('btn-import-locked').disabled && !document.getElementById('unlock-vault').disabled"), 'Android locked-screen bootstrap');
  return { cdp, sessionId, evaluate, chooserOpened: () => chooserOpened };
}

async function unlock(browser) {
  await browser.evaluate(`(() => {
    const field = document.getElementById('master-password');
    field.value = ${JSON.stringify(password)};
    field.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('auth-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return true;
  })()`);
  await waitFor(() => browser.evaluate("!document.getElementById('vault-ui').hidden"), 'unlock imported vault');
  assert.deepEqual(await browser.evaluate(`(async () => {
    const { vaultManager:m } = await import('/scripts/core/vault/manager.js');
    return { count:m.getEntries().length, password:m.getEntries()[0]?.password, extractable:m.masterKey?.extractable };
  })()`), { count: 1, password: secret, extractable: false });
}

try {
  let browser = await start();
  assert.equal(await browser.evaluate("document.getElementById('vault-ui').hidden"), true);
  assert.equal(await browser.evaluate("document.getElementById('btn-import-locked').getBoundingClientRect().width > 0"), true);
  assert.equal(await browser.evaluate("(async () => { const {vaultManager:m}=await import('/scripts/core/vault/manager.js');return await m.storage.loadVault(); })()"), null);
  await browser.evaluate("document.getElementById('btn-import-locked').click()");
  await waitFor(() => browser.chooserOpened(), 'locked import button opens file chooser');
  const { root } = await browser.cdp.envoyer('DOM.getDocument', {}, browser.sessionId);
  const { nodeId } = await browser.cdp.envoyer('DOM.querySelector', { nodeId: root.nodeId, selector: '#file-import' }, browser.sessionId);
  await browser.cdp.envoyer('DOM.setFileInputFiles', { nodeId, files: [file] }, browser.sessionId);
  await waitFor(() => browser.evaluate("!!document.getElementById('secure-dialog-password')"), 'import password dialog');
  // Backgrounding while an import is awaiting its password cancels the pending
  // dialogue. Its continuation must not create or replace a stored vault.
  await browser.evaluate("Object.defineProperty(document, 'hidden', { configurable:true, value:true }); document.dispatchEvent(new Event('visibilitychange')); true");
  await waitFor(() => browser.evaluate("!document.querySelector('.secure-dialog') && document.getElementById('file-import').value === ''"), 'pending import cancelled by visibility lock');
  assert.equal(await browser.evaluate("(async () => {const {vaultManager:m}=await import('/scripts/core/vault/manager.js');return await m.storage.loadVault();})()"), null);
  await browser.evaluate("delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); true");
  console.log('PASS background visibility lock cancels a pending import password dialog without writing a vault');
  await browser.cdp.envoyer('DOM.setFileInputFiles', { nodeId, files: [file] }, browser.sessionId);
  await waitFor(() => browser.evaluate("!!document.getElementById('secure-dialog-password')"), 'reselected import password dialog');
  await browser.evaluate(`(() => {
    document.getElementById('secure-dialog-password').value = ${JSON.stringify(password)};
    document.querySelector('.secure-dialog .btn-primary').click();
    return true;
  })()`);
  await waitFor(() => browser.evaluate("!!document.querySelector('.secure-dialog__summary')"), 'verified import confirmation');
  assert.equal(await browser.evaluate("(async () => { const {vaultManager:m}=await import('/scripts/core/vault/manager.js');return await m.storage.loadVault(); })()"), null, 'No persistence before explicit import confirmation');
  await browser.evaluate("document.querySelector('.secure-dialog .btn-primary').click()");
  await waitFor(() => browser.evaluate("!document.querySelector('.secure-dialog') && document.getElementById('unlock-vault').textContent.includes('Déverrouiller') && document.getElementById('file-import').value === ''"), 'import completes in locked state');
  const persisted = await browser.evaluate("(async () => { const {vaultManager:m}=await import('/scripts/core/vault/manager.js');return {record:await m.storage.loadVault(),key:m.masterKey,firstTime:m.isFirstTime}; })()");
  assert.deepEqual(persisted.record, record);
  assert.equal(persisted.key, null);
  assert.equal(persisted.firstTime, false);
  assert.equal(await browser.evaluate("document.getElementById('vault-ui').hidden"), true);
  console.log('PASS Android-marked first-launch import: visible locked-screen button, real File input, password and explicit confirmation, encrypted persistence without creating a vault');
  await unlock(browser);
  console.log('PASS imported vault unlocks through the authentication form and retains a non-extractable key');
  // Explicitly synthetic visibility transition: tests the installed app handler,
  // not an Android Activity or an OEM WebView's delivery of lifecycle events.
  await browser.evaluate("Object.defineProperty(document, 'hidden', { configurable:true, value:true }); document.dispatchEvent(new Event('visibilitychange')); true");
  await waitFor(() => browser.evaluate("(async () => {const {vaultManager:m}=await import('/scripts/core/vault/manager.js');return m.masterKey===null && m.getEntries().length===0 && document.getElementById('vault-ui').hidden;})()"), 'Android-marked background visibility lock');
  assert.equal(await browser.evaluate(`document.body.textContent.includes(${JSON.stringify(secret)}) || Array.from(document.querySelectorAll('input,textarea')).some(n=>n.value.includes(${JSON.stringify(secret)}))`), false);
  assert.deepEqual(await browser.evaluate("(async () => {const {vaultManager:m}=await import('/scripts/core/vault/manager.js');return await m.storage.loadVault();})()"), record);
  await browser.evaluate("delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); true");
  console.log('PASS synthetic hidden visibility event purges key, entries and rendered secret while retaining encrypted record');
  await stop();
  browser = await start();
  assert.equal(await browser.evaluate("document.getElementById('vault-ui').hidden"), true);
  await unlock(browser);
  assert.deepEqual(await browser.evaluate("(async () => {const {vaultManager:m}=await import('/scripts/core/vault/manager.js');return await m.storage.loadVault();})()"), record);
  assert.equal(remoteAttempts, 0);
  assert.deepEqual(exceptions, []);
  console.log('PASS imported synthetic vault survives a complete Chromium restart; no remote frontend requests or uncaught exceptions');
  console.log('LIMIT: Chromium with injected Android TEST marker and simulated visibility. Android native picker, lifecycle, storage and screen protection are not executed.');
} catch (error) {
  console.error('FAIL Android-marked browser:', error);
  process.exitCode = 1;
} finally {
  await stop();
  await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
