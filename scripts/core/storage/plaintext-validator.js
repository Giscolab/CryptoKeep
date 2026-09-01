/**
 * CryptoKeep - Validation des entrees APRES dechiffrement (Lot 2).
 *
 * Le dechiffrement authentifie prouve que le contenu vient bien du detenteur
 * du mot de passe. Il ne prouve PAS que ce contenu est raisonnable : un coffre
 * fabrique par un tiers, ou corrompu avant chiffrement, peut contenir des
 * structures aberrantes destinees a saturer la memoire ou l'interface.
 *
 * Aucune donnee dechiffree invalide ne doit etre persistee. Ce module ne
 * journalise jamais de valeur : seuls le nom du champ et la nature du refus
 * apparaissent dans les messages.
 */

import {
  MAX_ENTRY_PROPERTIES,
  MAX_ENTRY_TAGS,
  MAX_ENTRY_TOTAL_BYTES,
  MAX_FIELD_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_TOTAL_PLAINTEXT_BYTES
} from './import-limits.js';

export class PlaintextValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlaintextValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PlaintextValidationError(code, message);
}

function utf8Length(text) {
  return new TextEncoder().encode(text).length;
}

function maxLengthFor(fieldName) {
  return fieldName === 'notes' ? MAX_NOTES_LENGTH : MAX_FIELD_LENGTH;
}

function assertScalar(value, fieldName, label) {
  if (value === null) return;

  const type = typeof value;

  if (type === 'string') {
    if (value.length > maxLengthFor(fieldName)) {
      fail('field_too_large', `${label}.${fieldName} depasse la taille autorisee.`);
    }
    return;
  }

  if (type === 'number') {
    if (!Number.isFinite(value)) {
      fail('invalid_field', `${label}.${fieldName} doit etre un nombre fini.`);
    }
    return;
  }

  if (type === 'boolean') return;

  fail('invalid_field', `${label}.${fieldName} a un type non supporte.`);
}

/**
 * Valide une entree dechiffree.
 *
 * @param {unknown} entry
 * @param {string} label libelle non sensible utilise dans les messages
 * @returns {{byteLength: number, propertyCount: number}}
 */
export function validateDecryptedEntry(entry, label = 'entree') {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    fail('invalid_structure', `${label} dechiffree n'est pas un objet.`);
  }

  const keys = Object.keys(entry);
  if (keys.length > MAX_ENTRY_PROPERTIES) {
    fail('too_many_properties', `${label} declare trop de proprietes.`);
  }

  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 64) {
      fail('invalid_field', `${label} possede un nom de champ invalide.`);
    }
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      fail('invalid_field', `${label} possede un nom de champ interdit.`);
    }

    const value = Object.getOwnPropertyDescriptor(entry, key)?.value;

    if (Array.isArray(value)) {
      if (value.length > MAX_ENTRY_TAGS) {
        fail('too_many_tags', `${label}.${key} contient trop d'elements.`);
      }
      for (const item of value) {
        if (typeof item !== 'string') {
          fail('invalid_field', `${label}.${key} doit contenir uniquement des chaines.`);
        }
        if (item.length > MAX_FIELD_LENGTH) {
          fail('field_too_large', `${label}.${key} contient un element trop long.`);
        }
      }
      continue;
    }

    if (value !== null && typeof value === 'object') {
      fail('invalid_field', `${label}.${key} ne peut pas etre un objet imbrique.`);
    }

    assertScalar(value, key, label);
  }

  let serialized;
  try {
    serialized = JSON.stringify(entry);
  } catch {
    fail('invalid_structure', `${label} dechiffree n'est pas serialisable.`);
  }

  const byteLength = utf8Length(serialized);
  if (byteLength > MAX_ENTRY_TOTAL_BYTES) {
    fail('entry_too_large', `${label} dechiffree depasse la taille totale autorisee.`);
  }

  return { byteLength, propertyCount: keys.length };
}

/**
 * Valide un lot complet d'entrees dechiffrees et la taille cumulee.
 *
 * @param {Array} entries
 * @returns {{totalBytes: number, count: number}}
 */
export function validateDecryptedEntries(entries) {
  if (!Array.isArray(entries)) {
    fail('invalid_structure', 'Le lot dechiffre n\'est pas un tableau.');
  }

  let totalBytes = 0;
  entries.forEach((entry, index) => {
    const { byteLength } = validateDecryptedEntry(entry, `entree ${index}`);
    totalBytes += byteLength;
    if (totalBytes > MAX_TOTAL_PLAINTEXT_BYTES) {
      fail('total_too_large', 'La taille cumulee des donnees dechiffrees depasse la limite.');
    }
  });

  return { totalBytes, count: entries.length };
}

export default { validateDecryptedEntry, validateDecryptedEntries, PlaintextValidationError };
