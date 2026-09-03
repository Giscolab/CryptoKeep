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
const masterPasswordModal = await import('../scripts/ui/master-password-modal.js');
const auditReport = await import('../scripts/ui/audit-report-view.js');
const settingsControls = await import('../scripts/ui/settings-controls.js');
const appSettings = await import('../scripts/utils/app-settings.js');
const hibp = await import('../scripts/security/hibp-service.js');

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
  // Compteurs remis a zero APRES le deverrouillage : `unlock()` lit et peut
  // reecrire le coffre. Les numeros de lecture utilises par les scenarios
  // sont donc relatifs a l'operation testee, pas au montage.
  db.commits = 0;
  db.aborts = 0;
  db.readCount = 0;
  db.readFailures = 0;
  db.failReadsAt = new Set();
  db.failNextReads = 0;
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

/**
 * Attend qu'une condition devienne vraie, dans une limite de temps.
 *
 * Les gestionnaires de clic sont volontairement « fire and forget » : le
 * bouton ne renvoie pas de promesse. Or deux derivations PBKDF2 a 220 000
 * iterations prennent un temps reel, que quelques tours de boucle ne
 * couvrent pas. Attendre une CONDITION, plutot qu'un nombre arbitraire de
 * tours, garde le chemin reel du bouton sous test sans le rendre fragile.
 */
