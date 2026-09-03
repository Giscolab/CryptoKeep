/**
 * CryptoKeep - Service d'import `.vault` securise (Lot 2).
 *
 * Le coffre courant n'est JAMAIS remplace avant que la validation structurelle
 * ET cryptographique complete du fichier importe ait reussi, et avant que
 * l'utilisateur ait confirme explicitement.
 *
 * Ordre impose (les numeros correspondent au cahier des charges du Lot 2) :
 *   1. controle preliminaire  : extension insensible a la casse, taille
 *   2. lecture protegee       : UTF-8, retrait du BOM, JSON.parse encadre
 *   3. validation stricte     : liste exacte de proprietes, par version
 *   4. donnees chiffrees      : { id, iv, ciphertext } exactement
 *   5. limites de charge      : centralisees dans import-limits.js
 *   6. identifiants et IV     : non vides, uniques, IV compares decodes
 *   7. mot de passe           : fenetre dediee, champ type password
 *   8. derivation             : metadonnees DU COFFRE IMPORTE uniquement
 *   9. verification crypto    : bloc de validation, message generique
 *  10. dechiffrement complet  : toutes les entrees, avant toute ecriture
 *  11. validation du plaintext
 *  12. confirmation explicite
 *  13. instantane chiffre du coffre courant
 *  14. remplacement atomique
 *  15. verification post-ecriture par serialisation canonique
 *  16. restauration si divergence apres ecriture validee
 *  17. sauvegarde secondaire, seulement ensuite
 *  18. nettoyage dans un bloc finally
 *
 * LIMITE ASSUMEE : le nettoyage remet a zero les `Uint8Array` que ce module
 * controle et abandonne ses references. Les chaines JavaScript, les objets
 * geres par le ramasse-miettes et les `CryptoKey` ne peuvent PAS etre effaces
 * de la memoire de facon fiable. Aucune promesse contraire n'est faite.
 */

import { decryptData } from '../crypto/aes-gcm.js';
import { deriveMasterKey } from '../crypto/pbkdf2.js';
import { MAX_VAULT_FILE_BYTES } from './import-limits.js';
import {
  VaultImportValidationError,
  validateImportedVaultStructure
} from './vault-import-validator.js';
import {
  GENERIC_CRYPTO_FAILURE as SHARED_CRYPTO_FAILURE,
  verifyAndDecryptVault
} from './vault-crypto-verify.js';
import {
  createEncryptedSnapshot,
  writeVaultRecordVerified
} from './vault-transaction.js';
import { writeLocalBackup } from './local-backup.js';

/**
 * Message unique pour tout echec cryptographique. Reexporte depuis
 * vault-crypto-verify.js pour qu'import et restauration disent la MEME chose :
 * mot de passe incorrect, AAD incorrecte et alteration sont indiscernables.
 */
export const GENERIC_CRYPTO_FAILURE = SHARED_CRYPTO_FAILURE;

export class VaultImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'VaultImportError';
    this.code = code;
    this.details = details;
  }
}

/*
 * Les options d'AAD par version et la verification cryptographique complete
 * vivent desormais dans vault-crypto-verify.js, partage avec la restauration
 * d'une sauvegarde secondaire.
 */

/** Etape 1 : controle preliminaire, avant toute lecture. */
export function assertImportableFile(file) {
  if (!file || typeof file !== 'object') {
    throw new VaultImportError('no_file', 'Aucun fichier selectionne.');
  }

  const name = typeof file.name === 'string' ? file.name : '';
  if (!/\.vault$/i.test(name)) {
    throw new VaultImportError('bad_extension', 'Fichier invalide. Extension requise : .vault');
  }

  if (typeof file.size !== 'number' || !Number.isFinite(file.size)) {
    throw new VaultImportError('unreadable', 'Le fichier n\'est pas accessible.');
  }

  if (file.size === 0) {
    throw new VaultImportError('empty_file', 'Le fichier .vault est vide.');
  }

  // Taille controlee AVANT parsing, jamais apres.
  if (file.size > MAX_VAULT_FILE_BYTES) {
    throw new VaultImportError(
      'file_too_large',
      `Fichier .vault trop volumineux (limite : ${MAX_VAULT_FILE_BYTES} octets).`
    );
  }

  return true;
}

/** Etape 2 : lecture protegee. Retire un eventuel BOM UTF-8. */
export function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function readVaultFile(file, readFile) {
  let text;
  try {
    text = await readFile(file);
  } catch {
    throw new VaultImportError('unreadable', 'Le fichier n\'a pas pu etre lu.');
  }

  if (typeof text !== 'string') {
    throw new VaultImportError('unreadable', 'Le fichier n\'a pas pu etre lu en texte.');
  }

  const cleaned = stripBom(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Aucun extrait du fichier n'est journalise ni affiche.
    throw new VaultImportError('invalid_json', 'Le fichier .vault ne contient pas de JSON valide.');
  }
}

/**
 * Import complet d'un fichier `.vault`.
 *
 * @param {File|{name: string, size: number}} file
 * @param {object} deps injections (stockage, dialogues, crypto) pour les tests
 * @returns {Promise<object>} rapport verifiable
 */
