module.exports = config => {
  config.set({
    colors: true,
    singleRun: true,
    autoWatch: false,
    basePath: process.cwd(),
    files: [
      { pattern: 'test/integration/polyfills/es6-promise-4.2.4.js', included: false },
      { pattern: 'test/integration/polyfills/whatwg-fetch-2.0.4.js', included: false },
      { pattern: 'test/integration/123', included: false },
      { pattern: 'test/integration/throw-string.js', included: false },
      { pattern: 'test/integration/throw-error.js', included: false },
      { pattern: 'test/integration/throw-object.js', included: false },
      { pattern: 'test/integration/example.json', included: false },
      { pattern: 'test/integration/frame.html', included: false },
      { pattern: 'test/integration/loader.html', included: false },
      { pattern: 'test/integration/loader-lazy-no.html', included: false },
      { pattern: 'test/integration/common.js', included: false },
      { pattern: 'src/loader.js', included: false },
      { pattern: 'test/integration/init.js', included: false },
      { pattern: 'build/bundle.js', included: false },
      { pattern: 'build/bundle.js.map', included: false },
      'test/integration/test.js',
    ],
    frameworks: ['mocha', 'chai', 'sinon'],
    plugins: [
      'karma-mocha',
      'karma-mocha-reporter',
      'karma-chai',
      'karma-sinon',
      'karma-chrome-launcher',
      'karma-firefox-launcher',
      'karma-failed-reporter',
    ],
    reporters: ['mocha'],
    browsers: ['ChromeHeadlessNoSandbox', 'FirefoxHeadless'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      FirefoxHeadless: {
        base: 'Firefox',
        flags: ['-headless'],
      },
    },
    // https://docs.travis-ci.com/user/gui-and-headless-browsers/#Karma-and-Firefox-inactivity-timeouts
    browserNoActivityTimeout: 30000,
    concurrency: 2,
    client: {
      mocha: {
        reporter: 'html',
        ui: 'bdd',
      },
    },
  });
};
