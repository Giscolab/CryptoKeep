/**
 * CryptoKeep - Changement du mot de passe maitre (Lot 4).
 *
 * ETAT AVANT CE LOT
 * `#changePasswordBtn` et `#changePasswordModal` existaient dans index.html
 * mais AUCUN script ne les raccordait : la fenetre ne s'ouvrait jamais et le
 * mot de passe maitre ne pouvait pas etre change. Aucune fonction de
 * rechiffrement n'existait dans le projet.
 *
 * CE MODULE est la logique metier, sans aucune dependance au DOM. Il ne lit
 * ni champ, ni bouton, ni fenetre : l'interface lui passe trois chaines et
 * recoit un rapport verifiable.
 *
 * PROPRIETES CRYPTOGRAPHIQUES
 * - Le coffre actuel est REELLEMENT verifie : la cle est derivee du mot de
 *   passe fourni avec le sel et le nombre d'iterations STOCKES, puis le bloc
 *   de validation est dechiffre avec son AAD. Aucune comparaison de chaines,
 *   aucun marqueur en clair.
 * - Un sel NEUF de VAULT_SALT_BYTES octets est tire de crypto.getRandomValues.
 * - La nouvelle cle est derivee par PBKDF2-HMAC-SHA-512 au nombre
 *   d'iterations courant, et reste NON EXTRACTIBLE (deriveMasterKey).
 * - Chaque entree est rechiffree par un appel distinct a encryptData, qui
 *   tire un IV de 12 octets neuf a chaque appel. Aucun IV, aucun ciphertext
 *   n'est reutilise.
 * - Les AAD sont reconstruites pour le format courant :
 *   `vault-entry:<version>:<id>` et `vault-validation:<version>`.
 * - Le bloc de validation est recree avec la nouvelle cle.
 *
 * PROPRIETES TRANSACTIONNELLES
 * - Le coffre complet est rechiffre EN MEMOIRE avant la moindre ecriture.
 *   Une interruption pendant le rechiffrement ne peut donc produire aucune
 *   ecriture partielle : il n'y a qu'une seule ecriture, a la fin.
 * - L'ecriture passe par writeVaultRecordVerified (Lot 2/3b) : transaction
 *   unique, relecture, comparaison canonique, restauration verifiee en cas
 *   de divergence apres validation.
 * - LOT 3C : une lecture du coffre qui ECHOUE n'est pas un coffre absent.
 *   L'operation s'interrompt alors avant toute ecriture.
 * - Apres l'ecriture, le coffre est relu ET REELLEMENT DECHIFFRE avec la
 *   nouvelle cle — bloc de validation ET chaque entree. Une comparaison
 *   canonique prouve que les octets sont ceux attendus ; elle ne prouve pas
 *   que le coffre est utilisable. Si cette verification echoue, l'instantane
 *   chiffre precedent est restaure puis verifie, et l'operation est refusee.
 *
 * MESSAGES
 * Aucun message ne revele de detail cryptographique. Un mot de passe actuel
 * errone, un bloc de validation illisible et une entree indechiffrable
 * produisent le meme refus generique. Aucun mot de passe, aucune cle, aucun
 * fragment de secret n'est journalise ni insere dans une erreur.
 *
 * LIMITE DE NETTOYAGE, DITE HONNETEMENT
 * Les Uint8Array controles par ce module (sels) sont remis a zero. Les
 * CHAINES JavaScript — les mots de passe eux-memes — ne peuvent pas etre
 * effacees de la memoire de facon fiable : le moteur peut en avoir conserve
 * des copies. Ce module ne promet donc pas un effacement parfait.
 */

