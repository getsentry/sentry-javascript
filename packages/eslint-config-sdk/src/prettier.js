module.exports = {
  extends: ['prettier'],
  overrides: [
    {
      // Configuration for typescript files
      files: ['*.ts', '*.tsx', '*.d.ts'],
      extends: ['prettier/@typescript-eslint'],
      parser: '@typescript-eslint/parser',
    },
  ],
};
