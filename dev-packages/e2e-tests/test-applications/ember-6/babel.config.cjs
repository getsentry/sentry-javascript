/**
 * This babel config is used for local tests in the e2e app.
 */
const { buildMacros } = require('@embroider/macros/babel');

const macros = buildMacros();

module.exports = {
  plugins: [
    [
      '@babel/plugin-transform-typescript',
      {
        allExtensions: true,
        allowDeclareFields: true,
        onlyRemoveTypeImports: true,
      },
    ],
    [
      'babel-plugin-ember-template-compilation',
      {
        transforms: [...macros.templateMacros],
      },
    ],
    [
      'module:decorator-transforms',
      {
        runtime: {
          import: require.resolve('decorator-transforms/runtime-esm'),
        },
      },
    ],
    ...macros.babelMacros,
  ],
  generatorOpts: {
    compact: false,
  },
};
