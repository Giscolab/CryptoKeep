/**
 * LOT 3B - Tests d'INTEGRATION au niveau application.
 *
 * POURQUOI CE FICHIER EXISTE
 * Les specs du Lot 3 sont vertes et le restent. Elles n'ont pourtant pas
 * detecte huit defauts reels, parce qu'elles verifiaient chaque module
 * ISOLEMENT, contre un document synthetique ecrit pour le test. Les defauts
 * ne vivaient pas dans un module : ils vivaient dans l'assemblage.
 *
 * Ici, au contraire :
 *   - le document est construit a partir du VRAI index.html du depot ;
 *   - le stockage passe par le VRAI StorageManager, sur une base IndexedDB
 *     synthetique qui reproduit la semantique des transactions ;
 *   - la cryptographie est reelle (WebCrypto de Node) ;
 *   - les boutons sont reellement cliques, et l'on observe le DOM obtenu,
 *     pas seulement l'evenement emis.
 *
 * DONNEES : exclusivement synthetiques. Aucun coffre reel, aucun fichier
 * .vault de l'utilisateur, aucun secret personnel n'est lu ni ecrit.
 */

import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIndexHtmlDocument } from './helpers/app-dom.js';
import { FakeIDBDatabase } from './helpers/fake-indexeddb.js';
import { buildSyntheticVault } from './helpers/vault-fixtures.js';
import { decryptData } from '../scripts/core/crypto/aes-gcm.js';
import { entryAdditionalData } from '../scripts/core/storage/vault-format.js';

const MDP = 'phrase-de-passe-lot3b-integration';

// ===========================================================================
// Environnement navigateur minimal, installe AVANT le chargement des modules
// d'interface : plusieurs d'entre eux lisent leurs preferences des le
// chargement du module.
// ===========================================================================

const document = loadIndexHtmlDocument();

class TestEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.detail = init.detail;
  }
  preventDefault() {}
  stopPropagation() {}
}

class TestStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  get length() { return this.map.size; }
}

globalThis.document = document;
globalThis.CustomEvent = TestEvent;
globalThis.Event = TestEvent;
globalThis.localStorage = new TestStorage();
globalThis.sessionStorage = new TestStorage();

const { vaultManager } = await import('../scripts/core/vault/manager.js');
const { StorageManager } = await import('../scripts/core/storage/manager.js');
const entryOperations = await import('../scripts/core/vault/entry-operations.js');
const vaultList = await import('../scripts/ui/vault-list/vault-list.js');
const dashboard = await import('../scripts/ui/dashboard.js');
const entryModal = await import('../scripts/ui/entry-modal.js');
const viewRefresh = await import('../scripts/ui/vault-view-refresh.js');

const { createEntry, updateEntry, deleteEntry } = entryOperations;

// ===========================================================================
// Outils de scenario
// ===========================================================================

/** Installe un coffre synthetique et deverrouille le gestionnaire reel. */
async function installVault(entries) {
  const built = await buildSyntheticVault({ password: MDP, entries });
  const db = new FakeIDBDatabase(built.record);
  const storage = new StorageManager();
  storage.db = db;
  // `initializeDB()` ouvrirait une vraie base : elle est neutralisee, la base
  // synthetique etant deja injectee. Toute la logique de saveVault, elle,
  // reste celle du module de production.
  storage.initializeDB = async () => { storage.db = db; };

  vaultManager.storage = storage;
  vaultManager.clearSession?.();
  await vaultManager.unlock(MDP);
  db.commits = 0;
  db.aborts = 0;
  return { db, storage, built };
}

/** Empreinte du stockage PERSISTANT, sans passer par l'etat en memoire. */
function persistentFingerprint(db) {
  const record = db.peek();
  if (!record) return { count: 0, ciphers: [] };
  return {
    count: record.entries.length,
    ciphers: record.entries.map((entry) => `${entry.id}:${entry.iv}:${entry.ciphertext}`).sort()
  };
}

/** Capture une erreur d'operation sans laisser passer un succes silencieux. */
async function captureFailure(promise, message) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail(`${message} : l'operation aurait du echouer`);
}

const results = [];
function check(label, fn) { results.push({ label, fn }); }

function textOf(node) { return node ? node.textContent : ''; }

/** Titres reellement rendus dans un conteneur, dans l'ordre du DOM. */
function renderedTitles(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return container.children
    .filter((child) => child.classList.contains('vault-item'))
    .map((item) => textOf(item.querySelector('strong')));
}

function emptyMessage(containerId) {
  const container = document.getElementById(containerId);
  const paragraph = container ? container.querySelector('p') : null;
  return paragraph ? paragraph.textContent : '';
}