async function attendreQue(predicat, message, limiteMs = 30000) {
  const echeance = Date.now() + limiteMs;
  for (;;) {
    let satisfait = false;
    try { satisfait = Boolean(predicat()); } catch { satisfait = false; }
    if (satisfait) return true;
    if (Date.now() > echeance) {
      assert.fail(`Condition jamais atteinte (${limiteMs} ms) : ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

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
// A5 a A8. LOT 3C : une base ILLISIBLE n'est pas une base vide
// ---------------------------------------------------------------------------
// Defaut reproduit avant correction : la lecture prealable qui construit
// l'instantane etait enveloppee dans un `catch { snapshot = null; }`. Une
// erreur reelle de lecture etait donc traitee comme « aucun coffre
// precedent », l'ecriture se poursuivait, et une divergence post-commit
// detruisait definitivement le coffre : sortie observee
//   ecriture effectuee : true / coffre precedent perdu : true
// ===========================================================================

check('A5 - lecture prealable en echec : aucune ecriture, coffre intact', async () => {
  const { db } = await installVault([
    { id: 'a5', title: 'Intacte', username: 'u@example.test', password: 'mdp-synthetique-9' }
  ]);

  const avant = persistentFingerprint(db);
  // Lecture 1 = celle du VaultManager, lecture 2 = la prealable de saveVault.
  db.failReadsAt = new Set([2]);

  const error = await captureFailure(
    updateEntry(vaultManager, 'a5', { title: 'Apres', password: 'mdp-synthetique-9' }),
    'Modification avec lecture prealable en echec'
  );

  assert.equal(error.code, 'write_snapshot_unavailable',
    "DEFAUT 3C : une lecture en echec doit etre signalee comme telle, "
    + "et non confondue avec un coffre absent");
  assert.equal(error.written, false, "Rien ne doit avoir ete ecrit");
  assert.equal(error.restored, false);
  assert.equal(db.commits, 0,
    'DEFAUT 3C : aucune ecriture ne doit avoir lieu quand l etat precedent est inconnu');
  assert.equal(db.readFailures, 1, 'La lecture visee doit bien avoir echoue');
  assert.deepEqual(persistentFingerprint(db), avant, 'Le coffre doit rester intact');
});

check('A6 - lecture prealable en echec PUIS divergence : le coffre n est pas perdu', async () => {
  const { db, built } = await installVault([
    { id: 'a6', title: 'Avant', username: 'u@example.test', password: 'mdp-synthetique-10' }
  ]);

  const avant = persistentFingerprint(db);
  db.failReadsAt = new Set([2]);
  db.divergeReadAfterCommit = true;

  const error = await captureFailure(
    updateEntry(vaultManager, 'a6', { title: 'Apres', password: 'mdp-synthetique-10' }),
    'Lecture prealable en echec et divergence post-commit'
  );

  assert.equal(error.code, 'write_snapshot_unavailable');
  assert.equal(error.written, false);
  assert.equal(db.commits, 0,
    "C'est le scenario destructeur : sans instantane, l ecriture ne doit "
    + 'jamais etre tentee, sans quoi la divergence serait irreversible');
  assert.deepEqual(persistentFingerprint(db), avant);

  const conserve = db.peek().entries.find((entry) => entry.id === 'a6');
  const clair = await decryptData(conserve, built.key, {
    additionalData: entryAdditionalData('a6', 2)
  });
  assert.equal(clair.title, 'Avant', 'Le coffre precedent reste dechiffrable');
});

check('A7 - coffre ABSENT : la premiere ecriture reste possible', async () => {
  // La correction ne doit pas transformer un cas normal en refus : un coffre
  // inexistant n'a legitimement rien a restaurer, et `loadVault()` renvoyant
  // `null` n'est pas une erreur.
  const { db, storage, built } = await installVault([
    { id: 'a7', title: 'Base', username: 'u@example.test', password: 'mdp-synthetique-11' }
  ]);

  db.records.clear();
  db.commits = 0;
  assert.equal(db.peek(), null, 'Le pre-requis du test : aucun coffre en base');

  const rapport = await storage.saveVault(built.record.entries, built.record.meta);
  assert.ok(rapport, 'Une premiere creation doit aboutir');
  assert.equal(db.commits, 1, 'Exactement une ecriture');
  assert.ok(db.peek(), 'Le coffre doit exister apres la creation');
  assert.equal(db.peek().entries.length, 1);
});

check('A8 - lecture en echec APRES le commit : restauration, pas de perte', async () => {
  // Distinct de A5 : ici l'ecriture a bien eu lieu, c'est la RELECTURE de
  // verification qui echoue. L'instantane existe, la restauration doit jouer.
  const { db } = await installVault([
    { id: 'a8', title: 'Origine', username: 'u@example.test', password: 'mdp-synthetique-12' }
  ]);

  const avant = persistentFingerprint(db);
  // Lecture 1 = VaultManager, 2 = prealable de saveVault (doit reussir),
  // 3 = relecture de verification (echoue).
  db.failReadsAt = new Set([3]);

  const error = await captureFailure(
    updateEntry(vaultManager, 'a8', { title: 'Apres', password: 'mdp-synthetique-12' }),
    'Relecture de verification en echec'
  );

  assert.equal(error.code, 'write_verification_failed');
  assert.equal(error.restored, true, 'Un instantane etait disponible : il doit servir');
  assert.equal(error.verifiedRestore, true);
  assert.deepEqual(persistentFingerprint(db), avant,
    'Le coffre doit avoir ete ramene a son etat initial');
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

// La garde STATIQUE equivalente — un seul module raccorde le generateur, et
// scripts/app.js n'utilise plus PasswordGenerator — vit dans
// tests/security-no-plaintext.spec.js, qui analyse deja l'integralite de
// scripts/. Elle y couvre aussi les fichiers que ce test d'integration ne
// charge pas, notamment scripts/app.js lui-meme.

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
// K. LOT 4 : la fenetre de changement du mot de passe maitre
// ---------------------------------------------------------------------------
// Le document est le VRAI index.html. Les boutons sont reellement cliques.
// ===========================================================================

const MDP_LOT4_NOUVEAU = 'phrase-de-passe-lot4-integration-neuve';

check('K1 - la fenetre s ouvre et se ferme reellement', async () => {
  await installVault([
    { id: 'k1', title: 'Entree', username: 'u@example.test', password: 'MotDePasse-K1-1!' }
  ]);

  const bind = masterPasswordModal.initMasterPasswordModal({ doc: document });
  assert.ok(bind.bound || bind.reason === 'already_bound',
    'La fenetre de changement doit etre raccordee au document reel');

  const fields = bind.fields || masterPasswordModal.collectChangePasswordFields(document);
  const fenetre = document.getElementById('changePasswordModal');
  const ouvrir = document.getElementById('changePasswordBtn');
  assert.ok(fenetre && ouvrir, 'Les elements doivent exister dans index.html');

  assert.equal(fenetre.classList.contains('active'), false, 'Fermee au depart');

  ouvrir.click();
  assert.equal(fenetre.classList.contains('active'), true,
    'DEFAUT CORRIGE : #changePasswordBtn n avait aucun gestionnaire');
  assert.equal(fenetre.getAttribute('aria-hidden'), 'false');

  document.getElementById('cancelChangeModalBtn').click();
  assert.equal(fenetre.classList.contains('active'), false);
  assert.equal(fenetre.getAttribute('aria-hidden'), 'true');

  ouvrir.click();
  document.getElementById('closeChangeModal').click();
  assert.equal(fenetre.classList.contains('active'), false, 'La croix doit fermer aussi');
  void fields;
});

check('K2 - le pied de fenetre est DANS la boite de dialogue', async () => {
  // Defaut de markup corrige : `.modal-footer` etait un FRERE de `.modal`,
  // donc rendu hors de la fenetre.
  const boite = document.querySelector('#changePasswordModal .modal');
  assert.ok(boite, 'La boite de dialogue doit exister');

  const pied = document.querySelector('#changePasswordModal .modal-footer');
  assert.ok(pied, 'Le pied de fenetre doit exister');
  assert.ok(pied.closest('.modal') === boite,
    'Le pied de fenetre doit etre un descendant de .modal, pas un frere');

  const valider = document.getElementById('confirmChangePasswordBtn');
  assert.ok(valider, 'Le bouton de validation doit avoir un identifiant');
  assert.equal(valider.listenerCount('click'), 1, 'Exactement un gestionnaire');
});

check('K3 - changement complet : coffre rechiffre, champs purges', async () => {
  const { db } = await installVault([
    { id: 'k3a', title: 'Alpha', username: 'a@example.test', password: 'MotDePasse-K3-1!' },
    { id: 'k3b', title: 'Beta', username: 'b@example.test', password: 'MotDePasse-K3-2!' }
  ]);

  const bind = masterPasswordModal.initMasterPasswordModal({ doc: document });
  const fields = bind.fields || masterPasswordModal.collectChangePasswordFields(document);
  const avant = persistentFingerprint(db);

  document.getElementById('changePasswordBtn').click();
  fields.current.value = MDP;
  fields.next.value = MDP_LOT4_NOUVEAU;
  fields.confirm.value = MDP_LOT4_NOUVEAU;

  // Le BOUTON reel est clique : c'est ce chemin qui doit fonctionner.
  const fenetre = document.getElementById('changePasswordModal');
  document.getElementById('confirmChangePasswordBtn').click();

  // Les champs du document sont purges DES la lecture de la saisie, sans
  // attendre la fin des deux derivations PBKDF2.
  assert.equal(fields.current.value, '',
    'Le mot de passe actuel ne doit pas rester dans le document pendant l operation');
  assert.equal(fields.next.value, '');
  assert.equal(fields.confirm.value, '');

  await attendreQue(() => !fenetre.classList.contains('active'),
    'la fenetre doit se fermer apres un changement reussi');

  assert.notDeepEqual(persistentFingerprint(db), avant, 'Le coffre doit avoir ete rechiffre');
  assert.equal(db.commits, 1, 'Une seule ecriture');
  assert.equal(db.peek().entries.length, 2, 'Les deux entrees doivent survivre');

  // Les champs sont purges et remasques.
  for (const champ of [fields.current, fields.next, fields.confirm]) {
    assert.equal(champ.value, '', 'Le champ doit etre vide apres un changement');
    assert.equal(champ.type, 'password', 'Le champ doit etre remasque');
  }
  assert.equal(fenetre.classList.contains('active'), false,
    'La fenetre doit se fermer apres un succes');

  // La session continue avec la nouvelle cle.
  assert.equal(vaultManager.getEntries().length, 2);
  assert.equal(vaultManager.masterKey.extractable, false);
});

check('K4 - refus : message generique affiche, champs purges, fenetre ouverte', async () => {
  const { db } = await installVault([
    { id: 'k4', title: 'Gamma', username: 'g@example.test', password: 'MotDePasse-K4-1!' }
  ]);

  const bind = masterPasswordModal.initMasterPasswordModal({ doc: document });
  const fields = bind.fields || masterPasswordModal.collectChangePasswordFields(document);
  const avant = persistentFingerprint(db);

  document.getElementById('changePasswordBtn').click();
  fields.current.value = 'mot-de-passe-actuel-faux-synthetique';
  fields.next.value = MDP_LOT4_NOUVEAU;
  fields.confirm.value = MDP_LOT4_NOUVEAU;

  document.getElementById('confirmChangePasswordBtn').click();
  await attendreQue(() => document.getElementById('changePasswordMessage').hidden === false,
    'un message de refus doit apparaitre');

  assert.equal(db.commits, 0, 'Aucune ecriture apres un refus');
  assert.deepEqual(persistentFingerprint(db), avant, 'Le coffre doit etre intact');

  const message = document.getElementById('changePasswordMessage');
  assert.equal(message.hidden, false, 'Un message doit etre affiche');
  assert.ok(message.textContent.length > 0);
  assert.ok(!message.textContent.includes(MDP)
    && !message.textContent.includes(MDP_LOT4_NOUVEAU),
  'Aucun mot de passe ne doit apparaitre a l ecran');
  for (const terme of ['PBKDF2', 'AES', 'GCM', 'AAD', 'ciphertext']) {
    assert.ok(!message.textContent.includes(terme),
      `Le message ne doit pas reveler « ${terme} »`);
  }

  // Les champs sont purges meme en cas d'echec, et la fenetre reste ouverte.
  for (const champ of [fields.current, fields.next, fields.confirm]) {
    assert.equal(champ.value, '', 'Le champ doit etre vide apres un refus');
    assert.equal(champ.type, 'password');
  }
  assert.equal(document.getElementById('changePasswordModal').classList.contains('active'), true,
    'La fenetre reste ouverte pour permettre une nouvelle tentative');

  masterPasswordModal.closeChangePasswordModal(fields);
});

check('K5 - confirmation differente : refus immediat, aucune lecture du coffre', async () => {
  const { db } = await installVault([
    { id: 'k5', title: 'Delta', username: 'd@example.test', password: 'MotDePasse-K5-1!' }
  ]);

  const bind = masterPasswordModal.initMasterPasswordModal({ doc: document });
  const fields = bind.fields || masterPasswordModal.collectChangePasswordFields(document);

  document.getElementById('changePasswordBtn').click();
  fields.current.value = MDP;
  fields.next.value = MDP_LOT4_NOUVEAU;
  fields.confirm.value = `${MDP_LOT4_NOUVEAU}-different`;

  document.getElementById('confirmChangePasswordBtn').click();
  await attendreQue(() => document.getElementById('changePasswordMessage').hidden === false,
    'un message de refus doit apparaitre');

  assert.equal(db.commits, 0);
  assert.equal(db.readCount, 0,
    'Une confirmation differente est refusee AVANT toute lecture du coffre');
  assert.match(document.getElementById('changePasswordMessage').textContent, /correspondent pas/);

  masterPasswordModal.closeChangePasswordModal(fields);
});

check('K6 - fermer la fenetre purge les champs saisis', async () => {
  await installVault([]);
  const bind = masterPasswordModal.initMasterPasswordModal({ doc: document });
  const fields = bind.fields || masterPasswordModal.collectChangePasswordFields(document);

  document.getElementById('changePasswordBtn').click();
  fields.current.value = 'saisie-abandonnee-synthetique';
  fields.next.value = 'autre-saisie-abandonnee';
  fields.confirm.value = 'autre-saisie-abandonnee';
  fields.current.type = 'text';

  document.getElementById('cancelChangeModalBtn').click();

  for (const champ of [fields.current, fields.next, fields.confirm]) {
    assert.equal(champ.value, '', 'Annuler doit vider les champs');
    assert.equal(champ.type, 'password', 'Annuler doit remasquer les champs');
  }
  assert.equal(document.getElementById('changePasswordMessage').hidden, true);
});

check('K7 - indicateur de solidite : rien d allume pour un champ vide', async () => {
  await installVault([]);
  const bind = masterPasswordModal.initMasterPasswordModal({ doc: document });
  const fields = bind.fields || masterPasswordModal.collectChangePasswordFields(document);

  const points = () => document
    .querySelectorAll('#changePasswordStrength .strength-dot')
    .filter((dot) => dot.classList.contains('active')).length;

  document.getElementById('changePasswordBtn').click();
  assert.equal(points(), 0,
    'Un indicateur ne doit afficher aucun niveau tant qu il n a rien analyse');

  fields.next.value = 'phrase-de-passe-longue-et-variee-9!';
  fields.next.dispatchEvent({ type: 'input', target: fields.next });
  assert.ok(points() > 0, 'Une saisie solide doit allumer des points');

  fields.next.value = '';
  fields.next.dispatchEvent({ type: 'input', target: fields.next });
  assert.equal(points(), 0, 'Effacer la saisie doit tout eteindre');

  masterPasswordModal.closeChangePasswordModal(fields);
});

check('K8 - raccordement idempotent', async () => {
  const rebind = masterPasswordModal.initMasterPasswordModal({ doc: document });
  assert.equal(rebind.bound, false);
  assert.equal(rebind.reason, 'already_bound');

  assert.equal(document.getElementById('changePasswordBtn').listenerCount('click'), 1);
  assert.equal(document.getElementById('confirmChangePasswordBtn').listenerCount('click'), 1);
  assert.equal(document.getElementById('cancelChangeModalBtn').listenerCount('click'), 1);
  assert.equal(document.getElementById('closeChangeModal').listenerCount('click'), 1);
});

// ===========================================================================
// L. LOT 6 : rapport de securite veridique
// ---------------------------------------------------------------------------
// Le document est le VRAI index.html : ce qui est verifie ici, c'est que le
// markup livre ne contient plus de valeurs inventees, et que le rapport rendu
// provient d'un audit reellement execute.
// ===========================================================================

check('L1 - le markup ne contient plus AUCUNE valeur fictive', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // Les commentaires documentent le defaut corrige : ils sont exclus.
  const visible = source.replace(/<!--[\s\S]*?-->/g, '');

  for (const invente of ['NetBank', 'password123', 'qwerty',
    'Compte de réseau social', 'Achat en ligne', '30 derniers jours',
    'Évolution de la santé']) {
    assert.ok(!visible.includes(invente),
      `Le markup ne doit plus contenir la valeur inventee « ${invente} »`);
  }

  // Aucun mot de passe en clair ne doit subsister dans la page.
  assert.ok(!/Mot de passe\s*:\s*"/.test(visible),
    'Un mot de passe etait ecrit en clair dans le markup du rapport');

  // Les compteurs LIVRES doivent etre vierges. Sans cette verification, un
  // chiffre code en dur passerait inapercu tant que le moteur le recouvre au
  // premier rendu : l'utilisateur le verrait pourtant avant tout calcul,
  // coffre verrouille compris.
  const compteurs = [
    'report-score', 'report-weak', 'report-reused', 'report-old',
    'report-no-url', 'report-no-category', 'report-breached',
    'stats-score', 'stats-score-ring', 'stats-total', 'stats-weak',
    'stats-reused', 'stats-old', 'stats-weak-in-info'
  ];

  // Analyse par decoupage plutot que par expression reguliere construite :
  // pas de RegExp non litterale, et le decoupage est plus lisible.
  for (const id of compteurs) {
    const marqueur = `id="${id}"`;
    const debut = visible.indexOf(marqueur);
    assert.notEqual(debut, -1, `#${id} doit exister dans index.html`);

    const finBalise = visible.indexOf('>', debut);
    const finContenu = visible.indexOf('<', finBalise);
    const contenu = visible.slice(finBalise + 1, finContenu).trim();

    assert.equal(contenu, '—',
      `#${id} contient la valeur codee en dur « ${contenu} » : `
      + 'elle serait affichee avant tout calcul');
  }

  // Et aucun pourcentage en dur ne doit subsister nulle part dans la page.
  const pourcentages = visible.match(/>\s*\d{1,3}\s*%\s*</g) || [];
  assert.deepEqual(pourcentages, [],
    `Pourcentages codes en dur trouves : ${pourcentages.join(', ')}`);
});

check('L2 - les compteurs affichent « — » tant qu aucun audit n a tourne', async () => {
  await installVault([
    { id: 'l2', title: 'Entree', username: 'u@example.test', password: 'MotDePasse-L2-1!' }
  ]);

  auditReport.clearAuditReport({ doc: document });

  for (const id of ['report-score', 'report-weak', 'report-reused', 'report-old',
    'report-no-url', 'report-no-category', 'report-breached']) {
    const node = document.getElementById(id);
    assert.ok(node, `#${id} doit exister dans index.html`);
    assert.equal(node.textContent, '—',
      `#${id} ne doit afficher aucun chiffre avant un audit`);
  }

  assert.match(document.getElementById('auditStatus').textContent, /non encore exécuté|verrouillé/i,
    'L etat doit etre annonce honnetement');
});

check('L3 - un audit reel remplit le rapport avec les donnees du coffre', async () => {
  await installVault([
    { id: 'a', title: 'Solide', username: 'a@example.test', password: 'x7$Qm2!vLp9Zk', url: 'https://a.test', category: 'bank' },
    { id: 'b', title: 'Faible', username: 'b@example.test', password: 'azerty2024', url: 'https://b.test', category: 'social' },
    { id: 'c', title: 'Partage1', username: 'c@example.test', password: 'MemeMotDePasse-1!', url: 'https://c.test', category: 'cloud' },
    { id: 'd', title: 'Partage2', username: 'd@example.test', password: 'MemeMotDePasse-1!' }
  ]);

  const rapport = await auditReport.runAndRenderAudit({ doc: document });

  assert.equal(rapport.status, 'completed');
  assert.equal(document.getElementById('report-score').textContent, `${rapport.score.value}%`);
  assert.equal(document.getElementById('report-reused').textContent, '2');
  assert.equal(document.getElementById('report-no-url').textContent, '1');
  assert.equal(document.getElementById('report-no-category').textContent, '1');
  assert.equal(document.getElementById('report-breached').textContent, '—',
    'La compromission n a pas ete verifiee : « — », jamais « 0 »');

  assert.match(document.getElementById('auditStatus').textContent, /Audit exécuté le/);
  assert.ok(document.getElementById('auditFindings').children.length > 0,
    'Les constats doivent etre rendus');
  assert.ok(document.getElementById('auditReuseGroups').children.length > 0,
    'Le groupe de reutilisation doit etre rendu');
  assert.ok(document.getElementById('auditScope').children.length > 0,
    'La portee de l audit doit etre affichee');
});

check('L4 - AUCUN mot de passe rendu dans le rapport affiche', async () => {
  const secrets = ['x7$Qm2!vLp9Zk', 'azerty2024', 'MemeMotDePasse-1!'];
  for (const conteneur of ['auditFindings', 'auditReuseGroups', 'auditScope']) {
    const texte = document.getElementById(conteneur).textContent;
    for (const secret of secrets) {
      assert.ok(!texte.includes(secret),
        `Le conteneur #${conteneur} ne doit afficher aucun mot de passe`);
    }
  }
});

check('L5 - chaque constat porte une action REELLE', async () => {
  // Le raccordement re-rend le conteneur : les fiches doivent etre relues
  // APRES, sinon on manipulerait des noeuds detaches de l'arbre.
  entryModal.initEntryModal({ doc: document });
  auditReport.initAuditReport({ doc: document });

  const constats = document.getElementById('auditFindings').children
    .filter((child) => child.classList.contains('vulnerability-item'));
  assert.ok(constats.length > 0);

  for (const constat of constats) {
    const bouton = constat.querySelector('[data-audit-action="edit"]');
    assert.ok(bouton, 'Chaque constat doit porter un bouton d action');
    assert.ok(bouton.dataset.entryId, 'Le bouton doit designer une entree precise');
    // Ce que l action NE fait PAS est dit explicitement.
    assert.match(bouton.title, /ne peut pas changer le mot de passe sur le site/i,
      'L infobulle doit expliquer pourquoi une intervention manuelle reste necessaire');
  }

  // Le clic ouvre reellement la fenetre d edition. La delegation d'evenements
  // impose que l'evenement remonte du bouton jusqu'au conteneur.
  const premier = constats[0].querySelector('[data-audit-action="edit"]');
  premier.click();

  const fenetre = document.getElementById('passwordModal');
  assert.ok(fenetre.classList.contains('active'),
    'Le bouton doit ouvrir la fenetre d edition de l entree');
  assert.equal(document.getElementById('entry-title').value, constats[0].querySelector('strong').textContent,
    'La fenetre doit etre pre-remplie avec l entree designee');

  entryModal.closeEntryModal(
    entryModal.initEntryModal({ doc: document }).fields
      || (() => { const b = entryModal.initEntryModal({ doc: document }); return b.fields; })()
  );
});

check('L6 - les quatre actions du tableau de bord sont raccordees', async () => {
  const resultat = auditReport.initDashboardMetricActions({ doc: document });
  assert.equal(resultat.bound, 4, 'Les quatre cartes doivent etre raccordees');

  const boutons = document.querySelectorAll('[data-metric-action]');
  assert.equal(boutons.length, 4);
  for (const bouton of boutons) {
    assert.equal(bouton.tagName, 'BUTTON',
      'Une action doit etre un bouton, pas un <div> inerte');
    assert.equal(bouton.listenerCount('click'), 1);
    assert.ok(bouton.title.length > 0, 'Chaque action doit expliquer ce qu elle fait');
  }

  let recu = null;
  const ecouteur = (event) => { recu = event.detail.action; };
  document.addEventListener('vault:metric-action', ecouteur);
  boutons.find((b) => b.dataset.metricAction === 'reused').click();
  document.removeEventListener('vault:metric-action', ecouteur);
  assert.equal(recu, 'reused', 'Le clic doit reellement declencher la navigation');
});

check('L7 - le rapport est efface au verrouillage', async () => {
  await installVault([
    { id: 'l7', title: 'Entree', username: 'u@example.test', password: 'MotDePasse-L7-1!' }
  ]);
  await auditReport.runAndRenderAudit({ doc: document });
  assert.equal(auditReport.getLastAuditReport().status, 'completed');

  const efface = auditReport.clearAuditReport({ doc: document });
  assert.equal(efface.cleared, true, 'Le nettoyage doit etre verifiable');
  assert.equal(auditReport.getLastAuditReport().status, 'not_run');
  assert.equal(document.getElementById('report-score').textContent, '—',
    'L affichage doit revenir a l etat non calcule');
});

check('L8 - coffre verrouille : aucun mot de passe demande', async () => {
  const faux = { masterKey: null, getEntries: () => [] };
  const rapport = await auditReport.runAndRenderAudit({ doc: document, vaultManager: faux });

  assert.equal(rapport.status, 'not_run');
  assert.match(rapport.message, /verrouill/i);
  assert.equal(document.getElementById('changePasswordModal').classList.contains('active'), false,
    'Aucune fenetre de saisie de mot de passe ne doit s ouvrir');
  assert.equal(document.getElementById('report-score').textContent, '—');
});

check('L9 - les scripts a valeurs fictives ne sont plus charges', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const balises = source.match(/<script[^>]*src="[^"]+"/g) || [];
  const charges = balises.map((b) => b.match(/src="([^"]+)"/)[1]);

  for (const interdit of ['scripts/tools/audit-crypto.js', 'scripts/ui/audit-panel.js']) {
    assert.ok(!charges.some((src) => src.includes(interdit)),
      `${interdit} ne doit plus etre charge : simulations GPU et demande de mot de passe inutile`);
  }

  // Mais les fichiers restent presents dans le depot.
  const { existsSync } = await import('node:fs');
  for (const conserve of ['../scripts/tools/audit-crypto.js', '../scripts/ui/audit-panel.js']) {
    assert.ok(existsSync(new URL(conserve, import.meta.url)),
      `${conserve} doit rester conserve dans le depot`);
  }
});

