module.exports = {
  // todo: remove regexp plugin from here once we add it to base.js eslint config for the whole project
  extends: ['../.eslintrc.js', 'plugin:regexp/recommended'],
  plugins: ['regexp'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
  },

  overrides: [
    {
      files: ['*.mjs'],
      extends: ['@sentry-internal/sdk'],
    },
  ],
};
