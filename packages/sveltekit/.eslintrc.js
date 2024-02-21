module.exports = {
  env: {
    browser: true,
    node: true,
  },
  overrides: [
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
    },
    {
      files: ['src/vite/**', 'src/server/**'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
};