check('L10 - Chart.min.js : la casse referencee correspond au fichier reel', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const reference = (source.match(/src="(scripts\/vendor\/[^"]*hart[^"]*)"/i) || [])[1];
  assert.ok(reference, 'index.html doit referencer la bibliotheque de graphiques');

  const fichiers = readdirSync(new URL('../scripts/vendor/', import.meta.url));
  const nom = reference.split('/').pop();
  assert.ok(fichiers.includes(nom),
    `« ${nom} » doit exister exactement sous ce nom : sur un systeme sensible `
    + `a la casse, toute autre variante echouerait. Presents : ${fichiers.join(', ')}`);

  const loader = await import('../scripts/ui/chart-loader.js');
  assert.ok(loader.CHART_PATHS.includes(reference),
    'Le chargeur de secours doit connaitre le chemin reference par la page');
  assert.equal(loader.resolveChart({}), null, 'Absence detectee honnetement');
});

// ===========================================================================
// M. LOT 7 : reglages et fonctions annoncees
// ===========================================================================

check('M1 - tous les reglages raccordables portent un identifiant', async () => {
  const attendus = [
    'setting-clipboard-clear', 'setting-clipboard-seconds',
    'setting-generator-length', 'setting-generator-digits', 'setting-generator-symbols',
    'setting-security-alerts', 'setting-hibp',
    'autolock-enabled', 'autolock-delay', 'autolock-on-hidden',
    'theme-select', 'launch-audit-ui'
  ];
  for (const id of attendus) {
    assert.ok(document.getElementById(id), `#${id} doit exister dans index.html`);
  }
});

