module.exports = {
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    jsx: true,
  },
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['scripts/**/*.ts'],
      parserOptions: {
        project: ['../../tsconfig.dev.json'],
      },
    },
    {
      files: ['src/config/templates/**/*.ts'],
      rules: {
        // This complains about importing from @sentry/nextjs, so we skip this for template files
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['src/config/polyfills/perf_hooks.js'],
      globals: {
        globalThis: 'readonly',
      },
    },
  ],
};
