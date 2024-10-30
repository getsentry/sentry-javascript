module.exports = {
  env: {
    node: true,
  },
  extends: ['eslint:recommended'],
  plugins: ['@sentry-internal/eslint-plugin-sdk'],
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
      extends: ['plugin:@typescript-eslint/recommended', 'plugin:deprecation/recommended'],
      plugins: ['@typescript-eslint', 'jsdoc'],
      parser: '@typescript-eslint/parser',
      rules: {
        // We want to guard against using the equality operator with empty arrays
        '@sentry-internal/sdk/no-eq-empty': 'error',

        // Unused variables should be removed unless they are marked with and underscore (ex. _varName).
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

        // Do not use ts-ignore, use ts-expect-error instead.
        // Also make sure that all ts-expect-error comments are given a description.
        '@typescript-eslint/ban-ts-comment': 'error',

        // Types usage should be explicit as possible, so we prevent usage of inferrable types.
        // This is especially important because we have a public API, so usage needs to be as
        // easy to understand as possible.
        '@typescript-eslint/no-inferrable-types': 'off',

        // Enforce type annotations to maintain consistency. This is especially important as
        // we have a public API, so we want changes to be very explicit.
        '@typescript-eslint/typedef': ['error', { arrowParameter: false }],

        // Although for most codebases inferencing the return type is fine, we explicitly ask to annotate
        // all functions with a return type. This is so that intent is as clear as possible. We are guarding against
        // cases where you accidentally refactor a function's return type to be the wrong type.
        '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],

        // Consistent ordering of fields, methods and constructors for classes should be enforced
        '@typescript-eslint/member-ordering': 'error',

        // Enforce that unbound methods are called within an expected scope. As we frequently pass data between classes
        // in SDKs, we should make sure that we are correctly preserving class scope.
        '@typescript-eslint/unbound-method': 'error',

        '@typescript-eslint/consistent-type-imports': 'error',

        // Private and protected members of a class should be prefixed with a leading underscore.
        // typeLike declarations (class, interface, typeAlias, enum, typeParameter) should be
        // PascalCase.
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
          {
            selector: 'typeLike',
            format: ['PascalCase'],
          },
        ],

        // Prefer for-of loop over for loop if index is only used to access array
        '@typescript-eslint/prefer-for-of': 'error',

        // Make sure all expressions are used. Turned off in tests
        // Must disable base rule to prevent false positives
        'no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true }],

        // Make sure Promises are handled appropriately
        '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],

        // Disallow delete operator. We should make this operation opt in (by disabling this rule).
        '@typescript-eslint/no-dynamic-delete': 'error',

        // We should prevent against overloads unless necessary.
        '@typescript-eslint/unified-signatures': 'error',

        // Disallow unsafe any usage. We should enforce that types be used as possible, or unknown be used
        // instead of any. This is especially important for methods that expose a public API, as users
        // should know exactly what they have to provide to use those methods. Turned off in tests.
        '@typescript-eslint/no-unsafe-member-access': 'error',

        // Be explicit about class member accessibility (public, private, protected). Turned off
        // on tests for ease of use.
        '@typescript-eslint/explicit-member-accessibility': ['error'],
      },
    },
    {
      // Configuration for files under src
      files: ['src/**/*'],
      rules: {
        'no-restricted-globals': [
          'error',
          {
            name: 'window',
            message:
              'Some global variables are not available in environments like WebWorker or Node.js. Use GLOBAL_OBJ instead.',
          },
          {
            name: 'document',
            message:
              'Some global variables are not available in environments like WebWorker or Node.js. Use GLOBAL_OBJ instead.',
          },
          {
            name: 'location',
            message:
              'Some global variables are not available in environments like WebWorker or Node.js. Use GLOBAL_OBJ instead.',
          },
          {
            name: 'navigator',
            message:
              'Some global variables are not available in environments like WebWorker or Node.js. Use GLOBAL_OBJ instead.',
          },
        ],

        // We want to prevent optional chaining & nullish coalescing usage in our files
        // to prevent unnecessary bundle size. Turned off in tests.
        '@sentry-internal/sdk/no-optional-chaining': 'error',
        '@sentry-internal/sdk/no-nullish-coalescing': 'error',

        // We want to avoid using the RegExp constructor as it can lead to invalid or dangerous regular expressions
        // if end user input is used in the constructor. It's fine to ignore this rule if it is safe to use the RegExp.
        // However, we want to flag each use case so that we're aware of the potential danger.
        '@sentry-internal/sdk/no-regexp-constructor': 'error',

        // JSDOC comments are required for classes and methods. As we have a public facing codebase, documentation,
        // even if it may seems excessive at times, is important to emphasize. Turned off in tests.
        'jsdoc/require-jsdoc': [
          'error',
          {
            require: { ClassDeclaration: true, MethodDefinition: true },
            checkConstructors: false,
            publicOnly: true,
          },
        ],

        // Do not allow usage of class field initializers
        '@sentry-internal/sdk/no-class-field-initializers': 'error',
      },
    },
    {
      // Configuration for files in test directories
      env: {
        jest: true,
      },
      files: [
        'test.ts',
        '*.test.ts',
        '*.test.tsx',
        '*.test.js',
        '*.test.jsx',
        'test/**/*.ts',
        'test/**/*.js',
        'tests/**/*.ts',
        'tests/**/*.js',
      ],
      rules: {
        'max-lines': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-expressions': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/explicit-member-accessibility': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@sentry-internal/sdk/no-optional-chaining': 'off',
        '@sentry-internal/sdk/no-nullish-coalescing': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@sentry-internal/sdk/no-focused-tests': 'error',
        '@sentry-internal/sdk/no-skipped-tests': 'error',
      },
    },
    {
      // Configuration for config files like webpack/rollup
      files: ['*.config.js', '*.config.mjs'],
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2018,
      },
    },
    {
      // Configuration for jsx and tsx files
      files: ['*.tsx', '*.jsx', '*.test.tsx', '*.test.jsx'],
      parserOptions: {
        jsx: true,
      },
    },
  ],

  rules: {
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
    'max-lines': ['error', { max: 300, skipComments: true, skipBlankLines: true }],

    // We should require a whitespace beginning a comment
    'spaced-comment': [
      'error',
      'always',
      {
        line: {
          // this lets us use triple-slash directives
          markers: ['/'],
        },
        block: {
          // comments of the form /* ..... */ should always have whitespace before the closing `*/` marker...
          balanced: true,
          // ... unless they're jsdoc-style block comments, which end with `**/`
          exceptions: ['*'],
        },
      },
    ],

    // Disallow usage of bitwise operators - this makes it an opt in operation
    'no-bitwise': 'error',

    // Limit cyclomatic complexity
    complexity: 'error',

    // Make sure all expressions are used. Turn off on tests.
    'no-unused-expressions': 'error',

    // Make sure for in loops check for properties
    'guard-for-in': 'error',

    // Make sure that we are returning in the callbacks passed into `.map`,
    // `.filter` and `.reduce`. If we are not, we should be using
    // `.forEach()` or an explicit for loop.
    'array-callback-return': ['error', { allowImplicit: true }],

    quotes: ['error', 'single', { avoidEscape: true }],

    // Remove unnecessary usages of async await to prevent extra micro-tasks
    'no-return-await': 'error',
  },
};
