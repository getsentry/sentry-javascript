module.exports = {
  env: {
    node: true,
  },
  ignorePatterns: ['src/integrations/anr/worker-script.ts'],
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-optional-chaining': 'off',
    '@sentry-internal/sdk/no-nullish-coalescing': 'off',
    '@sentry-internal/sdk/no-unsupported-es6-methods': 'off',
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
