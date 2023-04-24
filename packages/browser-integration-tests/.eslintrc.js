module.exports = {
  env: {
    browser: true,
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: [
    'suites/**/subject.js',
    'suites/**/dist/*',
    'loader-suites/**/dist/*',
    'loader-suites/**/subject.js',
    'scripts/**',
    'fixtures/**',
  ],
  parserOptions: {
    sourceType: 'module',
  },
};
