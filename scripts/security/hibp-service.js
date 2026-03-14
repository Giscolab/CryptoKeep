/**
 * Service HIBP (k-anonymity) pour vérification de fuites.
 */

const HIBP_API = 'https://api.pwnedpasswords.com/range/';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

const pwnedCache = new Map();
let offlineNoticeShown = false;

function isHibpEnabled() {
  if (typeof window !== 'undefined' && window.__VAULT_HIBP_ENABLED__ === false) {
    return false;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem('vault.security.hibp.enabled') === 'false') {
        return false;
      }
    } catch {
      // no-op
    }
  }

  return true;
}

async function sha1(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function isPasswordPwned(password) {
  if (!password || typeof password !== 'string') {
    return { pwned: false, count: 0, source: 'skipped' };
  }

  if (!isHibpEnabled()) {
    if (!offlineNoticeShown) {
      console.info('[HIBP] Vérification désactivée (mode offline).');
      offlineNoticeShown = true;
    }
    return { pwned: false, count: 0, source: 'offline' };
  }

  const cacheKey = await sha1(password);
  const cached = pwnedCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
    return { pwned: cached.pwned, count: cached.count, source: 'cache' };
  }

  try {
    const prefix = cacheKey.slice(0, 5);
    const suffix = cacheKey.slice(5);

    const response = await fetch(`${HIBP_API}${prefix}`, {
      headers: {
        'Add-Padding': 'true'
      }
    });

    if (!response.ok) {
      throw new Error(`HIBP API error: ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split('\n');

    let count = 0;
    for (const line of lines) {
      const [hashSuffix, occurrence] = line.trim().split(':');
      if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
        count = parseInt(occurrence, 10) || 1;
        break;
      }
    }

    const result = { pwned: count > 0, count };
    pwnedCache.set(cacheKey, { ...result, timestamp: Date.now() });
    return { ...result, source: 'hibp' };
  } catch (error) {
    console.warn('[HIBP] Vérification indisponible:', error.message);
    return { pwned: false, count: 0, error: error.message, source: 'error' };
  }
}

export function clearHibpCache() {
  pwnedCache.clear();
}