check('M2 - AUCUNE bascule sans identifiant ne subsiste dans les reglages', async () => {
  const vue = document.getElementById('settings-view');
  const bascules = vue.querySelectorAll('input');
  const anonymes = bascules.filter((n) => n.getAttribute('type') === 'checkbox' && !n.id);

  assert.deepEqual(anonymes, [],
    'Cinq bascules etaient livrees sans identifiant ni gestionnaire, '
    + 'dont trois cochees par defaut : elles annoncaient une protection absente');
});

check('M3 - les reglages sont reellement raccordes', async () => {
  const resultat = settingsControls.initSettingsControls({ doc: document });
  assert.ok(resultat.bound, 'Le panneau doit etre raccorde');
  assert.ok(resultat.controls >= 7, `Au moins 7 controles attendus, obtenu ${resultat.controls}`);

  for (const id of ['setting-clipboard-clear', 'setting-clipboard-seconds',
    'setting-generator-length', 'setting-generator-digits',
    'setting-generator-symbols', 'setting-security-alerts', 'setting-hibp']) {
    assert.equal(document.getElementById(id).listenerCount('change'), 1,
      `#${id} doit porter exactement un gestionnaire`);
  }
  assert.equal(document.getElementById('launch-audit-ui').listenerCount('click'), 1);

  // Idempotent.
  assert.equal(settingsControls.initSettingsControls({ doc: document }).bound, false);
});

