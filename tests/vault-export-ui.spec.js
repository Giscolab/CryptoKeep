import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { loadIndexHtmlDocument } from './helpers/app-dom.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import { buildSyntheticVault, FakeVaultStorage } from './helpers/vault-fixtures.js';
import { closeSecureDialogs, getActiveSecureDialogCount } from '../scripts/ui/secure-dialogs.js';

const cases = [];
function test(label, fn) { cases.push({ label, fn }); }

const ENTRY = {
  id: 'export-ui-synthetic', title: 'Compte synthétique', url: 'https://example.test/login',
  username: 'alice', password: 'synthetic,secret"é', notes: 'Note locale', tags: ['test'],
  created_at: '2026-01-01T00:00:00.000Z', last_modified: '2026-01-02T00:00:00.000Z'
};

async function prepare() {
  const { initVaultExportControls } = await import('../scripts/ui/vault-export.js');
  const doc = loadIndexHtmlDocument();
  const password = 'Synthetic export UI master phrase 2026!';
  const built = await buildSyntheticVault({ password, entries: [ENTRY] });
  const manager = new VaultManager({
    storage: new FakeVaultStorage(built.record), subscribeVaultChanges: () => () => {}
  });
  await manager.unlock(password);
  const entries = manager.getEntries();
  const downloads = [];
  const revoked = [];
  const messages = [];
  const createElement = doc.createElement.bind(doc);
  let failClick = false;
  doc.createElement = (tag) => {
    const node = createElement(tag);
    if (tag === 'a') node.click = () => {
      assert.equal(node.parentNode, doc.body, 'Le lien doit être attaché pendant le clic');
      if (failClick) throw new Error(ENTRY.password);
      downloads.push({ filename: node.download, href: node.href });
    };
    return node;
  };
  const blobs = [];
  const urlApi = {
    createObjectURL(blob) { blobs.push(blob); return `blob:synthetic-${blobs.length}`; },
    revokeObjectURL(url) { revoked.push(url); }
  };
  const options = { doc, vaultManager: manager, urlApi, showToast: (...args) => messages.push(args) };
  const controller = initVaultExportControls(options);
  const button = doc.getElementById('btn-export');
  const select = doc.getElementById('export-format');
  return { doc, manager, entries, downloads, revoked, messages, blobs, options, controller, button, select,
    failDownload() { failClick = true; } };
}

async function flush() {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

function choose(context, format) {
  context.select.value = format;
  context.select.dispatchEvent({ type: 'change' });
}

test('Le vrai panneau propose les trois formats et sélectionne VAULT chiffré', () => {
  const doc = loadIndexHtmlDocument();
  const select = doc.getElementById('export-format');
  assert.ok(select, 'Le choix du format doit exister dans index.html');
  assert.deepEqual(select.querySelectorAll('option').map((option) => option.value), ['vault', 'csv', 'json']);
  assert.equal(select.querySelector('option[selected]').value, 'vault');
  assert.ok(doc.querySelector('label[for="export-format"]'));
});

test('CSV : annulation sans téléchargement et bouton réactivé', async () => {
  const context = await prepare();
  choose(context, 'csv');
  context.button.click();
  await flush();
  assert.equal(context.button.disabled, true);
  assert.equal(context.blobs.length, 0);
  const dialog = context.doc.querySelector('.secure-dialog');
  assert.ok(dialog);
  assert.match(dialog.textContent, /en clair/i);
  assert.equal(dialog.textContent.includes(ENTRY.password), false);
  dialog.querySelector('.btn-secondary').click();
  await flush();
  assert.equal(context.button.disabled, false);
  assert.equal(context.select.disabled, false);
  assert.equal(context.downloads.length, 0);
  assert.equal(getActiveSecureDialogCount(), 0);
});

test('CSV : le choix réel exporte le fichier après consentement, sans double écouteur', async () => {
  const context = await prepare();
  const { initVaultExportControls } = await import('../scripts/ui/vault-export.js');
  initVaultExportControls(context.options);
  choose(context, 'csv');
  context.button.click();
  context.button.click();
  await flush();
  assert.equal(context.doc.querySelectorAll('.secure-dialog').length, 1);
  context.doc.querySelector('.secure-dialog .btn-primary').click();
  await flush();
  assert.equal(context.downloads.length, 1);
  assert.match(context.downloads[0].filename, /\.csv$/);
  const text = await context.blobs[0].text();
  assert.match(text, /^name,url,username,password\r\n/);
  assert.ok(text.includes('"synthetic,secret""é"'));
  assert.equal(context.button.disabled, false);
  assert.equal(context.doc.querySelectorAll('a[download]').length, 0);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepEqual(context.revoked, [context.downloads[0].href]);
});

test('JSON : les champs complets sont exportés après confirmation explicite', async () => {
  const context = await prepare();
  choose(context, 'json');
  context.button.click();
  await flush();
  context.doc.querySelector('.secure-dialog .btn-primary').click();
  await flush();
  assert.match(context.downloads[0].filename, /\.json$/);
  assert.deepEqual(JSON.parse(await context.blobs[0].text()), {
    format: 'cryptokeep-plaintext', version: 1, entries: context.entries
  });
});

test('Verrouiller pendant la confirmation annule le fichier en clair', async () => {
  const context = await prepare();
  choose(context, 'json');
  context.button.click();
  await flush();
  context.manager.clearSession();
  closeSecureDialogs(context.doc);
  await flush();
  assert.equal(context.downloads.length, 0);
  assert.equal(context.blobs.length, 0);
  assert.equal(context.doc.querySelector('.secure-dialog'), null);
  assert.equal(context.button.disabled, false);
});

test('Une session déjà verrouillée ne peut pas ouvrir une confirmation ou télécharger', async () => {
  const context = await prepare();
  context.manager.clearSession();
  choose(context, 'csv');
  context.button.click();
  await flush();
  assert.equal(context.doc.querySelector('.secure-dialog'), null);
  assert.equal(context.blobs.length, 0);
  assert.equal(context.button.disabled, false);
  assert.ok(context.messages.some(([, type]) => type === 'error'));
});

test('Échec du téléchargement : lien et URL libérés, erreur sans secret', async () => {
  const context = await prepare();
  context.failDownload();
  choose(context, 'json');
  context.button.click();
  await flush();
  context.doc.querySelector('.secure-dialog .btn-primary').click();
  await flush();
  assert.equal(context.downloads.length, 0);
  assert.equal(context.doc.querySelectorAll('a[download]').length, 0);
  assert.deepEqual(context.revoked, ['blob:synthetic-1']);
  assert.equal(JSON.stringify(context.messages).includes(ENTRY.password), false);
  assert.ok(context.messages.some(([, type]) => type === 'error'));
  assert.equal(context.button.disabled, false);
});

let failures = 0;
for (const { label, fn } of cases) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) { failures += 1; console.error(`  ECHEC ${label}`, error); }
}
if (failures > 0) process.exitCode = 1;
else console.log(`Vault export UI tests passed (${cases.length} scenarios).`);
