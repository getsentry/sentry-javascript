module.exports = {
  env: {
    node: true,
    jest: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      // point all files at the testing TS config, since this entire package is tests
      files: ['**/*.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
        sourceType: 'module',
      },
    },
  ],
};
