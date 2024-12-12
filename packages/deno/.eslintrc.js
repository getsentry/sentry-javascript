module.exports = {
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['lib.deno.d.ts', 'scripts/*.mjs', 'build-types/**', 'build-test/**', 'build/**'],
  rules: {
    '@sentry-internal/sdk/no-optional-chaining': 'off',
    '@sentry-internal/sdk/no-nullish-coalescing': 'off',
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
