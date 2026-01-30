'use strict';

module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      // Vendor scripts are injected as inline <script> tags and must use ES5 syntax
      // to ensure compatibility with older browsers that cannot transpile inline scripts.
      // Setting ecmaVersion: 5 ensures ESLint will error on ANY ES6+ syntax at parse time.
      files: ['vendor/**/*.js'],
      parserOptions: {
        sourceType: 'script',
        ecmaVersion: 5,
      },
      env: {
        browser: true,
        node: false,
      },
    },
    {
      // addon files
      files: ['{addon,app,tests}/**/*.{js,ts,d.ts}'],
      parserOptions: {
        sourceType: 'module',
        babelOptions: {
          plugins: [['@babel/plugin-proposal-decorators', { decoratorsBeforeExport: true }]],
        },
      },
      plugins: ['ember'],
      extends: ['plugin:ember/recommended'],
      rules: {
        'import/no-unresolved': 'off',
      },
    },
    {
      // test files
      files: ['tests/**/*-test.{js,ts}', 'tests/helpers/**/*.{js,ts}'],
      extends: ['plugin:qunit/recommended'],
      /*  globals: {
        QUnit: true,
      }, */
      rules: {
        'qunit/require-expect': 'off',
      },
    },
    {
      files: [
        './.eslintrc.js',
        './.template-lintrc.js',
        './ember-cli-build.js',
        './index.js',
        './testem.js',
        './blueprints/*/index.js',
        './config/**/*.js',
        './tests/dummy/config/**/*.js',
      ],
      parserOptions: {
        sourceType: 'script',
      },
      env: {
        browser: false,
        node: true,
      },
      extends: ['plugin:n/recommended'],
    },
  ],
};
