/**
 * Rendu dynamique du Security Dashboard.
 */

function toText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

function sanitizeClassPart(value) {
  return toText(value)
    .toLowerCase()
    .replace('é', 'e')
    .replace(/[^a-z0-9_-]/g, '');
}

function addControlledClasses(element, classNames) {
  toText(classNames)
    .split(/\s+/)
    .map(sanitizeClassPart)
    .filter(Boolean)
    .forEach(className => element.classList.add(className));
}

function createIcon(iconClass) {
  const icon = document.createElement('i');
  icon.className = `fas ${iconClass}`;
  return icon;
}

function createMutedMessage(text) {
  const message = document.createElement('p');
  message.className = 'text-muted';
  message.textContent = text;
  return message;
}

/**
 * Conteneurs appartenant au moteur d'audit du Lot 6. Ce module historique ne
 * doit JAMAIS ecrire dedans, meme s'il etait rebranche par erreur.
 */
const CONTENEURS_RESERVES = Object.freeze([
  'auditFindings', 'auditReuseGroups', 'auditScope'
]);

/**
 * Un noeud appartient-il au nouveau moteur ?
 *
 * La verification porte sur le noeud, ses ANCETRES et ses DESCENDANTS : une
 * `.vulnerability-section` qui contient `#auditScope` est aussi une section
 * du nouveau rapport, meme si elle ne porte pas l'identifiant elle-meme.
 */
function estReserve(noeud) {
  if (!noeud) return false;

  let courant = noeud;
  while (courant) {
    if (courant.id && CONTENEURS_RESERVES.includes(courant.id)) return true;
    courant = courant.parentNode || null;
  }

  if (typeof noeud.querySelector === 'function') {
    const selecteur = CONTENEURS_RESERVES.map((id) => `#${id}`).join(', ');
    if (noeud.querySelector(selecteur)) return true;
  }
  return false;
}

function getTargets(root) {
  // LOT 7B - GARDE STRUCTURELLE. Ce module selectionnait les DEUX PREMIERES
  // `.vulnerability-section` par position. Depuis le Lot 6, ce sont les
  // conteneurs du nouveau rapport : l'ancien moteur les ecrasait donc.
  // La selection par position est conservee — d'autres vues en dependent —
  // mais tout conteneur appartenant au nouveau moteur est ecarte.
  const sections = Array.from(
    root.querySelectorAll('#security-report-view .vulnerability-section')
  ).filter((section) => !estReserve(section));

  const vulnerabilities = sections[0]?.querySelector('.vulnerability-list') || null;
  const weakPasswords = sections[1]?.querySelector('.vulnerability-list') || null;
  const recommendations = root.querySelector('#security-report-view .recommendations .recommendation-list');

  return {
    vulnerabilities: estReserve(vulnerabilities) ? null : vulnerabilities,
    weakPasswords: estReserve(weakPasswords) ? null : weakPasswords,
    recommendations
  };
}

function createVulnerabilityItem({
  itemModifier = '',
  iconClass = 'fa-exclamation-triangle',
  iconModifier = '',
  title = '',
  detail = '',
  severityClass = '',
  severityLabel = '',
  actionLabel = ''
}) {
  const item = document.createElement('div');
  item.className = 'vulnerability-item';
  addControlledClasses(item, itemModifier);

  const info = document.createElement('div');
  info.className = 'vuln-info';

  const iconBox = document.createElement('div');
  iconBox.className = 'vuln-icon';
  addControlledClasses(iconBox, iconModifier);
  iconBox.appendChild(createIcon(iconClass));

  const details = document.createElement('div');
  details.className = 'vuln-details';

  const titleNode = document.createElement('strong');
  titleNode.textContent = title;

  const detailNode = document.createElement('span');
  detailNode.textContent = detail;

  details.append(titleNode, detailNode);
  info.append(iconBox, details);
  item.appendChild(info);

  if (severityLabel) {
    const severity = document.createElement('div');
    severity.className = 'vuln-severity';
    addControlledClasses(severity, severityClass);
    severity.textContent = severityLabel;
    item.appendChild(severity);
  }

  if (actionLabel) {
    const actions = document.createElement('div');
    actions.className = 'vuln-actions';

    const button = document.createElement('button');
    button.className = 'vuln-action-btn';
    button.textContent = actionLabel;

    actions.appendChild(button);
    item.appendChild(actions);
  }

  return item;
}

