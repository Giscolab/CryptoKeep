// /scripts/ui/security-chart.js

/**
 * Rendu dynamique d'un graphique "Password Health" via Chart.js
 * Nécessite que Chart.js soit déjà chargé en global (scripts/vendor/chart.min.js dans le HTML AVANT ce fichier !)
 *
 * @param {string} domId - L'ID du <canvas>
 * @param {Object} data  - { labels: [], scores: [], weak: [] }
 */
export function renderSecurityChart(domId, { labels, scores, weak }) {
  const ctx = document.getElementById(domId);
  if (!ctx || typeof Chart === "undefined") {
    console.warn('[security-chart] Chart.js non chargé ou canvas inexistant');
    return;
  }

  // Si déjà un graphique Chart attaché, détruit-le proprement
  if (ctx._chartInstance) {
    ctx._chartInstance.destroy();
  }

  ctx._chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Security Score',
          data: scores,
          borderColor: '#bb86fc',
          backgroundColor: 'rgba(187, 134, 252, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#bb86fc',
        },
        {
          label: 'Weak Passwords',
          data: weak,
          borderColor: '#ff9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#ff9800',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e0e0e0',
            font: { size: 14, family: 'inherit' }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      },
      interaction: {
        mode: 'nearest',
        intersect: false
      },
      scales: {
        y: {
          beginAtZero: false,
          min: 50,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#999', font: { family: 'inherit' } }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#999', font: { family: 'inherit' } }
        }
      }
    }
  });
}
