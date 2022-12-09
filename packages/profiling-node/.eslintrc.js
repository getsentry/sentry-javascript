module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['playground/**/*', 'benchmarks/**/*'],
  rules: {
    '@sentry-internal/sdk/no-async-await': 'off',
  },
  overrides: [
    {
      files: ['*.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
      },
    },
  ],
};