import { encryptData, decryptData } from '../crypto/aes-gcm.js';
import { deriveMasterKey } from '../crypto/pbkdf2.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  CURRENT_VAULT_FORMAT_VERSION,
  VAULT_SALT_BYTES,
  base64ToBytes,
  bytesToBase64,
  createVaultMetadata,
  entryAdditionalData,
  parseVaultMetadata,
  validateVaultRecord,
  validationAdditionalData
} from '../storage/vault-format.js';
import {
  createEncryptedSnapshot,
  writeVaultRecordVerified,
  recordsAreIdentical
} from '../storage/vault-transaction.js';
import { writeLocalBackup } from '../storage/local-backup.js';
import { validateNewMasterPassword } from '../../security/master-password-policy.js';

/** Refus generique commun a toutes les causes cryptographiques. */
export const GENERIC_CURRENT_PASSWORD_FAILURE = 'Le mot de passe actuel est incorrect, ou le coffre n\'a pas pu etre ouvert.';

export class MasterPasswordChangeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MasterPasswordChangeError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new MasterPasswordChangeError(code, message, details);
}

/** Options de chiffrement d'une entree pour un format donne. */
function entryOptions(entryId, formatVersion) {
  return formatVersion < CURRENT_VAULT_FORMAT_VERSION
    ? {}
    : { additionalData: entryAdditionalData(entryId, formatVersion) };
}

/** Options de chiffrement du bloc de validation pour un format donne. */
function validationOptions(formatVersion) {
  return formatVersion < CURRENT_VAULT_FORMAT_VERSION
    ? {}
    : { additionalData: validationAdditionalData(formatVersion) };
}

/**
 * Etapes 1, 3 et 4 : la saisie, avant toute cryptographie.
 *
 * Verifier la forme AVANT de deriver une cle evite de faire travailler
 * PBKDF2 220 000 fois pour une confirmation mal recopiee.
 */
export function validateChangeRequest(input = {}) {
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';

  if (currentPassword.length === 0) {
    fail('current_password_required', 'Le mot de passe actuel est requis.', { field: 'currentPassword' });
  }
  if (newPassword.length === 0) {
    fail('new_password_required', 'Le nouveau mot de passe est requis.', { field: 'newPassword' });
  }
  if (confirmPassword.length === 0) {
    fail('confirmation_required', 'La confirmation du nouveau mot de passe est requise.', { field: 'confirmPassword' });
  }

  // Comparaison de deux valeurs fournies par le MEME utilisateur dans la meme
  // fenetre : il n'y a pas de secret a proteger d'un attaquant ici, et le
  // message ne revele rien d'autre que « les deux champs different ».
  if (newPassword !== confirmPassword) {
    fail('confirmation_mismatch', 'Les deux nouveaux mots de passe ne correspondent pas.', { field: 'confirmPassword' });
  }

  if (newPassword === currentPassword) {
    fail('same_as_current', 'Le nouveau mot de passe doit etre different de l\'actuel.', { field: 'newPassword' });
  }

  const policy = validateNewMasterPassword(newPassword);
  if (!policy.valid) {
    fail('weak_password', policy.message, { field: 'newPassword' });
  }

  return { valid: true, entropyBits: policy.entropyBits };
}

/**
 * Etape 2 : verification REELLE du coffre actuel, et etape 6 : dechiffrement
 * des entrees en memoire.
 *
 * Toute cause d'echec — mot de passe errone, bloc de validation altere,
 * entree indechiffrable — produit le MEME refus generique.
 *
 * @returns {Promise<{entries: Array, metadata: object}>}
 */
