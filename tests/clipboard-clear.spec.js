/**
 * Lot 7 - Presse-papiers : tentative de meilleure efficacite.
 *
 * Presse-papiers entierement synthetique. Aucun secret reel.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';
import { writeSettings, APP_SETTINGS_KEY } from '../scripts/utils/app-settings.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const SECRET = 'MotDePasse-Copie-Lot7-1!';

/** Presse-papiers synthetique, avec refus de permission injectable. */
function fauxPressePapiers(initial = '') {
  const etat = {
    contenu: initial,
    lectures: 0,
    ecritures: [],
    refuserLecture: false,
    refuserEcriture: false
  };
  etat.api = {
    async readText() {
      etat.lectures += 1;
      if (etat.refuserLecture) {
        const e = new Error('refus'); e.name = 'NotAllowedError'; throw e;
      }
      return etat.contenu;
    },
    async writeText(valeur) {
      if (etat.refuserEcriture) {
        const e = new Error('refus'); e.name = 'NotAllowedError'; throw e;
      }
      etat.ecritures.push(valeur);
      etat.contenu = valeur;
    }
  };
  return etat;
}

/**
 * `navigator` est une propriete en LECTURE SEULE sous Node : elle doit etre
 * redefinie, pas simplement affectee.
 */
let navigateurOriginal;
function installerNavigateur(valeur) {
  if (navigateurOriginal === undefined) {
    navigateurOriginal = Object.getOwnPropertyDescriptor(globalThis, 'navigator') || null;
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: valeur, configurable: true, writable: true
  });
}

/**
 * Document minimal, mais suffisamment complet pour `showToast` : ce module
 * cree des noeuds, pose des attributs et les retire. Un stub trop pauvre
 * ferait echouer un code parfaitement correct.
 */
function noeud(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    className: '', id: '', textContent: '', hidden: false,
    enfants: [],
    dataset: {},
    attributs: new Map(),
    setAttribute(nom, valeur) { this.attributs.set(nom, String(valeur)); },
    getAttribute(nom) { return this.attributs.has(nom) ? this.attributs.get(nom) : null; },
    appendChild(enfant) { this.enfants.push(enfant); return enfant; },
    append(...n) { this.enfants.push(...n); },
    replaceChildren(...n) { this.enfants = n; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }
  };
}

function installerDocument() {
  const corps = noeud('body');
  globalThis.document = {
    getElementById: () => null,
    createElement: (tag) => noeud(tag),
    createTextNode: (texte) => ({ nodeType: 3, textContent: String(texte) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: corps
  };
}

/** Installe l'environnement et charge une instance FRAICHE du module. */
async function chargerClipboard(presse, storage) {
  installerNavigateur({ clipboard: presse.api });
  globalThis.localStorage = storage;
  installerDocument();
  const module = await import(`../scripts/utils/clipboard.js?lot7=${Math.random()}`);
  return { module };
}

function nettoyer() {
  if (navigateurOriginal) Object.defineProperty(globalThis, 'navigator', navigateurOriginal);
  else Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true, writable: true });
  delete globalThis.localStorage;
  delete globalThis.document;
}

test('7.7 - une copie ulterieure de l utilisateur n est JAMAIS ecrasee', async () => {
  const presse = fauxPressePapiers();
  const store = new FakeLocalStorage();
  const { module } = await chargerClipboard(presse, store);

  try {
    assert.equal(await module.copyToClipboard(SECRET), true);
    assert.equal(presse.contenu, SECRET);

    // L'utilisateur copie autre chose entre-temps.
    presse.contenu = 'texte-copie-par-l-utilisateur';

    const rapport = await module.clearOwnedClipboard();
    assert.equal(rapport.succeeded, false);
    assert.equal(rapport.reason, 'replaced_by_user');
    assert.equal(presse.contenu, 'texte-copie-par-l-utilisateur',
      'Le contenu de l utilisateur doit etre PRESERVE');
    assert.equal(presse.ecritures.filter((v) => v === '').length, 0,
      'Aucune chaine vide ne doit avoir ete ecrite');
  } finally { module.cancelClipboardClear(); nettoyer(); }
});

