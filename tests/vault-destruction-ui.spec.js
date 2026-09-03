/**
 * Lot 8 - Fenetre de suppression volontaire, sur le VRAI index.html.
 *
 * ISOLEMENT DES DONNEES
 * Le document est construit a partir du fichier `index.html` du depot, mais
 * toutes les surfaces de stockage sont synthetiques : `FakeIdbRegistry` et
 * `FakeLocalStorage`, crees dans chaque test. Aucun appel ne touche
 * `indexedDB`, `localStorage`, ni un fichier `.vault`.
 *
 * DECLENCHEMENT
 * Plusieurs de ces tests existent precisement pour prouver qu'aucune
 * suppression n'a lieu tant que l'utilisateur ne l'a pas demandee.
 */
import assert from 'node:assert/strict';
import { loadIndexHtmlDocument } from './helpers/app-dom.js';
import { FakeIdbRegistry } from './helpers/fake-idb-registry.js';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';
import {
  DESTRUCTION_PHRASE,
  DESTRUCTION_SCOPES,
  createDeleteFactory,
  VAULT_STORAGE_KEYS,
  PROFILE_STORAGE_KEYS
} from '../scripts/core/vault/vault-destruction.js';
import {
  DESTRUCTION_BUTTON_ID,
  DESTRUCTION_MODAL_ID,
  DESTRUCTION_CONFIRM_ID,
  DESTRUCTION_SUBMIT_ID,
  initVaultDestructionControl,
  openDestructionModal,
  renderDestructionReport,
  describeScope
} from '../scripts/ui/vault-destruction-modal.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

class EvenementSynthetique {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  preventDefault() {}
  stopPropagation() {}
}

function coffreSynthetique() {
  return { id: 'current', entries: [{ id: 'e1', iv: 'AAA', data: 'chiffre-fictif' }], meta: { version: 2 } };
}
function profilSynthetique() {
  return { id: 'user-profile', name: 'Profil de test', email: 'test@exemple.invalid' };
}

function preparer() {
  const doc = loadIndexHtmlDocument();
  globalThis.document = doc;
  globalThis.CustomEvent = EvenementSynthetique;
  globalThis.Event = EvenementSynthetique;

  const registre = new FakeIdbRegistry({
    VaultDB: { vault: [coffreSynthetique()] },
    'vault-db': { settings: [profilSynthetique()] }
  });
  const storage = new FakeLocalStorage();
  for (const cle of VAULT_STORAGE_KEYS) storage.setItem(cle, '{"synthetique":true}');
  for (const cle of PROFILE_STORAGE_KEYS) storage.setItem(cle, 'valeur-fictive');

  const surfaces = {
    databases: [
      { name: 'VaultDB', stores: ['vault'], open: () => registre.open('VaultDB') },
      { name: 'vault-db', stores: ['settings'], open: () => registre.open('vault-db') }
    ],
    storage,
    deleteFactory: createDeleteFactory(registre)
  };

  return { doc, registre, storage, surfaces };
}

/**
 * Attend la fin REELLE de l operation.
 *
 * `setTimeout` arbitraire remplace : le registre synthetique enchaine
 * plusieurs tours de boucle (ouverture, comptage, vidage, relecture,
 * suppression de base) et une attente fixe rendrait le test dependant de la
 * machine. `onComplete` est resolu par le module lui-meme.
 */
function attendreExecution(doc, options) {
  return new Promise((resolve) => {
    openDestructionModal({ ...options, doc, onComplete: resolve });
  });
}

/** Petite respiration, uniquement pour PROUVER qu il ne se passe rien. */
function laisserTourner() {
  return new Promise((resolve) => { setTimeout(resolve, 50); });
}

function fermerNotifications(doc) {
  const conteneur = doc.getElementById('toast-container');
  if (!conteneur) return;
  conteneur.querySelectorAll('.toast').forEach((n) => {
    if (typeof n.dismiss === 'function') n.dismiss();
  });
}

function texteDe(noeud) {
  if (!noeud) return '';
  const morceaux = [];
  (function parcourir(n) {
    if (!n) return;
    if (n.nodeType === 3) { morceaux.push(n.textContent); return; }
    if (!n.childNodes || n.childNodes.length === 0) {
      if (typeof n.textContent === 'string') morceaux.push(n.textContent);
      return;
    }
    n.childNodes.forEach(parcourir);
  }(noeud));
  return morceaux.join(' ');
}

