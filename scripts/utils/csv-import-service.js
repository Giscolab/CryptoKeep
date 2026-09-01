/**
 * CryptoKeep - Import CSV robuste (Lot 2).
 *
 * L'import CSV AJOUTE des entrees. Il ne remplace jamais implicitement une
 * entree existante : chaque ligne acceptee recoit un identifiant neuf issu de
 * `crypto.randomUUID()`. Les ressemblances de contenu sont signalees dans
 * l'apercu, elles ne declenchent aucun ecrasement.
 *
 * L'ecriture est atomique : tout est parse, valide, chiffre et assemble en
 * memoire AVANT la moindre transaction. Aucun echec ne peut laisser une
 * partie seulement des lignes importees.
 */

import { encryptData } from '../core/crypto/aes-gcm.js';
import {
  MAX_CSV_FILE_BYTES,
  MAX_CSV_ROWS,
  MAX_FIELD_LENGTH
} from '../core/storage/import-limits.js';
import { validateDecryptedEntry } from '../core/storage/plaintext-validator.js';
import { validateImportedVaultStructure } from '../core/storage/vault-import-validator.js';
import { entryOptionsFor } from '../core/storage/vault-crypto-verify.js';
import {
  createEncryptedSnapshot,
  writeVaultRecordVerified
} from '../core/storage/vault-transaction.js';
import { writeLocalBackup } from '../core/storage/local-backup.js';
import { parseCsv, CsvParseError } from './csv-parser.js';

export class CsvImportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CsvImportError';
    this.code = code;
  }
}

/**
 * Synonymes d'en-tete reconnus, apres normalisation.
 * L'ordre des colonnes dans le fichier n'a aucune importance.
 */
export const HEADER_ALIASES = Object.freeze({
  title: ['name', 'title', 'nom', 'titre', 'site', 'sitename', 'accountname'],
  url: ['url', 'website', 'websiteurl', 'weburl', 'loginuri', 'uri', 'adresse', 'lien'],
  username: ['username', 'user', 'login', 'loginusername', 'email', 'emailaddress', 'identifiant', 'utilisateur', 'nomdutilisateur'],
  password: ['password', 'pass', 'motdepasse', 'passwd', 'loginpassword'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarque', 'remarques'],
  category: ['category', 'categorie', 'folder', 'dossier', 'group', 'groupe', 'type']
});

function findColumn(normalizedHeaders, aliases) {
  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const header = normalizedHeaders.at(index);
    if (aliases.includes(header)) return index;
  }
  return -1;
}

/**
 * Determine le mapping colonne -> champ. Independant de l'ordre des colonnes.
 * @returns {{mapping: object, missing: string[]}}
 */
export function detectColumnMapping(normalizedHeaders) {
  const mapping = {
    title: findColumn(normalizedHeaders, HEADER_ALIASES.title),
    url: findColumn(normalizedHeaders, HEADER_ALIASES.url),
    username: findColumn(normalizedHeaders, HEADER_ALIASES.username),
    password: findColumn(normalizedHeaders, HEADER_ALIASES.password),
    notes: findColumn(normalizedHeaders, HEADER_ALIASES.notes),
    category: findColumn(normalizedHeaders, HEADER_ALIASES.category)
  };

  const missing = [];
  // Le mot de passe est obligatoire.
  if (mapping.password === -1) missing.push('password');
  // Il faut au moins une colonne permettant d'identifier l'entree.
  if (mapping.title === -1 && mapping.url === -1 && mapping.username === -1) {
    missing.push('title|url|username');
  }

  return { mapping, missing };
}

function cellAt(values, index) {
  if (index < 0 || index >= values.length) return '';
  const raw = values.at(index);
  return typeof raw === 'string' ? raw.trim() : '';
}

function firstOverlongField(entry) {
  if (entry.title.length > MAX_FIELD_LENGTH) return 'title';
  if (entry.url.length > MAX_FIELD_LENGTH) return 'url';
  if (entry.username.length > MAX_FIELD_LENGTH) return 'username';
  if (entry.password.length > MAX_FIELD_LENGTH) return 'password';
  if (entry.notes.length > MAX_FIELD_LENGTH) return 'notes';
  if (entry.category.length > MAX_FIELD_LENGTH) return 'category';
  return null;
}

/**
 * Analyse les lignes et produit un apercu. N'ECRIT RIEN et ne chiffre rien.
 * Aucun mot de passe n'apparait dans l'apercu ni dans les motifs de rejet.
 */
