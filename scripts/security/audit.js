/**
 * Analyse les entrées déchiffrées du vault et identifie les faiblesses.
 * @param {Array<Object>} entries - Entrées en clair : { id, title, username, password }
 * @returns {Object} - Statistiques : total, weak, reused, liste des doublons
 */
export function auditVault(entries) {
  const stats = {
    total: entries.length,
    reused: 0,
    weak: 0,
    duplicates: []
  };

  const passwordMap = new Map();

  // Liste simple de mots de passe trop courants
  const commonPasswords = ['123456', 'password', 'azerty123', 'admin', 'qwerty'];

  for (const entry of entries) {
    const pwd = entry.password;
    const lowerPwd = pwd.toLowerCase();

    // Critères de mot de passe faible
    const isTooShort = pwd.length < 10;
    const lacksUpper = !/[A-Z]/.test(pwd);
    const lacksDigit = !/[0-9]/.test(pwd);
    const isCommon = commonPasswords.includes(lowerPwd);
    const resemblesUsername = entry.username && lowerPwd.includes(entry.username.toLowerCase());
    const isWeak = isTooShort || lacksUpper || lacksDigit || isCommon || resemblesUsername;

    if (isWeak) stats.weak++;

    // Recherche de duplication
    if (passwordMap.has(pwd)) {
      stats.reused++;
      stats.duplicates.push({
        id: entry.id,
        title: entry.title,
        duplicateWith: passwordMap.get(pwd)
      });
    } else {
      passwordMap.set(pwd, entry.title);
    }
  }

  // Calcul score
  let score = 0;
  if (stats.total > 0) {
    score = Math.round(
      100 * (stats.total - stats.weak - stats.reused) / stats.total
    );
    if (score < 0) score = 0;
  }

  let level = "Low Security";
  if (score >= 80) level = "High Security";
  else if (score >= 50) level = "Moderate Security";

  return { ...stats, score, level };
}

/**
 * Calcule l'entropie d'un mot de passe
 * @param {string} pwd
 * @returns {number} - Entropie en bits
 */
export function getPasswordEntropy(pwd) {
  let charsetSize = 0;
  if (/[a-z]/.test(pwd)) charsetSize += 26;
  if (/[A-Z]/.test(pwd)) charsetSize += 26;
  if (/[0-9]/.test(pwd)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(pwd)) charsetSize += 32; // caractères spéciaux

  return Math.round(Math.log2(charsetSize) * pwd.length);
}

/**
 * Calcule un niveau de force de 0 à 4 selon l'entropie
 * @param {number} entropy
 * @returns {number}
 */
function getStrengthLevel(entropy) {
  if (entropy >= 80) return 4;
  if (entropy >= 60) return 3;
  if (entropy >= 40) return 2;
  if (entropy >= 20) return 1;
  return 0;
}

/**
 * Met à jour la barre d'entropie sous un mot de passe
 * @param {string} password
 * @param {HTMLElement} container - l'élément .vault-item
 */
export function updatePasswordEntropyBar(password, container) {
  const entropy = getPasswordEntropy(password);
  const level = getStrengthLevel(entropy);

  // Vérifie si le DOM contient déjà la barre
  let barContainer = container.querySelector('.entropy-bar-container');
  if (!barContainer) {
    barContainer = document.createElement('div');
    barContainer.className = 'entropy-bar-container';
    barContainer.innerHTML = `
      <div class="entropy-bar">
        <div class="entropy-fill"></div>
      </div>
      <div class="entropy-label">Entropie : <span class="entropy-value">0 bits</span></div>
    `;
    container.querySelector('.account-details')?.appendChild(barContainer);
  }

  const fill = barContainer.querySelector('.entropy-fill');
  const label = barContainer.querySelector('.entropy-value');

  const percent = Math.min(entropy, 100);
  fill.style.width = `${percent}%`;

  // Couleurs dynamiques selon niveau
  if (entropy < 40) fill.style.backgroundColor = '#ff4d4f';
  else if (entropy < 60) fill.style.backgroundColor = '#ff9800';
  else if (entropy < 80) fill.style.backgroundColor = '#ffc107';
  else fill.style.backgroundColor = '#4caf50';

  label.textContent = `${entropy} bits`;
}
