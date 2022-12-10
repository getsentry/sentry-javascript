module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['playground/**/*', 'benchmarks/**/*'],
  parserOptions: {
    project: ['tsconfig.json'],
  },
};
