module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['src/integrations/node/**'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
      },
    },
  ],
};
