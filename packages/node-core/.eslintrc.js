module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
    '@sentry-internal/sdk/no-unsafe-random-apis': 'error',
  },
  overrides: [
    {
      files: ['test/**/*.ts', 'test/**/*.tsx'],
      rules: {
        '@sentry-internal/sdk/no-unsafe-random-apis': 'off',
      },
    },
  ],
};
