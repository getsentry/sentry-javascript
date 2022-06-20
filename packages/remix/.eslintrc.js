module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-async-await': 'off',
  },
};
