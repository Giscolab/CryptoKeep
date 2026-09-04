/**
 * Lot 9 - Integrite cryptographique : IV, ciphertext, AAD.
 *
 * `crypto.spec.js` verifiait le chiffrement, le dechiffrement et la
 * permutation d entrees par l AAD. Il ne verifiait PAS l unicite des IV, ni
 * qu une alteration du ciphertext ou de l AAD est reellement rejetee. Ce sont
 * exactement les proprietes sur lesquelles repose la promesse du coffre :
 * sans elles, AES-GCM n apporte plus l authentification qu on lui prete.
 *
 * `crypto.spec.js` est CONSERVE tel quel. Ce fichier le complete.
 *
 * Aucune donnee reelle : cles derivees sur place, donnees fabriquees.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { encryptData, decryptData } from '../scripts/core/crypto/aes-gcm.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  entryAdditionalData
} from '../scripts/core/storage/vault-format.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const MOT_DE_PASSE = 'Phrase-De-Test-Synthetique-2026!';
let cle = null;

async function cleDeTest() {
  if (!cle) {
    const sel = crypto.getRandomValues(new Uint8Array(16));
    cle = await deriveMasterKey(MOT_DE_PASSE, sel, { iterations: CURRENT_PBKDF2_ITERATIONS });
  }
  return cle;
}

/** Bascule UN bit d une chaine base64, en restant un base64 valide. */
function alterer(base64, index = 0) {
  const octets = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const position = Math.min(index, octets.length - 1);
  // Ecriture par `map` plutot que par index calcule : meme resultat, sans
  // acces indexe par variable (regle security/detect-object-injection).
  const modifies = octets.map((octet, rang) => (rang === position ? octet ^ 0x01 : octet));
  return btoa(String.fromCharCode(...modifies));
}

async function doitEchouer(action, message) {
  await assert.rejects(async () => { await action(); }, message);
}

// ===========================================================================
// 1. Unicite des IV
// ===========================================================================

test('C1 - UNICITE DES IV : 500 chiffrements, 500 IV distincts', async () => {
  const k = await cleDeTest();
  const vus = new Set();

  for (let i = 0; i < 500; i += 1) {
    const chiffre = await encryptData({ n: i }, k, { additionalData: entryAdditionalData('e') });
    assert.ok(!vus.has(chiffre.iv),
      `IV REUTILISE au tirage ${i}. Avec AES-GCM, deux messages partageant un IV `
      + 'sous la meme cle exposent le flux et permettent de forger un tag.');
    vus.add(chiffre.iv);
  }
  assert.equal(vus.size, 500);
});

test('C2 - un IV fait 12 octets exactement', async () => {
  const k = await cleDeTest();
  const chiffre = await encryptData({ a: 1 }, k);
  const octets = Uint8Array.from(atob(chiffre.iv), (c) => c.charCodeAt(0));
  assert.equal(octets.length, 12,
    'AES-GCM attend un IV de 96 bits ; une autre longueur declenche une '
    + 'derivation interne et affaiblit la garantie d unicite');
});

test('C3 - un meme contenu chiffre deux fois donne deux ciphertexts differents', async () => {
  const k = await cleDeTest();
  const a = await encryptData({ meme: 'contenu' }, k);
  const b = await encryptData({ meme: 'contenu' }, k);
  assert.notEqual(a.ciphertext, b.ciphertext,
    'Un chiffrement deterministe revelerait que deux entrees sont identiques');
  assert.notEqual(a.iv, b.iv);
});

// ===========================================================================
// 2. Alteration du ciphertext
// ===========================================================================

test('C4 - ALTERATION DU CIPHERTEXT : le dechiffrement echoue', async () => {
  const k = await cleDeTest();
  const aad = entryAdditionalData('entree-c4');
  const chiffre = await encryptData({ secret: 'valeur-synthetique' }, k, { additionalData: aad });

  for (const position of [0, 1, 5]) {
    await doitEchouer(
      () => decryptData({ ...chiffre, ciphertext: alterer(chiffre.ciphertext, position) }, k,
        { additionalData: aad }),
      `Un ciphertext altere a l octet ${position} doit etre REJETE, pas dechiffre`
    );
  }
});

test('C5 - ALTERATION DU TAG : le dernier octet compte autant que le premier', async () => {
  const k = await cleDeTest();
  const aad = entryAdditionalData('entree-c5');
  const chiffre = await encryptData({ secret: 'valeur' }, k, { additionalData: aad });
  const octets = Uint8Array.from(atob(chiffre.ciphertext), (c) => c.charCodeAt(0));

  await doitEchouer(
    () => decryptData({ ...chiffre, ciphertext: alterer(chiffre.ciphertext, octets.length - 1) },
      k, { additionalData: aad }),
    'Le tag d authentification est en fin de ciphertext : l alterer doit faire echouer'
  );
});

test('C6 - ALTERATION DE L IV : le dechiffrement echoue', async () => {
  const k = await cleDeTest();
  const aad = entryAdditionalData('entree-c6');
  const chiffre = await encryptData({ secret: 'valeur' }, k, { additionalData: aad });

  await doitEchouer(
    () => decryptData({ ...chiffre, iv: alterer(chiffre.iv) }, k, { additionalData: aad }),
    'Un IV modifie doit faire echouer l authentification'
  );
});

test('C7 - ciphertext tronque : rejet, jamais un dechiffrement partiel', async () => {
  const k = await cleDeTest();
  const chiffre = await encryptData({ secret: 'valeur' }, k);
  const octets = Uint8Array.from(atob(chiffre.ciphertext), (c) => c.charCodeAt(0));
  const tronque = btoa(String.fromCharCode(...octets.subarray(0, octets.length - 4)));

  await doitEchouer(() => decryptData({ ...chiffre, ciphertext: tronque }, k),
    'Un ciphertext tronque doit etre rejete');
});

