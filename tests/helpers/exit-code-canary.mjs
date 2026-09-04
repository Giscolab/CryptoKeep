/**
 * Canari de code de sortie (Lot 9).
 *
 * Ce fichier ECHOUE VOLONTAIREMENT. Il n'est pas enregistre dans `npm test` :
 * il est lance par `tests/test-harness.spec.js`, qui verifie que le patron de
 * harnais utilise par toutes les suites fait bien sortir Node avec un code non
 * nul quand une assertion est fausse.
 *
 * Sans ce controle, l exigence « le processus doit retourner un code non nul
 * en cas d echec » resterait une affirmation invérifiée — et c est exactement
 * ce qui s etait produit avec `console.assert`, qui affichait un echec tout en
 * laissant le code de sortie a 0.
 */
import assert from 'node:assert/strict';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

test('canari - cette assertion est fausse par construction', () => {
  assert.equal(1, 2, 'echec volontaire');
});

let echecs = 0;
for (const { label, fn } of cas) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
  }
}
if (echecs > 0) {
  console.error(`Canary failed on purpose: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log('Canary passed — ce qui serait un DEFAUT.');
}
