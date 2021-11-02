module.exports = {
  root: true,
  env: {
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: [
    'coverage/**',
    'build/**',
    'dist/**',
    'esm/**',
    'examples/**',
    'scripts/**',
    'test/manual/**',
  ],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    {
      files: ['*.tsx'],
      rules: {
        // Turn off jsdoc on tsx files until jsdoc is fixed for tsx files
        'jsdoc/require-jsdoc': 'off',
      },
    },
  ],
};
