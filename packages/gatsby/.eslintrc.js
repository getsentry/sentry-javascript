module.exports = {
  root: true,
  env: {
    es6: true,
    browser: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['sentry-sdks'],
  ignorePatterns: ['build/**/*', 'dist/**/*', 'esm/**/*', 'examples/**/*', 'scripts/**/*'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  ],
};
