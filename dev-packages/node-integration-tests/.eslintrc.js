module.exports = {
  env: {
    node: true,
    jest: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['utils/**/*.ts', 'src/**/*.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
        sourceType: 'module',
      },
    },
    {
      files: ['suites/**/*.ts'],
      parserOptions: {
        project: ['tsconfig.test.json'],
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/typedef': 'off',
        // Explicitly allow ts-ignore with description for Node integration tests
        // Reason: We run these tests on TS3.8 which doesn't support `@ts-expect-error`
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-ignore': 'allow-with-description',
            'ts-expect-error': true,
          },
        ],
      },
    },
  ],
};
