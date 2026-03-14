const DEBUG = false;

function debugLog(...args) {
  if (DEBUG) console.log('[LOG]', ...args);
}

/**
 * Injecte dynamiquement une CSP stricte côté client uniquement en dev.
 * Permet le test de violations sans modifier le backend.
 */
export function enforceCSP() {
  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
  const hasDOM = typeof document !== 'undefined' && document.head;

  if (!isDev || !hasDOM) return;

  const existingMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');

  if (!existingMeta) {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'", // Retrait de 'unsafe-inline'
      "img-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "report-uri /csp-violation-report-endpoint"
    ].join('; ');

    document.head.appendChild(meta);
    debugLog('CSP injectée dynamiquement en dev.');

    // Hook de monitoring
    window.addEventListener('securitypolicyviolation', (e) => {
      console.warn('[CSP Violation]', {
        directive: e.violatedDirective,
        uri: e.blockedURI,
        line: e.lineNumber,
        source: e.sourceFile,
        disposition: e.disposition
      });
    });
  } else {
    debugLog('CSP déjà présente, injection évitée.');
  }
}
