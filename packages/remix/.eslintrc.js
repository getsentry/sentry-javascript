module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  ignorePatterns: ['playwright.config.ts', 'vitest.config.ts', 'vitest.config.unit.ts', 'test/integration/**'],
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['scripts/**/*.ts'],
      parserOptions: {
        project: ['../../tsconfig.dev.json'],
      },
    },
  ],
};