// ===========================================================================
// 3. Alteration de l AAD
// ===========================================================================

test('C8 - ALTERATION DE L AAD : un octet suffit a faire echouer', async () => {
  const k = await cleDeTest();
  const aad = entryAdditionalData('entree-c8');
  const chiffre = await encryptData({ secret: 'valeur' }, k, { additionalData: aad });

  await doitEchouer(() => decryptData(chiffre, k, { additionalData: `${aad}x` }),
    'Une AAD modifiee doit faire echouer l authentification');
  await doitEchouer(() => decryptData(chiffre, k, { additionalData: aad.toUpperCase() }),
    'La casse de l AAD fait partie de la donnee authentifiee');
});

test('C9 - AAD ABSENTE : ne doit pas ouvrir un contenu scelle avec une AAD', async () => {
  const k = await cleDeTest();
  const aad = entryAdditionalData('entree-c9');
  const chiffre = await encryptData({ secret: 'valeur' }, k, { additionalData: aad });

  await doitEchouer(() => decryptData(chiffre, k),
    'Omettre l AAD ne doit pas contourner la liaison entre l entree et son identifiant');
});

test('C10 - AAD AJOUTEE : un contenu scelle sans AAD ne s ouvre pas avec une AAD', async () => {
  const k = await cleDeTest();
  const chiffre = await encryptData({ secret: 'valeur' }, k);

  await doitEchouer(() => decryptData(chiffre, k, { additionalData: entryAdditionalData('e') }),
    'L AAD doit etre exactement la meme au chiffrement et au dechiffrement');
});

test('C11 - PERMUTATION D ENTREES : le contenu de A ne s ouvre pas comme entree B', async () => {
  const k = await cleDeTest();
  const chiffreA = await encryptData({ titre: 'Banque' }, k,
    { additionalData: entryAdditionalData('entree-A') });

  await doitEchouer(
    () => decryptData(chiffreA, k, { additionalData: entryAdditionalData('entree-B') }),
    'Deplacer une entree chiffree sous un autre identifiant doit etre detecte'
  );

  // Le controle positif compte autant : la bonne AAD doit, elle, fonctionner.
  const rendu = await decryptData(chiffreA, k, { additionalData: entryAdditionalData('entree-A') });
  assert.equal(rendu.titre, 'Banque',
    'Un test de rejet sans controle positif ne prouve rien');
});

// ===========================================================================
// 4. Cle : mauvaise cle, non-extractibilite, unicite du sel
// ===========================================================================

test('C12 - MAUVAIS MOT DE PASSE : le dechiffrement echoue', async () => {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const bonne = await deriveMasterKey('Le-Bon-Mot-De-Passe-2026!', sel,
    { iterations: CURRENT_PBKDF2_ITERATIONS });
  const mauvaise = await deriveMasterKey('Le-Bon-Mot-De-Passe-2026?', sel,
    { iterations: CURRENT_PBKDF2_ITERATIONS });

  const chiffre = await encryptData({ secret: 'valeur' }, bonne);
  await doitEchouer(() => decryptData(chiffre, mauvaise),
    'Un caractere de difference doit suffire a refuser l ouverture');
});

test('C13 - MEME MOT DE PASSE, SEL DIFFERENT : cles differentes', async () => {
  const a = await deriveMasterKey('Identique!2026', crypto.getRandomValues(new Uint8Array(16)),
    { iterations: CURRENT_PBKDF2_ITERATIONS });
  const b = await deriveMasterKey('Identique!2026', crypto.getRandomValues(new Uint8Array(16)),
    { iterations: CURRENT_PBKDF2_ITERATIONS });

  const chiffre = await encryptData({ secret: 'valeur' }, a);
  await doitEchouer(() => decryptData(chiffre, b),
    'Le sel doit reellement separer deux coffres construits sur le meme mot de passe');
});

test('C14 - la cle maitre reste NON EXTRACTIBLE', async () => {
  const k = await cleDeTest();
  assert.equal(k.extractable, false);
  await doitEchouer(() => crypto.subtle.exportKey('raw', k),
    'Une cle exportable pourrait etre recopiee hors du coffre');
});

test('C15 - UNICITE DES SELS : 200 tirages, 200 valeurs distinctes', () => {
  const vus = new Set();
  for (let i = 0; i < 200; i += 1) {
    const sel = crypto.getRandomValues(new Uint8Array(16));
    const cleTexte = btoa(String.fromCharCode(...sel));
    assert.ok(!vus.has(cleTexte), `Sel reutilise au tirage ${i}`);
    vus.add(cleTexte);
  }
});

test('C16 - aucun secret ne transite dans le resultat chiffre', async () => {
  const k = await cleDeTest();
  const chiffre = await encryptData({ password: 'MotDePasse-Tres-Reconnaissable-42!' }, k,
    { additionalData: entryAdditionalData('e') });

  const serialise = JSON.stringify(chiffre);
  assert.ok(!serialise.includes('MotDePasse-Tres-Reconnaissable-42!'),
    'Le clair ne doit apparaitre nulle part dans l objet chiffre');
  assert.deepEqual(Object.keys(chiffre).sort(), ['ciphertext', 'iv'],
    'L objet chiffre ne doit transporter que l IV et le ciphertext');
});

console.log('=== TEST CRYPTO INTEGRITY (LOT 9) ===');
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
  console.error(`Crypto integrity tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Crypto integrity tests passed (${cas.length} scenarios).`);
}
