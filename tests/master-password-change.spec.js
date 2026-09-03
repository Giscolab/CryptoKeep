/**
 * Lot 4 - Changement du mot de passe maitre.
 *
 * Le stockage est une base IndexedDB synthetique servie par le VRAI
 * StorageManager : la discipline transactionnelle des Lots 2, 3b et 3c est
 * donc celle de production, pas une simulation. La cryptographie est reelle.
 *
 * Aucun coffre reel, aucun fichier .vault de l'utilisateur, aucun secret
 * personnel n'est lu. Tous les mots de passe sont synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  changeMasterPassword,
  validateChangeRequest,
  MasterPasswordChangeError,
  GENERIC_CURRENT_PASSWORD_FAILURE
} from '../scripts/core/vault/master-password-change.js';
import { StorageManager } from '../scripts/core/storage/manager.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import { decryptData } from '../scripts/core/crypto/aes-gcm.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import {
  base64ToBytes,
  entryAdditionalData,
  parseVaultMetadata,
  validationAdditionalData
} from '../scripts/core/storage/vault-format.js';
import { BACKUP_KEY_V1, parseBackupEnvelope } from '../scripts/core/storage/local-backup.js';
import { buildSyntheticVault, FakeLocalStorage } from './helpers/vault-fixtures.js';
import { FakeIDBDatabase } from './helpers/fake-indexeddb.js';

const ANCIEN = 'phrase-de-passe-actuelle-synthetique-4';
const NOUVEAU = 'phrase-de-passe-nouvelle-synthetique-4';

const ENTREES = [
  { id: 'e1', title: 'Banque Synthetique', username: 'client@example.test', password: 'MotDePasse-Un-1!', url: 'https://banque.example.test', category: 'bank' },
  { id: 'e2', title: 'Messagerie', username: 'pro@example.test', password: 'MotDePasse-Deux-2!', notes: 'note synthetique' },
  { id: 'e3', title: 'Élan Créatif', username: 'studio@example.test', password: 'MotDePasse-Trois-3!', tags: ['travail'] },
  { id: 'e4', title: 'Stockage', username: 'moi@example.test', password: 'MotDePasse-Quatre-4!' }
];

/** Monte un coffre synthetique deverrouille sur le VRAI StorageManager. */
async function monter(entries = ENTREES) {
  const built = await buildSyntheticVault({ password: ANCIEN, entries });
  const db = new FakeIDBDatabase(built.record);
  const storage = new StorageManager();
  storage.db = db;
  storage.initializeDB = async () => { storage.db = db; };

  const localStorageRef = new FakeLocalStorage();
  const manager = new VaultManager({ storage });
  await manager.unlock(ANCIEN);

  db.commits = 0;
  db.readCount = 0;
  db.readFailures = 0;
  db.failReadsAt = new Set();
  return { manager, storage, db, built, localStorageRef };
}

/** Empreinte du stockage PERSISTANT, sans passer par la memoire. */
function empreinte(db) {
  const record = db.peek();
  if (!record) return null;
  return JSON.stringify({
    salt: record.meta.salt,
    validation: record.meta.validation,
    entries: record.entries.map((e) => `${e.id}:${e.iv}:${e.ciphertext}`).sort()
  });
}

/** Ouvre un coffre stocke avec un mot de passe donne. Leve si impossible. */
async function ouvrirAvec(record, motDePasse) {
  const metadata = parseVaultMetadata(record.meta);
  const key = await deriveMasterKey(motDePasse, base64ToBytes(metadata.salt, 'salt'), {
    iterations: metadata.iterations
  });
  const validation = await decryptData(record.meta.validation, key, {
    additionalData: validationAdditionalData(metadata.formatVersion)
  });
  assert.equal(validation.check, 'ok');

  const entries = [];
  for (const stored of record.entries) {
    const data = await decryptData(stored, key, {
      additionalData: entryAdditionalData(stored.id, metadata.formatVersion)
    });
    entries.push({ ...data, id: stored.id });
  }
  return { entries, metadata };
}

async function attendreRefus(promesse, code, message) {
  try {
    await promesse;
  } catch (error) {
    assert.ok(error instanceof MasterPasswordChangeError,
      `${message} : type inattendu (${error.name})`);
    assert.equal(error.code, code, `${message} : code ${code} attendu, obtenu ${error.code}`);
    return error;
  }
  assert.fail(`${message} : l'operation aurait du echouer`);
}

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

