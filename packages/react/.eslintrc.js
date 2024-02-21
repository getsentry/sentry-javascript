module.exports = {
  env: {
    browser: true,
  },
  parserOptions: {
    jsx: true,
  },
  extends: ['../../.eslintrc.js', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  overrides: [
    {
      files: ['test/**'],
      rules: {
        // Prop types validation is not useful in test environments
        'react/prop-types': 'off',
      },
    },
  ],
};
