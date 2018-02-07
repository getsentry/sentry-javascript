const webpackConfig = require('./webpack.config');

webpackConfig.module.rules = webpackConfig.module.rules.concat([
  {
    test: /\.ts$/,
    loader: 'istanbul-instrumenter-loader',
    enforce: 'post',
    exclude: /node_modules|test/,
  },
]);

module.exports = function(config) {
  config.set({
    basePath: process.cwd(),
    files: ['test/**/*.ts'],
    frameworks: ['mocha', 'chai', 'sinon'],
    preprocessors: {
      './test/**/*.ts': ['webpack', 'sourcemap'],
      './src/**/*.ts': ['coverage'],
    },
    webpack: {
      module: webpackConfig.module,
      resolve: webpackConfig.resolve,
    },
    webpackMiddleware: {
      stats: webpackConfig.stats,
      quiet: true,
    },
    mime: {
      'text/x-typescript': ['ts'],
    },
    browsers: ['ChromeHeadless'],
    singleRun: true,
    reporters: ['dots', 'coverage', 'remap-coverage'],
    coverageReporter: {
      type: 'in-memory',
    },
    remapCoverageReporter: {
      'text-summary': null,
      html: './coverage',
    },

    // Uncomment if you want to silence console logs in the output
    // client: {
    //   captureConsole: false,
    // },
  });
};
