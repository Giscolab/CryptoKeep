/**
 * Invalidation inter-onglets du coffre.
 *
 * Le message ne contient aucun secret ni record : seulement une version, un
 * identifiant aleatoire de contexte et un nonce. `storage` couvre les onglets
 * partageant localStorage ; BroadcastChannel fournit un second transport sans
 * persistance. Les messages emis par le contexte courant sont ignores.
 */

export const VAULT_SYNC_KEY = 'cryptokeep.vault-sync.v1';
export const VAULT_SYNC_CHANNEL = 'cryptokeep-vault-sync-v1';

const listeners = new Set();
const seenNonces = new Set();
let transportInstalled = false;
let channel = null;
let realmId = null;

function isBrowserRealm() {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && !globalThis.process?.versions?.node;
}

function randomId() {
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('secure_random_unavailable');
  }
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getRealmId() {
  if (!realmId) realmId = randomId();
  return realmId;
}

function rememberNonce(nonce) {
  seenNonces.add(nonce);
  if (seenNonces.size > 64) {
    const oldest = seenNonces.values().next().value;
    seenNonces.delete(oldest);
  }
}

function deliver(message) {
  if (!message || message.version !== 1 || typeof message.nonce !== 'string') return;
  if (message.source === getRealmId() || seenNonces.has(message.nonce)) return;
  rememberNonce(message.nonce);
  listeners.forEach((listener) => {
    try { listener(Object.freeze({ ...message })); } catch { /* notification best-effort */ }
  });
}

function parseStorageMessage(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function ensureTransport() {
  if (transportInstalled || !isBrowserRealm()) return;
  transportInstalled = true;

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (!event || event.key !== VAULT_SYNC_KEY) return;
      deliver(parseStorageMessage(event.newValue));
    });
  }

  if (typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(VAULT_SYNC_CHANNEL);
      channel.addEventListener('message', (event) => deliver(event?.data));
    } catch {
      channel = null;
    }
  }
}

function reportDeliveryFailure(result) {
  if (result.storageNotified || result.broadcastNotified || !isBrowserRealm()) return;
  if (typeof document.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
  try {
    document.dispatchEvent(new CustomEvent('vault:sync-warning'));
  } catch {
    /* L'appelant recoit aussi le statut d'echec. */
  }
}

/** Abonne un gestionnaire aux changements provenant d'un autre contexte. */
export function subscribeVaultChanges(listener) {
  if (typeof listener !== 'function') return () => {};
  ensureTransport();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Publie un changement sans inclure la moindre donnee du coffre. */
export function publishVaultChange(options = {}) {
  if (!isBrowserRealm() && !options.storage) {
    return { storageNotified: false, broadcastNotified: false };
  }
  ensureTransport();
  let message;
  try {
    message = {
      version: 1,
      source: getRealmId(),
      nonce: randomId(),
      changedAt: Date.now()
    };
  } catch {
    return { storageNotified: false, broadcastNotified: false };
  }

  rememberNonce(message.nonce);
  let storageNotified = false;
  const storage = options.storage
    || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (storage) {
    try {
      storage.setItem(VAULT_SYNC_KEY, JSON.stringify(message));
      storageNotified = true;
    } catch {
      /* BroadcastChannel peut encore notifier les autres onglets. */
    }
  }

  let broadcastNotified = false;
  if (channel && typeof channel.postMessage === 'function') {
    try {
      channel.postMessage(message);
      broadcastNotified = true;
    } catch {
      /* notification best-effort */
    }
  }

  const result = { storageNotified, broadcastNotified };
  reportDeliveryFailure(result);
  return result;
}

export default {
  subscribeVaultChanges,
  publishVaultChange,
  VAULT_SYNC_KEY,
  VAULT_SYNC_CHANNEL
};
