module.exports = {
  env: {
    browser: true,
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['suites/**/subject.js'],
  parserOptions: {
    sourceType: 'module',
  },
};
