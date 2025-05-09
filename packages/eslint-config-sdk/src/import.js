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
      rules: {},
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
    // This is done by TS anyhow
    'import/no-unresolved': 'off',
    // sort imports
    'sort-imports': 'off',
    'import/order': 'off',
    // Avoid newlines between import groups
    // See: https://github.com/lydell/eslint-plugin-simple-import-sort?tab=readme-ov-file#how-do-i-remove-all-blank-lines-between-imports
    'simple-import-sort/imports': ['error', { groups: [['^\\u0000', '^node:', '^@?\\w', '^', '^\\.']] }],
    'simple-import-sort/exports': 'off',
    'import/first': 'error',
    'import/newline-after-import': 'error',
  },
};
