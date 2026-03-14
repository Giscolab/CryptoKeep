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
    if (!file || !file.name.endsWith('.vault')) {
        throw new Error('Fichier invalide. Format requis : .vault');
    }

    const content = await file.text();
    return JSON.parse(content);
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
    return JSON.parse(raw);
  } catch (e) {
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
