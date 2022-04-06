module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  // ignoring the package-specific prepack script here b/c it is not
  // covered by a `tsconfig` which makes eslint throw an error
  ignorePatterns: ['scripts/prepack.ts'],
  extends: ['../../.eslintrc.js'],
};
