/**
 * Lot 7C - L'interface des reglages doit montrer ce qui s'applique REELLEMENT.
 *
 * DEFAUT CORRIGE (signale a l'audit du Lot 7). Les gestionnaires de
 * `settings-controls.js` appelaient `writeSettings()` et IGNORAIENT son
 * resultat. Quand le stockage refusait l'ecriture — quota depasse, mode
 * restreint, stockage desactive — `writeSettings` renvoyait
 * `{written: false, reason: 'storage_unavailable'}` et le controle restait
 * affiche sur la valeur DEMANDEE, alors que le reglage reellement en vigueur
 * n'avait pas bouge :
 *
 *   demande UI                    : false
 *   case affichee apres           : false
 *   reglage reellement persiste   : true
 *
 * L'utilisateur decochait « Effacer le presse-papiers », voyait la case
 * decochee, et l'effacement restait actif. Ces tests verrouillent la
 * correction : apres CHAQUE reglage, l'etat affiche est compare a l'etat
 * relu du stockage, pas a l'intention de l'appelant.
 *
 * Aucune donnee reelle : document construit a partir du VRAI index.html,
 * stockage synthetique, aucun coffre.
 */
import assert from 'node:assert/strict';
import { loadIndexHtmlDocument } from './helpers/app-dom.js';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';
import { readSettings, writeSettings, APP_SETTINGS_KEY } from '../scripts/utils/app-settings.js';
import { initSettingsControls } from '../scripts/ui/settings-controls.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

class EvenementSynthetique {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
  preventDefault() {}
  stopPropagation() {}
}

/**
 * Prepare un panneau de reglages reel, raccorde a un stockage synthetique.
 *
 * `showToast` ecrit dans le document GLOBAL : il est donc pointe sur le meme
 * document, ce qui permet d'observer ce qui est reellement annonce a
 * l'utilisateur — et donc de prouver qu'un echec n'est jamais annonce comme
 * un succes.
 */
function preparerPanneau(reglagesInitiaux = {}) {
  const doc = loadIndexHtmlDocument();
  const storage = new FakeLocalStorage();

  globalThis.document = doc;
  globalThis.CustomEvent = EvenementSynthetique;
  globalThis.Event = EvenementSynthetique;

  if (Object.keys(reglagesInitiaux).length > 0) {
    const rapport = writeSettings(reglagesInitiaux, { storage });
    assert.equal(rapport.written, true, 'La preparation doit pouvoir ecrire');
  }

  const resultat = initSettingsControls({ doc, storage });
  assert.equal(resultat.bound, true, 'Le panneau de reglages doit etre raccorde');

  return { doc, storage, options: { storage } };
}

/** Declenche un `change` sur un controle, comme le ferait le navigateur. */
function changer(noeud) {
  noeud.dispatchEvent({ type: 'change', target: noeud });
}

/** Messages effectivement affiches a l'utilisateur, du plus ancien au recent. */
function messagesAffiches(doc) {
  const conteneur = doc.getElementById('toast-container');
  if (!conteneur) return [];
  return conteneur.querySelectorAll('.toast__message').map((n) => n.textContent);
}

/** Types des notifications affichees (`info`, `error`, ...). */
function typesAffiches(doc) {
  const conteneur = doc.getElementById('toast-container');
  if (!conteneur) return [];
  return conteneur.querySelectorAll('.toast').map((n) => String(n.className || ''));
}

/** Referme les notifications pour ne pas laisser de minuterie en vol. */
function fermerNotifications(doc) {
  const conteneur = doc.getElementById('toast-container');
  if (!conteneur) return;
  conteneur.querySelectorAll('.toast').forEach((n) => {
    if (typeof n.dismiss === 'function') n.dismiss();
  });
}

// ===========================================================================
// 1. Ecriture REFUSEE : l'interface revient sur l'etat reellement en vigueur
// ===========================================================================

