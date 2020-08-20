module.exports = {
  root: true,
  env: {
    es6: true,
    browser: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: ['build/**', 'dist/**', 'esm/**', 'examples/**', 'scripts/**', 'coverage/**', 'src/loader.js'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    {
      files: ['test/**'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
        'no-console': 'off',
        'max-lines': 'off',
        'prefer-template': 'off',
        'no-unused-expressions': 'off',
        'guard-for-in': 'off',
      },
    },
    {
      files: ['test/integration/**'],
      env: {
        mocha: true,
      },
      rules: {
        'no-undef': 'off',
      },
    },
    {
      files: ['test/integration/common/**', 'test/integration/suites/**'],
      rules: {
        'no-unused-vars': 'off',
      },
    },
  ],
  rules: {
    'no-prototype-builtins': 'off',
  },
};
