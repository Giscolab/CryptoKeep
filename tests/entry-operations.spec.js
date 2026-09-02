/**
 * Lot 3 - Ajout, modification et suppression d'une entree.
 *
 * Coffres et stockages exclusivement synthetiques. Les operations passent par
 * le vrai VaultManager, dont les ecritures utilisent la couche securisee du
 * Lot 2 : rien n'est simule au niveau cryptographique.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  createEntry,
  updateEntry,
  deleteEntry,
  describeEntryForConfirmation,
  inFlightCount,
  EntryOperationError
} from '../scripts/core/vault/entry-operations.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import { decryptData } from '../scripts/core/crypto/aes-gcm.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  base64ToBytes,
  entryAdditionalData
} from '../scripts/core/storage/vault-format.js';
import { buildSyntheticVault } from './helpers/vault-fixtures.js';

const MDP = 'phrase-de-passe-lot3-synthetique';

/** Stockage en memoire reproduisant le contrat de StorageManager. */
class MemoryStorage {
  constructor(record) {
    this.record = structuredClone(record);
    this.writes = 0;
    this.failNextWrites = 0;
  }
  async initializeDB() {}
  async loadVault() { return structuredClone(this.record); }
  async saveVault(entries, meta) {
    if (this.failNextWrites > 0) {
      this.failNextWrites -= 1;
      throw new Error('ecriture IndexedDB simulee en echec');
    }
    this.writes += 1;
    this.record = { id: 'current', entries: structuredClone(entries), meta: structuredClone(meta) };
    return { written: true };
  }
}

async function makeUnlockedManager(entries = []) {
  const built = await buildSyntheticVault({ password: MDP, entries });
  const storage = new MemoryStorage(built.record);
  const manager = new VaultManager({ storage });
  await manager.unlock(MDP);
  // `unlock()` normalise les horodatages des entrees qui n'en ont pas et
  // reecrit alors le coffre. Ce compteur est remis a zero pour que
  // `storage.writes` mesure UNIQUEMENT les ecritures provoquees par les
  // operations testees.
  storage.writes = 0;
  return { manager, storage, built };
}

async function decryptStoredEntry(storage, entryId, masterKey) {
  const record = await storage.loadVault();
  const stored = record.entries.find((entry) => entry.id === entryId);
  assert.ok(stored, `Entree ${entryId} absente du stockage`);
  const data = await decryptData(stored, masterKey, {
    additionalData: entryAdditionalData(entryId, 2)
  });
  return { stored, data };
}

