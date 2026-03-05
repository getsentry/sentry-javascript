module.exports = {
  env: {
    browser: true,
    node: true,
  },
  overrides: [
    {
      files: ['vite.config.ts', 'vitest.config.ts'],
      parserOptions: {
        project: ['tsconfig.vite.json'],
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
};
