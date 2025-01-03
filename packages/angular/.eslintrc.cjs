module.exports = {
  env: {
    browser: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['setup-test.ts', 'patch-vitest.ts'],
  rules: {
    // Angular transpiles this correctly/relies on this
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
