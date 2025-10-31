module.exports = {
  env: {
    node: true,
  },
  // todo: remove regexp plugin from here once we add it to base.js eslint config for the whole project
  extends: ['../../.eslintrc.js', 'plugin:regexp/recommended'],
  plugins: ['regexp'],
  ignorePatterns: ['test-applications/**', 'tmp/**'],
  parserOptions: {
    sourceType: 'module',
  },
};
