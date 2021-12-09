module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@sentry-internal/sdk/no-async-await': 'off',
  },
};