function renderVulnerabilities(container, items = []) {
  if (!container) return;
  container.replaceChildren();

  if (!items.length) {
    container.appendChild(createMutedMessage('Aucune vulnérabilité critique détectée.'));
    return;
  }

  for (const item of items) {
    const findings = Array.isArray(item.findings) ? item.findings : [];
    const primary = [...findings].sort((a, b) => b.weight - a.weight)[0];
    const severityLabel = toText(item.severity?.label);
    const severityKey = sanitizeClassPart(severityLabel);

    container.appendChild(createVulnerabilityItem({
      itemModifier: severityKey ? `vuln-${severityKey}` : '',
      title: toText(item.entry?.title, 'Sans titre') || 'Sans titre',
      detail: toText(primary?.description, 'Risque détecté.'),
      severityClass: item.severity?.class,
      severityLabel,
      actionLabel: 'Mettre à jour'
    }));
  }
}

function renderWeakPasswords(container, items = []) {
  if (!container) return;
  container.replaceChildren();

  if (!items.length) {
    container.appendChild(createMutedMessage('Aucun mot de passe faible détecté.'));
    return;
  }

  for (const item of items) {
    container.appendChild(createVulnerabilityItem({
      iconClass: 'fa-unlock',
      iconModifier: 'vuln-high',
      title: toText(item.entry?.title, 'Sans titre') || 'Sans titre',
      detail: `Entropie estimée: ${Math.round(Number(item.entropy) || 0)} bits`,
      actionLabel: 'Générer'
    }));
  }
}

function createReuseGroupItem(group) {
  const severity = group.severity === 'critical' ? 'critical' : 'high';
  const item = createVulnerabilityItem({
    itemModifier: `vuln-${severity}`,
    iconClass: 'fa-redo',
    title: `${group.entries.length} comptes identiques`,
    detail: toText(group.description),
    severityClass: `severity-${severity}`,
    severityLabel: severity === 'critical' ? 'Critique' : 'Élevée'
  });

  const details = item.querySelector('.vuln-details');
  const preview = document.createElement('ul');
  preview.className = 'reuse-preview';

  group.entries.slice(0, 3).forEach((entry) => {
    const row = document.createElement('li');
    row.textContent = toText(entry.title, 'Sans titre') || 'Sans titre';
    preview.appendChild(row);
  });

  if (group.entries.length > 3) {
    const remaining = document.createElement('li');
    remaining.textContent = `...et ${group.entries.length - 3} autres`;
    preview.appendChild(remaining);
  }

  details?.appendChild(preview);

  const actions = document.createElement('div');
  actions.className = 'vuln-actions';

  const button = document.createElement('button');
  button.className = 'vuln-action-btn resolve-reuse-btn';
  // Lot 5 : `groupId` est l'identifiant canonique ; `hashId` n'est conserve
  // que comme repli pour l'implementation historique.
  button.dataset.groupId = toText(group.groupId ?? group.hashId);
  button.textContent = 'Corriger';

  actions.appendChild(button);
  item.appendChild(actions);

  return item;
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

  const header = document.createElement('div');
  header.className = 'section-header';

  const heading = document.createElement('h3');
  heading.textContent = `Mots de passe réutilisés (${groups.length} groupes)`;
  header.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'vulnerability-list';

  for (const group of groups) {
    list.appendChild(createReuseGroupItem(group));
  }

  section.append(header, list);

  section.querySelectorAll('.resolve-reuse-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const groupId = button.dataset.groupId;
      const groupData = groups.find((group) => toText(group.groupId ?? group.hashId) === groupId);
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
  container.replaceChildren();

  if (!items.length) {
    container.appendChild(createMutedMessage('Aucune recommandation particulière.'));
    return;
  }

  for (const rec of items) {
    const item = document.createElement('div');
    item.className = 'recommendation-item';

    const icon = document.createElement('div');
    icon.className = 'recommendation-icon';
    icon.appendChild(createIcon('fa-user-shield'));

    const content = document.createElement('div');
    content.className = 'recommendation-content';

    const title = document.createElement('h4');
    title.textContent = toText(rec.entry?.title, 'Compte') || 'Compte';

    const action = document.createElement('p');
    action.textContent = toText(rec.action);

    content.append(title, action);
    item.append(icon, content);
    container.appendChild(item);
  }
}

function updateHeaderCounters(root, summary = {}) {
  const weakStat = root.querySelector('#stats-weak');
  const reusedStat = root.querySelector('#stats-reused');
  const oldStat = root.querySelector('#stats-old');

  if (weakStat) weakStat.textContent = String(summary.weak || 0);
  if (reusedStat) reusedStat.textContent = String(summary.reused || 0);
  if (oldStat) oldStat.textContent = String(summary.old || 0);
}

export function renderSecurityDashboardSections(report, root = document) {
  const { vulnerabilities, weakPasswords, recommendations } = getTargets(root);

  renderVulnerabilities(vulnerabilities, report.vulnerabilities);
  renderWeakPasswords(weakPasswords, report.weakPasswords);
  renderReuseGroups(report.reuseGroups || []);
  renderRecommendations(recommendations, report.recommendations);
  updateHeaderCounters(root, report.summary);
}
