/**
 * CryptoKeep - Parseur CSV local (Lot 2).
 *
 * Ecrit sans aucune dependance externe et sans CDN, conformement aux
 * invariants du projet. Remplace le decoupage naif `text.split('\n')` puis
 * `line.split(',')`, qui cassait des qu'un champ contenait une virgule, un
 * guillemet ou un saut de ligne, et qui pouvait produire des entrees
 * silencieusement tronquees.
 *
 * Le module implemente le comportement usuel des exports de navigateurs
 * (RFC 4180 et ses tolerances courantes) :
 *   - BOM UTF-8 retire ;
 *   - fins de ligne CRLF, LF et CR acceptees ;
 *   - champs entre guillemets ;
 *   - virgules a l'interieur d'un champ entre guillemets ;
 *   - guillemets echappes par doublement ("") ;
 *   - champs multilignes ;
 *   - derniere ligne avec ou sans saut de ligne final.
 *
 * La limite de lignes est appliquee PENDANT le parsing, pas apres : un
 * fichier hostile ne doit pas pouvoir faire construire un tableau geant en
 * memoire avant d'etre refuse.
 */

import { MAX_CSV_ROWS } from '../core/storage/import-limits.js';

export class CsvParseError extends Error {
  constructor(code, message, line = null) {
    super(message);
    this.name = 'CsvParseError';
    this.code = code;
    this.line = line;
  }
}

/** Retire un BOM UTF-8 en tete de chaine. */
export function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Decoupe un texte CSV en tableau de tableaux.
 *
 * @param {string} text
 * @param {{maxRows?: number}} options
 * @returns {string[][]} lignes brutes, en-tete compris
 */
export function parseCsvRows(text, options = {}) {
  const maxRows = options.maxRows ?? MAX_CSV_ROWS;

  if (typeof text !== 'string') {
    throw new CsvParseError('invalid_input', 'Le contenu CSV doit etre une chaine.');
  }

  const source = stripBom(text);
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let rowStartLine = 1;
  let line = 1;
  let fieldWasQuoted = false;
  let sawAnyChar = false;

  const pushField = () => {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
  };

  const pushRow = () => {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
    rows.push({ cells: row, line: rowStartLine });
    row = [];
    // +1 pour l'en-tete : la limite porte sur les lignes de DONNEES.
    if (rows.length > maxRows + 1) {
      throw new CsvParseError(
        'too_many_rows',
        `Le fichier CSV depasse ${maxRows} lignes de donnees.`,
        rowStartLine
      );
    }
    // `line` a deja ete incremente en consommant le saut de ligne :
    // il designe donc deja la ligne ou commence l'enregistrement suivant.
    rowStartLine = line;
  };

  for (let index = 0; index < source.length; index += 1) {
    // charAt plutot qu'un acces indexe : meme semantique sur des unites
    // de code UTF-16, sans acces indexe par variable.
    const character = source.charAt(index);
    sawAnyChar = true;

    if (inQuotes) {
      if (character === '"') {
        if (source.charAt(index + 1) === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      if (character === '\n') line += 1;
      field += character;
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new CsvParseError(
          'malformed_quote',
          'Guillemet ouvrant au milieu d\'un champ non protege.',
          rowStartLine
        );
      }
      inQuotes = true;
      fieldWasQuoted = true;
      continue;
    }

    if (character === ',') {
      pushField();
      continue;
    }

    if (character === '\r') {
      if (source.charAt(index + 1) === '\n') index += 1;
      line += 1;
      pushRow();
      continue;
    }

    if (character === '\n') {
      line += 1;
      pushRow();
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    throw new CsvParseError('unterminated_quote', 'Un champ entre guillemets n\'est jamais referme.', rowStartLine);
  }

  // Derniere ligne sans saut final.
  if (field.length > 0 || row.length > 0 || fieldWasQuoted) {
    pushRow();
  } else if (!sawAnyChar) {
    return [];
  }

  return rows;
}

/**
 * Normalise un en-tete : minuscules, sans accents, sans espaces ni
 * ponctuation. Permet de reconnaitre "Nom d'utilisateur", "User Name", etc.
 */
export function normalizeHeader(header) {
  return String(header)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parse un CSV en objets indexes par en-tete normalise.
 *
 * @returns {{headers: string[], normalizedHeaders: string[], rows: Array<{values: string[], line: number}>}}
 */
export function parseCsv(text, options = {}) {
  const rawRows = parseCsvRows(text, options);

  if (rawRows.length === 0) {
    throw new CsvParseError('empty_file', 'Le fichier CSV est vide.');
  }

  const headerRow = rawRows[0];
  const headers = headerRow.cells.map((cell) => cell.trim());

  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    throw new CsvParseError('missing_header', 'Le fichier CSV ne comporte pas d\'en-tete exploitable.', 1);
  }

  const normalizedHeaders = headers.map(normalizeHeader);

  return {
    headers,
    normalizedHeaders,
    rows: rawRows.slice(1).map((entry) => ({ values: entry.cells, line: entry.line }))
  };
}

export default { parseCsv, parseCsvRows, normalizeHeader, stripBom, CsvParseError };
