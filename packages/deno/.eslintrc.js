module.exports = {
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['lib.deno.d.ts', 'scripts/*.mjs', 'build-types/**', 'build-test/**', 'build/**'],
  rules: {
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