async function expectOperationError(promise, code, message) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof EntryOperationError, `${message} : type inattendu (${error.name})`);
    assert.equal(error.code, code, `${message} : code ${code} attendu, obtenu ${error.code}`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST ENTRY OPERATIONS ===');

  // ========== AJOUT ======================================================
  {
    // 1 a 6. creation valide, tous les champs reellement persistes
    const { manager, storage } = await makeUnlockedManager();
    const salt = base64ToBytes(storage.record.meta.salt, 'salt');
    const key = await deriveMasterKey(MDP, salt, { iterations: CURRENT_PBKDF2_ITERATIONS });

    const rapport = await createEntry(manager, {
      title: '  Ma   Banque ',
      username: ' alice@exemple.test ',
      password: 'MotDePasseSynthetique!42',
      url: 'exemple.test/compte',
      category: 'banking',
      notes: '  question secrete  ',
      tags: ' Perso , PERSO , travail '
    });

    assert.equal(rapport.created, true, 'La creation doit reussir');
    assert.equal(rapport.entryCount, 1);
    assert.equal(storage.writes, 1, 'Une seule ecriture pour une creation');

    const id = manager.getEntries()[0].id;
    const { data } = await decryptStoredEntry(storage, id, key);

    assert.equal(data.title, 'Ma Banque', 'Titre normalise et persiste');
    assert.equal(data.username, 'alice@exemple.test', 'Nom d utilisateur persiste');
    assert.equal(data.password, 'MotDePasseSynthetique!42', 'Mot de passe persiste');
    assert.equal(data.url, 'https://exemple.test/compte', 'URL normalisee et persistee');
    assert.equal(data.category, 'bank', 'Categorie persistee, alias du markup traduit');
    assert.equal(data.notes, 'question secrete', 'Notes persistees');
    assert.deepEqual(data.tags, ['perso', 'travail'], 'Etiquettes persistees et dedupliquees');
    assert.ok(data.created_at, 'Date de creation presente');
    assert.ok(data.last_modified, 'Date de modification presente');
  }

  // 7. URL dangereuse refusee, aucune persistance
  {
    const { manager, storage } = await makeUnlockedManager();
    const erreur = await expectOperationError(
      createEntry(manager, { title: 'Piege', password: 'p', url: 'javascript:alert(1)' }),
      'forbidden_scheme', 'URL dangereuse'
    );
    assert.equal(erreur.field, 'url');
    assert.equal(storage.writes, 0, 'Aucune ecriture apres refus de validation');
    assert.equal(manager.getEntries().length, 0);
  }

  // 8. limites de champs
  {
    const { manager, storage } = await makeUnlockedManager();
    await expectOperationError(
      createEntry(manager, { title: 'x'.repeat(500), password: 'p' }),
      'field_too_long', 'Titre trop long');
    await expectOperationError(
      createEntry(manager, { title: 'T' }), 'required', 'Mot de passe obligatoire');
    assert.equal(storage.writes, 0);
  }

  // 9 a 11. identifiants uniques, IV neufs, AAD correcte
  {
    const { manager, storage } = await makeUnlockedManager();
    const salt = base64ToBytes(storage.record.meta.salt, 'salt');
    const key = await deriveMasterKey(MDP, salt, { iterations: CURRENT_PBKDF2_ITERATIONS });

    for (let i = 0; i < 4; i += 1) {
      await createEntry(manager, { title: `Service ${i}`, password: `motdepasse-${i}` });
    }

    const record = await storage.loadVault();
    const ids = new Set(record.entries.map((entry) => entry.id));
    assert.equal(ids.size, 4, 'Chaque entree doit avoir un identifiant unique');

    const ivs = new Set(record.entries.map((entry) => entry.iv));
    ivs.add(record.meta.validation.iv);
    assert.equal(ivs.size, 5, 'Chaque bloc chiffre doit avoir un IV distinct');

    // AAD correcte : le dechiffrement ne reussit qu'avec l'AAD du format.
    for (const entry of record.entries) {
      const ok = await decryptData(entry, key, {
        additionalData: entryAdditionalData(entry.id, 2)
      });
      assert.ok(ok.title.startsWith('Service '), 'Dechiffrement avec la bonne AAD');

      await assert.rejects(
        decryptData(entry, key, { additionalData: entryAdditionalData('mauvais-id', 2) }),
        'Une AAD incorrecte doit faire echouer le dechiffrement');
      await assert.rejects(
        decryptData(entry, key, {}),
        'L absence d AAD doit faire echouer le dechiffrement d un coffre v2');
    }
  }

  // 13 et 14. aucune persistance si l'ecriture echoue
  {
    const { manager, storage } = await makeUnlockedManager([
      { id: 'existant', title: 'Existant', username: 'zoe', password: 'zzz' }
    ]);
    const avant = JSON.stringify(storage.record);
    storage.failNextWrites = 1;

    await expectOperationError(
      createEntry(manager, { title: 'Nouvelle', password: 'p' }),
      'write_failed', 'Echec d ecriture IndexedDB');

    assert.equal(JSON.stringify(storage.record), avant, 'Le coffre doit etre inchange');
    assert.equal(manager.getEntries().length, 1, 'L etat en memoire ne doit pas avoir grossi');
    assert.equal(manager.getEntries()[0].title, 'Existant');
  }

  // 15. double clic sur validation : une seule creation
  {
    const { manager, storage } = await makeUnlockedManager();
    const saisie = { title: 'Double', password: 'motdepasse' };

    const [a, b] = await Promise.all([
      createEntry(manager, saisie),
      createEntry(manager, saisie)
    ]);

    assert.equal(storage.writes, 1, 'Un double declenchement ne doit produire qu une ecriture');
    assert.equal(manager.getEntries().length, 1, 'Une seule entree doit exister');
    assert.equal(a.entryCount, b.entryCount, 'Les deux appels partagent le meme resultat');
    assert.equal(inFlightCount(), 0, 'Le verrou doit etre relache');
  }

  // ========== MODIFICATION ===============================================
  // 18 a 28. tous les champs, horodatages, IV et ciphertext neufs
  {
    const { manager, storage } = await makeUnlockedManager([
      {
        id: 'edit-1',
        title: 'Avant',
        username: 'avant',
        password: 'AvantMotDePasse',
        url: 'https://avant.test/',
        category: 'email',
        notes: 'note avant',
        created_at: '2026-01-01T00:00:00.000Z',
        last_modified: '2026-01-01T00:00:00.000Z'
      }
    ]);
    const salt = base64ToBytes(storage.record.meta.salt, 'salt');
    const key = await deriveMasterKey(MDP, salt, { iterations: CURRENT_PBKDF2_ITERATIONS });

    const avantRecord = await storage.loadVault();
    const ivAvant = avantRecord.entries[0].iv;
    const ciphertextAvant = avantRecord.entries[0].ciphertext;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const rapport = await updateEntry(manager, 'edit-1', {
      title: '  Apres  ',
      username: 'apres',
      password: 'ApresMotDePasse',
      url: 'apres.test',
      category: 'work',
      notes: '  note apres  ',
      tags: 'A, a, B'
    });

    assert.equal(rapport.updated, true);
    assert.ok(rapport.previousEntry, 'L entree precedente doit etre fournie');
    assert.equal(rapport.previousEntry.title, 'Avant');

    const { stored, data } = await decryptStoredEntry(storage, 'edit-1', key);

    assert.equal(data.title, 'Apres', 'Titre modifie');
    assert.equal(data.username, 'apres', 'Nom d utilisateur modifie');
    assert.equal(data.password, 'ApresMotDePasse', 'Mot de passe modifie');
    assert.equal(data.url, 'https://apres.test/', 'URL modifiee et normalisee');
    assert.equal(data.category, 'work', 'Categorie modifiee');
    assert.equal(data.notes, 'note apres', 'Notes modifiees');
    assert.deepEqual(data.tags, ['a', 'b'], 'Etiquettes modifiees');

    assert.equal(data.created_at, '2026-01-01T00:00:00.000Z',
      'La date de creation doit etre conservee');
    assert.notEqual(data.last_modified, '2026-01-01T00:00:00.000Z',
      'La date de modification doit etre mise a jour');

    assert.notEqual(stored.iv, ivAvant, 'Une modification doit produire un IV NEUF');
    assert.notEqual(stored.ciphertext, ciphertextAvant,
      'Une modification doit produire un nouveau ciphertext');

    // AAD correcte apres modification.
    await assert.rejects(
      decryptData(stored, key, { additionalData: entryAdditionalData('autre-id', 2) }),
      'L AAD doit rester liee a l identifiant de l entree');
  }

  // 29. echec de sauvegarde : ancienne entree conservee
  {
    const { manager, storage } = await makeUnlockedManager([
      { id: 'edit-2', title: 'Intact', username: 'u', password: 'MotDePasseIntact' }
    ]);
    const avant = JSON.stringify(storage.record);
    storage.failNextWrites = 1;

    const erreur = await expectOperationError(
      updateEntry(manager, 'edit-2', { title: 'Nouveau titre' }),
      'write_failed', 'Echec de sauvegarde de modification');

    assert.ok(erreur.previousEntry, 'L entree precedente doit accompagner l erreur');
    assert.equal(erreur.previousEntry.title, 'Intact');
    assert.equal(JSON.stringify(storage.record), avant, 'Le coffre chiffre doit etre inchange');

    const enMemoire = manager.getEntries().find((entry) => entry.id === 'edit-2');
    assert.equal(enMemoire.title, 'Intact', 'L ancienne entree reste utilisable');
    assert.equal(enMemoire.password, 'MotDePasseIntact');
  }

  // 30 et 31. double clic, et couple blur + click : UNE seule sauvegarde
  {
    const { manager, storage } = await makeUnlockedManager([
      { id: 'edit-3', title: 'Origine', username: 'u', password: 'p' }
    ]);
    const avantRecord = await storage.loadVault();
    const ivOrigine = avantRecord.entries[0].iv;

    // Reproduction exacte du defaut historique : `blur` puis `click`
    // declenchaient chacun une sauvegarde complete.
    const [r1, r2, r3] = await Promise.all([
      updateEntry(manager, 'edit-3', { title: 'Modifie' }),   // blur
      updateEntry(manager, 'edit-3', { title: 'Modifie' }),   // click
      updateEntry(manager, 'edit-3', { title: 'Modifie' })    // clic supplementaire
    ]);

    assert.equal(storage.writes, 1,
      `Trois declencheurs concurrents ne doivent produire qu une ecriture (obtenu ${storage.writes})`);
    assert.equal(r1.entryId, r2.entryId);
    assert.equal(r2.entryId, r3.entryId);
    assert.equal(inFlightCount(), 0, 'Le verrou doit etre relache');

    const apresRecord = await storage.loadVault();
    assert.equal(apresRecord.entries.length, 1, 'Aucune duplication d entree');
    assert.notEqual(apresRecord.entries[0].iv, ivOrigine, 'Un IV neuf, un seul');
    assert.equal(manager.getEntries()[0].title, 'Modifie');
  }

  // Une modification refusee par la validation n'ecrit rien
  {
    const { manager, storage } = await makeUnlockedManager([
      { id: 'edit-4', title: 'Stable', password: 'p' }
    ]);
    await expectOperationError(
      updateEntry(manager, 'edit-4', { url: 'javascript:alert(1)' }),
      'forbidden_scheme', 'URL dangereuse en modification');
    assert.equal(storage.writes, 0);
    await expectOperationError(
      updateEntry(manager, '', { title: 'X' }), 'invalid_id', 'Identifiant vide');
  }

  // ========== SUPPRESSION ================================================
  // 32 a 34. suppression correcte, identite non sensible
  {
    const { manager, storage } = await makeUnlockedManager([
      { id: 'del-1', title: 'A supprimer', username: 'bob', password: 'MotDePasseTresSecret',
        url: 'https://cible.test/page', notes: 'note tres privee' },
      { id: 'del-2', title: 'A garder', username: 'ana', password: 'autre' }
    ]);

    const cible = manager.getEntries().find((entry) => entry.id === 'del-1');
    const identite = describeEntryForConfirmation(cible);

    assert.equal(identite.title, 'A supprimer', 'Le titre identifie l entree');
    assert.equal(identite.host, 'cible.test', 'Le nom d hote peut accompagner le titre');
    assert.equal(identite.username, 'bob');

    const serialise = JSON.stringify(identite);
    ['MotDePasseTresSecret', 'note tres privee'].forEach((secret) => {
      assert.ok(!serialise.includes(secret),
        `La confirmation ne doit JAMAIS contenir ${secret.slice(0, 12)}`);
    });
    assert.equal('password' in identite, false, 'Aucun champ mot de passe dans l identite');
    assert.equal('notes' in identite, false, 'Aucun champ notes dans l identite');

    const rapport = await deleteEntry(manager, 'del-1');
    assert.equal(rapport.deleted, true);
    assert.equal(storage.writes, 1);
    assert.equal(manager.getEntries().length, 1, 'Une seule entree doit rester');
    assert.equal(manager.getEntries()[0].id, 'del-2');
  }

  // 35. double clic : une seule suppression reelle
  {
    const { manager, storage } = await makeUnlockedManager([
      { id: 'del-3', title: 'Cible', password: 'p' },
      { id: 'del-4', title: 'Autre', password: 'p' }
    ]);

    const resultats = await Promise.allSettled([
      deleteEntry(manager, 'del-3'),
      deleteEntry(manager, 'del-3'),
      deleteEntry(manager, 'del-3')
    ]);

    const reussites = resultats.filter((r) => r.status === 'fulfilled');
    assert.equal(reussites.length, 3, 'Les appels concurrents partagent le meme resultat');
    assert.equal(storage.writes, 1,
      `Un double clic ne doit produire qu une suppression (obtenu ${storage.writes})`);
    assert.equal(manager.getEntries().length, 1, 'Une seule entree supprimee');
    assert.equal(inFlightCount(), 0);

    // Une suppression posterieure de la meme entree echoue proprement.
    await expectOperationError(deleteEntry(manager, 'del-3'), 'not_found',
      'Entree deja supprimee');
    assert.equal(storage.writes, 1, 'Aucune ecriture supplementaire');
  }

  // 36. echec d ecriture : entree conservee
  {
    const { manager, storage } = await makeUnlockedManager([
      { id: 'del-5', title: 'Resistante', password: 'MotDePasseResistant' }
    ]);
    const avant = JSON.stringify(storage.record);
    storage.failNextWrites = 1;

    const erreur = await expectOperationError(
      deleteEntry(manager, 'del-5'), 'write_failed', 'Echec de suppression');

    assert.ok(erreur.previousEntry, 'L entree precedente doit accompagner l erreur');
    assert.equal(JSON.stringify(storage.record), avant, 'Le coffre doit etre inchange');
    assert.equal(manager.getEntries().length, 1,
      'L entree ne doit pas avoir disparu de la memoire');
    assert.equal(manager.getEntries()[0].password, 'MotDePasseResistant');
  }

  // Identite d une entree sans titre ni URL
  {
    const identite = describeEntryForConfirmation({ id: 'x', password: 'secret' });
    assert.equal(identite.title, 'Entree sans titre');
    assert.equal(identite.host, '');
    assert.ok(!JSON.stringify(identite).includes('secret'));
    assert.equal(describeEntryForConfirmation(null).title, 'Entree inconnue');
  }

  // ========== EVENEMENT DE RAFRAICHISSEMENT ==============================
  {
    // 37. une mutation reussie diffuse vault:entries-changed
    const evenements = [];
    globalThis.document = {
      dispatchEvent: (event) => { evenements.push(event.type); return true; }
    };

    const { manager } = await makeUnlockedManager([{ id: 'ev-1', title: 'E', password: 'p' }]);
    await createEntry(manager, { title: 'Nouvelle', password: 'p' });
    await updateEntry(manager, 'ev-1', { title: 'Modifiee' });
    await deleteEntry(manager, 'ev-1');

    assert.equal(evenements.length, 3, 'Trois mutations, trois evenements');
    assert.ok(evenements.every((type) => type === 'vault:entries-changed'),
      'Toutes les mutations diffusent le meme evenement de rafraichissement');

    delete globalThis.document;
  }

  console.log('Entry operations tests passed.');
} catch (error) {
  console.error('Entry operations tests failed:', error);
  process.exitCode = 1;
}
