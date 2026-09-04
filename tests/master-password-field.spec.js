/**
 * Lot 1 - Cycle de vie du champ mot de passe maitre.
 * Donnees synthetiques uniquement. Aucun secret reel.
 */
import {
  getMasterPasswordField,
  clearMasterPasswordField,
  consumeMasterPassword,
  installMasterPasswordHygiene,
  resetMasterPasswordFieldCache
} from '../scripts/security/master-password-field.js';
import { StubDocument, StubElement, StubWindow } from './helpers/dom-stub.js';
import assert from 'node:assert/strict';

// LOT 9 : l'assertion maison est remplacee par `node:assert/strict`, qui
// s'appelle de la meme facon — assert(valeur, message) — mais apporte en
// plus `equal`, `deepEqual`, `rejects` et un diff lisible en cas d'echec.

function buildDom() {
  const doc = new StubDocument();
  const input = new StubElement('input', { id: 'master-password', type: 'password' });
  const toggle = new StubElement('input', { id: 'toggle-password-visibility', type: 'checkbox' });
  const form = new StubElement('form', { id: 'auth-form' });
  doc.register(input);
  doc.register(toggle);
  doc.register(form);
  return { doc, input, toggle, form };
}

try {
  console.log('=== TEST MASTER PASSWORD FIELD ===');

  // 1. Reference resolue une seule fois puis mise en cache.
  resetMasterPasswordFieldCache();
  const { doc, input, toggle, form } = buildDom();
  let lookups = 0;
  const originalGetById = doc.getElementById.bind(doc);
  doc.getElementById = (id) => {
    if (id === 'master-password') lookups += 1;
    return originalGetById(id);
  };

  const first = getMasterPasswordField(doc);
  const second = getMasterPasswordField(doc);
  assert(first === second, 'La reference du champ doit etre mise en cache');
  assert(lookups === 1, `Le champ doit etre resolu une seule fois (obtenu ${lookups})`);

  // 2. Nettoyage complet apres une utilisation REUSSIE.
  input.value = 'synthetique-succes';
  input.type = 'text';
  toggle.checked = true;
  const okResult = await consumeMasterPassword((password) => {
    assert(password === 'synthetique-succes', 'Le gestionnaire doit recevoir la valeur du champ');
    return 'ok';
  }, { doc, field: first });
  assert(okResult === 'ok', 'La valeur du gestionnaire doit etre retournee');
  assert(input.value === '', 'Le champ doit etre vide apres une reussite');
  assert(input.type === 'password', 'Le type doit revenir a password apres une reussite');
  assert(toggle.checked === false, 'La case d affichage doit etre decochee apres une reussite');

  // 3. Nettoyage complet apres un ECHEC (exception propagee).
  input.value = 'synthetique-echec';
  input.type = 'text';
  toggle.checked = true;
  let threw = false;
  try {
    await consumeMasterPassword(() => {
      throw new Error('echec de deverrouillage simule');
    }, { doc, field: first });
  } catch (error) {
    threw = true;
    assert(
      !error.message.includes('synthetique-echec'),
      'Le message d erreur ne doit jamais contenir le mot de passe'
    );
  }
  assert(threw, 'L exception du gestionnaire doit etre propagee');
  assert(input.value === '', 'Le champ doit etre vide apres un echec');
  assert(input.type === 'password', 'Le type doit revenir a password apres un echec');
  assert(toggle.checked === false, 'La case d affichage doit etre decochee apres un echec');

  // 4. Rapport de nettoyage explicite.
  input.value = 'residu';
  input.type = 'text';
  toggle.checked = true;
  const report = clearMasterPasswordField(first, doc);
  assert(report.cleared && report.typeReset && report.toggleReset, 'Le rapport de nettoyage doit etre complet');

  // 5. Nettoyage sur changement d'ecran et masquage de l'onglet.
  resetMasterPasswordFieldCache();
  const win = new StubWindow();
  getMasterPasswordField(doc);
  const installed = installMasterPasswordHygiene({ doc, win });
  assert(installed, 'L hygiene doit s installer');
  assert(
    installMasterPasswordHygiene({ doc, win }) === false,
    'Une seconde installation ne doit pas ajouter d ecouteurs'
  );

  input.value = 'valeur-avant-masquage';
  doc.visibilityState = 'hidden';
  doc.dispatchEvent({ type: 'visibilitychange' });
  assert(input.value === '', 'Le champ doit etre vide quand l onglet passe en arriere-plan');

  input.value = 'valeur-avant-verrouillage';
  doc.dispatchEvent({ type: 'vault:locked' });
  assert(input.value === '', 'Le champ doit etre vide au verrouillage');

  input.value = 'valeur-avant-fermeture';
  win.emit('pagehide');
  assert(input.value === '', 'Le champ doit etre vide a la fermeture de page');

  input.value = 'valeur-avant-reset';
  form.dispatchEvent({ type: 'reset' });
  assert(input.value === '', 'Le champ doit etre vide sur reinitialisation du formulaire');

  // 6. Regression : la valeur ne doit jamais fuir dans une trace.
  const source = (await import('node:fs')).readFileSync(
    'scripts/security/master-password-field.js',
    'utf8'
  );
  assert(
    !/console\.(log|info|warn|error)\s*\([^)]*password/i.test(source),
    'Le module ne doit journaliser aucune valeur de mot de passe'
  );

  resetMasterPasswordFieldCache();
  console.log('Master password field tests passed.');
} catch (error) {
  console.error('Master password field tests failed:', error);
  process.exitCode = 1;
}
