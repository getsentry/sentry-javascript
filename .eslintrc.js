/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'simple-import-sort'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended', // Should be last
  ],

  settings: {},

  globals: {},
  rules: {
    // note you must disable the base rule as it can report incorrect errors
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { vars: 'all', varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
    ],

    '@typescript-eslint/no-explicit-any': 'off',

    // Make sure that all ts-ignore comments are given a description.
    '@typescript-eslint/ban-ts-comment': [
      'warn',
      {
        'ts-ignore': 'allow-with-description',
      },
    ],

    'simple-import-sort/imports': [
      'error',
      {
        groups: [
          // Side effect imports.
          ['^\\u0000'],

          // Node.js builtins.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          [`^(${require('module').builtinModules.join('|')})(/|$)`],

          // Packages.
          ['^@?\\w'],

          // Internal packages.
          ['^@$', '^(@/)(.*|$)'],

          // Parent imports. Put `..` last.
          ['^\\.\\.(?!/?$)', '^\\.\\./?$'],

          // Other relative imports. Put same-folder imports and `.` last.
          ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['*.spec.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': ['off'],
      },
    },
  ],
};
