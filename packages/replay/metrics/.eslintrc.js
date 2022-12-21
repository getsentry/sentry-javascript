module.exports = {
  extends: ['../.eslintrc.js'],
  overrides: [
    {
      files: ['*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
