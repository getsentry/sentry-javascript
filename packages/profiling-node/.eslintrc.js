module.exports = {
  env: {
    node: true
  },
  extends: ['../node/.eslintrc.js'],
  ignorePatterns: ['playground/**/*', 'benchmarks/**/*'],
  rules: {
    '@sentry-internal/sdk/no-async-await': 'off'
  }
};
