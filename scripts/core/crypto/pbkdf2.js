/**
 * Dérive une clé maître AES-GCM à partir d’un mot de passe utilisateur.
 * Utilise PBKDF2 avec SHA-512, 150 000 itérations.
 * @param {string} password - Le mot de passe maître en clair.
 * @param {Uint8Array} salt - Le sel de dérivation (aléatoire et persistant).
 * @returns {Promise<CryptoKey>} - Clé AES-GCM dérivée prête à l’usage.
 */
export async function deriveMasterKey(password, salt) {
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 150000,
            hash: 'SHA-512'
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    );
}
export function deriveMasterKeyWithWorker(password, salt, iterations = 150000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./core/crypto/workers/pbkdf2.worker.js', { type: 'module' });

    worker.postMessage({ password, salt: Array.from(salt), iterations });

    worker.onmessage = async (e) => {
      const rawKey = new Uint8Array(e.data);
      const key = await crypto.subtle.importKey(
        'raw',
        rawKey,
        'AES-GCM',
        false,
        ['encrypt', 'decrypt']
      );
      worker.terminate();
      resolve(key);
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
  });
}
