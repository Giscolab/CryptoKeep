module.exports = {
  content: [
    './index.html',
    './scripts/**/*.js'
  ],
  css: [
    './public/**/*.css'
  ],
  output: './public/purged/',
  safelist: [
    // Toasts dynamiques
    /^toast$/,
    /^toast--(success|error|warning|info)$/,

    // Vault entries
    /^vault-list$/,
    /^vault-list--grid$/,
    /^vault-list__scroll$/,
    /^vault-list__item$/,
    /^vault-list__title$/,
    /^vault-list__username$/,
    /^vault-list__password$/,
    /^vault-list__actions$/,
    /^vault-item__field$/,
    /^vault-item__label$/,
    /^vault-item--readonly$/,

    // Boutons
    /^btn$/,
    /^btn--(primary|danger|outline|inline)$/,

    // Formulaires dynamiques
    /^input$/,
    /^textarea$/,
    /^input--(inline|readonly|error|small)$/,
    /^password-toggle__.*$/,

    // Stats et sécurité
    /^stats-value--(warning|error)$/,
    /^score-box$/,
    /^security-score$/,
    /^security-chart$/,

    // Modals
    /^modal$/,
    /^modal--active$/,

    // Divers utilitaires ou éléments spécifiques
    /^section--transparent$/,
    /^count-badge$/,
    /^vault-header$/,
    /^vault-actions$/,
    /^vault-item$/,
    /^vault-item button$/,
    /^vault-item button\..*$/,
    /^vulnerability-section$/,
    /^vulnerability-item$/,
    /^vuln-(info|icon|details|actions|severity)$/,
    /^severity-(critical|high|medium)$/
  ],
  rejected: true // Active l'affichage des classes supprimées
};