async function openCurrentVault(record, currentPassword) {
  let metadata;
  let saltBytes = null;

  try {
    metadata = parseVaultMetadata(record.meta);
    saltBytes = base64ToBytes(metadata.salt, 'salt');
  } catch {
    fail('vault_unreadable', GENERIC_CURRENT_PASSWORD_FAILURE);
  }

  let key;
  try {
    key = await deriveMasterKey(currentPassword, saltBytes, { iterations: metadata.iterations });
  } catch {
    fail('invalid_current_password', GENERIC_CURRENT_PASSWORD_FAILURE);
  } finally {
    if (saltBytes instanceof Uint8Array) saltBytes.fill(0);
  }

  // Le bloc de validation est REELLEMENT dechiffre, avec son AAD.
  try {
    const validation = await decryptData(
      record.meta.validation,
      key,
      validationOptions(metadata.formatVersion)
    );
    if (!validation || validation.check !== 'ok') {
      fail('invalid_current_password', GENERIC_CURRENT_PASSWORD_FAILURE);
    }
  } catch (error) {
    if (error instanceof MasterPasswordChangeError) throw error;
    fail('invalid_current_password', GENERIC_CURRENT_PASSWORD_FAILURE);
  }

  // Etape 6 : dechiffrement de TOUTES les entrees en memoire. Une entree
  // illisible interrompt ici, avant le moindre rechiffrement : mieux vaut
  // refuser que produire un coffre neuf ampute d'une entree.
  const entries = [];
  for (const stored of record.entries) {
    let data;
    try {
      data = await decryptData(stored, key, entryOptions(stored.id, metadata.formatVersion));
    } catch {
      fail('entry_undecryptable', GENERIC_CURRENT_PASSWORD_FAILURE, { entryCount: record.entries.length });
    }
    entries.push({ ...data, id: stored.id });
  }

  return { entries, metadata };
}

/**
 * Etapes 7 a 11 : nouveau sel, nouvelle cle, rechiffrement complet.
 *
 * Le coffre entier est construit EN MEMOIRE. Aucune ecriture n'a lieu ici :
 * une interruption pendant le rechiffrement ne peut donc laisser aucun etat
 * partiel sur le disque.
 */
async function rebuildVault(entries, newPassword, previousMetadata, now) {
  // 7. sel neuf, tire du CSPRNG. Jamais Math.random.
  const salt = crypto.getRandomValues(new Uint8Array(VAULT_SALT_BYTES));

  // 8. cle neuve, non extractible, au nombre d'iterations courant.
  const key = await deriveMasterKey(newPassword, salt, {
    iterations: CURRENT_PBKDF2_ITERATIONS
  });

  // 9 et 10. rechiffrement de chaque entree : un appel par entree, donc un
  // IV neuf par entree, et une AAD reconstruite pour le format courant.
  const encryptedEntries = [];
  for (const entry of entries) {
    const { id, ...payload } = entry;
    const encrypted = await encryptData(
      payload,
      key,
      entryOptions(id, CURRENT_VAULT_FORMAT_VERSION)
    );
    encryptedEntries.push({ id, ...encrypted });
  }

  // 11. bloc de validation recree avec la nouvelle cle et sa propre AAD.
  const validation = await encryptData(
    { check: 'ok' },
    key,
    validationOptions(CURRENT_VAULT_FORMAT_VERSION)
  );

  // La date de creation du coffre est PRESERVEE : changer de mot de passe ne
  // fait pas naitre un nouveau coffre.
  const metadata = createVaultMetadata(bytesToBase64(salt), {
    createdAt: previousMetadata.createdAt || now,
    lastModified: now
  });

  const record = validateVaultRecord({
    id: 'current',
    entries: encryptedEntries,
    meta: { ...metadata, validation }
  });

  return { record, key, salt };
}

/**
 * Etape 13 : le coffre ecrit est-il REELLEMENT utilisable ?
 *
 * La comparaison canonique de writeVaultRecordVerified prouve que les octets
 * relus sont ceux qui ont ete ecrits. Elle ne prouve pas qu'ils se
 * dechiffrent. Ici, le bloc de validation ET chaque entree sont reellement
 * dechiffres avec la nouvelle cle.
 */
