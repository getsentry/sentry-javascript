module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: ['prettier', 'eslint:recommended'],
  plugins: ['sentry-sdk'],
  overrides: [
    {
      files: ['*.ts'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint'],
      plugins: ['@typescript-eslint'],
      parser: '@typescript-eslint/parser',
      rules: {
        'sentry-sdk/no-async-await': 'error',
      },
    },
    {
      env: {
        jest: true,
      },
      files: ['*.test.ts'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint'],
      plugins: ['@typescript-eslint'],
      parser: '@typescript-eslint/parser',
    },
    {
      files: ['*.config.js'],
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2018,
      },
    },
  ],
  rules: {},
};
