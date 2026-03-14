/**
 * Schéma de base du vault pour initialisation dans IndexedDB.
 * Ne contient que les données par défaut, pas de logique.
 */

export const VaultSchema = {
  id: 'current',
  entries: [], // Liste des entrées chiffrées : { id, iv, ciphertext, tags? }

  meta: {
    salt: '',                    // Sel PBKDF2 encodé en base64
    kdf: 'PBKDF2-HMAC-SHA512',   // Algorithme de dérivation
    iterations: 150000,          // Nombre d'itérations
    created_at: '',              // ISO 8601 — rempli lors de l'init
    last_modified: '',           // ISO 8601 — mis à jour après modif
    version: '1.0.0'             // Pour migrations futures
  }
};
