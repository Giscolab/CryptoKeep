/**
 * Lot 2 - Parseur CSV local. Donnees synthetiques uniquement.
 */
import assert from 'node:assert/strict';
import {
  parseCsv,
  parseCsvRows,
  normalizeHeader,
  stripBom,
  CsvParseError
} from '../scripts/utils/csv-parser.js';

function expectCode(action, code, message) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof CsvParseError, `${message} : type inattendu`);
    assert.equal(error.code, code, `${message} : code attendu ${code}, obtenu ${error.code}`);
    return;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST CSV PARSER ===');

  // --- BOM -----------------------------------------------------------------
  assert.equal(stripBom('﻿name'), 'name', 'Le BOM doit etre retire');
  {
    const parsed = parseCsv('﻿name,password\r\nSite,secret\r\n');
    assert.deepEqual(parsed.headers, ['name', 'password'], 'BOM en tete d\'en-tete');
  }

  // --- CRLF, LF et CR ------------------------------------------------------
  for (const [nom, eol] of [['CRLF', '\r\n'], ['LF', '\n'], ['CR', '\r']]) {
    const parsed = parseCsv(`name,password${eol}A,1${eol}B,2${eol}`);
    assert.equal(parsed.rows.length, 2, `${nom} : deux lignes attendues`);
    assert.deepEqual(parsed.rows[0].values, ['A', '1'], `${nom} : premiere ligne`);
    assert.deepEqual(parsed.rows[1].values, ['B', '2'], `${nom} : deuxieme ligne`);
  }

  // --- Derniere ligne sans saut final --------------------------------------
  {
    const parsed = parseCsv('name,password\nA,1');
    assert.equal(parsed.rows.length, 1, 'Derniere ligne sans \\n');
    assert.deepEqual(parsed.rows[0].values, ['A', '1']);
  }

  // --- Champs entre guillemets et virgules internes ------------------------
  {
    const parsed = parseCsv('name,notes,password\n"Banque, SG","a, b, c",secret\n');
    assert.deepEqual(parsed.rows[0].values, ['Banque, SG', 'a, b, c', 'secret'],
      'Les virgules a l\'interieur des guillemets ne doivent pas decouper');
  }

  // --- Guillemets echappes -------------------------------------------------
  {
    const parsed = parseCsv('name,password\n"Il a dit ""bonjour""",secret\n');
    assert.equal(parsed.rows[0].values[0], 'Il a dit "bonjour"',
      'Les guillemets doubles doivent etre desechappes');
  }
  {
    const parsed = parseCsv('name,password\n"""",secret\n');
    assert.equal(parsed.rows[0].values[0], '"', 'Un champ contenant un seul guillemet');
  }

  // --- Champs multilignes --------------------------------------------------
  {
    const parsed = parseCsv('name,notes,password\n"Site","ligne1\nligne2\nligne3",secret\nAutre,x,s2\n');
    assert.equal(parsed.rows.length, 2, 'Un champ multiligne ne doit pas creer de lignes');
    assert.equal(parsed.rows[0].values[1], 'ligne1\nligne2\nligne3', 'Contenu multiligne preserve');
    assert.equal(parsed.rows[1].values[0], 'Autre', 'La ligne suivante reste correcte');
    assert.equal(parsed.rows[1].line, 5, 'Le numero de ligne doit tenir compte du multiligne');
  }
  {
    // Multiligne en CRLF : le CR interne est conserve tel quel.
    const parsed = parseCsv('name,notes,password\r\n"S","a\r\nb",secret\r\n');
    assert.equal(parsed.rows.length, 1);
    assert.ok(parsed.rows[0].values[1].includes('\n'), 'Le saut interne est conserve');
  }

  // --- Champs vides et lignes vides ---------------------------------------
  {
    const parsed = parseCsv('name,url,username,password\nA,,,secret\n\nB,,,s2\n');
    assert.equal(parsed.rows.length, 3, 'La ligne vide est conservee au niveau parseur');
    assert.deepEqual(parsed.rows[0].values, ['A', '', '', 'secret']);
    assert.deepEqual(parsed.rows[1].values, [''], 'Ligne vide = une cellule vide');
  }

  // --- Guillemets mal formes ----------------------------------------------
  expectCode(() => parseCsv('name,password\n"non ferme,secret\n'), 'unterminated_quote',
    'Guillemet non ferme');
  expectCode(() => parseCsv('name,password\nab"cd",secret\n'), 'malformed_quote',
    'Guillemet ouvrant au milieu d\'un champ');

  // --- Fichier vide / sans en-tete ----------------------------------------
  expectCode(() => parseCsv(''), 'empty_file', 'Fichier vide');
  expectCode(() => parseCsv(',,\n'), 'missing_header', 'En-tete vide');
  expectCode(() => parseCsv(42), 'invalid_input', 'Entree non textuelle');

  // --- Limite de lignes appliquee PENDANT le parsing -----------------------
  {
    const lignes = ['name,password'];
    for (let i = 0; i < 12; i += 1) lignes.push(`S${i},p${i}`);
    const texte = `${lignes.join('\n')}\n`;

    const ok = parseCsv(texte, { maxRows: 12 });
    assert.equal(ok.rows.length, 12, '12 lignes doivent passer avec maxRows=12');

    expectCode(() => parseCsv(texte, { maxRows: 5 }), 'too_many_rows',
      'La limite doit etre appliquee pendant le parsing');

    // Preuve que le refus intervient avant la fin du fichier : la ligne
    // signalee n'est pas la derniere du fichier.
    try {
      parseCsvRows(texte, { maxRows: 5 });
    } catch (error) {
      assert.ok(error.line < 13, 'Le refus doit intervenir avant la fin du fichier');
    }
  }

  // --- Normalisation des en-tetes -----------------------------------------
  assert.equal(normalizeHeader('Nom d\'utilisateur'), 'nomdutilisateur');
  assert.equal(normalizeHeader('  Mot de passe  '), 'motdepasse');
  assert.equal(normalizeHeader('Web Site URL'), 'websiteurl');
  assert.equal(normalizeHeader('CATÉGORIE'), 'categorie', 'Les accents doivent etre replies');

  // --- Ordre variable des colonnes : le parseur n'impose rien -------------
  {
    const parsed = parseCsv('password,url,name\nsecret,https://x.test,Site\n');
    assert.deepEqual(parsed.normalizedHeaders, ['password', 'url', 'name']);
  }

  console.log('CSV parser tests passed.');
} catch (error) {
  console.error('CSV parser tests failed:', error);
  process.exitCode = 1;
}
