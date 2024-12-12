module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  // ignore these because they're not covered by a `tsconfig`, which makes eslint throw an error
  ignorePatterns: ['gatsby-node.d.ts'],
  overrides: [
    {
      files: ['scripts/**/*.ts'],
      parserOptions: {
        project: ['../../tsconfig.dev.json'],
      },
    },
  ],
  extends: ['../../.eslintrc.js'],
};
