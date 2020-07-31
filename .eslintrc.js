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
      files: ['*.ts', '*.tsx', '*.d.ts'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint'],
      plugins: ['@typescript-eslint'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
      },
      rules: {
        // We want to prevent async await usage in our files to prevent uncessary bundle size. Turned off in tests.
        'sentry-sdk/no-async-await': 'error',

        // Unused variables should be removed unless they are marked with and underscore (ex. _varName).
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

        // Make sure that all ts-ignore comments are given a description.
        '@typescript-eslint/ban-ts-comment': [
          'warn',
          {
            'ts-ignore': 'allow-with-description',
          },
        ],

        // Types usage should be explicit as possible, so we prevent usage of inferrable types.
        // This is especially important because we have a public API, so usage needs to be as
        // easy to understand as possible.
        '@typescript-eslint/no-inferrable-types': 'off',

        // Enforce type annotations to maintain consistency. This is especially important as
        // we have a public API, so we want changes to be very explicit.
        '@typescript-eslint/typedef': ['error', { arrowParameter: false }],
        '@typescript-eslint/explicit-function-return-type': 'error',

        // Consistent ordering of fields, methods and constructors for classes should be enforced
        '@typescript-eslint/member-ordering': 'error',

        // Enforce that unbound methods are called within an expected scope. As we frequently pass data between classes
        // in SDKs, we should make sure that we are correctly preserving class scope.
        '@typescript-eslint/unbound-method': 'error',

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

        // JSDOC comments are required for classes and methods. As we have a public facing codebase, documentation,
        // even if it may seems excessive at times, is important to emphasize. Turned off in tests.
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
        'max-lines': 'off',
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

    // Disallow usage of console and alert
    'no-console': 'error',
    'no-alert': 'error',

    // Prevent reassignment of function parameters, but still allow object properties to be
    // reassigned. We want to enforce immutability when possible, but we shouldn't sacrifice
    // too much efficiency
    'no-param-reassign': ['error', { props: false }],

    // Prefer use of template expression over string literal concatenation
    'prefer-template': 'error',

    // Limit maximum file size to reduce complexity. Turned off in tests.
    'max-lines': 'error',
  },
};