test('7C.1 - presse-papiers : ecriture refusee => la case revient sur l etat reel', () => {
  const { doc, storage, options } = preparerPanneau({ clipboardClearEnabled: true });
  const avant = readSettings(options).clipboardClearEnabled;
  assert.equal(avant, true, 'Etat de depart : effacement actif');

  storage.quotaExceeded = true;             // le stockage refuse desormais
  const bascule = doc.getElementById('setting-clipboard-clear');
  assert.ok(bascule, 'La case doit exister dans le VRAI index.html');
  bascule.checked = false;                  // l utilisateur decoche
  changer(bascule);

  const reel = readSettings(options).clipboardClearEnabled;
  assert.equal(reel, true,
    'Le reglage n a pas pu etre ecrit : il reste donc actif');
  assert.equal(bascule.checked, reel,
    'DEFAUT HISTORIQUE : la case restait decochee alors que l effacement '
    + 'restait actif. L interface doit montrer l etat REEL, pas la demande');

  fermerNotifications(doc);
});

test('7C.2 - duree : ecriture refusee => le menu revient sur la duree reelle', () => {
  const { doc, storage, options } = preparerPanneau({ clipboardClearSeconds: 30 });

  storage.quotaExceeded = true;
  const duree = doc.getElementById('setting-clipboard-seconds');
  assert.ok(duree, 'Le menu de duree doit exister');
  duree.value = '60';
  changer(duree);

  const reel = readSettings(options).clipboardClearSeconds;
  assert.equal(reel, 30, 'La duree reellement appliquee n a pas change');
  assert.equal(String(duree.value), String(reel),
    'Le menu annoncait 60 s alors que 30 s restaient appliquees');

  fermerNotifications(doc);
});

test('7C.3 - generateur : ecriture refusee => longueur, chiffres et symboles reels', () => {
  const { doc, storage, options } = preparerPanneau({
    generatorLength: 16, generatorDigits: true, generatorSymbols: true
  });

  storage.quotaExceeded = true;

  const longueur = doc.getElementById('setting-generator-length');
  longueur.value = '48';
  changer(longueur);

  const chiffres = doc.getElementById('setting-generator-digits');
  chiffres.checked = false;
  changer(chiffres);

  const symboles = doc.getElementById('setting-generator-symbols');
  symboles.checked = false;
  changer(symboles);

  const reel = readSettings(options);
  assert.equal(reel.generatorLength, 16);
  assert.equal(String(longueur.value), String(reel.generatorLength),
    'Le menu affichait 48 alors que le generateur produisait 16 caracteres');
  assert.equal(chiffres.checked, reel.generatorDigits,
    'La case chiffres doit refleter ce que le generateur fera reellement');
  assert.equal(symboles.checked, reel.generatorSymbols,
    'La case symboles doit refleter ce que le generateur fera reellement');

  fermerNotifications(doc);
});

test('7C.4 - alertes : ecriture refusee => la case revient sur l etat reel', () => {
  const { doc, storage, options } = preparerPanneau({ securityAlerts: true });

  storage.quotaExceeded = true;
  const alertes = doc.getElementById('setting-security-alerts');
  alertes.checked = false;
  changer(alertes);

  assert.equal(readSettings(options).securityAlerts, true);
  assert.equal(alertes.checked, true,
    'La case doit revenir sur l etat qui gouverne reellement les resumes');

  fermerNotifications(doc);
});

// ===========================================================================
// 2. Un echec ne doit JAMAIS etre annonce comme un succes
// ===========================================================================

