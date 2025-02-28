module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],

  ignorePatterns: ['lib/**/*', 'examples/**/*', 'vitest.config.ts'],
  rules: {
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
