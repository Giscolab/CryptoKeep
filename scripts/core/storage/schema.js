/**
 * Schéma de base du vault pour initialisation dans IndexedDB.
 * Ne contient que les données par défaut, pas de logique.
 */

export const VaultSchema = {
  id: 'current',
  entries: [], // Liste des entrées chiffrées : { id, iv, ciphertext, tags? }

  meta: {
    salt: '',                    // Sel PBKDF2 encodé en base64
    kdf: PBKDF2_ALGORITHM,       // Algorithme de dérivation
    iterations: CURRENT_PBKDF2_ITERATIONS,
    created_at: '',              // ISO 8601 — rempli lors de l'init
    last_modified: '',           // ISO 8601 — mis à jour après modif
    version: CURRENT_VAULT_FORMAT_VERSION
  }
};
import {
  CURRENT_PBKDF2_ITERATIONS,
  CURRENT_VAULT_FORMAT_VERSION,
  PBKDF2_ALGORITHM
} from './vault-format.js';
