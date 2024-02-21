module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['src/**'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
      },
    },
  ],
};
