module.exports = {
  extends: ['plugin:import/errors', 'plugin:import/warnings'],
  plugins: ['simple-import-sort'],
  overrides: [
    {
      // Configuration for typescript files
      files: ['*.ts', '*.tsx', '*.d.ts'],
      extends: ['plugin:import/typescript'],
      plugins: ['@typescript-eslint', 'jsdoc'],
      parser: '@typescript-eslint/parser',
      rules: {
        // sort imports
        'simple-import-sort/sort': 'error',
        'sort-imports': 'off',
        'import/order': 'off',
      },
    },
    {
      // Configuration for files under src
      files: ['src/**/*'],
      rules: {
        // All imports should be accounted for
        'import/no-extraneous-dependencies': 'error',
      },
    },
  ],

  rules: {
    // We shouldn't make assumptions about imports/exports being dereferenced.
    'import/namespace': 'off',

    // imports should be ordered.
    'import/order': ['error', { 'newlines-between': 'always' }],
  },
};
