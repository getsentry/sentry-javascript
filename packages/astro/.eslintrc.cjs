module.exports = {
  env: {
    browser: true,
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
    },
    {
      files: ['src/integration/**', 'src/server/**'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
        '@sentry-internal/sdk/no-nullish-coalescing': 'off',
      },
    },
  ],
};