// ===========================================================================
// 1. Le bouton existe reellement, et n'est plus inerte
// ===========================================================================

test('8.27 - le bouton de la « Zone critique » porte un identifiant', () => {
  const { doc } = preparer();
  const bouton = doc.getElementById(DESTRUCTION_BUTTON_ID);
  assert.ok(bouton, 'Le bouton doit exister dans le VRAI index.html');
  assert.equal(bouton.tagName.toLowerCase(), 'button');
  assert.equal(bouton.getAttribute('type'), 'button',
    'Sans type=button, un bouton dans un formulaire le soumettrait');
});

test('8.28 - le libelle ne parle plus d un « compte » qui n existe pas', () => {
  const { doc } = preparer();
  const bouton = doc.getElementById(DESTRUCTION_BUTTON_ID);
  const carte = bouton.closest('.setting-item');
  const description = texteDe(carte);

  assert.ok(!/Supprime définitivement votre compte Vault/.test(description),
    'CryptoKeep est local : il n a pas de compte');
  assert.ok(/portée|portee/i.test(description),
    'La description doit annoncer que la portee est choisie ensuite');
  assert.ok(/confirmation/i.test(description),
    'La description doit annoncer la phrase de confirmation');
});

// ===========================================================================
// 2. Aucun declenchement automatique
// ===========================================================================

test('8.29 - raccorder le bouton ne supprime RIEN', () => {
  const { doc, registre, storage, surfaces } = preparer();

  const resultat = initVaultDestructionControl({ doc, surfaces });
  assert.equal(resultat.bound, true);

  assert.equal(registre.peek('VaultDB', 'vault').length, 1);
  assert.equal(registre.peek('vault-db', 'settings').length, 1);
  assert.equal(registre.clears, 0, 'Aucun vidage n a ete emis');
  assert.equal(registre.deleted.length, 0);
  assert.equal(storage.getItem('cryptokeep.backup.v1'), '{"synthetique":true}');
  // `assert.ok(!noeud)` et non `assert.equal(noeud, null)` : un noeud du
  // document porte des references circulaires vers ses parents, et le
  // formatage du message d'echec les parcourrait.
  assert.ok(!doc.getElementById(DESTRUCTION_MODAL_ID),
    'Le raccordement n ouvre aucune fenetre');
});

test('8.30 - ouvrir la fenetre ne supprime RIEN', async () => {
  const { doc, registre, storage, surfaces } = preparer();
  initVaultDestructionControl({ doc, surfaces });

  const bouton = doc.getElementById(DESTRUCTION_BUTTON_ID);
  bouton.dispatchEvent({ type: 'click', target: bouton });
  await laisserTourner();

  assert.ok(doc.getElementById(DESTRUCTION_MODAL_ID), 'La fenetre doit s ouvrir');
  assert.equal(registre.peek('VaultDB', 'vault').length, 1);
  assert.equal(registre.clears, 0);
  assert.equal(storage.getItem('vaultBackup'), '{"synthetique":true}');
});

test('8.31b - les controles portent leurs attributs, pas seulement des proprietes', () => {
  const { doc, surfaces } = preparer();
  openDestructionModal({ doc, surfaces });

  const champ = doc.getElementById(DESTRUCTION_CONFIRM_ID);
  assert.equal(champ.getAttribute('type'), 'text');
  assert.equal(champ.getAttribute('autocomplete'), 'off',
    'Le navigateur ne doit pas memoriser la phrase de suppression');

  const radios = doc.getElementById(DESTRUCTION_MODAL_ID)
    .querySelectorAll('input[type="radio"]');
  assert.equal(radios.length, 3, 'Les trois portees doivent etre proposees');
  for (const radio of radios) {
    assert.equal(radio.getAttribute('name'), 'destruction-scope',
      'Sans nom commun, les boutons radio ne s excluent pas');
  }

  const etiquettes = doc.getElementById(DESTRUCTION_MODAL_ID).querySelectorAll('label');
  for (const etiquette of etiquettes) {
    const cible = etiquette.getAttribute('for');
    assert.ok(cible && doc.getElementById(cible),
      `Etiquette pointant vers un identifiant inexistant : ${cible}`);
  }
});

test('8.31 - la fenetre n est PAS presente dans index.html au repos', () => {
  const { doc } = preparer();
  assert.ok(!doc.getElementById(DESTRUCTION_MODAL_ID),
    'Une fenetre de suppression dormante dans le document est une fenetre '
    + 'qu un defaut d affichage peut reveler');
});

