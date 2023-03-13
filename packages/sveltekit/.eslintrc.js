module.exports = {
  env: {
    browser: true,
    node: true,
  },
  overrides: [
    {
      files: ['*.ts'],
      rules: {
        // Turning this off because it's not working with @sveltejs/kit
        'import/no-unresolved': 'off',
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
};
