module.exports = {
  env: {
    browser: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
      },
    },
  ]
};
