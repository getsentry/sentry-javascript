module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['**/*.ts'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
      },
    },
  ],
};
