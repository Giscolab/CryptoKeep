/**
 * CryptoKeep - Verification cryptographique complete d'un coffre (Lot 2).
 *
 * Source unique partagee par l'import `.vault` et la restauration d'une
 * sauvegarde secondaire : les deux flux doivent appliquer EXACTEMENT la meme
 * exigence avant toute ecriture.
 *
 * Le contrat :
 *   - la cle est derivee a partir des metadonnees DU COFFRE EXAMINE (sel,
 *     algorithme, iterations), jamais de celles du coffre courant ;
 *   - le format v1 historique est dechiffre SANS AAD, le format v2 avec les
 *     AAD exactes definies par vault-format.js ;
 *   - le bloc de validation est verifie en premier ;
 *   - TOUTES les entrees sont ensuite dechiffrees et authentifiees ; une
 *     alteration en position quelconque fait echouer l'ensemble ;
 *   - le plaintext obtenu est valide (type, structure, taille) ;
 *   - tout echec cryptographique produit le MEME message generique, qu'il
 *     s'agisse d'un mauvais mot de passe, d'une AAD incorrecte ou d'une
 *     donnee alteree.
 */

import { decryptData } from '../crypto/aes-gcm.js';
import { deriveMasterKey } from '../crypto/pbkdf2.js';
import { validateDecryptedEntries } from './plaintext-validator.js';
import {
  CURRENT_VAULT_FORMAT_VERSION,
  entryAdditionalData,
  validationAdditionalData
} from './vault-format.js';

/** Message unique pour tout echec cryptographique. Aucun detail ne fuit. */
export const GENERIC_CRYPTO_FAILURE =
  'Impossible de dechiffrer le coffre. Mot de passe incorrect ou donnees alterees.';

export class VaultCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VaultCryptoError';
    this.code = code;
  }
}

/** v1 historique : aucune AAD. v2 : AAD exactes du format. */
export function entryOptionsFor(entryId, formatVersion) {
  if (formatVersion < CURRENT_VAULT_FORMAT_VERSION) return {};
  return { additionalData: entryAdditionalData(entryId, formatVersion) };
}

export function validationOptionsFor(formatVersion) {
  if (formatVersion < CURRENT_VAULT_FORMAT_VERSION) return {};
  return { additionalData: validationAdditionalData(formatVersion) };
}

/**
 * Derive la cle, verifie le bloc de validation, dechiffre toutes les entrees
 * et valide le plaintext.
 *
 * @param {object} normalizedRecord record deja valide structurellement
 * @param {object} metadata metadonnees issues du validateur (saltBytes, iterations, formatVersion)
 * @param {string} password
 * @param {{derive?: Function, decrypt?: Function}} deps
 * @returns {Promise<{key: CryptoKey, entries: Array, plaintextStats: object}>}
 */
export async function verifyAndDecryptVault(normalizedRecord, metadata, password, deps = {}) {
  const { derive = deriveMasterKey, decrypt = decryptData } = deps;

  if (typeof password !== 'string' || password.length === 0) {
    throw new VaultCryptoError('no_password', 'Un mot de passe est requis.');
  }

  const saltBytes = metadata.saltBytes.slice();
  let key;

  try {
    try {
      key = await derive(password, saltBytes, { iterations: metadata.iterations });
    } catch {
      throw new VaultCryptoError('crypto_failure', GENERIC_CRYPTO_FAILURE);
    }

    // 1. bloc de validation
    try {
      const check = await decrypt(
        normalizedRecord.meta.validation,
        key,
        validationOptionsFor(metadata.formatVersion)
      );
      if (!check || check.check !== 'ok') {
        throw new Error('validation payload mismatch');
      }
    } catch {
      throw new VaultCryptoError('crypto_failure', GENERIC_CRYPTO_FAILURE);
    }

    // 2. toutes les entrees, sans exception
    const entries = [];
    for (const entry of normalizedRecord.entries) {
      let data;
      try {
        data = await decrypt(entry, key, entryOptionsFor(entry.id, metadata.formatVersion));
      } catch {
        throw new VaultCryptoError('crypto_failure', GENERIC_CRYPTO_FAILURE);
      }
      entries.push(data);
    }

    // 3. plaintext
    let plaintextStats;
    try {
      plaintextStats = validateDecryptedEntries(entries);
    } catch (error) {
      throw new VaultCryptoError(
        error.code || 'invalid_plaintext',
        `Contenu dechiffre refuse : ${error.message}`
      );
    }

    return { key, entries, plaintextStats };
  } finally {
    // Le sel copie est remis a zero. La cle derivee et les chaines produites
    // par le dechiffrement ne peuvent pas etre effacees de facon fiable.
    saltBytes.fill(0);
  }
}

export default { verifyAndDecryptVault, entryOptionsFor, validationOptionsFor, VaultCryptoError };
