const webpackConfig = require('./webpack.config');

module.exports = function(config) {
  config.set({
    basePath: process.cwd(),
    files: ['test/**/*.ts'],
    frameworks: ['mocha', 'chai', 'sinon'],
    preprocessors: {
      'test/**/*.ts': ['webpack'],
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
    reporters: ['dots'],
    browsers: ['ChromeHeadless'],
    singleRun: true,

    // Uncomment if you want to silence console logs in the output
    // client: {
    //   captureConsole: false,
    // },
  });
};
