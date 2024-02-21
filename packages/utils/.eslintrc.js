module.exports = {
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
  // symlinks to the folders inside of `build`, created to simulate what's in the npm package
  ignorePatterns: ['cjs/**', 'esm/**'],
};