export function analyzeCsvRows(parsed, options = {}) {
  const maxRows = options.maxRows ?? MAX_CSV_ROWS;
  const { mapping, missing } = detectColumnMapping(parsed.normalizedHeaders);

  if (missing.length > 0) {
    throw new CsvImportError(
      'missing_columns',
      `Colonnes obligatoires absentes : ${missing.join(', ')}.`
    );
  }

  if (parsed.rows.length > maxRows) {
    throw new CsvImportError('too_many_rows', `Le fichier CSV depasse ${maxRows} lignes de donnees.`);
  }

  const accepted = [];
  const rejected = [];
  let skippedEmpty = 0;
  const signatures = new Map();
  const duplicates = [];

  parsed.rows.forEach((row) => {
    const isEmpty = row.values.every((value) => typeof value !== 'string' || value.trim() === '');
    if (isEmpty) {
      skippedEmpty += 1;
      return;
    }

    const entry = {
      title: cellAt(row.values, mapping.title),
      url: cellAt(row.values, mapping.url),
      username: cellAt(row.values, mapping.username),
      password: cellAt(row.values, mapping.password),
      notes: cellAt(row.values, mapping.notes),
      category: cellAt(row.values, mapping.category)
    };

    // Le mot de passe est obligatoire.
    if (entry.password.length === 0) {
      rejected.push({ line: row.line, reason: 'mot de passe absent' });
      return;
    }

    // Au moins un element identifiant. URL et nom d'utilisateur peuvent
    // manquer individuellement.
    if (entry.title.length === 0 && entry.url.length === 0 && entry.username.length === 0) {
      rejected.push({ line: row.line, reason: "aucun titre, URL ni nom d'utilisateur" });
      return;
    }

    const tooLong = firstOverlongField(entry);
    if (tooLong) {
      rejected.push({ line: row.line, reason: `champ ${tooLong} trop long` });
      return;
    }

    // Signature de ressemblance : titre + identifiant + URL. Le mot de passe
    // n'entre PAS dans la signature et n'est jamais expose.
    const signature = `${entry.title} ${entry.username} ${entry.url}`.toLowerCase();
    if (signatures.has(signature)) {
      duplicates.push({ line: row.line, firstSeenLine: signatures.get(signature) });
    } else {
      signatures.set(signature, row.line);
    }

    accepted.push({ line: row.line, entry });
  });

  return {
    mapping,
    headers: parsed.headers,
    acceptedCount: accepted.length,
    skippedCount: skippedEmpty,
    rejectedCount: rejected.length,
    rejected,
    duplicates,
    accepted,
    // Apercu limite, sans aucun mot de passe.
    preview: accepted.slice(0, 10).map(({ line, entry }) => ({
      line,
      title: entry.title,
      username: entry.username,
      url: entry.url,
      category: entry.category,
      passwordProvided: entry.password.length > 0
    }))
  };
}

/** Lit un fichier CSV en refusant les sequences UTF-8 invalides. */
export async function readCsvFile(file, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_CSV_FILE_BYTES;

  if (!file || typeof file !== 'object') {
    throw new CsvImportError('no_file', 'Aucun fichier selectionne.');
  }

  if (typeof file.size !== 'number' || !Number.isFinite(file.size)) {
    throw new CsvImportError('unreadable', "Le fichier n'est pas accessible.");
  }

  // Taille controlee AVANT lecture et AVANT parsing.
  if (file.size > maxBytes) {
    throw new CsvImportError('file_too_large', `Fichier CSV trop volumineux (limite : ${maxBytes} octets).`);
  }

  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new CsvImportError('unreadable', "Le fichier CSV n'a pas pu etre lu.");
  }

  if (buffer.byteLength > maxBytes) {
    throw new CsvImportError('file_too_large', `Fichier CSV trop volumineux (limite : ${maxBytes} octets).`);
  }

  try {
    // `fatal: true` : toute sequence UTF-8 invalide fait echouer le decodage
    // au lieu d'introduire des caracteres de remplacement silencieux.
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new CsvImportError('invalid_utf8', "Le fichier CSV n'est pas encode en UTF-8 valide.");
  }
}

/**
 * Import CSV complet et atomique.
 *
 * @param {object} file fichier CSV
 * @param {object} deps injections : storage, cle de session, dialogues
 */
