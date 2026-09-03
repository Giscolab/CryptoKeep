/**
 * Lot 7 - Preferences d'application et presse-papiers.
 *
 * Aucune donnee reelle : stockages et presse-papiers synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  readSettings,
  writeSettings,
  sanitizeSettings,
  defaultSettings,
  generatorOptionsFromSettings,
  SETTINGS_SCHEMA,
  APP_SETTINGS_KEY
} from '../scripts/utils/app-settings.js';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

test('7.1 - defauts : l effacement du presse-papiers est ACTIF', () => {
  const d = defaultSettings();
  assert.equal(d.clipboardClearEnabled, true,
    'La case livree etait DECOCHEE alors que l effacement etait actif : '
    + 'le defaut doit refleter le comportement reel');
  assert.equal(d.clipboardClearSeconds, 30,
    'La description annoncait 60 s alors que le delai reel etait de 30 s');
  assert.equal(d.generatorLength, 16);
  assert.equal(d.securityAlerts, true);
});

test('7.2 - schema FERME : toute cle inconnue est rejetee', () => {
  const filtre = sanitizeSettings({
    clipboardClearSeconds: 60,
    motDePasseMaitre: 'jamais-persiste',
    termeDeRecherche: 'secret',
    __proto__: { pollue: true }
  });

  assert.equal(filtre.clipboardClearSeconds, 60, 'La cle connue est conservee');
  assert.ok(!('motDePasseMaitre' in filtre), 'Une cle inconnue ne doit pas survivre');
  assert.ok(!('termeDeRecherche' in filtre), 'Aucun terme de recherche ne doit etre persiste');
  assert.equal(filtre.pollue, undefined, 'Aucune pollution de prototype');
  assert.deepEqual(Object.keys(filtre).sort(), Object.keys(SETTINGS_SCHEMA).sort());
});

test('7.3 - valeurs hors liste ramenees au defaut, en lecture ET en ecriture', () => {
  const store = new FakeLocalStorage();

  // Valeur fabriquee a la main dans le stockage.
  store.setItem(APP_SETTINGS_KEY, JSON.stringify({
    clipboardClearSeconds: 99999,
    generatorLength: 1,
    clipboardClearEnabled: 'oui'
  }));

  const lu = readSettings({ storage: store });
  assert.equal(lu.clipboardClearSeconds, 30, 'Valeur hors liste -> defaut');
  assert.equal(lu.generatorLength, 16);
  assert.equal(lu.clipboardClearEnabled, true, 'Une chaine n est pas un booleen');

  // Et une ecriture ne peut pas introduire une valeur hors liste.
  const rapport = writeSettings({ clipboardClearSeconds: 7 }, { storage: store });
  assert.equal(rapport.settings.clipboardClearSeconds, 30);
  assert.equal(JSON.parse(store.getItem(APP_SETTINGS_KEY)).clipboardClearSeconds, 30);
});

test('7.4 - stockage illisible ou absent : defauts, jamais d erreur', () => {
  const casse = { getItem() { throw new Error('refuse'); }, setItem() { throw new Error('refuse'); } };
  assert.deepEqual(readSettings({ storage: casse }), defaultSettings());
  const r = writeSettings({ generatorLength: 32 }, { storage: casse });
  assert.equal(r.written, false);
  assert.equal(r.reason, 'storage_unavailable');
  assert.equal(r.settings.generatorLength, 32, 'La valeur reste utilisable en session');

  const invalide = new FakeLocalStorage();
  invalide.setItem(APP_SETTINGS_KEY, 'pas du json');
  assert.deepEqual(readSettings({ storage: invalide }), defaultSettings());
});

test('7.5 - les reglages du generateur sont REELLEMENT appliques', async () => {
  const store = new FakeLocalStorage();
  writeSettings({ generatorLength: 32, generatorSymbols: false, generatorDigits: false },
    { storage: store });

  const options = generatorOptionsFromSettings({ storage: store });
  assert.equal(options.length, 32);
  assert.equal(options.symbols, false);
  assert.equal(options.numbers, false);

  const { PasswordGenerator } = await import('../scripts/utils/password-generator.js');
  const mdp = PasswordGenerator.generate(options);
  assert.equal(mdp.length, 32, 'La longueur reglee doit etre celle produite');
  assert.ok(!/[0-9]/.test(mdp), 'Les chiffres devaient etre exclus');
  assert.ok(!/[^A-Za-z]/.test(mdp), 'Les symboles devaient etre exclus');
});

test('7.6 - aucun secret dans ce qui est persiste', () => {
  const store = new FakeLocalStorage();
  writeSettings({
    clipboardClearSeconds: 60,
    motDePasse: 'MotDePasse-Secret-1!',
    recherche: 'banque'
  }, { storage: store });

  const brut = store.getItem(APP_SETTINGS_KEY);
  assert.ok(!brut.includes('MotDePasse-Secret-1!'));
  assert.ok(!brut.includes('banque'));
  assert.deepEqual(Object.keys(JSON.parse(brut)).sort(), Object.keys(SETTINGS_SCHEMA).sort());
});

console.log('=== TEST APP SETTINGS ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) { echecs += 1; console.error(`  ECHEC ${label}`); console.error(`        ${error && error.message}`); }
}
if (echecs > 0) { console.error(`App settings tests failed: ${echecs} scenario(s).`); process.exitCode = 1; }
else { console.log(`App settings tests passed (${cas.length} scenarios).`); }
