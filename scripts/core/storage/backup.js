import { validateVaultRecord } from './vault-format.js';
import { MAX_VAULT_FILE_BYTES } from './import-limits.js';
import { validateImportedVaultStructure } from './vault-import-validator.js';
import { assertImportableFile, readVaultFile } from './vault-import-service.js';

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
  const backup = JSON.stringify({ entries, meta });
  localStorage.setItem('vaultBackup', backup);
}

/**
 * Tente de restaurer un vault depuis localStorage
 * @returns {Object|null} - Objet {entries, meta} ou null si absent
 */
export function restoreFromLocal() {
  const raw = localStorage.getItem('vaultBackup');
  if (!raw) return null;
  try {
    return validateVaultRecord(JSON.parse(raw));
  } catch {
    // Liaison de capture retiree : la valeur n'etait pas utilisee et ne
    // doit pas etre journalisee (elle peut refleter du contenu de coffre).
    console.warn('[Vault] Backup corrompu.');
    return null;
  }
}

/**
 * Efface le backup local si nécessaire
 */
export function clearBackup() {
  localStorage.removeItem('vaultBackup');
}
