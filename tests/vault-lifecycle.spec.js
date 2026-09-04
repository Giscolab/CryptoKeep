/**
 * Lot 9 - Cycle de vie complet du coffre, au niveau du VRAI VaultManager.
 *
 * Les tests existants couvraient la migration, les operations d entree et le
 * changement de mot de passe maitre. Le cycle NOMINAL — creation, ouverture
 * correcte, refus d un mauvais mot de passe, verrouillage, purge de session —
 * n etait verifie nulle part de bout en bout. C est pourtant le chemin que
 * l utilisateur emprunte a chaque demarrage.
 *
 * ISOLEMENT : `MemoryVaultStorage` ci-dessous ne touche ni IndexedDB, ni
 * localStorage, ni le disque. Aucun `.vault` reel n est lu.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { VaultManager } from '../scripts/core/vault/manager.js';
import { validateNewMasterPassword } from '../scripts/security/master-password-policy.js';
import {
  CURRENT_VAULT_FORMAT_VERSION,
  CURRENT_PBKDF2_ITERATIONS
} from '../scripts/core/storage/vault-format.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const MDP = 'Coffre-De-Test-Synthetique-2026!';

/** Stockage en memoire, fidele au contrat attendu par VaultManager. */
class MemoryVaultStorage {
  constructor() { this.record = null; this.writes = 0; }
  async initializeDB() {}
  async loadVault() { return this.record ? structuredClone(this.record) : null; }
  async saveVault(entries, meta) {
    this.writes += 1;
    this.record = { id: 'current', entries: structuredClone(entries), meta: structuredClone(meta) };
  }
}

async function coffreNeuf() {
  const storage = new MemoryVaultStorage();
  const manager = new VaultManager({ storage });
  await manager.createVault(MDP);
  return { storage, manager };
}

// ===========================================================================
// 1. Creation
// ===========================================================================

test('L1 - CREATION : le coffre est ecrit, chiffre, et la session est ouverte', async () => {
  const { storage, manager } = await coffreNeuf();

  assert.ok(storage.record, 'Un coffre doit avoir ete ecrit');
  assert.equal(storage.record.id, 'current');
  assert.deepEqual(storage.record.entries, [], 'Un coffre neuf n a aucune entree');
  assert.equal(storage.record.meta.version, CURRENT_VAULT_FORMAT_VERSION);
  assert.equal(storage.record.meta.iterations, CURRENT_PBKDF2_ITERATIONS);
  assert.ok(storage.record.meta.salt, 'Un sel doit avoir ete tire');
  assert.ok(storage.record.meta.validation, 'Un bloc de validation doit exister');
  assert.notEqual(manager.masterKey, null, 'La session doit etre ouverte apres creation');
});

test('L2 - CREATION : le mot de passe maitre n apparait NULLE PART', async () => {
  const { storage } = await coffreNeuf();
  const serialise = JSON.stringify(storage.record);
  assert.ok(!serialise.includes(MDP),
    'Le mot de passe maitre ne doit jamais etre persiste, sous aucune forme');
  assert.ok(!serialise.includes('check'),
    'Le contenu du bloc de validation doit etre chiffre, pas lisible');
});

test('L3 - CREATION refusee si un coffre existe deja', async () => {
  const { manager } = await coffreNeuf();
  await assert.rejects(() => manager.createVault('Un-Autre-Mot-De-Passe-2026!'),
    'Creer par-dessus un coffre existant l ecraserait');
});

test('L4 - deux coffres crees avec le MEME mot de passe ont des sels differents', async () => {
  const a = await coffreNeuf();
  const b = await coffreNeuf();
  assert.notEqual(a.storage.record.meta.salt, b.storage.record.meta.salt,
    'Un sel partage permettrait d attaquer deux coffres pour le prix d un');
});

// ===========================================================================
// 2. Politique de mot de passe maitre
// ===========================================================================

test('L5 - MOT DE PASSE FAIBLE : refuse par la politique', async () => {
  const faibles = ['', 'court', '12345678', 'aaaaaaaaaaaa', 'password', 'AZERTYUIOP'];
  for (const faible of faibles) {
    const verdict = validateNewMasterPassword(faible);
    assert.equal(verdict.valid, false, `Mot de passe faible accepte : « ${faible} »`);
    assert.ok(typeof verdict.message === 'string' && verdict.message.length > 0,
      'Un refus doit expliquer ce qui manque');
    // La chaine vide est contenue dans toute chaine : la verification n a de
    // sens que sur une saisie non vide.
    if (faible.length > 0) {
      assert.ok(!verdict.message.includes(faible),
        `Le message de refus rejoue la saisie « ${faible} »`);
    }
  }
});

