module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['test-applications/**', 'tmp/**'],
  parserOptions: {
    sourceType: 'module',
  },
};
