// Note: All paths are relative to the directory in which eslint is being run, rather than the directory where this file
// lives

module.exports = {
  root: true,
  env: {
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: ['coverage/**', 'build/**', 'dist/**', 'esm/**', 'examples/**', 'scripts/**', 'test/manual/**'],
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
      files: ["scenarios/**"],
      parserOptions: {
        sourceType: "module",
      },
      rules: {
        "no-console": "off",
      },
    },
  ],
};
