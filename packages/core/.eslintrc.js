module.exports = {
  root: true,
  env: {
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['build/**/*', 'dist/**/*', 'esm/**/*', 'examples/**/*', 'scripts/**/*'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.d.ts'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  ],
};
