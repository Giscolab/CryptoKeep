import { exportVault } from './backup.js';

const EXPORT_FORMATS = new Set(['vault', 'csv', 'json']);

export class VaultExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VaultExportError';
    this.code = code;
  }
}

function failedExport() {
  // Never attach an underlying exception: it can contain entry content.
  return new VaultExportError('export_failed', 'Impossible de preparer cet export.');
}

function isBrowserImportable(entry) {
  if (!entry || typeof entry.url !== 'string'
    || typeof entry.password !== 'string' || entry.password.length === 0) {
    return false;
  }
  try {
    const url = new URL(entry.url);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function csvField(value) {
  const text = typeof value === 'string' ? value : '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeCsv(entries) {
  const rows = entries.map((entry) => [
    typeof entry.title === 'string' ? entry.title : entry.name,
    entry.url,
    entry.username,
    entry.password
  ].map(csvField).join(','));
  // Passwords are preserved exactly, including formula-leading characters.
  // This browser-import file must not be opened in a spreadsheet application.
  return ['name,url,username,password', ...rows, ''].join('\r\n');
}

/**
 * Prepare a downloadable file without writing storage or starting a download.
 *
 * `.vault` delegates to the unchanged encrypted backup serializer. CSV uses
 * the Chrome/Edge columns name,url,username,password and skips entries without
 * an HTTP(S) URL or nonempty string password. JSON is a plaintext, versioned
 * envelope: { format: 'cryptokeep-plaintext', version: 1, entries: [...] }.
 * It contains entry fields only, never manager keys or storage metadata.
 *
 * A CSV/JSON Blob is created only after confirmPlaintext returns exactly true.
 * The callback receives counts and format, never decrypted entry contents.
 * Plaintext exports reconcile the unlocked session with authoritative storage
 * before the snapshot and again after consent, including missed sync signals.
 * The caller must trigger the download immediately after this promise resolves;
 * any further asynchronous UI work requires another session check.
 *
 * @param {'vault'|'csv'|'json'} format
 * @param {{vaultManager: Object, confirmPlaintext?: Function}} deps
 * @returns {Promise<{blob: Blob, filename: string, format: string,
 * exportedCount: number, skippedCount: number}>}
 */
export async function exportVaultFile(format, deps = {}) {
  if (!EXPORT_FORMATS.has(format)) {
    throw new VaultExportError('unsupported_format', 'Format d\'export non pris en charge.');
  }

  const { vaultManager, confirmPlaintext } = deps;
  if (!vaultManager || typeof vaultManager.captureSessionGuard !== 'function'
    || typeof vaultManager.assertSessionCurrent !== 'function') {
    throw failedExport();
  }
  const session = vaultManager.captureSessionGuard();
  let blob;
  let exportedCount;
  let skippedCount = 0;

  if (format === 'vault') {
    let record;
    try {
      record = await vaultManager.exportVaultRecord();
    } catch {
      vaultManager.assertSessionCurrent(session);
      throw failedExport();
    }
    vaultManager.assertSessionCurrent(session, record);
    try {
      exportedCount = record.entries.length;
      blob = exportVault(record);
    } catch {
      throw failedExport();
    }
  } else {
    if (typeof confirmPlaintext !== 'function') {
      throw new VaultExportError('confirmation_required', 'Une confirmation explicite est requise.');
    }

    try {
      await vaultManager.reconcileSessionWithStorage();
    } catch {
      vaultManager.assertSessionCurrent(session);
      throw failedExport();
    }
    vaultManager.assertSessionCurrent(session);

    let entries;
    try {
      entries = structuredClone(vaultManager.getEntries());
      if (!Array.isArray(entries)) throw failedExport();
    } catch {
      throw failedExport();
    }
    if (format === 'csv') {
      const importable = entries.filter(isBrowserImportable);
      skippedCount = entries.length - importable.length;
      entries = importable;
      if (entries.length === 0) {
        throw new VaultExportError('no_importable_entries', 'Aucune entree compatible avec cet export CSV.');
      }
    }
    exportedCount = entries.length;

    let confirmed;
    try {
      confirmed = await confirmPlaintext(Object.freeze({ format, exportedCount, skippedCount }));
    } catch {
      vaultManager.assertSessionCurrent(session);
      throw failedExport();
    }
    vaultManager.assertSessionCurrent(session);
    if (confirmed !== true) {
      throw new VaultExportError('export_cancelled', 'Export annule.');
    }

    try {
      await vaultManager.reconcileSessionWithStorage();
    } catch {
      vaultManager.assertSessionCurrent(session);
      throw failedExport();
    }
    vaultManager.assertSessionCurrent(session);

    try {
      blob = format === 'csv'
        ? new Blob([serializeCsv(entries)], { type: 'text/csv;charset=utf-8' })
        : new Blob([JSON.stringify({ format: 'cryptokeep-plaintext', version: 1, entries })], {
          type: 'application/json'
        });
    } catch {
      throw failedExport();
    }
  }

  vaultManager.assertSessionCurrent(session);
  return {
    blob,
    filename: `vault_${new Date().toISOString().slice(0, 10)}.${format}`,
    format,
    exportedCount,
    skippedCount
  };
}
