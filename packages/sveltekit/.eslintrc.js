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
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['scripts/**/*', 'src/vite/templates/**/*'],
};
