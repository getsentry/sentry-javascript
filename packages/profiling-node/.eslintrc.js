module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],

  ignorePatterns: ['lib/**/*', 'examples/**/*', 'jest.co'],
  rules: {
    '@sentry-internal/sdk/no-optional-chaining': 'off',
    '@sentry-internal/sdk/no-nullish-coalescing': 'off',
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
