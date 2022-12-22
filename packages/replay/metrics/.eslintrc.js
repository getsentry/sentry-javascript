module.exports = {
  extends: ['../.eslintrc.js'],
  overrides: [
    {
      files: ['*.ts'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
};