check('M4 - modifier un reglage le PERSISTE reellement', async () => {
  const duree = document.getElementById('setting-clipboard-seconds');
  duree.value = '120';
  duree.dispatchEvent({ type: 'change', target: duree });

  assert.equal(appSettings.readSettings().clipboardClearSeconds, 120,
    'La valeur choisie doit etre persistee');

  const longueur = document.getElementById('setting-generator-length');
  longueur.value = '32';
  longueur.dispatchEvent({ type: 'change', target: longueur });
  assert.equal(appSettings.generatorOptionsFromSettings().length, 32,
    'Le reglage du generateur doit etre reellement applique');
});

check('M4b - le bouton « Générer » applique REELLEMENT le reglage', async () => {
  // Verifier `generatorOptionsFromSettings()` ne prouve rien : ce qui compte
  // est que la fenetre d'entree s'en serve. Le vrai bouton est donc clique.
  await installVault([]);
  entryModal.initEntryModal({ doc: document });
  const champ = document.getElementById('password');
  const bouton = document.getElementById('generate-password');

  for (const longueur of [12, 32, 48]) {
    const select = document.getElementById('setting-generator-length');
    select.value = String(longueur);
    select.dispatchEvent({ type: 'change', target: select });

    champ.value = '';
    bouton.click();
    assert.equal(champ.value.length, longueur,
      `Le reglage « ${longueur} caractères » doit produire un mot de passe de cette longueur`);
  }

  // Et les classes de caracteres sont respectees.
  const symboles = document.getElementById('setting-generator-symbols');
  const chiffres = document.getElementById('setting-generator-digits');
  symboles.checked = false;
  symboles.dispatchEvent({ type: 'change', target: symboles });
  chiffres.checked = false;
  chiffres.dispatchEvent({ type: 'change', target: chiffres });

  champ.value = '';
  bouton.click();
  assert.ok(!/[^A-Za-z]/.test(champ.value),
    `Chiffres et symboles exclus, obtenu : ${champ.value.replace(/[A-Za-z]/g, '·')}`);

  // Retablissement des defauts pour les scenarios suivants.
  symboles.checked = true;
  symboles.dispatchEvent({ type: 'change', target: symboles });
  chiffres.checked = true;
  chiffres.dispatchEvent({ type: 'change', target: chiffres });
  champ.value = '';
});