export async function importCsvFile(file, deps = {}) {
  const {
    storage,
    masterKey,
    confirmImport,
    encrypt = encryptData,
    localStorageRef = typeof localStorage !== 'undefined' ? localStorage : null,
    generateId = () => crypto.randomUUID(),
    now = () => new Date().toISOString(),
    onSuccess
  } = deps;

  if (!storage) throw new CsvImportError('no_storage', 'Stockage indisponible.');
  if (!masterKey) {
    throw new CsvImportError('locked', 'Le coffre doit etre deverrouille pour importer un CSV.');
  }

  let analysis = null;
  let newEntries = null;

  try {
    // --- 1. lire, parser et valider TOUT en memoire ---------------------
    const text = await readCsvFile(file, deps);

    let parsed;
    try {
      parsed = parseCsv(text, { maxRows: MAX_CSV_ROWS });
    } catch (error) {
      if (error instanceof CsvParseError) {
        throw new CsvImportError(error.code, error.message);
      }
      throw error;
    }

    analysis = analyzeCsvRows(parsed, deps);

    if (analysis.acceptedCount === 0) {
      throw new CsvImportError('no_valid_row', 'Aucune ligne exploitable dans le fichier CSV.');
    }

    // --- apercu et confirmation explicite -------------------------------
    if (typeof confirmImport === 'function') {
      const accepted = await confirmImport({
        mapping: analysis.mapping,
        headers: analysis.headers,
        preview: analysis.preview,
        acceptedCount: analysis.acceptedCount,
        skippedCount: analysis.skippedCount,
        rejectedCount: analysis.rejectedCount,
        rejected: analysis.rejected,
        duplicates: analysis.duplicates
      });
      if (!accepted) {
        throw new CsvImportError('cancelled', "Import CSV annule par l'utilisateur.");
      }
    }

    // --- 2. identifiants neufs ------------------------------------------
    const timestamp = now();
    newEntries = analysis.accepted.map(({ entry }) => {
      const payload = { created_at: timestamp, last_modified: timestamp };
      if (entry.title) payload.title = entry.title;
      if (entry.url) payload.url = entry.url;
      if (entry.username) payload.username = entry.username;
      if (entry.notes) payload.notes = entry.notes;
      if (entry.category) payload.category = entry.category;
      payload.password = entry.password;

      validateDecryptedEntry(payload, 'ligne CSV');
      return { id: generateId(), payload };
    });

    // --- 3. charger le coffre courant, preparer le nouveau record -------
    const currentRecord = await storage.loadVault();
    if (!currentRecord) {
      throw new CsvImportError('no_vault', "Aucun coffre existant : creez-le avant d'importer un CSV.");
    }

    const validatedCurrent = validateImportedVaultStructure(currentRecord);
    const formatVersion = validatedCurrent.stats.formatVersion;
    const existingIds = new Set(validatedCurrent.entries.map((entry) => entry.id));

    // --- 4. chiffrer toutes les nouvelles entrees, IV uniques -----------
    const encryptedEntries = [];
    for (const { id, payload } of newEntries) {
      if (existingIds.has(id)) {
        // Un identifiant genere ne doit jamais recouvrir un identifiant
        // existant : l'import AJOUTE, il ne remplace pas.
        throw new CsvImportError('id_collision', "Collision d'identifiant detectee : import interrompu.");
      }
      let encrypted;
      try {
        // encryptData tire un IV frais de crypto.getRandomValues a chaque appel.
        encrypted = await encrypt(payload, masterKey, entryOptionsFor(id, formatVersion));
      } catch {
        throw new CsvImportError(
          'encryption_failed',
          "Le chiffrement d'une entree a echoue : aucune donnee n'a ete ecrite."
        );
      }
      encryptedEntries.push({ id, ...encrypted });
      existingIds.add(id);
    }

    // --- 5. nouveau record complet, sans toucher a l'etat en memoire ----
    const nextRecord = {
      id: 'current',
      entries: [...validatedCurrent.entries, ...encryptedEntries],
      meta: { ...validatedCurrent.normalized.meta, last_modified: timestamp }
    };

    // Revalidation complete : IV uniques sur l'ENSEMBLE du coffre resultant.
    const validatedNext = validateImportedVaultStructure(nextRecord);

    // --- 6. instantane exclusivement chiffre ----------------------------
    const snapshot = createEncryptedSnapshot(currentRecord);

    // --- 7. ecriture atomique puis verification -------------------------
    await writeVaultRecordVerified(storage, validatedNext.normalized, snapshot);

    // --- 8. sauvegarde secondaire, seulement ensuite --------------------
    const backup = writeLocalBackup(validatedNext.normalized, { storage: localStorageRef });

    // --- 9. etat en memoire et interface, seulement apres reussite ------
    const addedEntries = newEntries.map(({ id, payload }) => ({ ...payload, id }));
    if (typeof onSuccess === 'function') {
      await onSuccess(addedEntries);
    }

    return {
      imported: true,
      addedCount: addedEntries.length,
      skippedCount: analysis.skippedCount,
      rejectedCount: analysis.rejectedCount,
      duplicateCount: analysis.duplicates.length,
      totalEntryCount: validatedNext.stats.entryCount,
      backup,
      addedEntries
    };
  } finally {
    // Les charges utiles en clair ne sont plus referencees par ce module.
    // Les chaines JavaScript ne peuvent pas etre effacees de la memoire.
    if (Array.isArray(newEntries)) newEntries.length = 0;
    newEntries = null;
    analysis = null;

    if (typeof deps.onCleanup === 'function') {
      try {
        deps.onCleanup();
      } catch {
        /* nettoyage best-effort */
      }
    }
  }
}

export default {
  importCsvFile,
  analyzeCsvRows,
  detectColumnMapping,
  readCsvFile,
  HEADER_ALIASES,
  CsvImportError
};