// ===========================================================================
// A. Migration reussie avec plusieurs entrees
// ===========================================================================

test('A1 - quatre entrees : tout est rechiffre, relisible, et rien n est perdu', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = db.peek();

  const rapport = await changeMasterPassword(manager, {
    currentPassword: ANCIEN,
    newPassword: NOUVEAU,
    confirmPassword: NOUVEAU
  }, { localStorageRef });

  assert.equal(rapport.changed, true);
  assert.equal(rapport.entryCount, 4);
  assert.equal(rapport.saltRenewed, true);
  assert.equal(rapport.validationRenewed, true);
  assert.equal(rapport.iterations, 220000);
  assert.equal(rapport.formatVersion, 2);

  const apres = db.peek();

  // 7. sel REELLEMENT renouvele.
  assert.notEqual(apres.meta.salt, avant.meta.salt, 'Le sel doit etre neuf');

  // 11. bloc de validation recree.
  assert.notEqual(apres.meta.validation.ciphertext, avant.meta.validation.ciphertext);
  assert.notEqual(apres.meta.validation.iv, avant.meta.validation.iv);

  // 9. chaque entree a un IV ET un ciphertext neufs.
  for (const ancienne of avant.entries) {
    const nouvelle = apres.entries.find((e) => e.id === ancienne.id);
    assert.ok(nouvelle, `L'entree ${ancienne.id} ne doit pas disparaitre`);
    assert.notEqual(nouvelle.iv, ancienne.iv, `IV reutilise pour ${ancienne.id}`);
    assert.notEqual(nouvelle.ciphertext, ancienne.ciphertext, `Ciphertext reutilise pour ${ancienne.id}`);
  }

  // Aucun IV n'est reutilise ENTRE entrees non plus.
  const ivs = apres.entries.map((e) => e.iv);
  assert.equal(new Set(ivs).size, ivs.length, 'Deux entrees partagent un IV');

  // La date de creation du coffre est preservee : ce n'est pas un coffre neuf.
  assert.equal(apres.meta.created_at, avant.meta.created_at);
  assert.notEqual(apres.meta.last_modified, avant.meta.last_modified);

  // 13. le coffre est reellement ouvrable avec le NOUVEAU mot de passe.
  const ouvert = await ouvrirAvec(apres, NOUVEAU);
  assert.equal(ouvert.entries.length, 4);
  for (const attendue of ENTREES) {
    const relue = ouvert.entries.find((e) => e.id === attendue.id);
    assert.ok(relue, `L'entree ${attendue.id} doit etre relisible`);
    assert.equal(relue.title, attendue.title, 'Le titre doit survivre a la migration');
    assert.equal(relue.password, attendue.password, 'Le mot de passe doit survivre a la migration');
    assert.equal(relue.username, attendue.username);
  }
  assert.equal(ouvert.entries.find((e) => e.id === 'e2').notes, 'note synthetique');
  assert.deepEqual(ouvert.entries.find((e) => e.id === 'e3').tags, ['travail']);

  // L'ANCIEN mot de passe ne doit plus ouvrir le coffre.
  await assert.rejects(ouvrirAvec(apres, ANCIEN),
    'L\'ancien mot de passe ne doit plus fonctionner');

  // Une seule ecriture du coffre principal.
  assert.equal(db.commits, 1, 'Une seule ecriture pour un changement reussi');
});

test('A2 - AAD reconstruites : une AAD erronee ne dechiffre pas', async () => {
  const { manager, db, localStorageRef } = await monter();
  await changeMasterPassword(manager, {
    currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
  }, { localStorageRef });

  const apres = db.peek();
  const metadata = parseVaultMetadata(apres.meta);
  const key = await deriveMasterKey(NOUVEAU, base64ToBytes(metadata.salt, 'salt'), {
    iterations: metadata.iterations
  });

  const premiere = apres.entries[0];
  // Avec la BONNE AAD, l'entree se dechiffre.
  await decryptData(premiere, key, {
    additionalData: entryAdditionalData(premiere.id, 2)
  });
  // Avec l'AAD d'une AUTRE entree, elle ne se dechiffre pas.
  await assert.rejects(
    decryptData(premiere, key, { additionalData: entryAdditionalData('un-autre-id', 2) }),
    'L\'AAD doit lier le ciphertext a l\'identifiant de son entree'
  );
  // L'AAD du bloc de validation n'est pas celle d'une entree.
  await assert.rejects(
    decryptData(premiere, key, { additionalData: validationAdditionalData(2) }),
    'L\'AAD d\'entree et l\'AAD de validation doivent etre distinctes'
  );
});

