// `validateVaultRecord` (vault-format.js) reste la validation historique et
// demeure utilisee par StorageManager. Ce fichier s'appuie desormais sur le
// validateur strict du Lot 2, plus exigeant, via les modules ci-dessous.
import { MAX_VAULT_FILE_BYTES } from './import-limits.js';
import { validateImportedVaultStructure } from './vault-import-validator.js';
import { assertImportableFile, readVaultFile } from './vault-import-service.js';
import { writeLocalBackup, readLocalBackup, clearLocalBackup } from './local-backup.js';

/**
 * Limite de taille du fichier importe.
 *
 * Lot 2 : la valeur n'est plus definie ici. Elle est CENTRALISEE dans
 * scripts/core/storage/import-limits.js, documentee et couverte par les
 * tests. Cette constante est conservee comme alias de compatibilite pour
 * tout code qui l'importerait encore.
 */
export const MAX_IMPORT_BYTES = MAX_VAULT_FILE_BYTES;

/**
 * Exporte le contenu chiffré du vault dans un fichier `.vault`.
 * @param {Object} vaultData - Objet JSON complet à exporter (entries + meta).
 * @returns {Blob} - Blob téléchargeable à écrire dans un fichier.
 */
export function exportVault(vaultData) {
    const json = JSON.stringify(vaultData);
    const blob = new Blob([json], { type: 'application/json' });
    return blob;
}

/**
 * Importe un fichier `.vault` sélectionné par l’utilisateur.
 * @param {File} file - Le fichier File provenant d’un <input type="file">.
 * @returns {Promise<Object>} - Données JSON désérialisées (vault complet).
 */
export async function importVault(file) {
    // FONCTION CONSERVEE. Depuis le Lot 2 elle DELEGUE au service securise :
    // controle preliminaire (extension insensible a la casse, taille verifiee
    // AVANT lecture), lecture protegee avec retrait du BOM, puis validation
    // structurelle stricte propre a chaque version de format.
    //
    // ATTENTION : cette fonction ne realise QUE la validation structurelle.
    // Elle ne derive aucune cle, ne verifie aucun bloc de validation et
    // n'ecrit rien. Le flux complet — verification cryptographique,
    // dechiffrement de toutes les entrees, confirmation, remplacement
    // atomique verifie — est importVaultFile() dans vault-import-service.js.
    assertImportableFile(file);
    const parsed = await readVaultFile(file, (f) => f.text());
    return validateImportedVaultStructure(parsed).normalized;
}

// === Fichier: scripts/core/storage/backup.js

/**
 * Exporte le vault chiffré actuel et le stocke dans localStorage
 * @param {Array} entries - Entrées chiffrées du vault
 * @param {Object} meta - Métadonnées (inclut salt, date, etc.)
 */
export function backupToLocal(entries, meta) {
  // === Lot 2 partie 2 : delegation a la couche versionnee ===
  // FONCTION CONSERVEE, signature inchangee. Elle ecrivait un objet JSON
  // direct sous la cle `vaultBackup`, format incompatible avec celui de
  // StorageManager.saveToLocalBackup() qui utilisait la MEME cle en base64.
  // Ces deux formats historiques sont desormais uniquement lus et migres.
  //
  // La seule destination d'ecriture est l'enveloppe versionnee
  // `cryptokeep.backup.v1`. Ni le JSON ni le base64 ne chiffraient quoi que
  // ce soit : la confidentialite venait uniquement du fait que le contenu
  // etait deja chiffre par AES-GCM. C'est desormais verifie a l'ecriture.
  return writeLocalBackup({ id: 'current', entries, meta });
}

/**
 * Tente de restaurer un vault depuis localStorage
 * @returns {Object|null} - Objet {entries, meta} ou null si absent
 */
export function restoreFromLocal() {
  // FONCTION CONSERVEE. Elle lit desormais la sauvegarde VERSIONNEE, dont
  // le record est revalide integralement a la lecture. Elle ne restaure
  // rien par elle-meme : elle retourne l'enregistrement chiffre ou null.
  try {
    const envelope = readLocalBackup();
    return envelope ? envelope.record : null;
  } catch {
    // Aucune valeur n'est journalisee : elle pourrait refleter du contenu
    // de coffre.
    console.warn('[Vault] Backup corrompu.');
    return null;
  }
}

/**
 * Efface le backup local si nécessaire
 */
export function clearBackup() {
  // FONCTION CONSERVEE. Efface la sauvegarde versionnee ET la cle
  // historique. Comme clearLocalBackup(), elle reste volontairement NON
  // raccordee au bouton de suppression du coffre : ce flux appartient au
  // Lot 8.
  return clearLocalBackup({ includeLegacy: true });
}
