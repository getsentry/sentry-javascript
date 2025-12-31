// Note: All paths are relative to the directory in which eslint is being run, rather than the directory where this file
// lives

// ESLint config docs: https://eslint.org/docs/user-guide/configuring/

module.exports = {
  root: true,
  env: {
    es2017: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: [
    'coverage/**',
    'build/**',
    'dist/**',
    'cjs/**',
    'esm/**',
    'examples/**',
    'test/manual/**',
    'types/**',
    'scripts/*.js',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
  },
  reportUnusedDisableDirectives: true,
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
      },
    },
    {
      files: ['test/**/*.ts', 'test/**/*.tsx'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['scripts/**/*.ts'],
      parserOptions: {
        project: ['tsconfig.dev.json'],
      },
    },
    {
      files: ['*.tsx'],
      rules: {
        // Turn off jsdoc on tsx files until jsdoc is fixed for tsx files
        // See: https://github.com/getsentry/sentry-javascript/issues/3871
        'jsdoc/require-jsdoc': 'off',
      },
    },
    {
      files: ['scenarios/**', 'dev-packages/rollup-utils/**', 'dev-packages/bundle-analyzer-scenarios/**'],
      parserOptions: {
        sourceType: 'module',
      },
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
    },
  ],
};