async function assertVaultReadable(record, key) {
  const validation = await decryptData(
    record.meta.validation,
    key,
    validationOptions(CURRENT_VAULT_FORMAT_VERSION)
  );
  if (!validation || validation.check !== 'ok') {
    throw new Error('validation block unreadable');
  }

  for (const stored of record.entries) {
    await decryptData(stored, key, entryOptions(stored.id, CURRENT_VAULT_FORMAT_VERSION));
  }

  return true;
}

/**
 * Etape 14 : restauration temporaire de l'instantane chiffre precedent.
 *
 * La restauration est elle-meme relue et verifiee. Aucune restauration n'est
 * declenchee apres une restauration : la chaine s'arrete ici.
 */
async function restorePreviousVault(storage, snapshot) {
  if (!snapshot) return { restored: false, verifiedRestore: false };

  try {
    await storage.putVaultRecord(snapshot);
  } catch {
    return { restored: false, verifiedRestore: false };
  }

  try {
    const reread = await storage.loadVault();
    return { restored: true, verifiedRestore: recordsAreIdentical(reread, snapshot) };
  } catch {
    return { restored: true, verifiedRestore: false };
  }
}

/**
 * Change le mot de passe maitre du coffre.
 *
 * Enchainement complet des 17 etapes exigees. Aucune ecriture n'a lieu avant
 * l'etape 12 : tout echec anterieur laisse le coffre strictement intact.
 *
 * @param {object} vaultManager gestionnaire de coffre (expose `storage`)
 * @param {{currentPassword: string, newPassword: string, confirmPassword: string}} input
 * @param {{now?: string, localStorageRef?: object, lockAfterChange?: boolean}} [deps]
 * @returns {Promise<object>} rapport verifiable, sans aucun secret
 */
