// ESLint 9+ flat config. Migrated from .eslintrc.json so that
// `npm run lint` is runnable again — eslint 9 dropped the legacy
// .eslintrc.* lookup and lint had been silently broken.
//
// The behavior is intended to match the previous .eslintrc.json:
// recommended TS + JSDoc rules with prettier as the last layer.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores — replaces ignorePatterns from the legacy config.
  {
    ignores: ['dist/**', 'wasm/**', 'node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs'],
  },

  // Base ESLint recommended rules.
  js.configs.recommended,

  // TypeScript files.
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Lint-only project: the build tsconfig excludes test/, so typed
        // linting of test files needs a project that includes them.
        project: './tsconfig.eslint.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
        // The @types/node global namespace is referenced by Timer types
        // (NodeJS.Timeout) in worker-pool / pool-manager / parallel-executor.
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      jsdoc,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...jsdoc.configs.recommended.rules,

      // 'any' is a warning, not an error: the AST traversal in
      // tool-handlers, the mathjs Node interfaces, and the worker IPC
      // payload have legitimate dynamic shapes. Flag new introductions
      // without forcing a wholesale typed rewrite.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // require-jsdoc is intentionally off: the eslint --fix codemod
      // emits empty /** */ stubs which are worse than no docstring at
      // all. Keep the param/returns description rules so existing
      // JSDoc stays accurate, but don't force coverage.
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/check-tag-names': 'warn',
      'jsdoc/check-types': 'warn',
      'jsdoc/tag-lines': 'off',
      'jsdoc/no-defaults': 'off',

      'no-console': 'off',
    },
  },

  // Prettier — must be last so it disables conflicting style rules.
  prettierConfig,
];
