module.exports = {
  env: {
    browser: true,
    node: true,
  },
  overrides: [
    {
      files: ['vite.config.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
};
