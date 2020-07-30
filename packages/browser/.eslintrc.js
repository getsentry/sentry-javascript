module.exports = {
  root: true,
  env: {
    es6: true,
    browser: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['build/**/*', 'dist/**/*', 'esm/**/*', 'examples/**/*', 'scripts/**/*', 'src/loader.js'],
  overrides: [
    {
      files: ['test/**/*'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
        'no-console': 'off',
      },
    },
    {
      files: ['test/integration/**/*'],
      env: {
        mocha: true,
      },
      rules: {
        'no-undef': 'off',
      },
    },
    {
      files: ['test/integration/common/**/*', 'test/integration/suites/**/*'],
      rules: {
        'no-unused-vars': 'off',
      },
    },
  ],
  rules: {
    'no-prototype-builtins': 'off',
  },
};
