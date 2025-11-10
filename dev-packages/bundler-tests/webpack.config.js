const path = require('path');

module.exports = (env, argv) => ({
  mode: argv.mode || 'development',
  entry: path.resolve(__dirname, 'fixtures/basic/index.js'),
  output: {
    path: path.resolve(__dirname, 'dist/webpack-' + (argv.mode || 'development')),
    filename: 'bundle.js',
  },
});
