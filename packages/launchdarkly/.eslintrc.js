// Note: All paths are relative to the directory in which eslint is being run, rather than the directory where this file
// lives

// ESLint config docs: https://eslint.org/docs/user-guide/configuring/

module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['src/**/*.ts'],
    },
    {
      files: ['test.setup.ts', 'vitest.config.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['test/**/*.ts'],

      rules: {},
    },
    {
      files: ['src/types/deprecated.ts'],
      rules: {
        '@typescript-eslint/naming-convention': 'off',
      },
    },
  ],
};
