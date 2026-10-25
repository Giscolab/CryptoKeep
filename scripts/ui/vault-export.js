import { vaultManager as defaultVaultManager } from '../core/vault/manager.js';
import { exportVaultFile } from '../core/storage/vault-export-service.js';
import { confirmDialog } from './secure-dialogs.js';
import { showToast as defaultShowToast } from '../utils/toast.js';

function describeFormat(format) {
  switch (format) {
    case 'csv':
      return 'CSV pour Chrome et Edge : mots de passe avec URL web. Les notes, catégories et autres métadonnées ne sont pas incluses. Fichier en clair.';
    case 'json':
      return 'JSON : toutes les entrées et leurs champs, en clair. Pour un usage externe ; ce fichier ne s’importe pas dans les navigateurs ou dans CryptoKeep.';
    default:
      return 'VAULT : sauvegarde complète chiffrée, à réimporter dans CryptoKeep avec votre mot de passe maître.';
  }
}

function confirmPlaintextExport(summary, doc) {
  const csv = summary.format === 'csv';
  return confirmDialog({
    doc,
    title: 'Exporter les mots de passe en clair',
    message: csv
      ? 'Ce CSV sert à importer vos mots de passe dans Chrome ou Edge. Il contient uniquement les noms, URL, identifiants et mots de passe.'
      : 'Ce JSON contient toutes vos entrées et leurs champs en clair. Il ne sert pas à restaurer un coffre ou à importer dans Chrome ou Edge.',
    lines: [
      ['Format', summary.format.toUpperCase()],
      ['Entrées exportées', String(summary.exportedCount)],
      ...(csv ? [['Entrées exclues (URL web ou mot de passe manquant)', String(summary.skippedCount)]] : [])
    ],
    warning: 'Toute personne ayant accès à ce fichier pourra lire vos mots de passe. '
      + 'Ne l’ouvrez pas dans un tableur et supprimez-le après utilisation. '
      + 'Préférez VAULT pour une sauvegarde chiffrée.',
    confirmLabel: 'Exporter en clair'
  });
}

/** Le lien temporaire ne contient que l’URL Blob, jamais les secrets dans le DOM. */
function downloadExport(report, doc, urlApi) {
  let url = null;
  let anchor = null;
  let clicked = false;
  try {
    url = urlApi.createObjectURL(report.blob);
    anchor = doc.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', report.filename);
    anchor.download = report.filename;
    anchor.hidden = true;
    doc.body.appendChild(anchor);
    anchor.click();
    clicked = true;
  } finally {
    if (anchor) anchor.remove();
    if (url !== null) {
      if (clicked) {
        // Laisser au navigateur le temps de prendre en charge le téléchargement.
        // Cette fermeture retient seulement l’URL, pas le Blob ni les entrées.
        const cleanup = setTimeout(() => urlApi.revokeObjectURL(url), 1000);
        if (cleanup && typeof cleanup.unref === 'function') cleanup.unref();
      } else {
        urlApi.revokeObjectURL(url);
      }
    }
  }
}

/** Raccordement unique du bouton existant ; aucune préférence sensible persistée. */
export function initVaultExportControls(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  const button = doc?.getElementById('btn-export');
  const select = doc?.getElementById('export-format');
  if (!button || !select) return { bound: false, reason: 'controls_absent' };
  if (button.dataset.vaultExportBound === 'true') return { bound: false, reason: 'already_bound' };

  const manager = options.vaultManager || defaultVaultManager;
  const notify = options.showToast || defaultShowToast;
  const urlApi = options.urlApi || URL;
  const help = doc.getElementById('export-format-help');
  button.dataset.vaultExportBound = 'true';
  select.value = 'vault';
  const updateHelp = () => { if (help) help.textContent = describeFormat(select.value); };
  updateHelp();
  select.addEventListener('change', updateHelp);

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    select.disabled = true;
    try {
      const session = manager.captureSessionGuard();
      const report = await exportVaultFile(select.value, {
        vaultManager: manager,
        confirmPlaintext: (summary) => confirmPlaintextExport(summary, doc)
      });
      manager.assertSessionCurrent(session);
      downloadExport(report, doc, urlApi);
      const exclusions = report.skippedCount > 0
        ? ` ${report.skippedCount} entrée(s) exclue(s) : URL web ou mot de passe manquant.`
        : '';
      notify(`Téléchargement ${report.format.toUpperCase()} lancé : ${report.exportedCount} entrée(s).${exclusions}`,
        report.skippedCount > 0 ? 'warning' : 'success');
    } catch (error) {
      // Ne jamais afficher ou journaliser error.message : il peut refléter une entrée.
      if (error?.code === 'export_cancelled') return;
      const message = error?.code === 'no_importable_entries'
        ? 'Aucune entrée exportable en CSV : renseignez une URL HTTP(S) valide et un mot de passe, ou choisissez JSON ou VAULT.'
        : error?.code === 'vault_locked' || error?.code === 'session_changed' || error?.code === 'stale_session'
          ? 'Export annulé : le coffre est verrouillé ou la session a changé. Déverrouillez-le et réessayez.'
          : 'Impossible d’exporter les données. Aucun téléchargement terminé n’est confirmé.';
      notify(message, 'error');
    } finally {
      button.disabled = false;
      select.disabled = false;
    }
  });
  return { bound: true };
}
