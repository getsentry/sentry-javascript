module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: ['prettier', 'eslint:recommended'],
  plugins: ['sentry-sdk', 'jsdoc'],
  ignorePatterns: ['eslint-plugin-sentry-sdk'],
  overrides: [
    {
      // Configuration for JavaScript files
      files: ['*.js'],
      rules: {
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
    {
      // Configuration for typescript files
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint'],
      plugins: ['@typescript-eslint'],
      parser: '@typescript-eslint/parser',
      rules: {
        // We want to prevent async await usage in our files to prevent uncessary bundle size.
        'sentry-sdk/no-async-await': 'error',

        // Make sure variables marked with _ are ignored (ex. _varName)
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

        // Make sure that all ts-ignore comments are given a description
        '@typescript-eslint/ban-ts-comment': [
          'warn',
          {
            'ts-ignore': 'allow-with-description',
          },
        ],

        // Types usage should be explicit as possible, so we prevent usage of inferrable types.
        // This is especially important because we have a public API, so usage needs to be as
        // easy to understand as possible
        '@typescript-eslint/no-inferrable-types': 'off',

        // Enforce type annotations to maintain consistency. This is especially important as
        // we have a public API, so we want changes to be very explicit.
        '@typescript-eslint/typedef': ['error', { arrowParameter: false }],
        '@typescript-eslint/explicit-function-return-type': 'error',

        // Consistent ordering of fields, methods and constructors for classes should be enforced
        '@typescript-eslint/member-ordering': 'error',

        // Private and protected members of a class should be prefixed with a leading underscore
        '@typescript-eslint/naming-convention': [
          'error',
          {
            selector: 'memberLike',
            modifiers: ['private'],
            format: ['camelCase'],
            leadingUnderscore: 'require',
          },
          {
            selector: 'memberLike',
            modifiers: ['protected'],
            format: ['camelCase'],
            leadingUnderscore: 'require',
          },
        ],

        // JSDOC comments are required for classes and methods
        'jsdoc/require-jsdoc': [
          'error',
          { require: { ClassDeclaration: true, MethodDefinition: true }, checkConstructors: false },
        ],
      },
    },
    {
      // Configuration for test files
      env: {
        jest: true,
      },
      files: ['*.test.ts', '*.test.tsx', '*.test.js', '*.test.jsx'],
      rules: {
        'sentry-sdk/no-async-await': 'off',
        'jsdoc/require-jsdoc': 'off',
      },
    },
    {
      // Configuration for config files like webpack/rollback
      files: ['*.config.js'],
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2018,
      },
    },
  ],

  rules: {
    // We want to prevent usage of unary operators outside of for loops
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],

    // disallow usage of console and alert
    'no-console': 'error',
    'no-alert': 'error',
  },
};
