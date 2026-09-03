/**
 * Lot 5 partie 1 - Politique de solidite des mots de passe.
 *
 * Aucun mot de passe reel : toutes les chaines sont synthetiques ou des
 * exemples publics de mots de passe notoirement faibles.
 */
import assert from 'node:assert/strict';
import {
  analyzePassword,
  evaluateMasterPasswordPolicy,
  countDistinctWords,
  bitsToScore,
  observedAlphabetCeiling,
  POLICY
} from '../scripts/security/password-policy.js';
import { estimatePasswordEntropyBits } from '../scripts/ui/password-meter/password-meter.js';
import {
  validateNewMasterPassword,
  MIN_MASTER_PASSWORD_ENTROPY_BITS
} from '../scripts/security/master-password-policy.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

/** Motifs que l'ancien estimateur surestimait. */
const PREVISIBLES = [
  ['abababababab', 'repetition'],
  ['passwordpassword', 'repetition'],
  ['aaaaaaaaaaaaaaaa', 'repetition'],
  ['123456789012', 'sequence'],
  ['abcdefghijkl', 'sequence'],
  ['azertyuiop123', 'keyboard'],
  ['qwertyuiop', 'keyboard'],
  ['password123', 'trivial_variant'],
  ['P@ssw0rd', 'common_word'],
  ['motdepasse', 'common_word'],
  ['cheval cheval cheval cheval', 'repeated_words']
];

test('1.1 - chaque motif previsible est detecte ET penalise', () => {
  for (const [chaine, codeAttendu] of PREVISIBLES) {
    const a = analyzePassword(chaine);
    const codes = a.penalties.map((p) => p.code);
    assert.ok(codes.includes(codeAttendu),
      `« ${chaine} » : motif ${codeAttendu} attendu, obtenu [${codes.join(', ')}]`);
    assert.ok(a.effectiveBits < a.naiveBits,
      `« ${chaine} » : les bits effectifs doivent etre inferieurs aux bits bruts`);
  }
});

test('1.2 - l ancien estimateur surestimait bien : ecart mesure', () => {
  // Ce test documente le defaut d'origine avec des chiffres verifiables.
  for (const [chaine] of PREVISIBLES) {
    const naif = estimatePasswordEntropyBits(chaine);
    const a = analyzePassword(chaine);
    assert.equal(a.naiveBits, naif, 'Les bits bruts doivent rester ceux de l ancien estimateur');
    assert.ok(a.effectiveBits <= naif / 2,
      `« ${chaine} » : ${naif} bits annonces, ${a.effectiveBits} bits effectifs — `
      + 'la penalite doit etre substantielle');
  }
});

test('1.3 - les chaines citees par le lot sont refusees comme mot de passe maitre', () => {
  for (const chaine of ['passwordpassword', 'abababababab', 'azertyuiopazerty', 'motdepassemotdepasse']) {
    const verdict = evaluateMasterPasswordPolicy(chaine);
    assert.equal(verdict.valid, false, `« ${chaine} » doit etre refuse`);
    assert.match(verdict.message, /previsible/i);
    assert.ok(verdict.message.length > 40,
      'Le refus doit nommer le motif detecte, pour etre actionnable');
  }
});

test('1.4 - une phrase de passe longue est acceptee SANS exiger toutes les classes', () => {
  const phrases = [
    'correcte agrafe batterie cheval',
    'le vieux phare eclaire la baie tranquille',
    'quatre mots distincts suffisent largement'
  ];

  for (const phrase of phrases) {
    assert.ok(!/[0-9]/.test(phrase), 'Le pre-requis : aucune chiffre');
    assert.ok(!/[^a-z ]/.test(phrase), 'Le pre-requis : aucun symbole, aucune majuscule');

    const verdict = evaluateMasterPasswordPolicy(phrase);
    assert.equal(verdict.valid, true,
      `« ${phrase} » doit etre acceptee : une phrase longue vaut mieux qu une chaine courte`);
    assert.equal(verdict.analysis.isPassphrase, true);
    assert.ok(verdict.analysis.effectiveBits >= POLICY.minEffectiveBits);
  }
});

