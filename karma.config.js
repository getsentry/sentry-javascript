// Karma configuration
// Generated on Tue Oct 10 2017 16:05:16 GMT+0300 (EEST)

module.exports = {
  // base path that will be used to resolve all patterns (eg. files, exclude)
  basePath: '',

  // frameworks to use
  // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
  frameworks: ['mocha', 'chai', 'sinon'],

  // list of files / patterns to load in the browser
  files: [],

  // list of files to exclude
  exclude: [],

  // preprocess matching files before serving them to the browser
  // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
  preprocessors: {},

  plugins: [
    'karma-mocha',
    'karma-mocha-reporter',
    'karma-chai',
    'karma-sinon',
    'karma-chrome-launcher',
    'karma-firefox-launcher',
    'karma-failed-reporter'
  ],

  // test results reporter to use
  // possible values: 'dots', 'progress'
  // available reporters: https://npmjs.org/browse/keyword/karma-reporter
  reporters: ['mocha'],

  // web server port
  port: 9876,

  // enable / disable colors in the output (reporters and logs)
  colors: true,

  // enable / disable watching file and executing tests whenever any file changes
  autoWatch: true,

  // start these browsers
  // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
  browsers: ['ChromeHeadlessNoSandbox', 'FirefoxHeadless'],

  customLaunchers: {
    ChromeHeadlessNoSandbox: {
      base: 'ChromeHeadless',
      flags: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    FirefoxHeadless: {
      base: 'Firefox',
      flags: ['-headless']
    }
  },

  // Continuous Integration mode
  // if true, Karma captures browsers, runs the tests and exits
  singleRun: false,

  // Concurrency level
  // how many browser should be started simultaneous
  concurrency: 2,

  client: {
    mocha: {
      reporter: 'html',
      ui: 'bdd'
    }
  }
};
