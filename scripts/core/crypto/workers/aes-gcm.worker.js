self.addEventListener('message', async (event) => {
  const { action, data, keyBuffer, ivBase64, ciphertextBase64 } = event.data;

  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBuffer),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  if (action === 'encrypt') {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    self.postMessage({
      iv: btoa(String.fromCharCode(...iv)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    });

  } else if (action === 'decrypt') {
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    self.postMessage({
      plaintext: new TextDecoder().decode(decrypted)
    });
  }
});
