module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  // ignore these because they're not covered by a `tsconfig`, which makes eslint throw an error
  ignorePatterns: ['gatsby-browser.d.ts', 'gatsby-node.d.ts'],
  extends: ['../../.eslintrc.js'],
};
