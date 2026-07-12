export function assertSecureWebCrypto() {
  const webCrypto = globalThis.crypto;

  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function' || !webCrypto.subtle) {
    throw new Error('Secure Web Crypto is unavailable. The vault cannot start safely.');
  }

  const probe = new Uint8Array(16);
  webCrypto.getRandomValues(probe);
  probe.fill(0);
}
