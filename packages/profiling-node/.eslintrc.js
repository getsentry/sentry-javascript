module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['playground/**/*', 'benchmarks/**/*'],
  rules: {
    '@sentry-internal/sdk/no-async-await': 'off',
  },
};
