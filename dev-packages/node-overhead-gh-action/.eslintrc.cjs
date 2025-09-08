module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['**/*.mjs'],
      parserOptions: {
        project: ['tsconfig.json'],
        sourceType: 'module',
      },
    },
  ],
};
