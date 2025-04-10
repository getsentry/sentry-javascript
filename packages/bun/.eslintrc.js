module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
