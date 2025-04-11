module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],

  ignorePatterns: ['build/**/*', 'examples/**/*', 'vitest.config.ts'],
  rules: {
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