test('1.5 - une phrase faite du MEME mot repete n est pas une bonne phrase', () => {
  const verdict = evaluateMasterPasswordPolicy('cheval cheval cheval cheval cheval');
  assert.equal(verdict.valid, false,
    'Repeter un mot ne cree pas de la variete');
  assert.equal(countDistinctWords('cheval cheval cheval cheval cheval'), 1);
});

test('1.6 - variantes simples : substitutions leet et suffixes', () => {
  for (const chaine of ['P@ssw0rd', 'p4ssw0rd', 'azerty2024', 'admin123!', 'Motdepasse1!']) {
    const a = analyzePassword(chaine);
    assert.ok(a.penalties.length > 0, `« ${chaine} » doit etre reconnu comme variante triviale`);
    assert.ok(a.effectiveBits < 45,
      `« ${chaine} » : ${a.effectiveBits} bits effectifs, une variante triviale doit rester faible`);
  }
});

test('1.6b - REPETITIONS INTERNES : le defaut audite est corrige', () => {
  // Defaut reel signale a l'audit : `detectRepetition` ne reconnaissait que
  // les repetitions couvrant la chaine ENTIERE. Une longue suite noyee dans
  // une chaine echappait a toute penalite, et l'estimateur naif s'appliquait
  // intact. Sorties mesurees avant correction :
  //   'aaaaaaaaaaaaZ9!'  -> 98 bits, ACCEPTE, aucune penalite
  //   '111111111111Aa!'  -> 98 bits, ACCEPTE, aucune penalite
  //   'aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddddd' -> 260 bits, ACCEPTE
  const audites = [
    'aaaaaaaaaaaaZ9!',
    '111111111111Aa!',
    'aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddddd',
    'Xaaaaaaaaaaaaaaaa',
    'motdepasseaaaaaaaaaa1!'
  ];

  for (const chaine of audites) {
    const a = analyzePassword(chaine);
    assert.ok(a.penalties.length > 0,
      `« ${chaine} » doit etre penalise : aucune penalite detectee`);
    assert.ok(a.effectiveBits < 50,
      `« ${chaine} » : ${a.effectiveBits} bits effectifs, doit rester sous le seuil`);
    assert.equal(evaluateMasterPasswordPolicy(chaine).valid, false,
      `« ${chaine} » doit etre refuse comme mot de passe maitre`);
  }
});

test('1.6c - fragments repetes et suites multiples', () => {
  const cas = [
    ['abcabcabcabcXYZ9!', 'repeated_block'],
    ['aaaa1111bbbb2222cccc3333', 'character_run'],
    ['Zz9!Zz9!Zz9!Zz9!', 'repeated_block']
  ];

  for (const [chaine, codeAttendu] of cas) {
    const a = analyzePassword(chaine);
    assert.ok(a.penalties.map((p) => p.code).includes(codeAttendu),
      `« ${chaine} » : ${codeAttendu} attendu, obtenu [${a.penalties.map((p) => p.code).join(', ')}]`);
    assert.equal(evaluateMasterPasswordPolicy(chaine).valid, false);
  }
});

test('1.6d - le plafond par alphabet observe ne penalise pas les chaines courtes', () => {
  // La garde est essentielle : un mot de passe aleatoire COURT n'affiche que
  // peu de caracteres distincts sans que cela signifie quoi que ce soit.
  assert.equal(observedAlphabetCeiling('x7$Qm2!vLp9Zk'), null,
    '13 caracteres tous distincts : la garde doit empecher tout plafonnement');

  const plafond = observedAlphabetCeiling('aaaaaaaaaaaaZ9!');
  assert.ok(typeof plafond === 'number' && plafond < 30,
    `Une chaine longue a 4 caracteres distincts doit etre plafonnee bas, obtenu ${plafond}`);

  // La propriete qui compte : le plafond peut s'appliquer a une bonne phrase
  // — elle contient forcement des lettres repetees — mais il ne doit JAMAIS
  // la faire passer sous le seuil. C'est un correctif d'estimation, pas une
  // sanction.
  const bonnes = [
    'correcte agrafe batterie cheval',
    'le vieux phare eclaire la baie tranquille',
    'quatre mots distincts suffisent largement',
    'jonquille-vitrail-8-Kayak'
  ];
  for (const phrase of bonnes) {
    const limite = observedAlphabetCeiling(phrase);
    if (limite !== null) {
      assert.ok(limite >= POLICY.minEffectiveBits,
        `« ${phrase} » plafonnee a ${limite} bits : le plafond ne doit pas `
        + 'faire chuter une bonne phrase sous le seuil');
    }
    assert.equal(evaluateMasterPasswordPolicy(phrase).valid, true,
      `« ${phrase} » doit rester acceptee`);
  }
});

