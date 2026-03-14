/**
 * Utilitaires de calcul d'âge des mots de passe.
 */

const DAYS_MS = 24 * 60 * 60 * 1000;

function toMs(value) {
  if (!value) return NaN;
  if (typeof value === 'number') return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? NaN : ms;
}

export function getPasswordAgeDays(entry) {
  if (!entry) return 0;
  const refDate = entry.last_modified || entry.created_at;
  const refMs = toMs(refDate);
  if (Number.isNaN(refMs)) return 0;

  const diff = Date.now() - refMs;
  if (diff <= 0) return 0;
  return Math.floor(diff / DAYS_MS);
}

export function isPasswordOld(entry, thresholdDays = 365) {
  return getPasswordAgeDays(entry) > thresholdDays;
}

export function categorizePasswordAge(entry) {
  const days = getPasswordAgeDays(entry);

  if (days < 180) {
    return { days, category: 'recent', label: 'Récent', severity: 'low' };
  }

  if (days < 365) {
    return {
      days,
      category: 'moderate',
      label: `${Math.max(1, Math.floor(days / 30))} mois`,
      severity: 'medium'
    };
  }

  if (days < 730) {
    return { days, category: 'old', label: '1 an', severity: 'high' };
  }

  return {
    days,
    category: 'critical',
    label: `${Math.max(2, Math.floor(days / 365))} ans`,
    severity: 'critical'
  };
}
