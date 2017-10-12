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
  sl_ios_safari: {
    base: 'SauceLabs',
    browserName: 'iphone',
    platform: 'macOS 10.12',
    version: '10.0'
  },
  sl_macos_safari: {
    base: 'SauceLabs',
    browserName: 'safari',
    platform: 'macOS 10.12',
    version: '10.0'
  },
  sl_ie_11: {
    base: 'SauceLabs',
    browserName: 'internet explorer',
    platform: 'Windows 10',
    version: '11'
  },
  sl_ie_10: {
    base: 'SauceLabs',
    browserName: 'internet explorer',
    platform: 'Windows 10',
    version: '10'
  },
  sl_android_4: {
    base: 'SauceLabs',
    browserName: 'android',
    platform: 'Linux',
    version: '4.4'
  },
  sl_android_5: {
    base: 'SauceLabs',
    browserName: 'android',
    platform: 'Linux',
    version: '5.1'
  },
  sl_edge: {
    base: 'SauceLabs',
    browserName: 'microsoftedge',
    version: 'latest-1',
    platform: 'Windows 10'
  }
};

var testFiles = [
  'node_modules/es6-promise/dist/es6-promise.auto.js',
  'node_modules/whatwg-fetch/fetch.js',
  'test/globals.js',
  'build/raven.js',
  'build/raven.test.js',
  {pattern: 'test/integration/123', included: false},
  {pattern: 'test/integration/throw-string.js', included: false},
  {pattern: 'test/integration/throw-error.js', included: false},
  {pattern: 'test/integration/throw-object.js', included: false},
  {pattern: 'test/integration/example.json', included: false},
  'test/integration/test.js',
  {pattern: 'test/integration/frame.html', included: false}
];

module.exports = function(config) {
  var testConfig = Object.assign({}, commonConfig, {
    files: testFiles,
    logLevel: config.LOG_INFO,
    customLaunchers: customLaunchers,
    browsers: Object.keys(customLaunchers),
    reporters: ['dots', 'saucelabs'],
    singleRun: true,
    plugins: commonConfig.plugins.concat(['karma-sauce-launcher']),
    sauceLabs: {
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