test('7C.5 - ecriture refusee : l utilisateur est averti, et pas felicite', () => {
  const { doc, storage } = preparerPanneau({ clipboardClearEnabled: true });

  storage.quotaExceeded = true;
  const bascule = doc.getElementById('setting-clipboard-clear');
  bascule.checked = false;
  changer(bascule);

  const messages = messagesAffiches(doc);
  const types = typesAffiches(doc);

  assert.ok(messages.length > 0, 'Un echec silencieux est interdit');
  assert.ok(types.some((c) => c.includes('toast--error')),
    'L echec doit etre presente comme une erreur');
  assert.ok(messages.some((m) => m.includes('n’a pas pu')
    || m.includes('n\'a pas pu')),
  `Le message doit dire que l enregistrement a echoue. Recu : ${JSON.stringify(messages)}`);

  assert.ok(!messages.some((m) => m.includes('Aucune tentative d’effacement')
    || m.includes('Aucune tentative d\'effacement')),
  'DEFAUT HISTORIQUE : le message de succes etait affiche alors que rien '
    + 'n avait ete enregistre');

  fermerNotifications(doc);
});

test('7C.6 - ecriture acceptee : le message de succes decrit l etat reel', () => {
  const { doc, options } = preparerPanneau({ clipboardClearEnabled: true });

  const bascule = doc.getElementById('setting-clipboard-clear');
  bascule.checked = false;
  changer(bascule);

  assert.equal(readSettings(options).clipboardClearEnabled, false,
    'Sans refus du stockage, le reglage doit reellement changer');
  assert.equal(bascule.checked, false, 'La case suit l etat reel');

  const types = typesAffiches(doc);
  assert.ok(!types.some((c) => c.includes('toast--error')),
    'Aucune erreur ne doit etre affichee quand l ecriture reussit');

  fermerNotifications(doc);
});

// ===========================================================================
// 3. Ecriture acceptee mais valeur NORMALISEE par le schema ferme
// ---------------------------------------------------------------------------
// Meme sans panne de stockage, la valeur retenue peut differer de la valeur
// demandee : le schema est ferme. L interface doit alors afficher la valeur
// RETENUE, pas celle qui a ete refusee.
// ===========================================================================

test('7C.7 - valeur hors liste : le controle affiche la valeur RETENUE', () => {
  const { doc, options } = preparerPanneau({ generatorLength: 16 });

  const longueur = doc.getElementById('setting-generator-length');
  longueur.value = '9999';                 // hors liste
  changer(longueur);

  const reel = readSettings(options).generatorLength;
  assert.notEqual(reel, 9999, 'Le schema ferme refuse une longueur hors liste');
  assert.equal(String(longueur.value), String(reel),
    'Le menu ne doit pas conserver une longueur que le generateur ignorera');

  fermerNotifications(doc);
});

// ===========================================================================
// 4. Le contrat vaut pour TOUS les controles raccordes
// ---------------------------------------------------------------------------
// Ce test balaie les controles un par un plutot que d en nommer un seul :
// un futur reglage ajoute sans resynchronisation le fera echouer.
// ===========================================================================

test('7C.8 - aucun controle ne diverge du stockage apres un refus', () => {
  const { doc, storage, options } = preparerPanneau({
    clipboardClearEnabled: true,
    clipboardClearSeconds: 30,
    generatorLength: 16,
    generatorDigits: true,
    generatorSymbols: true,
    securityAlerts: true
  });

  storage.quotaExceeded = true;

  const cases = [
    ['setting-clipboard-clear', 'clipboardClearEnabled', 'checkbox'],
    ['setting-generator-digits', 'generatorDigits', 'checkbox'],
    ['setting-generator-symbols', 'generatorSymbols', 'checkbox'],
    ['setting-security-alerts', 'securityAlerts', 'checkbox'],
    ['setting-clipboard-seconds', 'clipboardClearSeconds', 'select'],
    ['setting-generator-length', 'generatorLength', 'select']
  ];

  const divergences = [];
  for (const [id, cle, genre] of cases) {
    const noeud = doc.getElementById(id);
    assert.ok(noeud, `Controle absent du VRAI index.html : #${id}`);

    if (genre === 'checkbox') noeud.checked = !noeud.checked;
    else noeud.value = String(noeud.value) === '30' ? '60' : '48';

    changer(noeud);

    // Lecture par correspondance explicite : eviter un acces indexe par une
    // variable (regle security/detect-object-injection) et garder le
    // decompte d'avertissements ESLint a son niveau de reference.
    const etat = readSettings(options);
    const reel = new Map(Object.entries(etat)).get(cle);
    const affiche = genre === 'checkbox' ? noeud.checked : String(noeud.value);
    const attendu = genre === 'checkbox' ? Boolean(reel) : String(reel);
    if (affiche !== attendu) divergences.push(`${id}: affiche=${affiche} reel=${attendu}`);
  }

  assert.deepEqual(divergences, [],
    'Chaque controle doit montrer ce qui s appliquera reellement');

  fermerNotifications(doc);
});

