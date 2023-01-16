module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-async-await': 'off',
    '@sentry-internal/sdk/no-optional-chaining': 'off',
  },
};
