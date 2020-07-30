module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: ['prettier', 'eslint:recommended'],
  plugins: ['sentry-sdk'],
  overrides: [
    {
      files: ['*.js'],
      rules: {
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
    {
      files: ['*.ts'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint'],
      plugins: ['@typescript-eslint'],
      parser: '@typescript-eslint/parser',
      rules: {
        'sentry-sdk/no-async-await': 'error',
        // Make sure variables marked with _ are ignored (ex. _varName)
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      },
    },
    {
      env: {
        jest: true,
      },
      files: ['*.test.ts'],
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
