module.exports = {
  env: {
    browser: true,
    node: true,
  },
  // todo: remove regexp plugin from here once we add it to base.js eslint config for the whole project
  extends: ['../.eslintrc.js', 'plugin:regexp/recommended'],
  plugins: ['regexp'],
  ignorePatterns: [
    'suites/**/subject.js',
    'suites/**/dist/*',
    'loader-suites/**/dist/*',
    'loader-suites/**/subject.js',
    'scripts/**',
    'fixtures/**',
    'tmp/**',
  ],
  overrides: [
    {
      files: ['loader-suites/**/{subject,init}.js'],
      globals: {
        Sentry: true,
      },
    },
  ],
  parserOptions: {
    sourceType: 'module',
  },
};
