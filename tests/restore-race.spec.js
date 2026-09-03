/**
 * Lot 2 partie 2 - Course entre restauration et apparition d'un coffre.
 *
 * Reproduit le defaut audite : IndexedDB etait constate vide, le dialogue de
 * restauration s'ouvrait, un coffre principal valide apparaissait pendant
 * l'attente utilisateur, et la restauration l'ecrasait quand meme
 * (`overwrittenPrincipal: true`).
 *
 * La defense verifiee ici vit dans le SERVICE METIER : elle doit tenir meme
 * si l'interface comporte une erreur de synchronisation.
 *
 * Stockages exclusivement synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  restoreBackupWhenPrimaryMissing,
  restoreBackupDeliberately,
  inspectRestoreSituation
} from '../scripts/core/storage/backup-restore-service.js';
import { writeLocalBackup, BACKUP_KEY_V1 } from '../scripts/core/storage/local-backup.js';
import { canonicalize } from '../scripts/core/storage/vault-transaction.js';
import {
  FakeVaultStorage,
  FakeLocalStorage,
  buildSyntheticVault
} from './helpers/vault-fixtures.js';

const MDP_SAUVEGARDE = 'phrase-de-passe-de-la-sauvegarde';
const MDP_PRINCIPAL = 'phrase-de-passe-du-coffre-principal';

async function expectCode(promise, code, message) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code, code, `${message} : code attendu ${code}, obtenu ${error.code}`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST RESTORE RACE ===');

  const sauvegarde = await buildSyntheticVault({
    password: MDP_SAUVEGARDE,
    entries: [
      { id: 'sauv-1', title: 'Sauvegarde A', username: 'alice', password: 'aaa' },
      { id: 'sauv-2', title: 'Sauvegarde B', username: 'bob', password: 'bbb' }
    ]
  });
  const principal = await buildSyntheticVault({
    password: MDP_PRINCIPAL,
    entries: [{ id: 'princ-1', title: 'PRINCIPAL', username: 'zoe', password: 'zzz' }]
  });

  // ===== 1. LA COURSE : un coffre apparait pendant la confirmation ========
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(sauvegarde.record, { storage: store });
    const sauvegardeBrute = store.getItem(BACKUP_KEY_V1);

    const storage = new FakeVaultStorage(null); // IndexedDB vide au depart
    const principalAttendu = canonicalize(principal.record);

    // Le service constate bien un stockage principal vide.
    const situation = await inspectRestoreSituation({ storage, localStorageRef: store });
    assert.equal(situation.primaryUsable, false);
    assert.equal(situation.offerRestore, true, 'La restauration doit etre proposee');

    let motDePasseDemande = false;
    const erreur = await expectCode(
      restoreBackupWhenPrimaryMissing({
        storage,
        localStorageRef: store,
        requestPassword: async () => { motDePasseDemande = true; return MDP_SAUVEGARDE; },
        // Pendant l'attente utilisateur, un coffre principal valide apparait.
        confirmRestore: async () => {
          storage.record = structuredClone(principal.record);
          return true;
        }
      }),
      'primary_vault_has_priority',
      'Un coffre apparu pendant le dialogue doit etre prioritaire'
    );

    assert.equal(erreur.details.appearedDuringDialog, true,
      'Le rapport doit indiquer l\'apparition pendant le dialogue');
    assert.equal(erreur.details.wrote, false, 'Aucune ecriture ne doit avoir eu lieu');

    // Les invariants exiges par l'audit.
    assert.equal(canonicalize(storage.record), principalAttendu,
      'Le coffre principal doit rester STRICTEMENT identique');
    assert.equal(storage.writes, 0, 'Aucune ecriture de restauration');
    assert.equal(store.getItem(BACKUP_KEY_V1), sauvegardeBrute,
      'La sauvegarde secondaire doit rester intacte');
    assert.equal(motDePasseDemande, true,
      'Le controle final intervient APRES le dialogue, pas a sa place');
  }

  // ===== 2. La meme course, en restauration volontaire ====================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(sauvegarde.record, { storage: store });
    const storage = new FakeVaultStorage(principal.record);
    const attendu = canonicalize(principal.record);

    // Un AUTRE coffre remplace le principal pendant la confirmation.
    const autre = await buildSyntheticVault({
      password: 'encore-une-autre-phrase',
      entries: [{ id: 'autre-1', title: 'AUTRE', username: 'x', password: 'xxx' }]
    });

    const erreur = await expectCode(
      restoreBackupDeliberately({
        storage,
        localStorageRef: store,
        requestPassword: async () => MDP_SAUVEGARDE,
        confirmDeliberate: async () => {
          storage.record = structuredClone(autre.record);
          return true;
        }
      }),
      'primary_vault_changed',
      'Un changement du stockage principal pendant le dialogue doit annuler'
    );

    assert.equal(erreur.details.changedDuringDialog, true);
    assert.equal(erreur.details.wrote, false);
    assert.equal(storage.writes, 0, 'Aucune ecriture de restauration');
    assert.notEqual(canonicalize(storage.record), attendu,
      'Le test a bien simule un changement');
    assert.equal(canonicalize(storage.record), canonicalize(autre.record),
      'Le contenu apparu pendant le dialogue est preserve tel quel');
  }

  // ===== 3. Cas normal : IndexedDB reste vide, la restauration aboutit ====
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(sauvegarde.record, { storage: store });
    const storage = new FakeVaultStorage(null);

    let etapes = [];
    const rapport = await restoreBackupWhenPrimaryMissing({
      storage,
      localStorageRef: store,
      requestPassword: async () => { etapes.push('mot-de-passe'); return MDP_SAUVEGARDE; },
      confirmRestore: async () => { etapes.push('confirmation'); return true; }
    });

    assert.deepEqual(etapes, ['confirmation', 'mot-de-passe'],
      'La confirmation precede la demande de mot de passe');
    assert.equal(rapport.restored, true, 'La restauration doit aboutir');
    assert.equal(rapport.entryCount, 2);
    assert.equal(storage.writes, 1, 'Une seule ecriture atomique');
    assert.equal(canonicalize(storage.record.entries), canonicalize(sauvegarde.record.entries),
      'Le coffre restaure doit correspondre a la sauvegarde');
  }

  // ===== 4. Restauration volontaire nominale, sans course ================
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(sauvegarde.record, { storage: store });
    const storage = new FakeVaultStorage(principal.record);

    const rapport = await restoreBackupDeliberately({
      storage,
      localStorageRef: store,
      requestPassword: async () => MDP_SAUVEGARDE,
      confirmDeliberate: async () => true
    });

    assert.equal(rapport.restored, true,
      'Sans course, une restauration volontaire reste possible');
    assert.equal(storage.writes, 1);
    assert.equal(canonicalize(storage.record.entries), canonicalize(sauvegarde.record.entries));
  }

  // ===== 5. La garde vit dans le service, pas dans l'interface ===========
  {
    const fs = await import('node:fs');
    const source = fs.readFileSync('scripts/core/storage/backup-restore-service.js', 'utf8');
    assert.ok(source.includes('primaryBeforeCanonical'),
      'Le service doit memoriser l\'etat anterieur au dialogue');
    assert.ok(/GARDE ANTI-COURSE/.test(source),
      'La garde doit etre explicitement documentee dans le service');

    // Le controle final doit se situer APRES la verification cryptographique
    // et AVANT l'appel a writeVaultRecordVerified.
    const posGarde = source.indexOf('appearedDuringDialog');
    const posEcriture = source.indexOf('await writeVaultRecordVerified');
    assert.ok(posGarde > 0 && posEcriture > posGarde,
      'La garde doit preceder immediatement l\'ecriture');
  }

  // ===== LOT 3C : une base ILLISIBLE n'est pas une base vide ==============
  // Les deux lectures du service (empreinte avant dialogue, relecture juste
  // avant l'ecriture) etaient enveloppees dans un `catch { ... = null; }`.
  // Deux lectures en echec produisaient donc deux `null` compares entre eux :
  // la garde anti-course concluait « rien n'a change » et la restauration
  // ecrasait un coffre dont l'etat n'avait jamais pu etre constate.
  {
    const store = new FakeLocalStorage();
    writeLocalBackup(sauvegarde.record, { storage: store });

    // Le diagnostic ne doit pas presenter une base illisible comme absente.
    const storageDiag = new FakeVaultStorage(principal.record);
    storageDiag.failNextRead = true;
    const situation = await inspectRestoreSituation({ storage: storageDiag, localStorageRef: store });
    assert.equal(situation.primaryUnreadable, true,
      'Le diagnostic doit dire que le coffre est illisible');
    assert.equal(situation.primaryUsable, false);
    assert.equal(situation.offerRestore, false,
      'Aucune restauration ne doit etre PROPOSEE par-dessus un coffre illisible');
    assert.equal(situation.reason, 'primary_vault_unreadable');

    // Et le service d'ecriture doit refuser, sans rien ecrire.
    const storage = new FakeVaultStorage(principal.record);
    const avant = canonicalize(storage.record);
    storage.failNextRead = true;

    const erreur = await expectCode(
      restoreBackupDeliberately({
        storage,
        localStorageRef: store,
        requestPassword: async () => MDP_SAUVEGARDE,
        confirmRestore: async () => true
      }),
      'primary_vault_unreadable',
      'Restauration sur coffre illisible'
    );

    assert.equal(erreur.details.wrote, false);
    assert.equal(storage.writes, 0,
      'AUCUNE ecriture ne doit avoir lieu quand l etat du coffre est inconnu');
    assert.equal(canonicalize(storage.record), avant,
      'Le coffre principal doit rester exactement dans son etat');
  }

  console.log('Restore race tests passed.');
} catch (error) {
  console.error('Restore race tests failed:', error);
  process.exitCode = 1;
}
