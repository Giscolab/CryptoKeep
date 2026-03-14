/**
 * Évalue la force d’un mot de passe selon des critères simples.
 * Renvoie un score entre 0 et 4.
 */
export function evaluatePasswordStrength(password) {
  let score = 0;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  return Math.min(score, 4);
}

/**
 * Affiche la force du mot de passe sur l’élément HTML avec l’ID `password-strength-meter`.
 */
export function renderStrengthMeter(strength) {
  const meter = document.getElementById('password-strength-meter');
  const labels = ['Faible', 'Moyen', 'Bon', 'Fort'];
  const colors = ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c'];

  if (meter) {
    meter.textContent = labels[strength - 1] || '';
    meter.style.color = colors[strength - 1] || '';
  }
}