check('M5 - desactiver l effacement grise la duree', async () => {
  const bascule = document.getElementById('setting-clipboard-clear');
  const duree = document.getElementById('setting-clipboard-seconds');

  bascule.checked = false;
  bascule.dispatchEvent({ type: 'change', target: bascule });
  assert.equal(appSettings.readSettings().clipboardClearEnabled, false);
  assert.equal(duree.disabled, true, 'Une duree sans effacement n a pas de sens');

  bascule.checked = true;
  bascule.dispatchEvent({ type: 'change', target: bascule });
  assert.equal(duree.disabled, false);
});

check('M6 - 2FA et remplissage automatique : desactives et documentes', async () => {
  for (const [id, badge] of [['setting-2fa', 'badge-2fa'], ['setting-autofill', 'badge-autofill']]) {
    const controle = document.getElementById(id);
    assert.ok(controle, `#${id} doit rester VISIBLE, pas supprime`);
    assert.equal(controle.disabled, true,
      `#${id} ne doit pas pouvoir etre coche : il ne protegerait rien`);
    assert.equal(controle.getAttribute('checked'), null,
      'Une fonction absente ne doit jamais etre livree comme active');
    assert.equal(controle.listenerCount('change'), 0,
      'Aucun gestionnaire ne doit simuler un effet');

    assert.match(document.getElementById(badge).textContent, /non disponible/i);
  }

  // Le document d'analyse existe reellement.
  const { existsSync } = await import('node:fs');
  assert.ok(existsSync(new URL('../docs/2FA-WEBAUTHN-AUTOFILL.md', import.meta.url)),
    'Le modele de menace doit exister, pas seulement etre promis');
});

