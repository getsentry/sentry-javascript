var commonConfig = require('./karma.config');

var customLaunchers = {
  sl_chrome: {
    base: 'SauceLabs',
    browserName: 'chrome',
    platform: 'Windows 10',
    version: 'latest'
  },
  sl_firefox: {
    base: 'SauceLabs',
    browserName: 'firefox',
    platform: 'Windows 10',
    version: 'latest'
  },
  sl_edge: {
    base: 'SauceLabs',
    browserName: 'microsoftedge',
    version: 'latest',
    platform: 'Windows 10'
  },
  sl_ie_11: {
    base: 'SauceLabs',
    browserName: 'internet explorer',
    platform: 'Windows 7',
    version: '11'
  },
  sl_ie_10: {
    base: 'SauceLabs',
    browserName: 'internet explorer',
    platform: 'Windows 7',
    version: '10'
  },
  sl_safari: {
    base: 'SauceLabs',
    browserName: 'safari',
    platform: 'OS X 10.12',
    version: '11.0'
  },
  sl_ios: {
    base: 'SauceLabs',
    browserName: 'iphone',
    platform: 'OS X 10.12',
    version: '11.0'
  },
  sl_android_7: {
    base: 'SauceLabs',
    browserName: 'Chrome',
    platform: 'Android',
    version: '7.1',
    device: 'Android GoogleAPI Emulator'
  },
  sl_android_6: {
    base: 'SauceLabs',
    browserName: 'Chrome',
    platform: 'Android',
    version: '6.0',
    device: 'Android Emulator'
  },
  sl_android_5: {
    base: 'SauceLabs',
    browserName: 'android',
    platform: 'Linux',
    version: '5.1'
  },
  sl_android_4: {
    base: 'SauceLabs',
    browserName: 'android',
    platform: 'Linux',
    version: '4.4'
  }
};

var testFiles = [
  {pattern: 'node_modules/es6-promise/dist/es6-promise.auto.js', included: false},
  {pattern: 'node_modules/whatwg-fetch/fetch.js', included: false},
  {pattern: 'test/integration/123', included: false},
  {pattern: 'test/integration/throw-string.js', included: false},
  {pattern: 'test/integration/throw-error.js', included: false},
  {pattern: 'test/integration/throw-object.js', included: false},
  {pattern: 'test/integration/example.json', included: false},
  {pattern: 'test/integration/frame.html', included: false},
  'test/integration/test.js',
  'test/globals.js',
  'build/raven.js',
  'build/raven.test.js'
];

module.exports = function(config) {
  var testConfig = Object.assign({}, commonConfig, {
    files: testFiles,
    logLevel: config.LOG_INFO,
    customLaunchers: customLaunchers,
    browsers: Object.keys(customLaunchers),
    reporters: ['failed', 'saucelabs'],
    singleRun: true,
    plugins: commonConfig.plugins.concat(['karma-sauce-launcher']),
    build: process.env.TRAVIS_BUILD_NUMBER,
    // SauceLabs allows for 2 tunnels only, therefore some browsers will have to wait
    // rather long time. Plus mobile emulators tend to require a lot of time to start up.
    // 10 minutes should be more than enough to run all of them.
    browserNoActivityTimeout: 600000,
    captureTimeout: 600000,
    sauceLabs: {
      startConnect: false,
      // Just something "random" so we don't have to provide additional ENV var when running locally
      tunnelIdentifier: process.env.TRAVIS_JOB_NUMBER || Math.ceil(Math.random() * 1337),
      recordScreenshots: false,
      recordVideo: false,
      testName:
        'Raven.js' +
        (process.env.TRAVIS_JOB_NUMBER ? ' #' + process.env.TRAVIS_JOB_NUMBER : ''),
      public: 'public'
    }
  });
  config.set(testConfig);
};