test('L6 - une phrase de passe longue est acceptee sans regle de composition', () => {
  assert.equal(validateNewMasterPassword('correct-horse-battery-staple').valid, true);
});

// ===========================================================================
// 3. Ouverture
// ===========================================================================

test('L7 - DEVERROUILLAGE CORRECT : la session s ouvre et les entrees reviennent', async () => {
  const { storage } = await coffreNeuf();

  // Nouveau manager sur le MEME stockage : c'est exactement ce que fait un
  // redemarrage du navigateur.
  const manager = new VaultManager({ storage });
  const entrees = await manager.unlock(MDP);

  assert.ok(Array.isArray(entrees), 'unlock doit rendre la liste des entrees');
  assert.notEqual(manager.masterKey, null, 'La cle de session doit etre en place');
});

test('L8 - MAUVAIS MOT DE PASSE : refus, et AUCUNE session ouverte', async () => {
  const { storage } = await coffreNeuf();
  const manager = new VaultManager({ storage });

  for (const mauvais of [`${MDP} `, MDP.toLowerCase(), MDP.slice(0, -1), 'autre-chose']) {
    await assert.rejects(() => manager.unlock(mauvais),
      `Mot de passe accepte a tort : « ${mauvais} »`);
    assert.ok(!manager.masterKey,
      'Un echec d ouverture ne doit laisser aucune cle en session');
    assert.deepEqual(manager.getEntries(), [],
      'Un echec d ouverture ne doit exposer aucune entree');
  }
});

test('L9 - un echec d ouverture n ECRIT rien', async () => {
  const { storage } = await coffreNeuf();
  const avant = JSON.stringify(storage.record);
  const ecrituresAvant = storage.writes;

  const manager = new VaultManager({ storage });
  await assert.rejects(() => manager.unlock('mauvais-mot-de-passe'));

  assert.equal(JSON.stringify(storage.record), avant, 'Le coffre doit rester intact');
  assert.equal(storage.writes, ecrituresAvant, 'Aucune ecriture ne doit avoir eu lieu');
});

test('L10 - le message d echec reste GENERIQUE', async () => {
  const { storage } = await coffreNeuf();
  const manager = new VaultManager({ storage });

  const erreur = await manager.unlock('mauvais').catch((e) => e);
  const texte = `${erreur.name} ${erreur.message}`;
  assert.ok(!texte.includes('mauvais'), 'Le message ne doit pas rejouer la saisie');
  assert.ok(!/PBKDF2|AES|iterations|salt|sel/i.test(texte),
    `Le message ne doit pas reveler la cause cryptographique. Recu : ${texte}`);
});

// ===========================================================================
// 4. Cycle complet : ajout, redemarrage, relecture
// ===========================================================================

test('L11 - CYCLE COMPLET : ajout, fermeture, reouverture, l entree est intacte', async () => {
  const { storage, manager } = await coffreNeuf();

  await manager.addEntry({
    title: 'Service de test', username: 'utilisateur-test',
    password: 'MotDePasse-Entree-1!', url: 'https://exemple.invalid'
  });
  manager.clearSession();

  const apresRedemarrage = new VaultManager({ storage });
  const entrees = await apresRedemarrage.unlock(MDP);

  assert.equal(entrees.length, 1, 'L entree doit survivre a la fermeture de session');
  assert.equal(entrees[0].title, 'Service de test');
  assert.equal(entrees[0].password, 'MotDePasse-Entree-1!',
    'Le mot de passe doit etre restitue a l identique');
});

test('L12 - le coffre PERSISTE est chiffre : aucun champ en clair', async () => {
  const { storage, manager } = await coffreNeuf();
  await manager.addEntry({
    title: 'Titre-Reconnaissable-XYZ', username: 'utilisateur-Reconnaissable',
    password: 'MotDePasse-Reconnaissable-99!', url: 'https://reconnaissable.invalid'
  });

  const serialise = JSON.stringify(storage.record);
  for (const clair of ['Titre-Reconnaissable-XYZ', 'utilisateur-Reconnaissable',
    'MotDePasse-Reconnaissable-99!', 'reconnaissable.invalid']) {
    assert.ok(!serialise.includes(clair), `Champ persiste EN CLAIR : « ${clair} »`);
  }
});

test('L13 - chaque entree persistee porte son PROPRE IV', async () => {
  const { storage, manager } = await coffreNeuf();
  for (let i = 0; i < 25; i += 1) {
    await manager.addEntry({ title: `S${i}`, username: `u${i}`, password: 'Identique-Partout-1!' });
  }

  const ivs = storage.record.entries.map((e) => e.iv);
  assert.equal(new Set(ivs).size, ivs.length,
    'Des mots de passe identiques ne doivent pas produire deux fois le meme IV');
});

