// scripts/utils/vault-stats.js

/**
 * Génère les stats mensuelles (scores et faibles) pour les N derniers mois
 * @param {Array<Object>} entries - Entrées du vault [{id, password, created_at, last_modified, ...}]
 * @param {number} monthsCount - Nombre de mois à analyser (par défaut 12)
 * @returns {Array<Object>} - [{label: "Jan", score: 80, weak: 3}, ...]
 */
export function getMonthlyStats(entries, monthsCount = 12) {
  const now = new Date();
  const stats = [];

  for (let i = monthsCount - 1; i >= 0; i--) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);

    // Filtrer toutes les entrées modifiées/créées CE mois
    const filtered = entries.filter(e => {
      // Si jamais tu n'as pas de date sur une entrée, tu l'ignores (fallback possible)
      const dateStr = e.last_modified || e.created_at;
      if (!dateStr) return false;
      const entryDate = new Date(dateStr);
      return entryDate.getFullYear() === month.getFullYear() && entryDate.getMonth() === month.getMonth();
    });

    // Stats pour ce mois
    const total = filtered.length;
    let weak = 0, reused = 0;
    const seen = new Set();
    for (const e of filtered) {
      if (e.password.length < 10 || !/[A-Z]/.test(e.password) || !/[0-9]/.test(e.password)) weak++;
      if (seen.has(e.password)) reused++;
      else seen.add(e.password);
    }
    let score = total ? Math.round(100 * (total - weak - reused) / total) : 0;
    stats.push({
      label: month.toLocaleString('default', { month: 'short' }), // "Jan", "Feb", etc.
      score,
      weak
    });
  }
  return stats;
}