test('A3 - session renouvelee : la session continue avec la nouvelle cle', async () => {
  const { manager, localStorageRef } = await monter();
  const ancienneCle = manager.masterKey;

  const rapport = await changeMasterPassword(manager, {
    currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
  }, { localStorageRef });

  assert.equal(rapport.session.renewed, true);
  assert.equal(rapport.session.locked, false);
  assert.notEqual(manager.masterKey, ancienneCle, 'La cle de session doit avoir change');
  assert.equal(manager.getEntries().length, 4, 'Les entrees restent disponibles en session');
  assert.equal(manager.formatVersion, 2);

  // La cle de session reste NON EXTRACTIBLE.
  assert.equal(manager.masterKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', manager.masterKey),
    'La cle maitre ne doit jamais etre exportable');
});

test('A4 - session verrouillee sur demande', async () => {
  const { manager, localStorageRef } = await monter();

  const rapport = await changeMasterPassword(manager, {
    currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
  }, { localStorageRef, lockAfterChange: true });

  assert.equal(rapport.session.locked, true);
  assert.equal(rapport.session.renewed, false);
  assert.equal(manager.masterKey, null, 'La cle maitre doit etre liberee');
  assert.equal(manager.getEntries().length, 0, 'Aucune entree ne doit rester en memoire');
});

test('A5 - sauvegarde secondaire mise a jour APRES verification', async () => {
  const { manager, localStorageRef } = await monter();
  assert.equal(localStorageRef.getItem(BACKUP_KEY_V1), null);

  const rapport = await changeMasterPassword(manager, {
    currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
  }, { localStorageRef });

  assert.equal(rapport.backup.written, true);
  const enveloppe = parseBackupEnvelope(localStorageRef.getItem(BACKUP_KEY_V1));
  assert.equal(enveloppe.entryCount, 4);

  // La sauvegarde contient le coffre RECHIFFRE : elle s'ouvre avec le nouveau
  // mot de passe, pas avec l'ancien.
  await ouvrirAvec(enveloppe.record, NOUVEAU);
  await assert.rejects(ouvrirAvec(enveloppe.record, ANCIEN),
    'La sauvegarde ne doit pas rester chiffree avec l\'ancienne cle');
});

test('A6 - coffre vide : le changement reste possible', async () => {
  const { manager, db, localStorageRef } = await monter([]);
  const rapport = await changeMasterPassword(manager, {
    currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
  }, { localStorageRef });

  assert.equal(rapport.changed, true);
  assert.equal(rapport.entryCount, 0);
  await ouvrirAvec(db.peek(), NOUVEAU);
});

// ===========================================================================
// B. Mauvais mot de passe actuel
// ===========================================================================

test('B1 - mot de passe actuel errone : refus, aucune ecriture, coffre intact', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  const erreur = await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: 'mot-de-passe-actuel-faux-synthetique',
      newPassword: NOUVEAU,
      confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'invalid_current_password',
    'Mot de passe actuel errone'
  );

  assert.equal(erreur.message, GENERIC_CURRENT_PASSWORD_FAILURE,
    'Le message doit rester generique');
  assert.equal(db.commits, 0, 'AUCUNE ecriture ne doit avoir lieu');
  assert.equal(empreinte(db), avant, 'Le coffre doit etre strictement intact');
  assert.equal(localStorageRef.getItem(BACKUP_KEY_V1), null,
    'Aucune sauvegarde secondaire apres un refus');

  // L'ancien mot de passe fonctionne toujours.
  await ouvrirAvec(db.peek(), ANCIEN);
});

test('B2 - le message d erreur ne revele aucun detail cryptographique', async () => {
  const { manager, localStorageRef } = await monter();

  const erreur = await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: 'autre-mot-de-passe-faux-synthetique',
      newPassword: NOUVEAU,
      confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'invalid_current_password',
    'Message generique'
  );

  const interdits = [
    'PBKDF2', 'AES', 'GCM', 'SHA', 'salt', 'sel', 'IV', 'iteration',
    'AAD', 'cle', 'key', 'ciphertext', 'OperationError', 'DataError'
  ];
  const message = erreur.message;
  for (const terme of interdits) {
    assert.ok(!message.toLowerCase().includes(terme.toLowerCase()),
      `Le message ne doit pas contenir « ${terme} » : ${message}`);
  }
  // Et surtout : aucun mot de passe.
  assert.ok(!message.includes(ANCIEN) && !message.includes(NOUVEAU),
    'Aucun mot de passe ne doit apparaitre dans un message d erreur');
});

