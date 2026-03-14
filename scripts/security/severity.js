/**
 * Système de classification par sévérité pour le Security Dashboard.
 */

export const SEVERITY = {
  CRITICAL: { level: 3, label: 'Critique', class: 'severity-critical', color: '#ff4d4f' },
  HIGH: { level: 2, label: 'Élevée', class: 'severity-high', color: '#ff9800' },
  MEDIUM: { level: 1, label: 'Moyenne', class: 'severity-medium', color: '#ffc107' },
  LOW: { level: 0, label: 'Faible', class: 'severity-low', color: '#52c41a' }
};

const FINDING_RULES = {
  pwned: { severity: SEVERITY.CRITICAL, weight: 100, description: 'Mot de passe compromis dans une fuite de données' },
  old_2years: { severity: SEVERITY.CRITICAL, weight: 90, description: 'Inchangé depuis plus de 2 ans' },
  old_1year: { severity: SEVERITY.HIGH, weight: 70, description: 'Inchangé depuis plus de 1 an' },
  weak_critical: { severity: SEVERITY.HIGH, weight: 60, description: 'Mot de passe très faible (< 40 bits)' },
  weak: { severity: SEVERITY.MEDIUM, weight: 40, description: 'Mot de passe faible' },
  reused: { severity: SEVERITY.HIGH, weight: 80, description: 'Réutilisé sur plusieurs comptes' },
  similar: { severity: SEVERITY.MEDIUM, weight: 30, description: 'Variante prévisible d’un mot de passe existant' }
};

function getRecommendation(type) {
  const recs = {
    pwned: 'Changez immédiatement ce mot de passe et activez la 2FA.',
    old_2years: 'Renouvelez ce mot de passe, il est trop ancien.',
    old_1year: 'Prévoyez de changer ce mot de passe prochainement.',
    weak_critical: 'Remplacez-le par un mot de passe généré aléatoirement (16+ caractères).',
    weak: 'Utilisez un mot de passe plus long et plus complexe.',
    reused: 'Utilisez un mot de passe unique pour ce service.',
    similar: 'Évitez les variations prévisibles entre services.'
  };

  return recs[type] || 'Révisez la sécurité de cette entrée.';
}

export function classifyFinding(type, details = {}) {
  const rule = FINDING_RULES[type] || {
    severity: SEVERITY.LOW,
    weight: 0,
    description: 'Anomalie détectée'
  };

  return {
    type,
    ...rule,
    details,
    recommendation: getRecommendation(type)
  };
}

export function getEntrySeverity(findings = []) {
  if (!findings.length) return SEVERITY.LOW;

  return findings.reduce((max, finding) => {
    const sev = finding.severity || SEVERITY.LOW;
    return sev.level > max.level ? sev : max;
  }, SEVERITY.LOW);
}

export function sortBySeverity(entriesWithFindings = []) {
  return [...entriesWithFindings].sort((a, b) => {
    const sevA = getEntrySeverity(a.findings).level;
    const sevB = getEntrySeverity(b.findings).level;
    return sevB - sevA;
  });
}
