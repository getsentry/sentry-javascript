module.exports = {
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['lib.deno.d.ts'],
  rules: {
    '@sentry-internal/sdk/no-optional-chaining': 'off',
    '@sentry-internal/sdk/no-nullish-coalescing': 'off',
    '@sentry-internal/sdk/no-unsupported-es6-methods': 'off',
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