export async function importVaultFile(file, deps = {}) {
  const {
    storage,
    readFile = (f) => f.text(),
    requestPassword,
    confirmImport,
    derive = deriveMasterKey,
    decrypt = decryptData,
    localStorageRef = typeof localStorage !== 'undefined' ? localStorage : null,
    now
  } = deps;

  if (!storage) throw new VaultImportError('no_storage', 'Stockage indisponible.');
  if (typeof requestPassword !== 'function') {
    throw new VaultImportError('no_prompt', 'Aucun dialogue de mot de passe fourni.');
  }

  let password = null;
  let saltBytes = null;
  let decryptedEntries = null;

  try {
    // --- 1. controle preliminaire ---------------------------------------
    assertImportableFile(file);

    // --- 2. lecture protegee --------------------------------------------
    const parsed = await readVaultFile(file, readFile);

    // --- 3 a 6. validation structurelle stricte -------------------------
    let validated;
    try {
      validated = validateImportedVaultStructure(parsed);
    } catch (error) {
      if (error instanceof VaultImportValidationError) {
        throw new VaultImportError(error.code, error.message);
      }
      throw error;
    }

    const { metadata, normalized, stats } = validated;

    // --- 7. mot de passe du coffre IMPORTE ------------------------------
    password = await requestPassword({
      title: 'Mot de passe du coffre importe',
      description: `Coffre au format v${stats.formatVersion}, ${stats.entryCount} entree(s).`
    });

    if (password === null || password === undefined || password === '') {
      throw new VaultImportError('cancelled', 'Import annule : aucun mot de passe fourni.');
    }

    // --- 8. derivation depuis les metadonnees DU FICHIER ----------------
    // verifyAndDecryptVault derive la cle a partir de metadata (sel,
    // iterations, version) du coffre IMPORTE, jamais du coffre courant.
    saltBytes = metadata.saltBytes.slice();

    // --- 9 a 11. verification cryptographique complete ------------------
    // Bloc de validation, puis TOUTES les entrees, puis validation du
    // plaintext. Rien n'a encore ete ecrit a ce stade.
    let verification;
    try {
      verification = await verifyAndDecryptVault(normalized, metadata, password, { derive, decrypt });
    } catch (error) {
      throw new VaultImportError(
        error.code === 'crypto_failure' ? 'crypto_failure' : (error.code || 'invalid_plaintext'),
        error.message
      );
    }
    decryptedEntries = verification.entries;
    const plaintextStats = verification.plaintextStats;

    // --- 12. resume puis confirmation explicite -------------------------
    const summary = {
      entryCount: stats.entryCount,
      formatVersion: stats.formatVersion,
      iterations: metadata.iterations,
      kdf: metadata.kdf,
      distinctIvCount: stats.distinctIvCount,
      totalCiphertextBytes: stats.totalCiphertextBytes,
      totalPlaintextBytes: plaintextStats.totalBytes,
      createdAt: metadata.createdAt,
      lastModified: metadata.lastModified,
      structureValidated: true,
      cryptographyVerified: true,
      allEntriesDecrypted: true
    };

    // Lot 2 partie 2 : l'absence de callback ne vaut jamais consentement
    // implicite. Sans confirmation possible, aucune persistance.
    if (typeof confirmImport !== 'function') {
      throw new VaultImportError(
        'confirmation_required',
        'Une confirmation explicite est requise avant de remplacer le coffre.',
        { summary }
      );
    }

    {
      const confirmed = await confirmImport(summary);
      if (!confirmed) {
        // Annulation : le coffre courant est strictement inchange, aucune
        // ecriture n'a eu lieu jusqu'ici.
        throw new VaultImportError('cancelled', 'Import annule par l\'utilisateur.', { summary });
      }
    }

    // --- 13. instantane exclusivement chiffre du coffre courant ---------
    //
    // LOT 3C : ce bloc confondait lui aussi « aucun coffre » et « coffre
    // illisible ». Un import remplace l'INTEGRALITE du coffre : poursuivre
    // sans instantane exploitable rendait l'operation irreversible tout en
    // laissant croire qu'une restauration la protegeait. Une lecture qui
    // echoue interrompt donc l'import AVANT toute ecriture.
    let currentRecord = null;
    try {
      currentRecord = await storage.loadVault();
    } catch (error) {
      throw new VaultImportError(
        'current_vault_unreadable',
        'Le coffre actuel n\'a pas pu etre lu. Import abandonne, rien n\'a ete ecrit.',
        { wrote: false, cause: error && error.name ? error.name : 'unknown' }
      );
    }
    const snapshot = createEncryptedSnapshot(currentRecord);

    // --- 14 a 16. ecriture atomique, verification, restauration ---------
    await writeVaultRecordVerified(storage, normalized, snapshot);

    // --- 17. sauvegarde secondaire, apres verification seulement --------
    const backupResult = writeLocalBackup(normalized, { storage: localStorageRef, now });

    return {
      imported: true,
      summary,
      backup: backupResult,
      replacedEntryCount: snapshot ? snapshot.entries.length : 0
    };
  } finally {
    // --- 18. nettoyage --------------------------------------------------
    // Les Uint8Array controles par ce module sont remis a zero. Les chaines,
    // objets et CryptoKey ne peuvent pas etre effaces de facon fiable.
    if (saltBytes instanceof Uint8Array) saltBytes.fill(0);
    saltBytes = null;
    password = null;
    if (Array.isArray(decryptedEntries)) decryptedEntries.length = 0;
    decryptedEntries = null;
    // La CryptoKey derivee n'est volontairement retenue par aucune variable
    // de cette fonction : elle ne vit que dans la portee de
    // verifyAndDecryptVault. Aucune reference n'est donc a liberer ici, et
    // il ne serait de toute facon pas possible de l'effacer de la memoire.

    if (typeof deps.onCleanup === 'function') {
      try {
        deps.onCleanup();
      } catch {
        /* nettoyage best-effort */
      }
    }
  }
}

export default { importVaultFile, assertImportableFile, readVaultFile, stripBom, VaultImportError };
