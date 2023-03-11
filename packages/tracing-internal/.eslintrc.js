module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['src/node/**'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
      },
    },
  ],
};
