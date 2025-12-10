module.exports = {
  extends: ['../.eslintrc.js'],
  rules: {
    // tests often have just cause to do evil
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
