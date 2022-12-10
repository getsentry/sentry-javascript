module.exports = {
  env: {
    node: true,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['playground/**/*', 'benchmarks/**/*'],
  overrides: [
    {
      files: ['*.ts', '*.d.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
      },
    },
  ],
};