// ===========================================================================
// 5. Verrouillage et purge de session
// ===========================================================================

test('L14 - VERROUILLAGE : cle, sel et entrees dechiffrees disparaissent', async () => {
  const { manager } = await coffreNeuf();
  await manager.addEntry({ title: 'A effacer', username: 'u', password: 'Secret-En-Memoire-7!' });

  manager.clearSession();

  assert.equal(manager.masterKey, null, 'La cle maitre doit etre liberee');
  assert.equal(manager.salt, null, 'Le sel doit etre libere');
  assert.deepEqual(manager.getEntries(), [], 'Aucune entree dechiffree ne doit subsister');

  const reste = JSON.stringify(manager.getEntries());
  assert.ok(!reste.includes('Secret-En-Memoire-7!'));
});

test('L15 - VERROUILLAGE : le coffre chiffre, lui, est CONSERVE', async () => {
  const { storage, manager } = await coffreNeuf();
  await manager.addEntry({ title: 'A conserver', username: 'u', password: 'MotDePasse-2!' });
  const avant = JSON.stringify(storage.record);

  manager.clearSession();

  assert.equal(JSON.stringify(storage.record), avant,
    'Verrouiller n est pas supprimer : le coffre chiffre doit rester en place');
});

test('L16 - apres verrouillage, une lecture exige une nouvelle ouverture', async () => {
  const { manager } = await coffreNeuf();
  await manager.addEntry({ title: 'X', username: 'u', password: 'MotDePasse-3!' });
  manager.clearSession();

  await assert.rejects(
    () => manager.addEntry({ title: 'Y', username: 'v', password: 'MotDePasse-4!' }),
    'Ecrire sans session ouverte doit etre refuse'
  );
});

test('L17 - verrouiller deux fois de suite ne casse rien', async () => {
  const { manager } = await coffreNeuf();
  manager.clearSession();
  assert.doesNotThrow(() => manager.clearSession());
  assert.equal(manager.masterKey, null);
});

// ===========================================================================
// 6. Coffre ALTERE : le bloc de validation est verifie pour lui-meme
// ---------------------------------------------------------------------------
// Un mauvais mot de passe fait echouer le dechiffrement AVANT toute lecture du
// contenu de validation. Le controle explicite `check === 'ok'` ne se voit
// donc que sur un coffre dont le bloc de validation se dechiffre correctement
// mais ne dit PAS ce qu il devrait — c est-a-dire un coffre altere par
// quelqu un qui connait le mot de passe, ou un fichier importe fabrique.
// Sans ce scenario, le controle serait indistinguable de code mort.
// ===========================================================================

test('L18 - COFFRE ALTERE : un bloc de validation valide mais faux est REFUSE', async () => {
  const { encryptData } = await import('../scripts/core/crypto/aes-gcm.js');
  const { deriveMasterKey } = await import('../scripts/core/crypto/pbkdf2.js');
  const { base64ToBytes, parseVaultMetadata, validationAdditionalData } =
    await import('../scripts/core/storage/vault-format.js');

  const { storage } = await coffreNeuf();
  const metadonnees = parseVaultMetadata(storage.record.meta);
  const cle = await deriveMasterKey(MDP, base64ToBytes(metadonnees.salt, 'salt'),
    { iterations: metadonnees.iterations });

  // Chiffre AVEC LA BONNE CLE, mais avec un contenu qui n est pas le bon.
  storage.record.meta.validation = await encryptData(
    { check: 'pas-ok' }, cle,
    { additionalData: validationAdditionalData(metadonnees.formatVersion) }
  );

  const manager = new VaultManager({ storage });
  await assert.rejects(() => manager.unlock(MDP),
    'Un bloc de validation dechiffrable mais incorrect doit faire echouer '
    + 'l ouverture : c est la seule chose qui distingue un coffre authentique '
    + 'd un coffre fabrique.');
  assert.ok(!manager.masterKey, 'Aucune session ne doit rester ouverte');
});

test('L19 - COFFRE ALTERE : un bloc de validation absent est REFUSE', async () => {
  const { storage } = await coffreNeuf();
  delete storage.record.meta.validation;

  const manager = new VaultManager({ storage });
  await assert.rejects(() => manager.unlock(MDP),
    'Un coffre sans bloc de validation ne peut pas etre authentifie');
});

console.log('=== TEST VAULT LIFECYCLE (LOT 9) ===');
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
  console.error(`Vault lifecycle tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Vault lifecycle tests passed (${cas.length} scenarios).`);
}
