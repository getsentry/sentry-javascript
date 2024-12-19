module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['scripts/**/*.ts'],
      parserOptions: {
        project: ['../../tsconfig.dev.json'],
      },
    },
    {
      files: ['test/**'],
      parserOptions: {
        sourceType: 'module',
      },
    },
  ],
};
