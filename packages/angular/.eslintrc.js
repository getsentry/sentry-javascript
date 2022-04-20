module.exports = {
  env: {
    browser: true,
  },
  // ignore these because they're not covered by a `tsconfig`, which makes eslint throw an error
  ignorePatterns: ['scripts/postbuild.ts'],
  extends: ['../../.eslintrc.js'],
};
