module.exports = {
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['rollup.npm.config.mjs'],
  rules: {
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
