module.exports = {
  // todo: remove regexp plugin from here once we add it to base.js eslint config for the whole project
  extends: ['../.eslintrc.js', 'plugin:regexp/recommended'],
  plugins: ['regexp'],
  ignorePatterns: ['otelLoaderTemplate.js.tmpl'],
  sourceType: 'module',
};
