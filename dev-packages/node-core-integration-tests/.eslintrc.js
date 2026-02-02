module.exports = {
  env: {
    node: true,
  },
  // todo: remove regexp plugin from here once we add it to base.js eslint config for the whole project
  extends: ['../.eslintrc.js', 'plugin:regexp/recommended'],
  plugins: ['regexp'],
  overrides: [
    {
      files: ['utils/**/*.ts', 'src/**/*.ts'],
      parserOptions: {
        project: ['tsconfig.json'],
        sourceType: 'module',
      },
    },
    {
      files: ['suites/**/*.ts', 'suites/**/*.mjs'],
      parserOptions: {
        project: ['tsconfig.test.json'],
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        fetch: 'readonly',
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
        // We rely on having imports after init() is called for OTEL
        'import/first': 'off',
      },
    },
  ],
};