// ===========================================================================
// 3. Confirmation forte
// ===========================================================================

test('8.32 - le bouton reste desactive tant que la phrase ne correspond pas', () => {
  const { doc, surfaces } = preparer();
  openDestructionModal({ doc, surfaces });

  const champ = doc.getElementById(DESTRUCTION_CONFIRM_ID);
  const valider = doc.getElementById(DESTRUCTION_SUBMIT_ID);
  assert.ok(champ && valider);
  assert.equal(valider.disabled, true, 'Desactive a l ouverture');

  for (const saisie of ['', 'supprimer', 'supprimer definitivement', 'SUPPRIMER DEFINITIVEMEN']) {
    champ.value = saisie;
    champ.dispatchEvent({ type: 'input', target: champ });
    assert.equal(valider.disabled, true, `Saisie acceptee a tort : « ${saisie} »`);
  }

  champ.value = DESTRUCTION_PHRASE;
  champ.dispatchEvent({ type: 'input', target: champ });
  assert.equal(valider.disabled, false, 'La phrase exacte doit activer le bouton');
});

test('8.33 - double verrou : un bouton reactive de force n atteint meme pas le moteur', async () => {
  const { doc, registre, storage, surfaces } = preparer();

  // Compteur d'ouvertures : si le moteur est appele, il ouvre les bases. Le
  // moteur refuserait de lui-meme une phrase erronee, et cette defense en
  // profondeur masquerait la disparition du verrou de l'interface. On mesure
  // donc que l'appel n'a PAS LIEU, pas seulement qu'il ne detruit rien.
  let ouvertures = 0;
  const surveillees = surfaces.databases.map((base) => ({
    ...base, open: () => { ouvertures += 1; return base.open(); }
  }));
  openDestructionModal({ doc, surfaces: { ...surfaces, databases: surveillees } });

  const champ = doc.getElementById(DESTRUCTION_CONFIRM_ID);
  const valider = doc.getElementById(DESTRUCTION_SUBMIT_ID);

  champ.value = 'supprimer definitivement';
  valider.disabled = false;                    // contournement de l interface
  valider.dispatchEvent({ type: 'click', target: valider });
  await laisserTourner();

  assert.equal(ouvertures, 0,
    'Le gestionnaire de clic doit revalider la phrase AVANT d appeler le moteur');

  // Le moteur refuserait de lui-meme une phrase erronee ; sa seule trace
  // observable serait alors un RAPPORT de refus affiche dans la fenetre. Son
  // absence prouve que le moteur n'a pas ete sollicite du tout.
  const zone = doc.getElementById(DESTRUCTION_MODAL_ID).querySelector('.destruction-report');
  assert.equal(zone.childNodes.length, 0,
    'Un clic invalide ne doit produire AUCUN rapport, pas meme un rapport de refus');
  assert.equal(valider.disabled, false,
    'Le clic n a rien declenche : le bouton n a donc pas ete verrouille par l execution');
  assert.equal(registre.peek('VaultDB', 'vault').length, 1,
    'L etat « disabled » est une commodite ; la phrase est la condition reelle');
  assert.equal(registre.clears, 0);
  assert.equal(storage.getItem('cryptokeep.backup.v1'), '{"synthetique":true}');
});

// ===========================================================================
// 4. Portees : ce qui part, ce qui reste
// ===========================================================================

test('8.34 - la fenetre annonce aussi ce qui sera CONSERVE', () => {
  const { doc, surfaces } = preparer();
  openDestructionModal({ doc, surfaces });

  const fenetre = doc.getElementById(DESTRUCTION_MODAL_ID);
  const texte = texteDe(fenetre);

  assert.ok(/Sera supprimé/.test(texte), 'Ce qui est supprime doit etre liste');
  assert.ok(/Sera conservé/.test(texte),
    'Une fenetre qui ne dit que ce qu elle detruit laisse croire qu elle detruit tout');
  assert.ok(/profil local/i.test(texte),
    'La portee « coffre » doit dire que le profil survit');
});

