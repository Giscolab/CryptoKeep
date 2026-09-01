import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'vendor' ? [] : listJavaScriptFiles(fullPath);
    }
    return entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

try {
  const scriptFiles = listJavaScriptFiles('scripts');
  const sources = scriptFiles.map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
  const combinedSource = sources.map(({ source }) => source).join('\n');
  const indexSource = fs.readFileSync('index.html', 'utf8');
  const vaultListSource = fs.readFileSync('scripts/ui/vault-list/vault-list.js', 'utf8');

  assert(
    !/window\.(vaultManager|vault\b|debugAudit)/.test(combinedSource),
    'Des objets de coffre sensibles sont encore exposes sur window.'
  );
  assert(
    !/exportKey\(\s*['"]raw['"]/.test(combinedSource),
    'Une cle cryptographique est encore exportee en brut.'
  );
  assert(
    !/\[Vault DEBUG\]/.test(combinedSource),
    'Un log de debug du coffre est encore present.'
  );
  assert(
    !/\.innerHTML\s*=/.test(combinedSource),
    'Le code applicatif ne doit pas injecter de HTML avec innerHTML.'
  );
  assert(
    !vaultListSource.includes('.storage.'),
    'L UI ne doit pas acceder directement au stockage du coffre.'
  );
  const blockedHost = 'cdnjs.cloudflare.com';
  const urlCandidates = [
    ...indexSource.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi),
    ...indexSource.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)
  ].map((m) => m[1]);
  const referencesBlockedCdn = urlCandidates.some((value) => {
    try {
      const parsed = new URL(value, 'https://local.test');
      return parsed.hostname === blockedHost;
    } catch {
      return false;
    }
  });
  assert(
    !referencesBlockedCdn,
    'Le CDN ne doit pas etre autorise par la page du coffre.'
  );
  assert(
    !indexSource.includes("'unsafe-inline'"),
    'La CSP ne doit pas autoriser les styles inline.'
  );
  assert(
    indexSource.includes("default-src 'none'"),
    'La CSP doit partir de default-src none.'
  );
  assert(
    indexSource.includes("script-src 'self'"),
    'La CSP doit limiter les scripts a self.'
  );

  console.log('Security regression checks passed.');
} catch (error) {
  console.error('Security regression checks failed:', error);
  process.exitCode = 1;
}
