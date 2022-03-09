module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',

    "plugin:prettier/recommended", // Should be last
  ],

  globals: {},
  rules: {},
  overrides: [
    {
      "files": ["*.spec.ts"],
      "rules": {
        "@typescript-eslint/no-var-requires": ["off"],
      }
    }
  ]
};

