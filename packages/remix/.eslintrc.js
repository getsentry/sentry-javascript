module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  overrides: [
    {
      files: ['scripts/**/*.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
  rules: {
    '@sentry-internal/sdk/no-async-await': 'off',
  },
};
