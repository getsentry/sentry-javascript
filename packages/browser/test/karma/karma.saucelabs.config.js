var customLaunchers = {
  sl_chrome: {
    base: 'SauceLabs',
    browserName: 'chrome',
    platform: 'Windows 10',
    version: 'latest',
  },
  sl_firefox: {
    base: 'SauceLabs',
    browserName: 'firefox',
    platform: 'Windows 10',
    version: 'latest',
  },
  sl_edge: {
    base: 'SauceLabs',
    browserName: 'microsoftedge',
    version: 'latest',
    platform: 'Windows 10',
  },
  sl_ie_11: {
    base: 'SauceLabs',
    browserName: 'internet explorer',
    platform: 'Windows 7',
    version: '11',
  },
  sl_ie_10: {
    base: 'SauceLabs',
    browserName: 'internet explorer',
    platform: 'Windows 7',
    version: '10',
  },
  sl_safari: {
    base: 'SauceLabs',
    browserName: 'safari',
    platform: 'OS X 10.13',
    version: '11.1',
  },
  sl_ios: {
    base: 'SauceLabs',
    browserName: 'iphone',
    platform: 'OS X 10.13',
    version: '11.1',
  },
  sl_android_7: {
    base: 'SauceLabs',
    browserName: 'Chrome',
    platform: 'Android',
    version: '7.1',
    device: 'Android GoogleAPI Emulator',
  },
  sl_android_6: {
    base: 'SauceLabs',
    browserName: 'Chrome',
    platform: 'Android',
    version: '6.0',
    device: 'Android Emulator',
  },
  sl_android_5: {
    base: 'SauceLabs',
    browserName: 'android',
    platform: 'Linux',
    version: '5.1',
  },
  sl_android_4: {
    base: 'SauceLabs',
    browserName: 'android',
    platform: 'Linux',
    version: '4.4',
  },
};

module.exports = function(config) {
  config.set({
    logLevel: config.LOG_INFO,
    basePath: process.cwd(),
    files: require('./integration-files'),
    frameworks: ['mocha', 'chai', 'sinon'],
    plugins: ['karma-mocha', 'karma-chai', 'karma-sinon', 'karma-failed-reporter', 'karma-sauce-launcher'],
    concurrency: 2,
    client: {
      mocha: {
        reporter: 'html',
        ui: 'bdd',
      },
    },
    customLaunchers: customLaunchers,
    browsers: Object.keys(customLaunchers),
    reporters: ['failed', 'saucelabs'],
    singleRun: true,
    build: process.env.TRAVIS_BUILD_NUMBER,
    // SauceLabs allows for 2 tunnels only, therefore some browsers will have to wait
    // rather long time. Plus mobile emulators tend to require a lot of time to start up.
    // 10 minutes should be more than enough to run all of them.
    browserNoActivityTimeout: 600000,
    captureTimeout: 600000,
    sauceLabs: {
      // NOTE: To run tests locally, change `startConnect` to `true` and use command:
      // $ SAUCE_USERNAME=sentryio SAUCE_ACCESS_KEY=<key> yarn test:saucelabs
      startConnect: false,
      // Just something "random" so we don't have to provide additional ENV var when running locally
      tunnelIdentifier: process.env.TRAVIS_JOB_NUMBER || Math.ceil(Math.random() * 1337),
      recordScreenshots: false,
      recordVideo: false,
      testName: '@sentry/browser' + (process.env.TRAVIS_JOB_NUMBER ? ' #' + process.env.TRAVIS_JOB_NUMBER : ''),
      public: 'public',
    },
  });
};
