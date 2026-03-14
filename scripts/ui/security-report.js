// scripts/ui/security-report.js
import { getMonthlyStats } from '../utils/vault-stats.js';
import { renderSecurityChart } from './security-chart.js'; // tu l'as déjà dans init

export async function renderSecurityReport() {
  const vaultManager = window.vaultManager; // Utilisation sûre, pas d'import circulaire
  if (!vaultManager) return; // Sécurité

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