test('B3 - bloc de validation altere : meme refus generique', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  // Le bloc de validation est corrompu directement en base.
  const record = db.peek();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const c = record.meta.validation.ciphertext;
  const i = 3;
  record.meta.validation.ciphertext =
    c.slice(0, i) + alphabet.charAt((alphabet.indexOf(c.charAt(i)) + 1) % 64) + c.slice(i + 1);
  db.records.set('current', record);

  const erreur = await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'invalid_current_password',
    'Bloc de validation altere'
  );
  assert.equal(erreur.message, GENERIC_CURRENT_PASSWORD_FAILURE,
    'Un bloc altere et un mot de passe errone doivent etre indiscernables');
  assert.equal(db.commits, 0);
  void avant;
});

test('B4 - entree indechiffrable : refus AVANT tout rechiffrement', async () => {
  const { manager, db, localStorageRef } = await monter();

  const record = db.peek();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const c = record.entries[2].ciphertext;
  const i = 5;
  record.entries[2].ciphertext =
    c.slice(0, i) + alphabet.charAt((alphabet.indexOf(c.charAt(i)) + 1) % 64) + c.slice(i + 1);
  db.records.set('current', record);
  const avant = empreinte(db);

  await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'entry_undecryptable',
    'Entree indechiffrable'
  );

  assert.equal(db.commits, 0,
    'Mieux vaut refuser que produire un coffre neuf ampute d une entree');
  assert.equal(empreinte(db), avant);
});

// ===========================================================================
// C. Confirmation differente et politique
// ===========================================================================

test('C1 - confirmation differente : refus sans aucune cryptographie', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  const erreur = await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: ANCIEN,
      newPassword: NOUVEAU,
      confirmPassword: `${NOUVEAU}-different`
    }, { localStorageRef }),
    'confirmation_mismatch',
    'Confirmation differente'
  );

  assert.equal(erreur.details.field, 'confirmPassword');
  assert.equal(db.commits, 0);
  assert.equal(db.readCount, 0,
    'La saisie est validee AVANT toute lecture du coffre et toute derivation');
  assert.equal(empreinte(db), avant);
});

test('C2 - politique appliquee au nouveau mot de passe', async () => {
  const { manager, db, localStorageRef } = await monter();

  for (const faible of ['court', 'aaaaaaaaaaaaaaaa', '123456789012']) {
    await attendreRefus(
      changeMasterPassword(manager, {
        currentPassword: ANCIEN, newPassword: faible, confirmPassword: faible
      }, { localStorageRef }),
      'weak_password',
      `Mot de passe faible : ${faible}`
    );
  }
  assert.equal(db.commits, 0, 'Aucune ecriture pour un mot de passe refuse');
});

test('C3 - champs manquants et reutilisation du mot de passe actuel', async () => {
  const { manager, db, localStorageRef } = await monter();

  await attendreRefus(changeMasterPassword(manager,
    { currentPassword: '', newPassword: NOUVEAU, confirmPassword: NOUVEAU }, { localStorageRef }),
  'current_password_required', 'Mot de passe actuel manquant');

  await attendreRefus(changeMasterPassword(manager,
    { currentPassword: ANCIEN, newPassword: '', confirmPassword: '' }, { localStorageRef }),
  'new_password_required', 'Nouveau mot de passe manquant');

  await attendreRefus(changeMasterPassword(manager,
    { currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: '' }, { localStorageRef }),
  'confirmation_required', 'Confirmation manquante');

  await attendreRefus(changeMasterPassword(manager,
    { currentPassword: ANCIEN, newPassword: ANCIEN, confirmPassword: ANCIEN }, { localStorageRef }),
  'same_as_current', 'Nouveau mot de passe identique a l actuel');

  assert.equal(db.commits, 0);
});

test('C4 - validateChangeRequest est utilisable seule, sans coffre', () => {
  assert.deepEqual(
    validateChangeRequest({ currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU }).valid,
    true
  );
  assert.throws(
    () => validateChangeRequest({ currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: 'x' }),
    (error) => error.code === 'confirmation_mismatch'
  );
});

// ===========================================================================
// D. Interruption pendant le rechiffrement, et restauration de l'ancien coffre
// ===========================================================================

