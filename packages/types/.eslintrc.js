/* eslint-env node */

module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    node: false,
    browser: false,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
