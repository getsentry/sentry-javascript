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
      files: ['src/vite/**', 'src/server/**', 'src/config/**'],
      rules: {
        '@sentry-internal/sdk/no-optional-chaining': 'off',
        '@sentry-internal/sdk/no-nullish-coalescing': 'off',
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
};
