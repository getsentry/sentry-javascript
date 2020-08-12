module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['@sentry-internal/sdk'],
  ignorePatterns: ['build/**', 'dist/**', 'esm/**', 'examples/**', 'scripts/**', 'test/manual/**'],
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
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
    {
      files: ['test/**/*.js'],
      rules: {
        'import/order': 'off',
      },
    },
  ],
  rules: {
    'prefer-rest-params': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@sentry-internal/sdk/no-async-await': 'off',
  },
};
