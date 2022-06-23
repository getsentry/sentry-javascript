module.exports = {
  extends: ['../../.eslintrc.js'],
  rules: {
    // Disallow optional chaining in browser SDKs
    'no-restricted-syntax': [
      'error',
      {
        selector: 'OptionalMemberExpression',
        message: 'Optional Chaining is disallowed in packages that could be used by Browser SDKs',
      },
    ],
  },
};
