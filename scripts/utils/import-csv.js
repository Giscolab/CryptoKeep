/**
 * CryptoKeep - Raccordement de l'import CSV a l'interface (Lot 2).
 *
 * FICHIER CONSERVE. Son role n'a pas change : ecouter le bouton et le champ
 * fichier de l'ecran des parametres. En revanche, le traitement du contenu
 * DELEGUE desormais entierement a scripts/utils/csv-import-service.js.
 *
 * L'implementation precedente decoupait le fichier avec
 * `text.trim().split('\n')` puis `line.split(',')`. Elle cassait des qu'un
 * champ contenait une virgule, un guillemet ou un saut de ligne, ignorait le
 * BOM, ne verifiait ni l'encodage ni aucune limite de taille, et ajoutait les
 * entrees UNE PAR UNE : une erreur au milieu laissait le coffre a moitie
 * importe. Elle exigeait aussi un nom d'utilisateur, ce qui rejetait des
 * exports legitimes.
 *
 * Le nouveau flux lit, parse, valide, chiffre et assemble TOUT en memoire,
 * presente un apercu, demande confirmation, puis ecrit dans une transaction
 * unique verifiee. Aucun echec ne peut laisser une partie des lignes.
 */

import { vaultManager } from '../core/vault/manager.js';
import { renderVaultEntries } from '../ui/vault-list/vault-list.js';
import { confirmDialog } from '../ui/secure-dialogs.js';
import { importCsvFile } from './csv-import-service.js';
import { showToast } from './toast.js';

/** Construit les lignes de resume de l'apercu, sans jamais montrer un secret. */
function buildPreviewLines(info) {
  const lines = [
    ['Lignes acceptees', String(info.acceptedCount)],
    ['Lignes vides ignorees', String(info.skippedCount)],
    ['Lignes rejetees', String(info.rejectedCount)]
  ];

  if (info.duplicates.length > 0) {
    lines.push(['Ressemblances signalees', `${info.duplicates.length} (aucun ecrasement)`]);
  }

  const colonnes = Object.entries(info.mapping)
    .filter(([, index]) => index >= 0)
    .map(([champ, index]) => `${champ} <- « ${info.headers.at(index)} »`)
    .join(', ');
  lines.push(['Colonnes detectees', colonnes]);

  info.preview.slice(0, 5).forEach((row) => {
    const identite = row.title || row.username || row.url || '(sans titre)';
    lines.push([`Ligne ${row.line}`, identite]);
  });

  info.rejected.slice(0, 5).forEach((row) => {
    lines.push([`Ligne ${row.line} rejetee`, row.reason]);
  });

  return lines;
}

document.addEventListener('DOMContentLoaded', () => {
  const importBtn = document.getElementById('btn-csv-import');
  const fileInput = document.getElementById('csv-import');

  if (!importBtn || !fileInput) {
    console.warn('[CSV Import] Boutons non trouvés dans le DOM.');
    return;
  }

  if (importBtn.dataset.csvImportBound === 'true') return;
  importBtn.dataset.csvImportBound = 'true';

  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;

    try {
      const report = await importCsvFile(file, {
        storage: vaultManager.storage,
        masterKey: vaultManager.masterKey,
        confirmImport: (info) => confirmDialog({
          title: 'Importer ces mots de passe ?',
          message: 'Les entrees seront AJOUTEES au coffre. Aucune entree existante ne sera remplacee.',
          lines: buildPreviewLines(info),
          warning: info.rejectedCount > 0
            ? `${info.rejectedCount} ligne(s) seront ignorees. Aucun mot de passe n'est affiche ici.`
            : '',
          confirmLabel: `Importer ${info.acceptedCount} entree(s)`
        }),
        localStorageRef: localStorage,
        // L'etat en memoire et l'interface ne sont mis a jour qu'apres
        // reussite complete et verification de l'ecriture.
        onSuccess: async () => {
          const updated = await vaultManager.decryptAllEntries();
          renderVaultEntries(updated);
        }
      });

      if (report.backup && !report.backup.written) {
        showToast(report.backup.message, 'warning', 10000);
      }

      const details = [];
      if (report.skippedCount > 0) details.push(`${report.skippedCount} vide(s)`);
      if (report.rejectedCount > 0) details.push(`${report.rejectedCount} rejetee(s)`);
      showToast(
        `${report.addedCount} entree(s) importee(s)${details.length ? ` — ${details.join(', ')}` : ''}.`,
        'success'
      );
    } catch (err) {
      console.warn('[CSV Import] Refus :', err?.code || 'inconnu');
      if (err?.code === 'cancelled') {
        showToast('Import CSV annule. Le coffre est inchange.', 'warning');
      } else {
        showToast(err?.message || "Erreur lors de l'importation CSV.", 'error', 8000);
      }
    } finally {
      try { input.value = ''; } catch { /* nettoyage best-effort */ }
    }
  });
});