export async function changeMasterPassword(vaultManager, input, deps = {}) {
  const {
    now = new Date().toISOString(),
    localStorageRef = typeof localStorage !== 'undefined' ? localStorage : null,
    lockAfterChange = false
  } = deps;

  if (!vaultManager || !vaultManager.storage) {
    fail('storage_unavailable', 'Le stockage du coffre est indisponible.');
  }
  const storage = vaultManager.storage;

  // --- 1, 3, 4, 5 : saisie et politique, avant toute cryptographie -------
  const policyReport = validateChangeRequest(input);

  // --- lecture du coffre actuel -----------------------------------------
  // LOT 3C : une lecture qui ECHOUE n'est pas un coffre absent.
  let currentRecord = null;
  try {
    if (typeof storage.initializeDB === 'function') await storage.initializeDB();
    currentRecord = await storage.loadVault();
  } catch {
    fail('vault_unreadable', 'Le coffre n\'a pas pu etre lu. Aucune modification n\'a ete effectuee.', { written: false });
  }

  if (!currentRecord) {
    // Changer le mot de passe d'un coffre inexistant n'a pas de sens, et ne
    // doit surtout pas en creer un.
    fail('no_vault', 'Aucun coffre n\'existe. Aucune modification n\'a ete effectuee.', { written: false });
  }

  // --- 2 et 6 : verification reelle puis dechiffrement en memoire --------
  const opened = await openCurrentVault(currentRecord, input.currentPassword);

  // --- instantane chiffre du coffre actuel (etape 14, prepare avant) -----
  let snapshot = null;
  try {
    snapshot = validateVaultRecord(createEncryptedSnapshot(currentRecord));
  } catch {
    fail(
      'snapshot_unusable',
      'L\'etat actuel du coffre n\'a pas pu etre preserve. Aucune modification n\'a ete effectuee.',
      { written: false }
    );
  }

  // --- 7 a 11 : rechiffrement COMPLET en memoire ------------------------
  let rebuilt;
  try {
    rebuilt = await rebuildVault(opened.entries, input.newPassword, opened.metadata, now);
  } catch (error) {
    if (error instanceof MasterPasswordChangeError) throw error;
    // Interruption pendant le rechiffrement : rien n'a ete ecrit, il ne peut
    // donc exister aucun etat partiel.
    fail(
      'reencryption_failed',
      'Le rechiffrement du coffre a echoue. Aucune modification n\'a ete effectuee.',
      { written: false, entryCount: opened.entries.length }
    );
  }

  // --- 12 : ecriture atomique verifiee ----------------------------------
  try {
    await writeVaultRecordVerified(storage, rebuilt.record, snapshot);
  } catch (error) {
    const details = (error && error.details) || {};
    fail('write_failed', 'Le nouveau coffre n\'a pas pu etre enregistre.', {
      written: details.restored === true,
      restored: details.restored === true,
      verifiedRestore: details.verifiedRestore === true,
      cause: error && error.code ? error.code : 'unknown'
    });
  }

  // --- 13 : le coffre ecrit est-il reellement relisible ? ----------------
  let readable = false;
  try {
    const reread = await storage.loadVault();
    readable = await assertVaultReadable(reread, rebuilt.key);
  } catch {
    readable = false;
  }

  if (!readable) {
    // --- 14 : restauration temporaire de l'ancien coffre ----------------
    const restoration = await restorePreviousVault(storage, snapshot);
    if (rebuilt.salt instanceof Uint8Array) rebuilt.salt.fill(0);
    fail(
      'verification_failed',
      'Le nouveau coffre n\'a pas pu etre verifie. L\'ancien mot de passe reste valable.',
      { written: true, ...restoration }
    );
  }

  // --- 15 : sauvegarde secondaire chiffree, APRES verification seulement -
  let backup = { written: false, reason: 'no_storage' };
  if (localStorageRef) {
    try {
      backup = writeLocalBackup(rebuilt.record, { storage: localStorageRef, now });
    } catch {
      // Un echec de sauvegarde secondaire ne remet pas en cause le coffre
      // principal, deja ecrit ET verifie. Il est signale, jamais masque.
      backup = { written: false, reason: 'backup_failed' };
    }
  }

  // --- 16 : nettoyage des anciennes references --------------------------
  // Les Uint8Array sont remis a zero. Les CHAINES (mots de passe) ne peuvent
  // pas etre effacees de facon fiable en JavaScript : ce module ne le promet
  // pas. Les entrees dechiffrees locales sont liberees.
  const previousSalt = vaultManager.salt;
  if (previousSalt instanceof Uint8Array) previousSalt.fill(0);
  opened.entries.length = 0;

  // --- 17 : session verrouillee, ou renouvelee proprement ---------------
  let session;
  if (lockAfterChange) {
    if (typeof vaultManager.clearSession === 'function') vaultManager.clearSession();
    if (rebuilt.salt instanceof Uint8Array) rebuilt.salt.fill(0);
    session = { renewed: false, locked: true };
  } else {
    // La session continue avec la NOUVELLE cle et le NOUVEAU sel : l'ancienne
    // cle n'est plus referencee nulle part.
    const decrypted = await Promise.all(rebuilt.record.entries.map(async (stored) => {
      const data = await decryptData(
        stored,
        rebuilt.key,
        entryOptions(stored.id, CURRENT_VAULT_FORMAT_VERSION)
      );
      return { ...data, id: stored.id };
    }));

    vaultManager._setSession(
      rebuilt.key,
      rebuilt.salt,
      decrypted,
      CURRENT_VAULT_FORMAT_VERSION
    );
    session = { renewed: true, locked: false };
  }

  return {
    changed: true,
    entryCount: rebuilt.record.entries.length,
    formatVersion: CURRENT_VAULT_FORMAT_VERSION,
    iterations: CURRENT_PBKDF2_ITERATIONS,
    saltRenewed: true,
    validationRenewed: true,
    entropyBits: policyReport.entropyBits,
    backup,
    session
  };
}

export default {
  changeMasterPassword,
  validateChangeRequest,
  MasterPasswordChangeError,
  GENERIC_CURRENT_PASSWORD_FAILURE
};
