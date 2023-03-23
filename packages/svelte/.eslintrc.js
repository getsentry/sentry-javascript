module.exports = {
  env: {
    browser: true,
  },
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-unsupported-es6-methods': 'off',
  },
};
