module.exports = {
  env: {
    node: true,
    jest: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['utils/**/*.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
        sourceType: 'module',
      },
    },
    {
      files: ['suites/**/*.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/typedef': 'off',
      },
    },
  ],
};