// ===========================================================================
// A. ATOMICITE REELLE : commit valide puis verification en echec
// ---------------------------------------------------------------------------
// Defaut reproduit avant correction, avec exactement cette sortie :
//   operation_error write_failed / memory_title Avant /
//   persistent_cipher_changed true
// Autrement dit : l'operation etait signalee en echec, l'etat en memoire
// conservait l'ancienne entree, et le stockage persistant portait pourtant
// deja le NOUVEAU ciphertext. Invariants #29 et #36, critere G.
// ===========================================================================

check('A1 - modification : commit valide puis verification en echec -> restauration verifiee', async () => {
  const { db, built } = await installVault([
    { id: 'a1', title: 'Avant', username: 'utilisateur@example.test', password: 'mdp-synthetique-1', url: 'https://exemple.test' }
  ]);

  const avant = persistentFingerprint(db);
  db.divergeReadAfterCommit = true;

  const error = await captureFailure(
    updateEntry(vaultManager, 'a1', { title: 'Apres', password: 'mdp-synthetique-1' }),
    'Modification avec relecture divergente'
  );

  assert.equal(error.name, 'EntryOperationError');
  assert.equal(error.code, 'write_verification_failed',
    "L'echec doit etre identifie comme un echec de VERIFICATION, non aplati en write_failed");
  assert.equal(error.restored, true, 'Le coffre precedent doit avoir ete restaure');
  assert.equal(error.verifiedRestore, true, 'La restauration doit avoir ete relue et verifiee');

  assert.deepEqual(persistentFingerprint(db), avant,
    'DEFAUT 1 : le stockage persistant doit etre revenu a son etat exact (IV et ciphertext compris)');

  const memoire = vaultManager.getEntries().find((entry) => entry.id === 'a1');
  assert.equal(memoire.title, 'Avant', "L'etat en memoire doit rester coherent avec le stockage");

  // La restauration ne doit pas seulement etre identique octet a octet : elle
  // doit rester DECHIFFRABLE avec la cle de session.
  const restaure = db.peek().entries.find((entry) => entry.id === 'a1');
  const clair = await decryptData(restaure, built.key, {
    additionalData: entryAdditionalData('a1', 2)
  });
  assert.equal(clair.title, 'Avant', 'Le coffre restaure doit rester dechiffrable');

  // Une ecriture divergente, une restauration : pas de boucle.
  assert.equal(db.commits, 2, 'Aucune restauration en chaine ne doit se declencher');
});

check('A2 - ajout : commit valide puis verification en echec -> aucune entree persistee', async () => {
  const { db } = await installVault([
    { id: 'a2', title: 'Existante', username: 'u@example.test', password: 'mdp-synthetique-2' }
  ]);

  const avant = persistentFingerprint(db);
  db.divergeReadAfterCommit = true;

  const error = await captureFailure(
    createEntry(vaultManager, { title: 'Nouvelle', password: 'mdp-synthetique-3' }),
    'Ajout avec relecture divergente'
  );

  assert.equal(error.code, 'write_verification_failed');
  assert.equal(error.restored, true);
  assert.equal(error.verifiedRestore, true);
  assert.equal(persistentFingerprint(db).count, avant.count,
    'Un ajout signale en echec ne doit laisser aucune entree dans le stockage');
  assert.deepEqual(persistentFingerprint(db), avant);
  assert.equal(vaultManager.getEntries().length, 1);
});

check('A3 - suppression : commit valide puis verification en echec -> entree conservee', async () => {
  const { db } = await installVault([
    { id: 'a3', title: 'A conserver', username: 'u@example.test', password: 'mdp-synthetique-4' },
    { id: 'a3-bis', title: 'Autre', username: 'v@example.test', password: 'mdp-synthetique-5' }
  ]);

  const avant = persistentFingerprint(db);
  db.divergeReadAfterCommit = true;

  const error = await captureFailure(
    deleteEntry(vaultManager, 'a3'),
    'Suppression avec relecture divergente'
  );

  assert.equal(error.code, 'write_verification_failed');
  assert.equal(error.restored, true);
  assert.deepEqual(persistentFingerprint(db), avant,
    'Une suppression signalee en echec ne doit rien supprimer du stockage');
  assert.ok(vaultManager.getEntries().some((entry) => entry.id === 'a3'));
});

