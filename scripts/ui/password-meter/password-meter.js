export function estimatePasswordEntropyBits(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 0;
  }

  let alphabetSize = 0;
  if (/[a-z]/.test(password)) alphabetSize += 26;
  if (/[A-Z]/.test(password)) alphabetSize += 26;
  if (/[0-9]/.test(password)) alphabetSize += 10;
  if (/[^A-Za-z0-9]/.test(password)) alphabetSize += 33;

  return Math.floor(password.length * Math.log2(Math.max(alphabetSize, 1)));
}

/**
 * Returns a UI strength score from 0 to 4. It is an estimate, not a password audit.
 */
export function evaluatePasswordStrength(password) {
  const entropyBits = estimatePasswordEntropyBits(password);

  if (entropyBits < 30) return 0;
  if (entropyBits < 45) return 1;
  if (entropyBits < 60) return 2;
  if (entropyBits < 80) return 3;
  return 4;
}

/**
 * Palette des niveaux de force, du plus faible au plus fort.
 *
 * Elle n'est volontairement PAS appliquee en style inline : la CSP du
 * projet interdit `unsafe-inline`, un attribut `style` serait bloque par
 * le navigateur. La couleur effective est pilotee par le CSS via
 * `meter.dataset.strength`. Cette constante est conservee et exportee
 * comme source unique de la palette. Valeurs inchangees.
 */
export const STRENGTH_COLORS = ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c', '#2e7d32'];

/**
 * Affiche la force du mot de passe sur l’élément HTML avec l’ID `password-strength-meter`.
 */
export function renderStrengthMeter(strength) {
  const meter = document.getElementById('password-strength-meter');
  const labels = ['Tres faible', 'Faible', 'Moyen', 'Bon', 'Fort'];

  if (meter) {
    meter.textContent = labels[strength] || '';
    meter.dataset.strength = String(strength);
  }
}
