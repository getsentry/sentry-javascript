module.exports = {
  root: true,
  env: {
    es6: true,
    browser: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['build/**/*', 'dist/**/*', 'esm/**/*', 'examples/**/*', 'scripts/**/*', 'src/loader.js'],
  overrides: [
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
      files: ['test/integration/common/**/*'],
      rules: {
        'no-unused-vars': 'off',
      },
    },
  ],
  rules: {
    'no-prototype-builtins': 'off',
  },
};