test('D1 - interruption pendant le rechiffrement : aucune ecriture partielle', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  // Le chiffrement echoue a la 3e entree : le coffre est rechiffre
  // ENTIEREMENT en memoire avant la moindre ecriture, donc aucun etat
  // partiel ne peut atteindre le disque.
  const vraiEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  let appels = 0;
  crypto.subtle.encrypt = async (...args) => {
    appels += 1;
    if (appels === 3) throw new Error('interruption synthetique');
    return vraiEncrypt(...args);
  };

  try {
    await attendreRefus(
      changeMasterPassword(manager, {
        currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
      }, { localStorageRef }),
      'reencryption_failed',
      'Interruption pendant le rechiffrement'
    );
  } finally {
    crypto.subtle.encrypt = vraiEncrypt;
  }

  assert.equal(db.commits, 0, 'AUCUNE ecriture, donc aucun coffre a moitie rechiffre');
  assert.equal(empreinte(db), avant, 'Le coffre doit etre strictement intact');
  assert.equal(localStorageRef.getItem(BACKUP_KEY_V1), null);

  // L'ancien mot de passe reste le bon.
  const ouvert = await ouvrirAvec(db.peek(), ANCIEN);
  assert.equal(ouvert.entries.length, 4);
});

test('D2 - transaction annulee a l ecriture : ancien coffre intact', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  db.abortNextWrites = 1;

  const erreur = await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'write_failed',
    'Transaction annulee'
  );

  assert.equal(erreur.details.written, false, 'Rien n a ete ecrit');
  assert.equal(erreur.details.cause, 'transaction_aborted');
  assert.equal(db.commits, 0);
  assert.equal(empreinte(db), avant);
  await ouvrirAvec(db.peek(), ANCIEN);
});

test('D3 - divergence apres commit : ancien coffre restaure et verifie', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  db.divergeReadAfterCommit = true;

  const erreur = await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'write_failed',
    'Divergence apres commit'
  );

  assert.equal(erreur.details.restored, true, 'L ancien coffre doit avoir ete restaure');
  assert.equal(erreur.details.verifiedRestore, true, 'La restauration doit avoir ete verifiee');
  assert.equal(empreinte(db), avant, 'Le coffre doit etre revenu a son etat exact');
  assert.equal(localStorageRef.getItem(BACKUP_KEY_V1), null,
    'Aucune sauvegarde secondaire apres un echec');

  // L'ANCIEN mot de passe reste valable : c'est ce que promet le message.
  const ouvert = await ouvrirAvec(db.peek(), ANCIEN);
  assert.equal(ouvert.entries.length, 4);
  await assert.rejects(ouvrirAvec(db.peek(), NOUVEAU),
    'Le nouveau mot de passe ne doit pas fonctionner apres un echec');
});

test('D4 - coffre ecrit mais NON RELISIBLE : restauration temporaire (etape 14)', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  // L'ecriture et la comparaison canonique reussissent. C'est le
  // DECHIFFREMENT de verification qui echoue : une comparaison d'octets ne
  // prouve pas qu'un coffre est utilisable.
  const vraiDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
  let ecritureFaite = false;

  crypto.subtle.decrypt = async (...args) => {
    if (db.commits >= 1) {
      ecritureFaite = true;
      throw new Error('verification synthetique impossible');
    }
    return vraiDecrypt(...args);
  };

  let erreur;
  try {
    erreur = await attendreRefus(
      changeMasterPassword(manager, {
        currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
      }, { localStorageRef }),
      'verification_failed',
      'Coffre ecrit mais non relisible'
    );
  } finally {
    crypto.subtle.decrypt = vraiDecrypt;
  }

  assert.equal(ecritureFaite, true, 'Le pre-requis du test : l ecriture a bien eu lieu');
  assert.equal(erreur.details.written, true, 'Le rapport doit reconnaitre qu une ecriture a eu lieu');
  assert.equal(erreur.details.restored, true, 'L ancien coffre doit avoir ete restaure');
  assert.equal(erreur.details.verifiedRestore, true, 'La restauration doit avoir ete verifiee');
  assert.match(erreur.message, /ancien mot de passe reste valable/,
    'Le message doit dire a l utilisateur ou il en est');

  assert.equal(empreinte(db), avant, 'Le coffre doit etre revenu a son etat exact');
  assert.equal(localStorageRef.getItem(BACKUP_KEY_V1), null,
    'La sauvegarde secondaire ne doit jamais refleter un coffre non verifie');

  const ouvert = await ouvrirAvec(db.peek(), ANCIEN);
  assert.equal(ouvert.entries.length, 4, 'Les quatre entrees doivent avoir survecu');
  for (const attendue of ENTREES) {
    const relue = ouvert.entries.find((e) => e.id === attendue.id);
    assert.equal(relue.password, attendue.password);
  }
});

