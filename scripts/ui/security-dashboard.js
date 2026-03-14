/**
 * Rendu dynamique du Security Dashboard.
 */

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getTargets(root) {
  const sections = root.querySelectorAll('#security-report-view .vulnerability-section');
  const vulnerabilities = sections[0]?.querySelector('.vulnerability-list') || null;
  const weakPasswords = sections[1]?.querySelector('.vulnerability-list') || null;
  const recommendations = root.querySelector('#security-report-view .recommendations .recommendation-list');

  return { vulnerabilities, weakPasswords, recommendations };
}

function renderVulnerabilities(container, items = []) {
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<p class="text-muted">Aucune vulnérabilité critique détectée.</p>';
    return;
  }

  container.innerHTML = items.map((item) => {
    const primary = [...item.findings].sort((a, b) => b.weight - a.weight)[0];
    return `
      <div class="vulnerability-item vuln-${item.severity.label.toLowerCase().replace('é', 'e')}">
        <div class="vuln-info">
          <div class="vuln-icon"><i class="fas fa-exclamation-triangle"></i></div>
          <div class="vuln-details">
            <strong>${escapeHtml(item.entry.title || 'Sans titre')}</strong>
            <span>${escapeHtml(primary.description)}</span>
          </div>
        </div>
        <div class="vuln-severity ${item.severity.class}">${item.severity.label}</div>
        <div class="vuln-actions"><button class="vuln-action-btn">Mettre à jour</button></div>
      </div>
    `;
  }).join('');
}

function renderWeakPasswords(container, items = []) {
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<p class="text-muted">Aucun mot de passe faible détecté.</p>';
    return;
  }

  container.innerHTML = items.map((item) => `
    <div class="vulnerability-item">
      <div class="vuln-info">
        <div class="vuln-icon vuln-high"><i class="fas fa-unlock"></i></div>
        <div class="vuln-details">
          <strong>${escapeHtml(item.entry.title || 'Sans titre')}</strong>
          <span>Entropie estimée: ${Math.round(item.entropy)} bits</span>
        </div>
      </div>
      <div class="vuln-actions"><button class="vuln-action-btn">Générer</button></div>
    </div>
  `).join('');
}

function renderReuseGroups(groups = []) {
  const existing = document.getElementById('reuse-groups-section');
  if (existing) existing.remove();

  const reportRoot = document.getElementById('security-report-view');
  const recommendations = reportRoot?.querySelector('.recommendations');
  if (!reportRoot || !recommendations) return;

  if (!groups.length) return;

  const section = document.createElement('section');
  section.className = 'vulnerability-section';
  section.id = 'reuse-groups-section';

  const list = groups.map((group) => `
    <div class="vulnerability-item vuln-${group.severity === 'critical' ? 'critical' : 'high'}">
      <div class="vuln-info">
        <div class="vuln-icon"><i class="fas fa-redo"></i></div>
        <div class="vuln-details">
          <strong>${group.entries.length} comptes identiques</strong>
          <span>${escapeHtml(group.description)}</span>
          <ul class="reuse-preview">
            ${group.entries.slice(0, 3).map((entry) => `<li>${escapeHtml(entry.title || 'Sans titre')}</li>`).join('')}
            ${group.entries.length > 3 ? `<li>...et ${group.entries.length - 3} autres</li>` : ''}
          </ul>
        </div>
      </div>
      <div class="vuln-severity severity-${group.severity}">${group.severity === 'critical' ? 'Critique' : 'Élevée'}</div>
      <div class="vuln-actions">
        <button class="vuln-action-btn resolve-reuse-btn" data-group-id="${group.hashId}">Corriger</button>
      </div>
    </div>
  `).join('');

  section.innerHTML = `
    <div class="section-header">
      <h3>Mots de passe réutilisés (${groups.length} groupes)</h3>
    </div>
    <div class="vulnerability-list">${list}</div>
  `;

  section.querySelectorAll('.resolve-reuse-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const groupId = button.dataset.groupId;
      const groupData = groups.find((group) => group.hashId === groupId);
      if (!groupData) return;

      document.dispatchEvent(new CustomEvent('vault:open-reuse-resolver', {
        detail: { groupId, groupData }
      }));
    });
  });

  recommendations.insertAdjacentElement('beforebegin', section);
}

function renderRecommendations(container, items = []) {
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<p class="text-muted">Aucune recommandation particulière.</p>';
    return;
  }

  container.innerHTML = items.map((rec) => `
    <div class="recommendation-item">
      <div class="recommendation-icon"><i class="fas fa-user-shield"></i></div>
      <div class="recommendation-content">
        <h4>${escapeHtml(rec.entry.title || 'Compte')}</h4>
        <p>${escapeHtml(rec.action)}</p>
      </div>
    </div>
  `).join('');
}

function updateHeaderCounters(root, summary) {
  const weakStat = root.querySelector('#stats-weak');
  const reusedStat = root.querySelector('#stats-reused');
  const oldStat = root.querySelector('#stats-old');

  if (weakStat) weakStat.textContent = String(summary.weak);
  if (reusedStat) reusedStat.textContent = String(summary.reused);
  if (oldStat) oldStat.textContent = String(summary.old);
}

export function renderSecurityDashboardSections(report, root = document) {
  const { vulnerabilities, weakPasswords, recommendations } = getTargets(root);

  renderVulnerabilities(vulnerabilities, report.vulnerabilities);
  renderWeakPasswords(weakPasswords, report.weakPasswords);
  renderReuseGroups(report.reuseGroups || []);
  renderRecommendations(recommendations, report.recommendations);
  updateHeaderCounters(root, report.summary);
}