test('1.6e - une chaine de suites n est PAS une phrase de passe', () => {
  const a = analyzePassword('aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddddd');
  assert.equal(a.isPassphrase, false,
    'Quatre « mots » faits chacun d un seul caractere repete ne forment pas une phrase');
  assert.ok(a.effectiveBits < a.naiveBits / 4);
});

test('1.7 - les mots de passe reellement solides ne sont pas penalises a tort', () => {
  const solides = [
    'x7$Qm2!vLp9Zk',
    'Tr0ub4dor&3xK',
    'jonquille-vitrail-8-Kayak',
    'F6#nWq2@rTz8Lm'
  ];

  for (const chaine of solides) {
    const a = analyzePassword(chaine);
    assert.ok(a.effectiveBits >= 55,
      `« ${chaine} » : ${a.effectiveBits} bits effectifs, un faux positif rendrait la politique inutilisable`);
    assert.equal(evaluateMasterPasswordPolicy(chaine).valid, true);
  }
});

test('1.8 - la longueur minimale reste appliquee', () => {
  const court = evaluateMasterPasswordPolicy('x7$Qm2!v');
  assert.equal(court.valid, false);
  assert.ok(court.message.includes(String(POLICY.minLength)),
    'Le refus doit annoncer la longueur minimale exigee');
});

test('1.9 - la couche METIER decide, pas seulement l interface', () => {
  // `validateNewMasterPassword` est le point d'entree utilise par la creation
  // de coffre et par le changement de mot de passe maitre.
  const refus = validateNewMasterPassword('passwordpassword');
  assert.equal(refus.valid, false, 'La decision metier doit refuser cette chaine');
  assert.ok(refus.effectiveBits < refus.naiveBits,
    'Le verdict metier doit exposer les deux mesures');

  const accepte = validateNewMasterPassword('correcte agrafe batterie cheval');
  assert.equal(accepte.valid, true);
  assert.equal(accepte.entropyBits, accepte.effectiveBits,
    '`entropyBits` doit desormais porter la valeur EFFECTIVE');
});

test('1.10 - l ancien estimateur reste disponible pour l affichage', () => {
  // Conservation exigee : la fonction existe toujours et se comporte comme
  // avant. Elle n'est simplement plus l arbitre unique.
  assert.equal(typeof estimatePasswordEntropyBits, 'function');
  assert.equal(estimatePasswordEntropyBits('abababababab'), 56,
    'Le comportement historique doit etre inchange');
  assert.equal(estimatePasswordEntropyBits(''), 0);
  assert.equal(MIN_MASTER_PASSWORD_ENTROPY_BITS, POLICY.minEffectiveBits,
    'Le seuil historique reste exporte');
});

test('1.11 - cas limites : vide, une lettre, unicode, tres long', () => {
  assert.equal(analyzePassword('').effectiveBits, 0);
  assert.equal(analyzePassword('').score, 0);
  assert.equal(analyzePassword(null).effectiveBits, 0);
  assert.equal(analyzePassword('a').penalties.length >= 0, true);

  const accentue = analyzePassword('Élan Créatif Batterie Jonquille');
  assert.equal(accentue.isPassphrase, true, 'Les accents ne doivent pas casser le decoupage');

  const tresLong = 'a'.repeat(500);
  assert.ok(analyzePassword(tresLong).effectiveBits < 20,
    'Une repetition, meme tres longue, ne vaut pas grand chose');
  assert.equal(bitsToScore(0), 0);
  assert.equal(bitsToScore(100), 4);
});

console.log('=== TEST PASSWORD POLICY ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
  }
}
if (echecs > 0) {
  console.error(`Password policy tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Password policy tests passed (${cas.length} scenarios).`);
}
