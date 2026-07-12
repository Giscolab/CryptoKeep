function arrayToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
}

function base64ToArray(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalizeAdditionalData(additionalData) {
  if (additionalData === undefined || additionalData === null) {
    return undefined;
  }

  if (typeof additionalData === 'string') {
    return new TextEncoder().encode(additionalData);
  }

  if (additionalData instanceof Uint8Array || additionalData instanceof ArrayBuffer) {
    return additionalData;
  }

  throw new Error('AES-GCM additional data must be a string or byte buffer.');
}

function buildAlgorithm(iv, additionalData) {
  const algorithm = { name: 'AES-GCM', iv };
  const normalizedAdditionalData = normalizeAdditionalData(additionalData);

  if (normalizedAdditionalData) {
    algorithm.additionalData = normalizedAdditionalData;
  }

  return algorithm;
}

export async function encryptData(data, key, options = {}) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));

  try {
    const ciphertext = await crypto.subtle.encrypt(
      buildAlgorithm(iv, options.additionalData),
      key,
      encoded
    );

    return {
      iv: arrayToBase64(iv),
      ciphertext: arrayToBase64(ciphertext)
    };
  } finally {
    encoded.fill(0);
    iv.fill(0);
  }
}

export async function decryptData(encrypted, key, options = {}) {
  const iv = base64ToArray(encrypted.iv);
  const ciphertext = base64ToArray(encrypted.ciphertext);

  try {
    const decrypted = await crypto.subtle.decrypt(
      buildAlgorithm(iv, options.additionalData),
      key,
      ciphertext
    );
    const plaintextBytes = new Uint8Array(decrypted);

    try {
      return JSON.parse(new TextDecoder().decode(plaintextBytes));
    } finally {
      plaintextBytes.fill(0);
    }
  } finally {
    iv.fill(0);
    ciphertext.fill(0);
  }
}
