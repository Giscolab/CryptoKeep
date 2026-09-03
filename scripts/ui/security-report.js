/**
 * MODULE HISTORIQUE - conserve, NON BRANCHE (Lot 6).
 *
 * Ce module ecrivait dans les memes cartes que le rapport actuel, a partir de
 * `getPasswordStats()`, dont la regle de faiblesse est la regle naive par
 * classes de caracteres remplacee au Lot 5. Il redessinait surtout le
 * graphique avec `getMonthlyStats()`, qui reconstitue une « evolution »
 * mois par mois a partir des seules dates de modification : un mois sans
 * modification y apparait avec un score de 0, ce qui ne decrit rien.
 * Le coffre ne conserve aucun historique de securite.
 *
 * Le moteur qui fait foi est scripts/security/audit-engine.js, affiche par
 * scripts/ui/audit-report-view.js. Ce fichier reste exporte et fonctionnel
 * pour ne casser aucun appelant externe. Ne pas le rebrancher.
 */

// scripts/ui/security-report.js
import { getMonthlyStats } from '../utils/vault-stats.js';
import { renderSecurityChart } from './security-chart.js'; // tu l'as déjà dans init
import { vaultManager } from '../core/vault/manager.js';

export async function renderSecurityReport() {
  // Récupère les stats du vault (affichera 0 si vault pas déchiffré)
  const stats = await vaultManager.getPasswordStats();

  // Met à jour les cartes du rapport
  const reportSection = document.getElementById('security-report-view');
  if (!reportSection) return; // sécurité

  // Score global
  const scoreCard = reportSection.querySelector('.score-security .score-value');
  if (scoreCard) scoreCard.innerText = (stats.score ?? 0) + '%';

  // Mots de passe faibles
  const weakCard = reportSection.querySelector('.score-weak .score-value');
  if (weakCard) weakCard.innerText = stats.weak ?? 0;

  // Mots de passe réutilisés
  const reusedCard = reportSection.querySelector('.score-reused .score-value');
  if (reusedCard) reusedCard.innerText = stats.reused ?? 0;

  // Mots de passe anciens
  const oldCard = reportSection.querySelector('.score-old .score-value');
  if (oldCard) oldCard.innerText = stats.old ?? 0;

  // Génération des données réelles du vault pour le graphique
  const entries = vaultManager.getEntries();
  const monthlyStats = getMonthlyStats(entries);

  const labels = monthlyStats.map(stat => stat.label);
  const scores = monthlyStats.map(stat => stat.score);
  const weak = monthlyStats.map(stat => stat.weak);

  // Appelle le graphique avec les données calculées (plus de valeurs "fake")
  renderSecurityChart('securityChart', { labels, scores, weak });
}
