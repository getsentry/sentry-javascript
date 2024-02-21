// Note: All paths are relative to the directory in which eslint is being run, rather than the directory where this file
// lives

// ESLint config docs: https://eslint.org/docs/user-guide/configuring/

module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: {
        // We cannot use backticks, as that conflicts with the stringified worker
        'prefer-template': 'off',
      },
    },
  ],
};
