module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['src/**/*.mjs', 'lib/**/*.mjs'],
      parserOptions: {
        project: ['tsconfig.json'],
        sourceType: 'module',
      },
    },
  ],
};
