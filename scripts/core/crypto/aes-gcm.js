// ===== AES-GCM 256 bits =====
// Nécessite une clé CryptoKey AES-GCM (obtenue via PBKDF2 par exemple)

/**
 * Chiffre un objet JavaScript avec AES-GCM.
 * @param {Object} data - Les données à chiffrer.
 * @param {CryptoKey} key - La clé AES-GCM.
 * @returns {Promise<Object>} - { iv, ciphertext } tous deux en base64.
 */
export async function encryptData(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encoded = encoder.encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    return {
        iv: arrayToBase64(iv),
        ciphertext: arrayToBase64(ciphertext)
    };
}

/**
 * Déchiffre un objet AES-GCM base64 avec la clé.
 * @param {Object} encrypted - { iv, ciphertext } en base64.
 * @param {CryptoKey} key - La clé AES-GCM.
 * @returns {Promise<Object>} - Les données d'origine (objet JS).
 */
export async function decryptData(encrypted, key) {
    const iv = base64ToArray(encrypted.iv);
    const ciphertext = base64ToArray(encrypted.ciphertext);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
}

// ===== Utils base64 <-> ArrayBuffer =====

function arrayToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArray(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
export function encryptDataWithWorker(data, rawKey) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./core/crypto/workers/aes-gcm.worker.js', { type: 'module' });

    worker.postMessage({
      action: 'encrypt',
      data,
      keyBuffer: rawKey.buffer
    });

    worker.onmessage = (e) => {
      worker.terminate();
      resolve(e.data);
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
  });
}

export function decryptDataWithWorker(iv, ciphertext, rawKey) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./core/crypto/workers/aes-gcm.worker.js', { type: 'module' });

    worker.postMessage({
      action: 'decrypt',
      ivBase64: iv,
      ciphertextBase64: ciphertext,
      keyBuffer: rawKey.buffer
    });

    worker.onmessage = (e) => {
      worker.terminate();
      resolve(JSON.parse(e.data.plaintext));
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
  });
}
