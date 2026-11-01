export const DESKTOP_ORIGIN = 'https://tauri.localhost';
export const DESKTOP_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' ipc: https://ipc.localhost http://ipc.localhost; manifest-src 'self'; worker-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

export function assertDesktopRuntime(runtime) {
  const marker = runtime.__CRYPTOKEEP_DESKTOP__;
  if (!marker || !['production', 'development', 'test'].includes(marker.channel)) {
    throw new Error('Un profil desktop CryptoKeep reconnu est requis.');
  }
  const syntheticOrigin = marker.synthetic === true && marker.channel === 'test'
    && /^http:\/\/127\.0\.0\.1:\d+$/.test(marker.expectedOrigin);
  if ((!syntheticOrigin && marker.expectedOrigin !== DESKTOP_ORIGIN)
    || runtime.location.origin !== marker.expectedOrigin) {
    throw new Error('Origine desktop inattendue : démarrage refusé.');
  }
  if (!runtime.isSecureContext || !runtime.crypto?.subtle
    || typeof runtime.crypto.getRandomValues !== 'function'
    || typeof runtime.crypto.randomUUID !== 'function'
    || typeof runtime.navigator?.locks?.request !== 'function'
    || !runtime.indexedDB || !runtime.localStorage) {
    throw new Error('Web Crypto, Web Locks et le stockage persistant sont requis.');
  }
  runtime.crypto.getRandomValues(new Uint8Array(16)).fill(0);
  return Object.freeze({ channel: marker.channel, origin: runtime.location.origin });
}
