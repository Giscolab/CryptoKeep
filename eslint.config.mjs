import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
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
  }
];
