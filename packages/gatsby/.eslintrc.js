module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  ignorePatterns: ['scripts/prepack.ts'],
  extends: ['../../.eslintrc.js'],
};