test('8.35 - changer de portee change ce qui est annonce', () => {
  const { doc, surfaces } = preparer();
  openDestructionModal({ doc, surfaces });

  const radioProfil = doc.getElementById(`destruction-scope-${DESTRUCTION_SCOPES.PROFILE}`);
  assert.ok(radioProfil, 'La portee « profil » doit etre proposee');
  radioProfil.checked = true;
  radioProfil.dispatchEvent({ type: 'change', target: radioProfil });

  const texte = texteDe(doc.getElementById(DESTRUCTION_MODAL_ID));
  assert.ok(/coffre chiffré est conservé/i.test(texte),
    'La portee « profil » doit dire explicitement que le coffre survit');
});

test('8.36 - portee « profil » : seul le profil disparait', async () => {
  const { doc, registre, storage, surfaces } = preparer();
  const termine = attendreExecution(doc, { surfaces });

  const radioProfil = doc.getElementById(`destruction-scope-${DESTRUCTION_SCOPES.PROFILE}`);
  radioProfil.checked = true;
  radioProfil.dispatchEvent({ type: 'change', target: radioProfil });

  const champ = doc.getElementById(DESTRUCTION_CONFIRM_ID);
  champ.value = DESTRUCTION_PHRASE;
  champ.dispatchEvent({ type: 'input', target: champ });

  const valider = doc.getElementById(DESTRUCTION_SUBMIT_ID);
  valider.dispatchEvent({ type: 'click', target: valider });
  const rapport = await termine;

  assert.equal(rapport.status, 'completed');
  assert.deepEqual(registre.peek('VaultDB', 'vault'), [coffreSynthetique()],
    'Le coffre ne doit pas etre touche');
  assert.equal(registre.peek('vault-db', 'settings'), null);
  assert.equal(storage.getItem('cryptokeep.backup.v1'), '{"synthetique":true}');
  assert.equal(storage.getItem('selectedTheme'), null);

  fermerNotifications(doc);
});

test('8.37 - le champ de confirmation est vide apres execution', async () => {
  const { doc, surfaces } = preparer();
  const termine = attendreExecution(doc, { surfaces });

  const champ = doc.getElementById(DESTRUCTION_CONFIRM_ID);
  champ.value = DESTRUCTION_PHRASE;
  champ.dispatchEvent({ type: 'input', target: champ });
  const valider = doc.getElementById(DESTRUCTION_SUBMIT_ID);
  valider.dispatchEvent({ type: 'click', target: valider });
  await termine;

  assert.equal(champ.value, '', 'Aucune saisie ne doit rester dans le champ');
  fermerNotifications(doc);
});

// ===========================================================================
// 5. Le rapport affiche est celui du moteur, sans embellissement
// ===========================================================================

test('8.38 - suppression partielle : l interface dit INCOMPLETE', () => {
  const { doc } = preparer();
  const conteneur = doc.createElement('div');

  renderDestructionReport(doc, conteneur, {
    status: 'partial', erasedSomething: false, removedRecords: 0,
    targets: [{ kind: 'indexeddb', database: 'VaultDB', store: 'vault', outcome: 'failed' }],
    clipboard: null, notes: []
  });

  const texte = texteDe(conteneur);
  assert.ok(/INCOMPLÈTE/.test(texte), `Rapport affiche : ${texte}`);
  assert.ok(/ÉCHEC/.test(texte), 'Chaque cible en echec doit etre nommee');
  assert.ok(!/Terminé\s*:/.test(texte), 'Aucun message de reussite sur un echec');
});

test('8.39 - rien a supprimer : jamais annonce comme une suppression', () => {
  const { doc } = preparer();
  const conteneur = doc.createElement('div');

  renderDestructionReport(doc, conteneur, {
    status: 'completed', erasedSomething: false, removedRecords: 0,
    targets: [{ kind: 'storage', key: 'cryptokeep.backup.v1', outcome: 'absent' }],
    clipboard: null, notes: []
  });

  const texte = texteDe(conteneur);
  assert.ok(/aucune donnée à supprimer/i.test(texte),
    'Regle du Lot 6 : aucun resultat positif sur une operation qui n a rien trouve');
  assert.ok(!/supprimé\(s\) et vérifié/i.test(texte));
});

test('8.40 - le rapport dit la limite, sans promettre l irrecuperabilite', () => {
  const { doc } = preparer();
  const conteneur = doc.createElement('div');
  renderDestructionReport(doc, conteneur, {
    status: 'completed', erasedSomething: true, removedRecords: 2,
    targets: [], clipboard: { attempted: true, succeeded: false, reason: 'permission_denied' },
    notes: []
  });

  const texte = texteDe(conteneur);
  assert.ok(/exportés vous-même/.test(texte), 'La limite doit etre affichee');
  assert.ok(/effacement non confirmé/.test(texte),
    'Un presse-papiers non efface ne doit pas etre presente comme efface');
  assert.ok(!/irrécupérable|irrecuperable|définitivement effacé/i.test(texte),
    'Rien ne permet de promettre qu une donnee est irrecuperable');
});