test('7.8 - lecture refusee : rien n est ecrase, et c est dit', async () => {
  const presse = fauxPressePapiers();
  const store = new FakeLocalStorage();
  const { module } = await chargerClipboard(presse, store);

  try {
    await module.copyToClipboard(SECRET);
    presse.refuserLecture = true;

    const rapport = await module.clearOwnedClipboard();
    assert.equal(rapport.attempted, true);
    assert.equal(rapport.succeeded, false);
    assert.equal(rapport.reason, 'permission_denied',
      'Un refus de permission doit etre nomme, pas confondu avec un succes');
    assert.equal(presse.contenu, SECRET,
      'Sans relecture possible, on n ecrase pas a l aveugle');
  } finally { module.cancelClipboardClear(); nettoyer(); }
});

test('7.9 - lecture indisponible : aucune ecriture aveugle', async () => {
  const presse = fauxPressePapiers();
  const store = new FakeLocalStorage();
  installerNavigateur({ clipboard: { writeText: presse.api.writeText } });
  globalThis.localStorage = store;
  installerDocument();

  try {
    const module = await import(`../scripts/utils/clipboard.js?lot7b=${Math.random()}`);
    await module.copyToClipboard(SECRET);
    const rapport = await module.clearOwnedClipboard();
    assert.equal(rapport.attempted, false);
    assert.equal(rapport.reason, 'read_unavailable');
    assert.equal(presse.contenu, SECRET);
    module.cancelClipboardClear();
  } finally { nettoyer(); }
});

test('7.10 - effacement effectif quand le contenu est bien le notre', async () => {
  const presse = fauxPressePapiers();
  const store = new FakeLocalStorage();
  const { module } = await chargerClipboard(presse, store);

  try {
    await module.copyToClipboard(SECRET);
    const rapport = await module.clearOwnedClipboard();
    assert.equal(rapport.succeeded, true);
    assert.equal(rapport.reason, 'cleared');
    assert.equal(presse.contenu, '');
  } finally { module.cancelClipboardClear(); nettoyer(); }
});

test('7.11 - le reglage DESACTIVE arme aucune minuterie', async () => {
  const presse = fauxPressePapiers();
  const store = new FakeLocalStorage();
  writeSettings({ clipboardClearEnabled: false }, { storage: store });
  const { module } = await chargerClipboard(presse, store);

  try {
    assert.equal(module.resolveClipboardTtl(), 0,
      'Effacement desactive : delai nul, aucune minuterie');
    assert.equal(await module.copyToClipboard(SECRET), true);
    assert.equal(presse.contenu, SECRET, 'La copie fonctionne toujours');

    // Aucune copie active n'est enregistree : rien a effacer.
    const rapport = await module.clearOwnedClipboard();
    assert.equal(rapport.reason, 'nothing_to_clear');
  } finally { module.cancelClipboardClear(); nettoyer(); }
});

test('7.12 - le delai regle est REELLEMENT celui applique', async () => {
  const presse = fauxPressePapiers();
  const store = new FakeLocalStorage();
  writeSettings({ clipboardClearEnabled: true, clipboardClearSeconds: 120 }, { storage: store });
  const { module } = await chargerClipboard(presse, store);

  try {
    assert.equal(module.resolveClipboardTtl(), 120000);
    // Un delai explicite reste prioritaire, pour les appelants qui en passent un.
    assert.equal(module.resolveClipboardTtl({ ttlMs: 5000 }), 5000);
  } finally { module.cancelClipboardClear(); nettoyer(); }
});

test('7.13 - aucun effacement n est annonce comme garanti', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../scripts/utils/clipboard.js', import.meta.url), 'utf8');
  const chaines = source.match(/'[^']{12,}'|`[^`]{12,}`/g) || [];
  const affichees = chaines.filter((c) => /presse-papiers/i.test(c));

  assert.ok(affichees.length > 0, 'Le module doit bien afficher des messages');
  for (const message of affichees) {
    assert.ok(!/sera efface|seront efface|efface dans \$\{/i.test(message),
      `Message promettant un effacement futur : ${message}`);
  }
  void APP_SETTINGS_KEY;
});

console.log('=== TEST CLIPBOARD CLEAR ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) { echecs += 1; console.error(`  ECHEC ${label}`); console.error(`        ${error && error.message}`); }
}
if (echecs > 0) { console.error(`Clipboard clear tests failed: ${echecs} scenario(s).`); process.exitCode = 1; }
else { console.log(`Clipboard clear tests passed (${cas.length} scenarios).`); }