check('A4 - transaction annulee : aucune ecriture, donc AUCUNE restauration', async () => {
  const { db } = await installVault([
    { id: 'a4', title: 'Intacte', username: 'u@example.test', password: 'mdp-synthetique-6' }
  ]);

  const avant = persistentFingerprint(db);
  db.abortNextWrites = 1;

  const error = await captureFailure(
    updateEntry(vaultManager, 'a4', { title: 'Jamais ecrite', password: 'mdp-synthetique-6' }),
    'Modification avec transaction annulee'
  );

  assert.equal(error.code, 'write_transaction_aborted');
  assert.equal(error.restored, false,
    'Aucune restauration ne doit etre ANNONCEE quand rien n a ete ecrit');
  assert.equal(db.commits, 0,
    'Aucune ecriture supplementaire ne doit suivre une transaction annulee');
  assert.equal(db.aborts, 1);
  assert.deepEqual(persistentFingerprint(db), avant);
});

// ===========================================================================
// B. Invariant #13 : aucune persistance si le CHIFFREMENT lui-meme echoue
// ===========================================================================

check('B1 - echec de chiffrement : aucune ecriture, aucune mutation en memoire', async () => {
  const { db } = await installVault([
    { id: 'b1', title: 'Intacte', username: 'u@example.test', password: 'mdp-synthetique-7' }
  ]);

  const avant = persistentFingerprint(db);
  const vraiEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  crypto.subtle.encrypt = async () => { throw new Error('chiffrement indisponible'); };

  try {
    await captureFailure(
      createEntry(vaultManager, { title: 'Jamais chiffree', password: 'mdp-synthetique-8' }),
      'Ajout avec chiffrement en echec'
    );
  } finally {
    crypto.subtle.encrypt = vraiEncrypt;
  }

  assert.equal(db.commits, 0, 'Un chiffrement en echec ne doit produire aucune ecriture');
  assert.deepEqual(persistentFingerprint(db), avant);
  assert.equal(vaultManager.getEntries().length, 1,
    "L'etat en memoire ne doit pas contenir une entree jamais chiffree");
});

// ===========================================================================
// C. Invariant #12 : source cryptographique du generateur, EN INTEGRATION
// ---------------------------------------------------------------------------
// Le bouton reel de index.html est clique. Pendant ce clic, Math.random est
// remplace par une fonction qui echoue : toute utilisation la ferait tomber.
// ===========================================================================

check('C1 - le generateur reel utilise crypto.getRandomValues, jamais Math.random', async () => {
  await installVault([]);

  const bind = entryModal.initEntryModal({ doc: document });
  assert.ok(bind.bound || bind.reason === 'already_bound',
    'La fenetre d\'entree doit etre raccordee au document reel');

  const bouton = document.getElementById('generate-password');
  const champ = document.getElementById('password');
  assert.ok(bouton && champ, 'Le bouton du generateur et le champ doivent exister dans index.html');

  champ.value = '';

  const vraiRandom = Math.random;
  const vraiGetRandomValues = crypto.getRandomValues.bind(crypto);
  let appelsCsprng = 0;
  let appelsMathRandom = 0;

  Math.random = () => { appelsMathRandom += 1; return 0.5; };
  crypto.getRandomValues = (array) => { appelsCsprng += 1; return vraiGetRandomValues(array); };

  try {
    bouton.click();
  } finally {
    Math.random = vraiRandom;
    crypto.getRandomValues = vraiGetRandomValues;
  }

  assert.ok(champ.value.length > 0, 'Le clic doit remplir le champ mot de passe');
  assert.ok(appelsCsprng > 0, 'crypto.getRandomValues doit etre la source utilisee');
  assert.equal(appelsMathRandom, 0,
    'Math.random ne doit jamais participer a la generation d\'un mot de passe');
});

check('C2 - un seul ecouteur sur le generateur (defaut 2)', async () => {
  const bouton = document.getElementById('generate-password');
  assert.equal(bouton.listenerCount('click'), 1,
    'DEFAUT 2 : deux ecouteurs etaient installes sur #generate-password '
    + '(scripts/app.js et scripts/ui/entry-modal.js). Un seul doit subsister.');

  // Second appel : l'initialisation est idempotente, aucun ecouteur ajoute.
  const rebind = entryModal.initEntryModal({ doc: document });
  assert.equal(rebind.bound, false);
  assert.equal(rebind.reason, 'already_bound');
  assert.equal(bouton.listenerCount('click'), 1,
    'Une seconde initialisation ne doit ajouter aucun ecouteur');
});