test('D5 - lecture du coffre en echec : refus avant toute ecriture (Lot 3c)', async () => {
  const { manager, db, localStorageRef } = await monter();
  const avant = empreinte(db);

  db.failNextReads = 1;

  const erreur = await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'vault_unreadable',
    'Coffre illisible'
  );

  assert.equal(erreur.details.written, false);
  assert.equal(db.commits, 0);
  assert.equal(empreinte(db), avant);
});

test('D6 - aucun coffre : le changement ne doit pas en creer un', async () => {
  const { manager, db, localStorageRef } = await monter();
  db.records.clear();
  db.commits = 0;

  await attendreRefus(
    changeMasterPassword(manager, {
      currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
    }, { localStorageRef }),
    'no_vault',
    'Aucun coffre'
  );

  assert.equal(db.commits, 0, 'Aucun coffre ne doit etre cree par ce chemin');
  assert.equal(db.peek(), null);
});

// ===========================================================================
// E. Hygiene des secrets
// ===========================================================================

test('E1 - aucun secret dans le rapport ni dans les erreurs', async () => {
  const { manager, db, localStorageRef } = await monter();

  const rapport = await changeMasterPassword(manager, {
    currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
  }, { localStorageRef });

  const serialise = JSON.stringify(rapport);
  assert.ok(!serialise.includes(ANCIEN), 'L ancien mot de passe ne doit pas figurer au rapport');
  assert.ok(!serialise.includes(NOUVEAU), 'Le nouveau mot de passe ne doit pas figurer au rapport');
  for (const entree of ENTREES) {
    assert.ok(!serialise.includes(entree.password),
      `Le mot de passe de ${entree.id} ne doit pas figurer au rapport`);
    assert.ok(!serialise.includes(entree.title),
      `Le titre de ${entree.id} ne doit pas figurer au rapport`);
  }
  // La VALEUR du sel n'y figure pas non plus. Le rapport annonce seulement
  // `saltRenewed: true` : un fait verifiable, sans le materiau lui-meme.
  assert.ok(!serialise.includes(db.peek().meta.salt),
    'La valeur du sel ne doit pas figurer au rapport');
  assert.ok(!serialise.includes(db.peek().meta.validation.ciphertext),
    'Le bloc de validation ne doit pas figurer au rapport');
  assert.ok(!('key' in rapport) && !('masterKey' in rapport),
    'Aucune cle ne doit etre exposee par le rapport');
});

test('E2 - le module ne journalise jamais de secret', async () => {
  const { manager, localStorageRef } = await monter();

  // Acces LITTERAUX aux methodes de console : aucune indexation par variable.
  const captures = [];
  const capturer = (...args) => { captures.push(args.map(String).join(' ')); };
  const vraiLog = console.log;
  const vraiWarn = console.warn;
  const vraiError = console.error;
  const vraiInfo = console.info;
  console.log = capturer;
  console.warn = capturer;
  console.error = capturer;
  console.info = capturer;

  try {
    await changeMasterPassword(manager, {
      currentPassword: ANCIEN, newPassword: NOUVEAU, confirmPassword: NOUVEAU
    }, { localStorageRef });
    try {
      await changeMasterPassword(manager, {
        currentPassword: 'faux-mot-de-passe-synthetique', newPassword: NOUVEAU, confirmPassword: NOUVEAU
      }, { localStorageRef });
    } catch { /* refus attendu */ }
  } finally {
    console.log = vraiLog;
    console.warn = vraiWarn;
    console.error = vraiError;
    console.info = vraiInfo;
  }

  const journal = captures.join('\n');
  for (const secret of [ANCIEN, NOUVEAU, ...ENTREES.map((e) => e.password)]) {
    assert.ok(!journal.includes(secret), 'Aucun secret ne doit etre journalise');
  }
});

// ===========================================================================
// Execution
// ===========================================================================

console.log('=== TEST MASTER PASSWORD CHANGE ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
    if (process.env.LOT4_TRACE) console.error(error);
  }
}

if (echecs > 0) {
  console.error(`Master password change tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Master password change tests passed (${cas.length} scenarios).`);
}
