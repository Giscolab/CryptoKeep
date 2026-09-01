import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';

// Lot 1 : la configuration existante rendait `npm run lint` inexploitable.
// Trois corrections additives, aucune regle de securite affaiblie :
//  1. les bundles tiers minifies ne sont plus analyses (ils ne sont pas
//     modifiables et generaient l essentiel des erreurs) ;
//  2. ecmaVersion passe a 2022 : le `await` de haut niveau est deja utilise
//     par des tests existants (crypto.spec.js, vault-format.spec.js...) ;
//  3. les tests Node obtiennent les globales Node (process, queueMicrotask).
export default [
  {
    ignores: [
      'node_modules/**',
      'scripts/vendor/**',
      'docs/assets/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      security: security
    },
    rules: {
      ...js.configs.recommended.rules,
      ...security.configs.recommended.rules
    }
  },
  {
    // Contextes Node : specs et outils en ligne de commande.
    // audit-runner.js est un script CLI (fs, path, process), pas du code
    // navigateur : il lui faut les globales Node, pas une regle desactivee.
    files: [
      'tests/**/*.js',
      'scripts/tools/audit-runner.js',
      '*.config.mjs',
      'purgecss.config.cjs'
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    // Scripts classiques charges par <script src> sans type="module".
    // scripts/tools/audit-crypto.js expose window.AuditCrypto ; le panneau
    // le consomme comme globale. On declare l environnement reel plutot que
    // de neutraliser no-undef.
    files: ['scripts/ui/audit-panel.js'],
    languageOptions: {
      globals: {
        AuditCrypto: 'readonly'
      }
    }
  },
  {
    // Chart.js est charge en script classique depuis scripts/vendor/ et
    // expose la globale Chart. Aucune dependance CDN n est introduite.
    files: ['scripts/ui/security-chart.js'],
    languageOptions: {
      globals: {
        Chart: 'readonly'
      }
    }
  }
];
