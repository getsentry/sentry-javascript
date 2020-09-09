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
  ignorePatterns: ['dist/**', 'esm/**'],
  overrides: [
    {
      files: ['*.ts', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    '@sentry-internal/sdk/no-async-await': 'off',
  },
};
