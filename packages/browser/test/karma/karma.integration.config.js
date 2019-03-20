module.exports = config => {
  config.set({
    colors: true,
    singleRun: true,
    autoWatch: false,
    basePath: process.cwd(),
    files: require('./integration-files'),
    frameworks: ['mocha', 'chai', 'sinon'],
    plugins: [
      'karma-mocha',
      'karma-mocha-reporter',
      'karma-chai',
      'karma-sinon',
      'karma-chrome-launcher',
      'karma-firefox-launcher',
    ],
    reporters: ['mocha'],
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      // FirefoxHeadless: {
      //   base: 'Firefox',
      //   flags: ['-headless'],
      // },
    },
    browserNoActivityTimeout: 30000,
    concurrency: 1,
    client: {
      mocha: {
        reporter: 'html',
        ui: 'bdd',
      },
    },
  });
};