check('C3 - garde statique : scripts/app.js ne raccorde plus le generateur', async () => {
  const source = readFileSync(new URL('../scripts/app.js', import.meta.url), 'utf8');
  const lignes = source.split(/\r?\n/);

  const raccordements = lignes.filter((ligne) => !ligne.trim().startsWith('//')
    && /addEventListener/.test(ligne)
    && /generate/i.test(ligne));
  assert.equal(raccordements.length, 0,
    'scripts/app.js ne doit plus installer d\'ecouteur sur le generateur');

  const usages = lignes.filter((ligne) => !ligne.trim().startsWith('//')
    && /PasswordGenerator/.test(ligne));
  assert.equal(usages.length, 0,
    'scripts/app.js ne doit plus utiliser PasswordGenerator');
});

// ===========================================================================
// D. Invariant #37 : les vues sont REELLEMENT rafraichies
// ---------------------------------------------------------------------------
// Ce qui est observe est le DOM obtenu, pas l'emission d'un evenement.
// ===========================================================================

check('D1 - une mutation reussie met a jour le DOM, les compteurs et les statistiques', async () => {
  await installVault([
    { id: 'd1', title: 'Alpha', username: 'alpha@example.test', password: 'MotDePasse-Alpha-1!' }
  ]);

  viewRefresh.installVaultViewRefresh();
  await viewRefresh.refreshVaultViews();

  assert.deepEqual(renderedTitles('entries'), ['Alpha']);
  assert.equal(textOf(document.getElementById('vault-count')), '1/1');

  await createEntry(vaultManager, { title: 'Beta', password: 'MotDePasse-Beta-2!' });
  // L'abonnement centralise est asynchrone : on attend son tour de boucle.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(renderedTitles('entries').sort(), ['Alpha', 'Beta'],
    'Le conteneur #entries doit contenir la nouvelle entree');
  assert.equal(textOf(document.getElementById('vault-count')), '2/2',
    'Le compteur doit refleter le nouvel etat');
  assert.equal(textOf(document.getElementById('stats-total')), '2',
    'Les statistiques du tableau de bord doivent etre recalculees');
});

