/**
 * CryptoKeep - Rafraichissement centralise des vues (Lot 3).
 *
 * Avant ce lot, chaque handler recopiait sa propre sequence de mise a jour
 * (`renderVaultEntries` ici, `renderRecentAccesses` la, parfois rien), ce qui
 * laissait des compteurs et des statistiques manifestement obsoletes selon le
 * chemin emprunte.
 *
 * Un seul abonnement a `vault:entries-changed` remplace ces recopies. Toute
 * mutation reussie d'entree — ajout, modification, suppression — declenche la
 * meme sequence, quel que soit le composant a l'origine de l'action.
 *
 * Ce module ne calcule aucun audit : le moteur d'audit complet appartient au
 * Lot 6. Il se contente de reactualiser ce qui existe deja et qui serait
 * sinon perime.
 */

import { vaultManager } from '../core/vault/manager.js';
import { ENTRIES_CHANGED_EVENT } from '../core/vault/entry-operations.js';
import { renderVaultEntries, renderRecentAccesses } from './vault-list/vault-list.js';

let installed = false;

/** Met a jour les compteurs et le score deja presents dans le tableau de bord. */
async function refreshDashboardStats() {
  let stats;
  try {
    stats = await vaultManager.getPasswordStats();
  } catch {
    return false;
  }

  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  };

  setText('stats-total', stats.total);
  setText('stats-weak', stats.weak);
  setText('stats-reused', stats.reused);
  setText('stats-old', stats.old);
  setText('stats-weak-in-info', stats.weak);
  setText('stats-score', `${stats.score}%`);
  setText('stats-score-ring', `${stats.score}%`);

  const level = document.getElementById('stats-level');
  if (level) {
    level.textContent = stats.score >= 80 ? 'Sécurité forte'
      : stats.score >= 60 ? 'Sécurité modérée'
        : 'Sécurité faible';
  }

  // Lot 6 : le texte d'accompagnement portait un compte fixe (« 16 mots de
  // passe »). Il decrit desormais l'etat reel de la session.
  const info = document.getElementById('stats-info');
  if (info && info.firstChild && info.firstChild.nodeType === 3) {
    info.firstChild.textContent = stats.total === 0
      ? ' Aucune entrée dans le coffre. '
      : ' Améliorez votre score en corrigeant les mots de passe signalés. '
        + 'Entrées nécessitant une attention : ';
  }

  return true;
}

/**
 * Rafraichit toutes les vues dependant des entrees.
 *
 * @returns {Promise<{entries: number, statsRefreshed: boolean}>}
 */
export async function refreshVaultViews() {
  const entries = vaultManager.getEntries();

  // La liste conserve son etat de recherche, de filtre et de tri : c'est
  // `renderVaultEntries` qui reapplique le pipeline sur les nouvelles donnees.
  renderVaultEntries(entries);
  await renderRecentAccesses();
  const statsRefreshed = await refreshDashboardStats();

  // Le tableau de bord de securite existant se rafraichit sur son propre
  // evenement, deja ecoute par scripts/app.js.
  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    try {
      document.dispatchEvent(new CustomEvent('vault:security-updated'));
    } catch {
      /* diffusion best-effort */
    }
  }

  return { entries: entries.length, statsRefreshed };
}

/** Abonnement unique. Un second appel n'ajoute pas d'ecouteur. */
export function installVaultViewRefresh() {
  if (installed) return false;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return false;
  }

  document.addEventListener(ENTRIES_CHANGED_EVENT, () => {
    void refreshVaultViews().catch((error) => {
      console.warn('[Vault] Rafraichissement partiel :', error?.name || 'erreur');
    });
  });

  installed = true;
  return true;
}

export default { refreshVaultViews, installVaultViewRefresh };
