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
    'cjs/**',
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
    }
  ],
};