check('D2 - une mutation ECHOUEE ne doit pas laisser une vue optimiste', async () => {
  const { db } = await installVault([
    { id: 'd2', title: 'Seule', username: 'u@example.test', password: 'MotDePasse-Seule-1!' }
  ]);

  await viewRefresh.refreshVaultViews();
  assert.deepEqual(renderedTitles('entries'), ['Seule']);

  db.divergeReadAfterCommit = true;
  await captureFailure(
    createEntry(vaultManager, { title: 'Fantome', password: 'MotDePasse-Fantome-1!' }),
    'Ajout divergent'
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(renderedTitles('entries'), ['Seule'],
    'Une entree dont l ecriture a echoue ne doit apparaitre nulle part');
  assert.equal(textOf(document.getElementById('vault-count')), '1/1');
});

// ===========================================================================
// E. Defaut 3 et invariant #43 : recherche, filtre et tri du TABLEAU DE BORD
// ---------------------------------------------------------------------------
// Le champ #dashboardSearchInput etait ecoute, mais son gestionnaire ne
// rendait que #entries : sur le tableau de bord, #recent-entries ne changeait
// jamais.
// ===========================================================================

async function scenarioDeuxVues() {
  await installVault([
    { id: 'e1', title: 'Banque Populaire', username: 'client@example.test', password: 'MotDePasse-Banque-1!', category: 'bank' },
    { id: 'e2', title: 'Messagerie Pro', username: 'pro@example.test', password: 'MotDePasse-Mail-2!', category: 'email' },
    { id: 'e3', title: 'Élan Créatif', username: 'studio@example.test', password: 'MotDePasse-Elan-3!', category: 'work' }
  ]);

  // Les trois entrees sont marquees comme consultees : sans acces recent, le
  // tableau de bord n'aurait rien a filtrer et le test ne prouverait rien.
  for (const id of ['e1', 'e2', 'e3']) {
    await vaultManager.markEntryAccessed(id);
  }

  await viewRefresh.refreshVaultViews();
}

check('E1 - la recherche du tableau de bord modifie reellement #recent-entries', async () => {
  await scenarioDeuxVues();

  assert.equal(renderedTitles('recent-entries').length, 3,
    'Les trois acces recents doivent etre affiches au depart');

  const champ = document.getElementById('dashboardSearchInput');
  assert.ok(champ, '#dashboardSearchInput doit exister dans index.html');
  assert.equal(champ.listenerCount('input'), 1, 'Un seul ecouteur de saisie');

  champ.value = 'banque';
  champ.dispatchEvent({ type: 'input', target: champ });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(renderedTitles('recent-entries'), ['Banque Populaire'],
    'DEFAUT 3 : la recherche saisie sur le tableau de bord doit filtrer '
    + '#recent-entries, et pas seulement #entries');
  assert.deepEqual(renderedTitles('entries'), ['Banque Populaire'],
    'La vue des mots de passe doit afficher exactement le meme resultat');
});

check('E2 - accents et casse ignores de la meme facon dans les deux vues', async () => {
  await scenarioDeuxVues();

  const champ = document.getElementById('dashboardSearchInput');
  champ.value = 'ELAN CREATIF';
  champ.dispatchEvent({ type: 'input', target: champ });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(renderedTitles('recent-entries'), ['Élan Créatif']);
  assert.deepEqual(renderedTitles('entries'), ['Élan Créatif']);

  // Les deux champs restent synchronises : une seule recherche, un seul etat.
  assert.equal(document.getElementById('searchInput').value, 'ELAN CREATIF');
});

check('E3 - message honnete quand la recherche ne renvoie rien', async () => {
  await scenarioDeuxVues();

  const champ = document.getElementById('dashboardSearchInput');
  champ.value = 'chaine-absente-du-coffre';
  champ.dispatchEvent({ type: 'input', target: champ });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(renderedTitles('recent-entries').length, 0);
  assert.match(emptyMessage('recent-entries'), /recherche/,
    'Le message doit dire qu aucun resultat ne correspond a la recherche, '
    + 'et non qu il n existe aucun acces recent');

  champ.value = '';
  champ.dispatchEvent({ type: 'input', target: champ });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(renderedTitles('recent-entries').length, 3, 'Effacer la recherche retablit la liste');
});

check('E4 - le filtre de categorie agit sur les DEUX vues', async () => {
  await scenarioDeuxVues();

  const boutonBanque = document
    .querySelectorAll('#dashboardCategoryFilter .category-btn')
    .find((button) => button.dataset.category === 'bank');
  assert.ok(boutonBanque, 'Le tableau de bord doit disposer du filtre de categorie');

  boutonBanque.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(renderedTitles('recent-entries'), ['Banque Populaire']);
  assert.deepEqual(renderedTitles('entries'), ['Banque Populaire']);

  // L'etat accessible suit, dans les DEUX groupes de boutons.
  const tousLesBoutonsBanque = document.querySelectorAll('.category-filter .category-btn')
    .filter((button) => button.dataset.category === 'bank');
  assert.equal(tousLesBoutonsBanque.length, 2);
  tousLesBoutonsBanque.forEach((button) => {
    assert.equal(button.getAttribute('aria-pressed'), 'true');
  });

  const retourTous = document.querySelectorAll('#dashboardCategoryFilter .category-btn')
    .find((button) => button.dataset.category === 'all');
  retourTous.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(renderedTitles('recent-entries').length, 3);
});

check('E5 - le tri agit reellement sur les DEUX vues', async () => {
  await scenarioDeuxVues();

  const boutonsTri = document.querySelectorAll('.vault-actions button.sort-button');
  assert.equal(boutonsTri.length, 2, 'Les deux vues doivent avoir un bouton de tri');

  const modeCourant = () => (boutonsTri[0].textContent.includes('A-Z') ? 'title-asc' : 'recent');

  // Le mode de tri est PERSISTE entre les sessions : le scenario ne peut pas
  // supposer son etat de depart, il l'amene explicitement sur A-Z.
  if (modeCourant() !== 'title-asc') {
    boutonsTri[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(modeCourant(), 'title-asc');
  assert.equal(boutonsTri[1].textContent, boutonsTri[0].textContent,
    'Les deux boutons de tri doivent afficher le meme etat');

  const alphabetique = ['Banque Populaire', 'Élan Créatif', 'Messagerie Pro'];
  assert.deepEqual(renderedTitles('entries'), alphabetique,
    'Le tri alphabetique doit utiliser le comparateur Unicode partage');
  assert.deepEqual(renderedTitles('recent-entries'), alphabetique,
    'DEFAUT 3 : le tri doit reordonner aussi les acces recents du tableau de bord');

  // Retour au mode « récents ». Les deux vues restent triees par recence,
  // mais selon la recence qui a un SENS pour chacune : la derniere
  // modification pour la liste complete, le dernier acces pour les acces
  // recents. Ce n'est pas une incoherence, c'est la definition du panneau.
  boutonsTri[1].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(modeCourant(), 'recent');

  const parAcces = renderedTitles('recent-entries');
  assert.notDeepEqual(parAcces, alphabetique,
    'Changer de mode de tri doit visiblement reordonner les acces recents');
  assert.deepEqual(parAcces, ['Élan Créatif', 'Messagerie Pro', 'Banque Populaire'],
    'Les acces recents sont ordonnes du plus recemment consulte au plus ancien');

  // Un clic sur l'un OU l'autre bouton pilote les deux vues : il n'existe
  // qu'un seul etat de tri.
  assert.equal(boutonsTri[0].textContent, boutonsTri[1].textContent);
});

// ===========================================================================
// F. Defaut 4 : une seule liste d'acces recents, avec son bouton Modifier
// ===========================================================================

check('F1 - le bouton Modifier survit au rafraichissement centralise', async () => {
  await scenarioDeuxVues();

  const boutonsApresRendu = document.getElementById('recent-entries')
    .querySelectorAll('.edit');
  assert.equal(boutonsApresRendu.length, 3,
    'Chaque acces recent doit porter un bouton Modifier');

  // Sequence reelle de scripts/app.js : rendu par dashboard.js, puis
  // rafraichissement centralise. Auparavant, le second rendu retirait le
  // bouton Modifier que le premier venait d'afficher.
  await dashboard.renderRecentAccesses();
  await viewRefresh.refreshVaultViews();

  const boutonsApresRafraichissement = document.getElementById('recent-entries')
    .querySelectorAll('.edit');
  assert.equal(boutonsApresRafraichissement.length, 3,
    'DEFAUT 4 : le bouton Modifier ne doit pas disparaitre apres un '
    + 'rafraichissement centralise');
});

check('F2 - les deux implementations produisent le meme rendu', async () => {
  await scenarioDeuxVues();

  await dashboard.renderRecentAccesses();
  const parDashboard = renderedTitles('recent-entries');
  const editsDashboard = document.getElementById('recent-entries').querySelectorAll('.edit').length;

  await vaultList.renderRecentAccesses();
  const parVaultList = renderedTitles('recent-entries');
  const editsVaultList = document.getElementById('recent-entries').querySelectorAll('.edit').length;

  assert.deepEqual(parDashboard, parVaultList,
    'Les deux points d entree doivent produire exactement la meme liste');
  assert.equal(editsDashboard, editsVaultList,
    'Les deux points d entree doivent produire exactement les memes actions');
});

check('F3 - Modifier ouvre la fenetre d edition complete', async () => {
  await scenarioDeuxVues();
  entryModal.initEntryModal({ doc: document });

  const premier = document.getElementById('recent-entries').children
    .find((item) => item.classList.contains('vault-item'));
  const bouton = premier.querySelector('.edit');
  bouton.click();

  const fenetre = document.getElementById('passwordModal');
  assert.ok(fenetre.classList.contains('active'),
    'Le bouton Modifier doit ouvrir la fenetre d edition');
  assert.equal(fenetre.getAttribute('aria-hidden'), 'false');
  assert.equal(textOf(document.querySelector('#passwordModal .modal-header h3')),
    'Modifier ce mot de passe');
  assert.equal(document.getElementById('entry-title').value, premier.querySelector('strong').textContent);

  entryModal.closeEntryModal(entryModal.initEntryModal({ doc: document }).fields);
});

// ===========================================================================
// G. Defaut 5 : les boutons « Filtrer » ne sont plus decoratifs
// ===========================================================================

check('G1 - les deux boutons Filtrer sont raccordes et pilotent leur groupe', async () => {
  await scenarioDeuxVues();

  const boutons = document.querySelectorAll('.vault-actions button.filter-button');
  assert.equal(boutons.length, 2, 'Les deux boutons Filtrer de index.html doivent etre trouves');

  boutons.forEach((bouton) => {
    assert.equal(bouton.listenerCount('click'), 1,
      'DEFAUT 5 : chaque bouton Filtrer doit porter exactement un gestionnaire');
    assert.equal(bouton.disabled, false);

    const groupe = document.getElementById(bouton.getAttribute('aria-controls'));
    assert.ok(groupe, 'Chaque bouton Filtrer doit designer un groupe existant');

    const etatInitial = groupe.hidden;
    assert.equal(bouton.getAttribute('aria-expanded'), etatInitial ? 'false' : 'true',
      'L etat accessible doit decrire l etat reel du groupe');

    bouton.click();
    assert.equal(groupe.hidden, !etatInitial, 'Le clic doit reellement basculer le groupe');
    assert.equal(bouton.getAttribute('aria-expanded'), etatInitial ? 'true' : 'false');

    bouton.click();
    assert.equal(groupe.hidden, etatInitial, 'Un second clic doit retablir l etat initial');
    assert.equal(bouton.getAttribute('aria-expanded'), etatInitial ? 'false' : 'true');
  });
});

check('G2 - aucun bouton de la barre d actions ne reste inerte', async () => {
  await scenarioDeuxVues();

  const boutons = document.querySelectorAll('.vault-actions button');
  const inertes = boutons.filter((bouton) => bouton.listenerCount('click') === 0 && !bouton.disabled);

  assert.deepEqual(inertes.map((b) => b.textContent.trim()), [],
    'Tout bouton de .vault-actions doit soit porter un gestionnaire, '
    + 'soit etre explicitement desactive');
});

// ===========================================================================
// H. Defaut 6 et invariant #41 : categorie persistee, puis effacable
// ===========================================================================

async function ouvrirEnEdition(entryId) {
  const bind = entryModal.initEntryModal({ doc: document });
  const fields = bind.fields || entryModal.initEntryModal({ doc: document }).fields;
  const entree = vaultManager.getEntries().find((item) => item.id === entryId);
  assert.ok(entryModal.openEditModal(fields, entree), 'La fenetre d edition doit s ouvrir');
  return fields;
}

async function soumettre(fields) {
  const formulaire = document.getElementById('entry-form');
  formulaire.dispatchEvent({ type: 'submit', target: formulaire });
  // La soumission est asynchrone : on laisse la chaine de promesses se vider.
  for (let tour = 0; tour < 10; tour += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return fields;
}

check('H1 - ancienne entree SANS categorie : la modification persiste la categorie choisie', async () => {
  await installVault([
    { id: 'h1', title: 'Ancienne entree', username: 'ancien@example.test', password: 'MotDePasse-Ancien-1!' }
  ]);
  entryModal.initEntryModal({ doc: document });
  await viewRefresh.refreshVaultViews();

  const avant = vaultManager.getEntries().find((entry) => entry.id === 'h1');
  assert.equal(avant.category, undefined, 'L entree de depart ne porte aucune categorie');

  const fields = await ouvrirEnEdition('h1');
  fields.category.value = 'banking';
  await soumettre(fields);

  const apres = vaultManager.getEntries().find((entry) => entry.id === 'h1');
  assert.equal(apres.category, 'bank',
    'La categorie choisie doit etre persistee, avec l alias banking -> bank resolu');
  assert.equal(apres.title, 'Ancienne entree', 'Les autres champs sont preserves');
});

check('H2 - « Aucune catégorie » efface reellement la categorie persistee (defaut 6)', async () => {
  await installVault([
    { id: 'h2', title: 'Entree categorisee', username: 'u@example.test', password: 'MotDePasse-Cat-1!', category: 'bank' }
  ]);
  entryModal.initEntryModal({ doc: document });
  await viewRefresh.refreshVaultViews();

  assert.equal(vaultManager.getEntries().find((e) => e.id === 'h2').category, 'bank');

  const fields = await ouvrirEnEdition('h2');
  assert.equal(fields.category.value, 'banking',
    'La fenetre doit refleter la categorie persistee de l entree');

  // Selection de l'option « Aucune catégorie », dont la valeur est vide.
  fields.category.value = '';
  await soumettre(fields);

  const apres = vaultManager.getEntries().find((entry) => entry.id === 'h2');
  assert.equal(apres.category, '',
    'DEFAUT 6 : selectionner « Aucune catégorie » doit effacer la categorie persistee');
  assert.equal(apres.title, 'Entree categorisee', 'Les autres champs restent intacts');
});

check('H3 - une categorie persistee inconnue du markup n est jamais effacee par accident', async () => {
  await installVault([
    { id: 'h3', title: 'Entree heritee', username: 'u@example.test', password: 'MotDePasse-Herite-1!', category: 'other' }
  ]);
  entryModal.initEntryModal({ doc: document });
  await viewRefresh.refreshVaultViews();

  const select = document.getElementById('category');
  const valeursMarkup = select.options.map((option) => option.getAttribute('value'));
  assert.ok(!valeursMarkup.includes('other'),
    'Le pre-requis du test : « other » n est pas une option du markup');

  const fields = await ouvrirEnEdition('h3');
  assert.equal(fields.category.value, 'other',
    'Une option doit avoir ete ajoutee pour representer fidelement l entree');

  await soumettre(fields);

  const apres = vaultManager.getEntries().find((entry) => entry.id === 'h3');
  assert.equal(apres.category, 'other',
    'Une categorie que l utilisateur n a pas touchee ne doit pas etre effacee');

  // L'option ajoutee ne doit pas s'accumuler d'une ouverture a l'autre.
  entryModal.resetEntryForm(fields);
  const apresNettoyage = select.options.map((option) => option.getAttribute('value'));
  assert.deepEqual(apresNettoyage, valeursMarkup,
    'Les options ajoutees dynamiquement doivent etre retirees a la reinitialisation');
});

// ===========================================================================
// I. Invariant #17 : aucune duplication d'ecouteur au niveau APPLICATION
// ===========================================================================

check('I1 - chaque controle raccorde porte exactement un gestionnaire', async () => {
  await scenarioDeuxVues();
  entryModal.initEntryModal({ doc: document });
  viewRefresh.installVaultViewRefresh();
  await viewRefresh.refreshVaultViews();

  const attendus = [
    ['#searchInput', 'input'],
    ['#dashboardSearchInput', 'input'],
    ['#generate-password', 'click'],
    ['#closeAddModal', 'click'],
    ['#cancelAddModalBtn', 'click'],
    ['#addPasswordBtn', 'click']
  ];

  for (const [selecteur, type] of attendus) {
    const noeud = document.querySelector(selecteur);
    assert.ok(noeud, `${selecteur} doit exister dans index.html`);
    assert.equal(noeud.listenerCount(type), 1,
      `${selecteur} doit porter exactement un gestionnaire « ${type} »`);
  }

  document.querySelectorAll('.category-filter .category-btn').forEach((bouton) => {
    assert.equal(bouton.listenerCount('click'), 1,
      'Chaque bouton de categorie doit porter exactement un gestionnaire');
  });

  document.querySelectorAll('.vault-actions button.sort-button').forEach((bouton) => {
    assert.equal(bouton.listenerCount('click'), 1);
  });

  assert.equal(document.getElementById('entry-form').listenerCount('submit'), 1,
    'Le formulaire ne doit avoir qu un seul gestionnaire de soumission');

  // L'abonnement centralise est unique, meme apres plusieurs installations.
  const avant = document.listenerCount('vault:entries-changed');
  viewRefresh.installVaultViewRefresh();
  viewRefresh.installVaultViewRefresh();
  assert.equal(document.listenerCount('vault:entries-changed'), avant,
    'installVaultViewRefresh() doit rester idempotent');
  assert.equal(avant, 1, 'Un seul abonnement a vault:entries-changed');
});

check('I2 - une action utilisateur ne produit qu une seule ecriture', async () => {
  const { db } = await installVault([
    { id: 'i2', title: 'Unique', username: 'u@example.test', password: 'MotDePasse-Unique-1!' }
  ]);
  entryModal.initEntryModal({ doc: document });
  await viewRefresh.refreshVaultViews();

  const fields = await ouvrirEnEdition('i2');
  fields.title.value = 'Unique modifiee';

  const formulaire = document.getElementById('entry-form');
  // Double declenchement immediat, comme un double clic reel.
  formulaire.dispatchEvent({ type: 'submit', target: formulaire });
  formulaire.dispatchEvent({ type: 'submit', target: formulaire });
  for (let tour = 0; tour < 10; tour += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(db.commits, 1,
    'Deux declenchements pour une meme action ne doivent produire qu une ecriture');
  assert.equal(vaultManager.getEntries().find((e) => e.id === 'i2').title, 'Unique modifiee');
});

// ===========================================================================
// J. Hygiene : aucun secret dans les preferences persistees
// ===========================================================================

check('J1 - la recherche n est jamais persistee', async () => {
  await scenarioDeuxVues();

  const champ = document.getElementById('dashboardSearchInput');
  champ.value = 'fragment-de-secret-synthetique';
  champ.dispatchEvent({ type: 'input', target: champ });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const boutonBanque = document.querySelectorAll('#dashboardCategoryFilter .category-btn')
    .find((button) => button.dataset.category === 'bank');
  boutonBanque.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  for (const [cle, valeur] of globalThis.localStorage.map.entries()) {
    assert.ok(!valeur.includes('fragment-de-secret-synthetique'),
      `La cle ${cle} ne doit contenir aucun terme de recherche`);
    assert.ok(!valeur.includes('MotDePasse-'),
      `La cle ${cle} ne doit contenir aucun mot de passe`);
  }

  champ.value = '';
  champ.dispatchEvent({ type: 'input', target: champ });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ===========================================================================
// Execution
// ===========================================================================

console.log('=== TEST LOT 3B INTEGRATION ===');
let echecs = 0;
for (const { label, fn } of results) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
    if (process.env.LOT3B_TRACE) console.error(error);
  }
}

if (echecs > 0) {
  console.error(`Lot 3b integration tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Lot 3b integration tests passed (${results.length} scenarios).`);
}
