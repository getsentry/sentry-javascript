module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    browser: true,
  },
  overrides: [
    {
      files: ['src/**'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
      },
    },
    {
      files: ['src/metrics/**'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
};
