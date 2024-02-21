module.exports = {
  env: {
    browser: true,
  },
  overrides: [
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-unsupported-es6-methods': 'off',
  },
};
