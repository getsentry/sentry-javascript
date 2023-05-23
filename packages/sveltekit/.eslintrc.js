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
    {
      files: ['./src/vite/**', './src/server/**'],
      '@sentry-internal/sdk/no-optional-chaining': 'off',
    },
  ],
  extends: ['../../.eslintrc.js'],
};