check('M7 - HIBP : desactive par defaut, consentement affiche', async () => {
  const bascule = document.getElementById('setting-hibp');
  assert.equal(bascule.checked, false, 'La fonction reseau doit etre desactivee par defaut');
  assert.equal(hibp.isHibpEnabled(), false);

  // Le texte de consentement est REELLEMENT affiche, pas seulement disponible.
  const notice = document.getElementById('hibp-notice-body').textContent;
  assert.match(notice, /jamais envoye/i);
  assert.match(notice, /5 premiers caracteres/i);
  assert.match(notice, /adresse IP/i);
  assert.match(notice, /api\.pwnedpasswords\.com/);
});

check('M8 - activer HIBP exige une action explicite et le dit', async () => {
  const bascule = document.getElementById('setting-hibp');

  bascule.checked = true;
  bascule.dispatchEvent({ type: 'change', target: bascule });

  assert.equal(hibp.isHibpEnabled(), true, 'Le consentement doit etre enregistre');
  assert.match(document.getElementById('badge-hibp').textContent, /activ/i);
  assert.match(document.getElementById('desc-hibp').textContent, /adresse IP/i,
    'L etat actif doit rappeler ce que le service voit');

  bascule.checked = false;
  bascule.dispatchEvent({ type: 'change', target: bascule });
  assert.equal(hibp.isHibpEnabled(), false);
  assert.match(document.getElementById('desc-hibp').textContent, /Aucune requête/i,
    'L etat inactif doit dire qu aucune requete n est emise');
});

