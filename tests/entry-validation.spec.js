/**
 * Lot 3 - Validation et normalisation d'une entree.
 * Donnees synthetiques uniquement. Aucun mot de passe reel.
 */
import assert from 'node:assert/strict';
import {
  validateEntryInput,
  normalizeEntryUrl,
  normalizeCategory,
  normalizeTags,
  normalizeWhitespace,
  ENTRY_LIMITS,
  EntryValidationError
} from '../scripts/core/vault/entry-validation.js';

function expectField(action, code, field, message) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof EntryValidationError, `${message} : type inattendu`);
    assert.equal(error.code, code, `${message} : code ${code} attendu, obtenu ${error.code}`);
    assert.equal(error.field, field, `${message} : champ ${field} attendu`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST ENTRY VALIDATION ===');

  // ===== Titre ============================================================
  assert.equal(normalizeWhitespace('  Mon   Service  '), 'Mon Service',
    'Les espaces superflus doivent etre normalises');
  assert.equal(validateEntryInput({ title: '  Ma   Banque ', password: 'p' }).title, 'Ma Banque');
  expectField(() => validateEntryInput({ title: '   ', password: 'p' }),
    'required', 'title', 'Titre vide');
  expectField(() => validateEntryInput({ title: 'x'.repeat(ENTRY_LIMITS.title + 1), password: 'p' }),
    'field_too_long', 'title', 'Titre trop long');

  // ===== Mot de passe =====================================================
  expectField(() => validateEntryInput({ title: 'T' }),
    'required', 'password', 'Mot de passe absent');
  {
    const err = expectField(
      () => validateEntryInput({ title: 'T', password: 'S3cr3tUltraConfidentiel'.repeat(50) }),
      'field_too_long', 'password', 'Mot de passe trop long');
    assert.ok(!err.message.includes('S3cr3t'),
      'Le message d erreur ne doit JAMAIS contenir le mot de passe');
  }
  assert.equal(validateEntryInput({ title: 'T', password: '  a b  ' }).password, '  a b  ',
    'Le mot de passe ne doit pas etre normalise');

  // ===== Nom d'utilisateur ================================================
  assert.equal(validateEntryInput({ title: 'T', password: 'p', username: '  alice  ' }).username, 'alice');
  assert.equal('username' in validateEntryInput({ title: 'T', password: 'p' }), false,
    'Le nom d utilisateur est facultatif');

  // ===== URL : schemas dangereux refuses ==================================
  const dangereux = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)  ',
    'data:text/html,<script>alert(1)</script>',
    'DATA:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'blob:https://x.test/abc',
    'file:///etc/passwd',
    'about:blank'
  ];
  dangereux.forEach((valeur) => {
    expectField(() => normalizeEntryUrl(valeur), 'forbidden_scheme', 'url',
      `Schema dangereux refuse : ${valeur.slice(0, 24)}`);
  });

  // Schema masque par des caracteres de controle ou invisibles. Ils sont
  // ecrits en sequences d'echappement, jamais en litteral.
  const masques = [
    ['caractere nul', 'java\u0000script:alert(1)'],
    ['retour ligne', 'java\nscript:alert(1)'],
    ['tabulation', '\tjavascript:alert(1)'],
    ['espace de largeur nulle', 'java\u200Bscript:alert(1)'],
    ['BOM', '\uFEFFjavascript:alert(1)']
  ];
  masques.forEach(([nom, valeur]) => {
    expectField(() => normalizeEntryUrl(valeur), 'forbidden_scheme', 'url',
      `Schema masque par ${nom}`);
  });

  // ===== URL : valeurs acceptees ==========================================
  assert.equal(normalizeEntryUrl('https://exemple.test/chemin'), 'https://exemple.test/chemin');
  assert.equal(normalizeEntryUrl('http://exemple.test/'), 'http://exemple.test/');
  assert.equal(normalizeEntryUrl('exemple.test'), 'https://exemple.test/',
    'Un nom d hote nu peut etre complete en https');
  assert.equal(normalizeEntryUrl('www.exemple.test/page'), 'https://www.exemple.test/page');
  assert.equal(normalizeEntryUrl(''), '', 'Une URL vide est acceptee');
  assert.equal(normalizeEntryUrl(null), '', 'Une URL absente est acceptee');
  assert.equal(normalizeEntryUrl('   '), '', 'Une URL blanche est acceptee');

  // ===== URL : valeurs ambigues refusees, jamais devinees =================
  ['pas une url', 'exemple', 'mot de passe', '::::', 'a b.c d'].forEach((valeur) => {
    expectField(() => normalizeEntryUrl(valeur), 'invalid_url', 'url',
      `Valeur ambigue refusee : ${valeur}`);
  });
  expectField(() => normalizeEntryUrl('mailto:x@y.test'), 'unsupported_scheme', 'url',
    'Schema non pris en charge');
  expectField(() => normalizeEntryUrl(`https://x.test/${'a'.repeat(ENTRY_LIMITS.url)}`),
    'field_too_long', 'url', 'URL trop longue');

  // ===== Categorie ========================================================
  assert.equal(normalizeCategory('banking'), 'bank',
    'La valeur historique du markup doit etre traduite');
  assert.equal(normalizeCategory('Email'), 'email');
  assert.equal(normalizeCategory(''), '', 'Une categorie vide est acceptee');
  expectField(() => normalizeCategory('inventee'), 'unknown_category', 'category',
    'Categorie inconnue refusee');

  // ===== Notes ============================================================
  assert.equal(validateEntryInput({ title: 'T', password: 'p', notes: '  note privee  ' }).notes,
    'note privee');
  expectField(
    () => validateEntryInput({ title: 'T', password: 'p', notes: 'n'.repeat(ENTRY_LIMITS.notes + 1) }),
    'field_too_long', 'notes', 'Notes trop longues');

  // ===== Etiquettes =======================================================
  assert.deepEqual(normalizeTags('  Perso , travail ,PERSO,  '), ['perso', 'travail'],
    'Les doublons et espaces doivent disparaitre');
  assert.deepEqual(normalizeTags(['A', 'a', 'B']), ['a', 'b']);
  assert.deepEqual(normalizeTags(''), []);
  assert.deepEqual(normalizeTags(null), []);
  expectField(() => normalizeTags(['x'.repeat(ENTRY_LIMITS.tagLength + 1)]),
    'field_too_long', 'tags', 'Etiquette trop longue');
  expectField(() => normalizeTags(Array.from({ length: ENTRY_LIMITS.tagCount + 2 }, (_, i) => `t${i}`)),
    'too_many_tags', 'tags', 'Trop d etiquettes');

  // ===== Mode partiel (modification champ par champ) ======================
  {
    const ok = validateEntryInput({ url: 'exemple.test' }, { partial: true });
    assert.deepEqual(Object.keys(ok), ['url'], 'Seul le champ fourni est retourne');
    assert.equal(ok.url, 'https://exemple.test/');
  }
  expectField(() => validateEntryInput({ title: '' }, { partial: true }),
    'required', 'title', 'Un titre fourni vide reste refuse en mode partiel');

  // ===== Le validateur ne mute jamais son entree ==========================
  {
    const source = { title: ' T ', password: 'p', url: 'exemple.test', tags: ['A', 'A'] };
    const copie = JSON.stringify(source);
    validateEntryInput(source);
    assert.equal(JSON.stringify(source), copie, 'La saisie source ne doit pas etre modifiee');
  }

  console.log('Entry validation tests passed.');
} catch (error) {
  console.error('Entry validation tests failed:', error);
  process.exitCode = 1;
}