// ===========================================================================
// 6. Regles de securite du projet
// ===========================================================================

test('8.41 - aucun innerHTML dans les modules du Lot 8', async () => {
  const { readFileSync } = await import('node:fs');
  for (const chemin of [
    'scripts/core/vault/vault-destruction.js',
    'scripts/ui/vault-destruction-modal.js'
  ]) {
    // Les COMMENTAIRES sont retires avant l analyse : ces modules documentent
    // precisement l interdiction, et un test qui echouerait sur sa propre
    // documentation pousserait a supprimer l explication plutot que le defaut.
    const code = readFileSync(chemin, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code),
      `Construction par balisage interdite dans ${chemin}`);
    if (chemin.includes('/ui/')) {
      assert.ok(/textContent/.test(code),
        `${chemin} doit construire son texte par textContent`);
    } else {
      // Le moteur n'a AUCUNE dependance au document : il ne construit rien.
      assert.ok(!/document\./.test(code),
        `${chemin} ne doit toucher a aucun noeud du document`);
    }
  }
});

test('8.42 - un nom de cible n est jamais interprete comme du balisage', () => {
  const { doc } = preparer();
  const conteneur = doc.createElement('div');

  renderDestructionReport(doc, conteneur, {
    status: 'completed', erasedSomething: true, removedRecords: 1,
    targets: [{
      kind: 'storage',
      key: '<img src=x onerror="alert(1)">',
      outcome: 'cleared'
    }],
    clipboard: null, notes: []
  });

  const lignes = conteneur.querySelectorAll('li');
  assert.equal(lignes.length, 1);
  assert.ok(lignes[0].textContent.includes('<img src=x'),
    'La valeur doit apparaitre comme du TEXTE');
  assert.equal(conteneur.querySelectorAll('img').length, 0,
    'Aucun noeud ne doit avoir ete cree a partir de la valeur');
});

test('8.43 - aucun secret n est journalise ni persiste par le Lot 8', async () => {
  const { readFileSync } = await import('node:fs');
  for (const chemin of [
    'scripts/core/vault/vault-destruction.js',
    'scripts/ui/vault-destruction-modal.js'
  ]) {
    const source = readFileSync(chemin, 'utf8');
    assert.ok(!/console\.(log|info|debug)\s*\(/.test(source),
      `Aucune journalisation dans ${chemin}`);
    assert.ok(!/setItem\s*\(/.test(source),
      `Le Lot 8 efface des cles, il n en ecrit aucune (${chemin})`);
  }
});

test('8.44 - app.js injecte la purge memoire et le presse-papiers', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('scripts/app.js', 'utf8');

  const bloc = source.slice(source.indexOf('initVaultDestructionControl({'));
  assert.ok(bloc.includes('clearSession'),
    'Sans purge memoire injectee, la cle maitre survivrait a la suppression');
  assert.ok(bloc.includes('clearClipboard'),
    'La tentative d effacement du presse-papiers doit etre cablee');
  assert.ok(bloc.includes('restoreFirstUse'),
    'Le retour a l etat de premiere utilisation doit etre cable');
});

test('8.45 - describeScope decrit les cibles REELLES, pas un texte fige', () => {
  const coffre = describeScope(DESTRUCTION_SCOPES.VAULT).join(' | ');
  const profil = describeScope(DESTRUCTION_SCOPES.PROFILE).join(' | ');

  assert.ok(coffre.includes('VaultDB') && !coffre.includes('vault-db'));
  assert.ok(profil.includes('vault-db') && !profil.includes('VaultDB'));
  for (const cle of VAULT_STORAGE_KEYS) assert.ok(coffre.includes(cle), `Cle absente : ${cle}`);
  for (const cle of PROFILE_STORAGE_KEYS) assert.ok(profil.includes(cle), `Cle absente : ${cle}`);
  assert.deepEqual(describeScope('inconnue'), []);
});

// ===========================================================================
console.log('=== TEST VAULT DESTRUCTION UI (LOT 8) ===');
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
  console.error(`Vault destruction UI tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Vault destruction UI tests passed (${cas.length} scenarios).`);
}