check('M9 - le bouton d audit des reglages est raccorde au moteur du Lot 6', async () => {
  await installVault([
    { id: 'm9', title: 'Entree', username: 'u@example.test', password: 'MotDePasse-M9-1!' }
  ]);
  auditReport.clearAuditReport({ doc: document });

  let navigation = null;
  const ecouteur = (event) => { navigation = event.detail.view; };
  document.addEventListener('vault:navigate', ecouteur);

  document.getElementById('launch-audit-ui').click();
  await attendreQue(() => auditReport.getLastAuditReport().status === 'completed',
    'l audit lance depuis les reglages doit aboutir');

  document.removeEventListener('vault:navigate', ecouteur);
  assert.equal(navigation, 'security-report-view', 'Le bouton doit mener au rapport');
  assert.equal(auditReport.getLastAuditReport().scope.entryCount, 1);
});

check('M10 - le profil n affiche plus de fausse identite', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const visible = source.replace(/<!--[\s\S]*?-->/g, '');

  assert.ok(!visible.includes('John Doe'), 'Le champ nom portait une identite fictive');
  assert.ok(!visible.includes('john.doe@example.com'));
  assert.equal(document.getElementById('name').value, '');
  assert.equal(document.getElementById('email').value, '');
});

check('M11 - la description du presse-papiers ne promet plus rien', async () => {
  const description = document.getElementById('desc-clipboard').textContent;
  assert.match(description, /essaie|tentative/i,
    'Le libelle doit dire « tentative », pas « effacer »');
  assert.match(description, /pas garantie/i);
  assert.match(description, /rien n'est écrasé|rien n'est ecrase/i,
    'La preservation d une copie ulterieure doit etre annoncee');
  assert.ok(!description.includes('60 secondes'),
    'La description annoncait 60 s alors que le delai reel etait de 30 s');
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
