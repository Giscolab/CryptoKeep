/**
 * Lot 2 - Sauvegarde secondaire versionnee, migration et restauration.
 * Stockages et coffres exclusivement synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  BACKUP_KEY_V1,
  LEGACY_BACKUP_KEY,
  BACKUP_ENVELOPE_VERSION,
  buildBackupEnvelope,
  writeLocalBackup,
  readLocalBackup,
  clearLocalBackup,
  readLegacyBackup,
  migrateLegacyBackup,
  compareBackupFreshness,
  LocalBackupError
} from '../scripts/core/storage/local-backup.js';
import {
  inspectRestoreSituation,
  restoreBackupWhenPrimaryMissing,
  restoreBackupDeliberately,
  isUsablePrimaryVault
} from '../scripts/core/storage/backup-restore-service.js';
import { canonicalize } from '../scripts/core/storage/vault-transaction.js';
import {
  FakeVaultStorage,
  FakeLocalStorage,
  buildSyntheticVault,
  tamperBase64
} from './helpers/vault-fixtures.js';

const MOT_DE_PASSE = 'phrase-de-passe-sauvegarde-synthetique';

async function expectRejection(promise, code, message) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code, code, `${message} : code attendu ${code}, obtenu ${error.code}`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST LOCAL BACKUP ===');

  const coffre = await buildSyntheticVault({
    password: MOT_DE_PASSE,
    entries: [
      { id: 'sauv-1', title: 'SecretTitre', username: 'alice', password: 'MotDePasseClair' },
      { id: 'sauv-2', title: 'Autre', username: 'bob', url: 'https://exemple.test', password: 'p2' }
    ],
    lastModified: '2026-02-01T00:00:00.000Z'
  });

  // ============ 1. Ecriture et relecture de l'enveloppe ====================
  {
    const store = new FakeLocalStorage();
    const resultat = writeLocalBackup(coffre.record, { storage: store, now: '2026-03-01T00:00:00.000Z' });
    assert.equal(resultat.written, true, 'Ecriture de la sauvegarde refusee');

    const relu = readLocalBackup({ storage: store });
    assert.equal(relu.envelopeVersion, BACKUP_ENVELOPE_VERSION);
    assert.equal(relu.backupCreatedAt, '2026-03-01T00:00:00.000Z');
    assert.equal(relu.entryCount, 2);
    assert.equal(relu.vaultFormatVersion, 2);
    assert.equal(canonicalize(relu.record), canonicalize(
      buildBackupEnvelope(coffre.record, { now: 'x' }).record
    ), 'Le record relu doit etre identique au record ecrit');

    // La version d'enveloppe est distincte de meta.version.
    assert.notEqual(relu.envelopeVersion, relu.vaultFormatVersion,
      'La version d\'enveloppe doit etre independante du format de coffre');
  }

  // ============ 2. Aucun plaintext persiste ================================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const brut = store.getItem(BACKUP_KEY_V1);

    ['SecretTitre', 'alice', 'MotDePasseClair', 'exemple.test', 'bob', 'Autre'].forEach((secret) => {
      assert.ok(!brut.includes(secret),
        `La sauvegarde ne doit contenir aucun champ dechiffre (${secret})`);
    });

    const enveloppe = JSON.parse(brut);
    assert.deepEqual(Object.keys(enveloppe.record.entries[0]).sort(), ['ciphertext', 'id', 'iv'],
      'Une entree sauvegardee ne doit exposer que id, iv et ciphertext');
    assert.deepEqual(
      Object.keys(enveloppe.record.meta).sort(),
      ['created_at', 'iterations', 'kdf', 'last_modified', 'salt', 'validation', 'version'],
      'meta ne doit contenir que des informations non sensibles');
  }

  // ============ 3. Refus d'ecrire autre chose qu'un coffre chiffre =========
  {
    const store = new FakeLocalStorage();
    const resultat = writeLocalBackup({ entries: [{ id: 'x', title: 'clair' }], meta: {} },
      { storage: store });
    assert.equal(resultat.written, false, 'Un contenu non chiffre doit etre refuse');
    assert.equal(store.getItem(BACKUP_KEY_V1), null, 'Rien ne doit etre ecrit');
  }

  // ============ 4. Migration du format historique JSON direct =============
  {
    const store = new FakeLocalStorage();
    store.setItem(LEGACY_BACKUP_KEY, JSON.stringify(coffre.record));

    const lu = readLegacyBackup({ storage: store });
    assert.equal(lu.format, 'json', 'Le format JSON direct doit etre reconnu');

    const rapport = await migrateLegacyBackup({ storage: store, now: '2026-04-01T00:00:00.000Z' });
    assert.equal(rapport.migrated, true, 'Migration JSON echouee');
    assert.equal(rapport.sourceFormat, 'json');
    assert.equal(rapport.legacyPreserved, false, 'L\'ancienne cle doit etre supprimee apres succes');
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null);
    assert.ok(store.getItem(BACKUP_KEY_V1), 'La nouvelle enveloppe doit exister');
  }

  // ============ 5. Migration du format historique base64 ==================
  {
    const store = new FakeLocalStorage();
    store.setItem(LEGACY_BACKUP_KEY, btoa(JSON.stringify(coffre.record)));

    const lu = readLegacyBackup({ storage: store });
    assert.equal(lu.format, 'base64', 'Le format base64 doit etre reconnu');

    const rapport = await migrateLegacyBackup({ storage: store });
    assert.equal(rapport.migrated, true, 'Migration base64 echouee');
    assert.equal(rapport.sourceFormat, 'base64');
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null);

    // Le base64 n'est pas un chiffrement : le contenu decode reste chiffre
    // uniquement parce que le coffre l'etait deja.
    const relu = readLocalBackup({ storage: store });
    assert.equal(relu.entryCount, 2);
  }

  // ============ 6. Ancienne sauvegarde preservee si la migration echoue ===
  {
    // 6a. structure historique invalide
    const store = new FakeLocalStorage();
    const invalide = structuredClone(coffre.record);
    invalide.entries[0].charge = 'inattendue';
    store.setItem(LEGACY_BACKUP_KEY, JSON.stringify(invalide));

    const rapport = await migrateLegacyBackup({ storage: store });
    assert.equal(rapport.migrated, false, 'Une structure invalide ne doit pas migrer');
    assert.equal(rapport.legacyPreserved, true);
    assert.ok(store.getItem(LEGACY_BACKUP_KEY), 'L\'ancienne sauvegarde doit etre conservee');
    assert.equal(store.getItem(BACKUP_KEY_V1), null, 'Aucune nouvelle enveloppe ne doit exister');
  }
  {
    // 6b. verification cryptographique impossible
    const store = new FakeLocalStorage();
    store.setItem(LEGACY_BACKUP_KEY, JSON.stringify(coffre.record));

    const rapport = await migrateLegacyBackup({
      storage: store,
      verifyRecord: async () => {
        const e = new Error('mot de passe indisponible');
        e.code = 'crypto_failure';
        throw e;
      }
    });
    assert.equal(rapport.migrated, false, 'Sans verification crypto, pas de migration');
    assert.equal(rapport.reason, 'verification_failed');
    assert.equal(rapport.legacyPreserved, true);
    assert.ok(store.getItem(LEGACY_BACKUP_KEY), 'L\'ancienne sauvegarde doit survivre');
  }
  {
    // 6c. verification cryptographique reussie : la migration a lieu
    const store = new FakeLocalStorage();
    store.setItem(LEGACY_BACKUP_KEY, JSON.stringify(coffre.record));
    let verifiee = false;
    const rapport = await migrateLegacyBackup({
      storage: store,
      verifyRecord: async (record) => {
        assert.ok(record.meta.validation, 'Le bloc de validation doit etre transmis');
        verifiee = true;
      }
    });
    assert.equal(verifiee, true, 'La verification doit etre appelee avant migration');
    assert.equal(rapport.migrated, true);
  }

  // ============ 7. Sauvegarde corrompue ====================================
  {
    const store = new FakeLocalStorage();
    store.setItem(BACKUP_KEY_V1, '{ ceci n est pas du json');
    assert.throws(() => readLocalBackup({ storage: store }),
      (e) => e instanceof LocalBackupError && e.code === 'corrupt',
      'Une enveloppe illisible doit etre refusee');

    store.setItem(BACKUP_KEY_V1, JSON.stringify({ envelopeVersion: 99, backupCreatedAt: 'x', record: {} }));
    assert.throws(() => readLocalBackup({ storage: store }),
      (e) => e.code === 'unsupported_envelope', 'Une version d\'enveloppe inconnue doit etre refusee');
  }

  // ============ 8. Quota localStorage ======================================
  {
    const store = new FakeLocalStorage();
    store.quotaExceeded = true;
    const resultat = writeLocalBackup(coffre.record, { storage: store });
    assert.equal(resultat.written, false);
    assert.equal(resultat.quotaExceeded, true, 'Le depassement de quota doit etre signale');
    assert.ok(resultat.message.includes('principal reste intact'),
      'Le message doit rassurer sur le coffre principal');
  }

  // ============ 9. Sauvegarde plus ancienne que le coffre principal =======
  {
    const enveloppe = buildBackupEnvelope(coffre.record, { now: '2026-03-01T00:00:00.000Z' });
    const coffrePlusRecent = structuredClone(coffre.record);
    coffrePlusRecent.meta.last_modified = '2026-06-01T00:00:00.000Z';

    const fraicheur = compareBackupFreshness(enveloppe, coffrePlusRecent);
    assert.equal(fraicheur.comparable, true);
    assert.equal(fraicheur.stale, true, 'La sauvegarde doit etre signalee comme obsolete');
    assert.ok(fraicheur.note.includes('ne sont pas authentifies'),
      'L\'honnetete sur les horodatages doit etre explicite');

    const incomparable = compareBackupFreshness(enveloppe, { meta: {} });
    assert.equal(incomparable.comparable, false, 'Des horodatages absents ne prouvent rien');
    assert.equal(incomparable.stale, false, 'Aucune conclusion sans donnee');
  }

  // ============ 10. Effacement de la sauvegarde secondaire ================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    store.setItem(LEGACY_BACKUP_KEY, 'ancienne');

    const partiel = clearLocalBackup({ storage: store });
    assert.equal(partiel.cleared, true);
    assert.equal(partiel.legacyCleared, false, 'L\'ancienne cle n\'est pas touchee par defaut');
    assert.equal(store.getItem(BACKUP_KEY_V1), null);
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), 'ancienne');

    writeLocalBackup(coffre.record, { storage: store });
    const total = clearLocalBackup({ storage: store, includeLegacy: true });
    assert.equal(total.cleared, true);
    assert.equal(total.legacyCleared, true);
    assert.equal(store.size, 0, 'Le stockage synthetique doit etre vide');

    const vide = clearLocalBackup({ storage: store });
    assert.equal(vide.cleared, false, 'Effacer deux fois reste sans effet');
  }

  // ============ 11. Aucune restauration automatique =======================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null); // IndexedDB vide

    const situation = await inspectRestoreSituation({ storage, localStorageRef: store });
    assert.equal(situation.primaryUsable, false);
    assert.equal(situation.backupAvailable, true);
    assert.equal(situation.offerRestore, true, 'Une proposition doit etre faite, pas une action');
    assert.equal(storage.writes, 0, 'Inspecter ne doit RIEN ecrire');
    assert.equal(storage.record, null, 'Le coffre principal doit rester vide');
  }

  // ============ 12. Le coffre principal valide est prioritaire ============
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const autre = await buildSyntheticVault({
      password: 'autre-phrase-de-passe',
      entries: [{ id: 'principal-1', title: 'Principal', username: 'z', password: 'zzz' }]
    });
    const storage = new FakeVaultStorage(autre.record);

    const situation = await inspectRestoreSituation({ storage, localStorageRef: store });
    assert.equal(situation.primaryUsable, true);
    assert.equal(situation.offerRestore, false, 'Aucune proposition si le coffre principal est sain');

    await expectRejection(
      restoreBackupWhenPrimaryMissing({
        storage,
        localStorageRef: store,
        requestPassword: async () => MOT_DE_PASSE,
        confirmRestore: async () => true
      }),
      'primary_vault_has_priority',
      'Une sauvegarde ne doit jamais ecraser automatiquement un coffre valide'
    );
    assert.equal(storage.writes, 0, 'Aucune ecriture ne doit avoir eu lieu');
    assert.equal(canonicalize(storage.record), canonicalize(autre.record),
      'Le coffre principal doit etre intact');
  }

  // ============ 13. Restauration nominale quand le principal manque =======
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null);

    const rapport = await restoreBackupWhenPrimaryMissing({
      storage,
      localStorageRef: store,
      requestPassword: async () => MOT_DE_PASSE,
      confirmRestore: async () => true
    });
    assert.equal(rapport.restored, true);
    assert.equal(rapport.entryCount, 2);
    assert.equal(storage.record.entries.length, 2, 'Le coffre doit avoir ete restaure');
    assert.equal(storage.writes, 1, 'Une seule ecriture');
  }

  // ============ 14. Refus de confirmation ==================================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null);
    let motDePasseDemande = false;

    await expectRejection(
      restoreBackupWhenPrimaryMissing({
        storage,
        localStorageRef: store,
        requestPassword: async () => { motDePasseDemande = true; return MOT_DE_PASSE; },
        confirmRestore: async () => false
      }),
      'cancelled', 'Refus de confirmation'
    );
    assert.equal(motDePasseDemande, false,
      'Le mot de passe ne doit pas etre demande si la confirmation est refusee');
    assert.equal(storage.writes, 0, 'Aucune ecriture apres refus');
    assert.equal(storage.record, null);
  }

  // ============ 15. Mauvais mot de passe ===================================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null);

    await expectRejection(
      restoreBackupWhenPrimaryMissing({
        storage,
        localStorageRef: store,
        requestPassword: async () => 'mauvaise-phrase',
        confirmRestore: async () => true
      }),
      'crypto_failure', 'Mauvais mot de passe de sauvegarde'
    );
    assert.equal(storage.writes, 0, 'Aucune ecriture apres echec cryptographique');
  }

  // ============ 16. Sauvegarde alteree =====================================
  {
    const store = new FakeLocalStorage();
    const altere = structuredClone(coffre.record);
    altere.entries[1].ciphertext = tamperBase64(altere.entries[1].ciphertext);
    writeLocalBackup(altere, { storage: store });
    const storage = new FakeVaultStorage(null);

    await expectRejection(
      restoreBackupWhenPrimaryMissing({
        storage,
        localStorageRef: store,
        requestPassword: async () => MOT_DE_PASSE,
        confirmRestore: async () => true
      }),
      'crypto_failure', 'Sauvegarde alteree'
    );
    assert.equal(storage.writes, 0);
  }

  // ============ 17. Transaction de restauration interrompue ===============
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null);
    storage.abortNextWrites = 1;

    const erreur = await expectRejection(
      restoreBackupWhenPrimaryMissing({
        storage,
        localStorageRef: store,
        requestPassword: async () => MOT_DE_PASSE,
        confirmRestore: async () => true
      }),
      'transaction_aborted', 'Transaction de restauration interrompue'
    );
    assert.equal(erreur.details.restored, false, 'Aucune restauration supplementaire ne doit etre tentee');
    assert.equal(storage.record, null, 'Le coffre reste dans son etat anterieur');
  }

  // ============ 18. Echec de verification post-ecriture ====================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const principal = await buildSyntheticVault({
      password: 'autre-phrase',
      entries: [{ id: 'p1', title: 'P', username: 'p', password: 'ppp' }]
    });
    // Coffre principal present : on passe par la voie volontaire.
    const storage = new FakeVaultStorage(principal.record);
    storage.corruptReadAfterWrite = true;

    const erreur = await expectRejection(
      restoreBackupDeliberately({
        storage,
        localStorageRef: store,
        requestPassword: async () => MOT_DE_PASSE,
        confirmDeliberate: async () => true
      }),
      'verification_failed', 'Echec de verification post-ecriture'
    );
    assert.equal(erreur.details.restored, true, 'L\'instantane doit avoir ete restaure');
    assert.equal(erreur.details.verifiedRestore, true, 'La restauration doit etre verifiee');
    assert.equal(canonicalize(storage.record), canonicalize(principal.record),
      'Le coffre principal doit avoir ete retabli a l\'identique');
  }

  // ============ 19. Restauration volontaire : confirmation renforcee ======
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const principal = await buildSyntheticVault({
      password: 'autre-phrase',
      entries: [{ id: 'p1', title: 'P', username: 'p', password: 'ppp' }],
      lastModified: '2026-09-01T00:00:00.000Z'
    });
    const storage = new FakeVaultStorage(principal.record);

    await expectRejection(
      restoreBackupDeliberately({ storage, localStorageRef: store, requestPassword: async () => MOT_DE_PASSE }),
      'no_confirmation', 'Sans confirmation renforcee, refus'
    );
    assert.equal(storage.writes, 0);

    let avertissement = null;
    const rapport = await restoreBackupDeliberately({
      storage,
      localStorageRef: store,
      requestPassword: async () => MOT_DE_PASSE,
      confirmDeliberate: async (info) => { avertissement = info; return true; }
    });
    assert.equal(rapport.restored, true);
    assert.equal(avertissement.deliberate, true);
    assert.equal(avertissement.stale, true, 'Une sauvegarde plus ancienne doit etre signalee');
    assert.ok(avertissement.warning.includes('remplacera un coffre principal valide'));
  }

  // ============ 20. Aucune sauvegarde disponible ===========================
  {
    const storage = new FakeVaultStorage(null);
    const store = new FakeLocalStorage();
    const situation = await inspectRestoreSituation({ storage, localStorageRef: store });
    assert.equal(situation.backupAvailable, false);
    assert.equal(situation.offerRestore, false);

    await expectRejection(
      restoreBackupWhenPrimaryMissing({ storage, localStorageRef: store, requestPassword: async () => 'x' }),
      'no_backup', 'Aucune sauvegarde'
    );
  }

  // ============ 21. isUsablePrimaryVault ===================================
  {
    assert.equal(isUsablePrimaryVault(null), false);
    assert.equal(isUsablePrimaryVault({ entries: [], meta: {} }), false);
    assert.equal(isUsablePrimaryVault(coffre.record), true);
  }

  console.log('Local backup tests passed.');
} catch (error) {
  console.error('Local backup tests failed:', error);
  process.exitCode = 1;
}