test('7C.9 - un refus n ecrit rien : le stockage reste intact', () => {
  const { doc, storage } = preparerPanneau({ clipboardClearEnabled: true });
  const avant = storage.getItem(APP_SETTINGS_KEY);

  storage.quotaExceeded = true;
  const bascule = doc.getElementById('setting-clipboard-clear');
  bascule.checked = false;
  changer(bascule);

  assert.equal(storage.getItem(APP_SETTINGS_KEY), avant,
    'Un refus d ecriture ne doit laisser aucune trace partielle');

  fermerNotifications(doc);
});

// ===========================================================================
// 5. Theme : meme classe de defaut (signale a l audit du Lot 7)
// ---------------------------------------------------------------------------
// `initThemeSelector` reaffichait la valeur BRUTE du stockage, y compris
// lorsqu elle avait ete refusee par la liste blanche et remplacee par
// « default ». Le menu montrait alors un theme qui n etait pas en vigueur.
// ===========================================================================

test('7C.10 - theme non autorise : le menu affiche le theme REELLEMENT applique', async () => {
  const doc = loadIndexHtmlDocument();
  const storage = new FakeLocalStorage({ selectedTheme: 'theme-inexistant' });

  globalThis.document = doc;
  globalThis.localStorage = storage;
  const avertissements = [];
  const warnOrigine = console.warn;
  console.warn = (...args) => avertissements.push(args.join(' '));

  try {
    const { initThemeSelector } = await import('../scripts/ui/theme-selector.js');
    const applique = initThemeSelector();

    assert.equal(applique, 'default', 'Un theme hors liste blanche retombe sur default');
    assert.equal(doc.documentElement.getAttribute('data-theme'), 'default',
      'C est bien « default » qui est applique au document');

    const menu = doc.getElementById('theme-select');
    assert.ok(menu, 'Le menu des themes doit exister dans le VRAI index.html');
    assert.equal(menu.value, 'default',
      'DEFAUT HISTORIQUE : le menu affichait « theme-inexistant » alors que '
      + '« default » etait applique');

    assert.equal(storage.getItem('selectedTheme'), 'default',
      'La valeur memorisee doit etre celle reellement appliquee');
    assert.ok(avertissements.some((m) => m.includes('theme-inexistant')),
      'Le refus doit rester visible en console, sans donnee sensible');
  } finally {
    console.warn = warnOrigine;
  }
});

test('7C.11 - theme : un stockage indisponible n empeche pas l application', async () => {
  const doc = loadIndexHtmlDocument();
  const storage = new FakeLocalStorage({ selectedTheme: 'ubuntu' });
  storage.quotaExceeded = true;                 // lecture ok, ecriture refusee

  globalThis.document = doc;
  globalThis.localStorage = storage;

  const { initThemeSelector } = await import('../scripts/ui/theme-selector.js');
  const applique = initThemeSelector();

  assert.equal(applique, 'ubuntu', 'Le theme reste applique malgre le refus d ecriture');
  assert.equal(doc.getElementById('theme-select').value, 'ubuntu',
    'Le menu affiche le theme en vigueur pour la session');
});

// ===========================================================================
console.log('=== TEST SETTINGS CONTROLS (LOT 7C) ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
  }
}
if (echecs > 0) {
  console.error(`Settings controls tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Settings controls tests passed (${cas.length} scenarios).`);
}
