module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
  },

  overrides: [
    {
      files: ['*.mjs'],
      extends: ['@sentry-internal/sdk/src/base'],
    },
  ],
};
