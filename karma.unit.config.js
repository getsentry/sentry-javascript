var commonConfig = require('./karma.config');

var testFiles = [
  'test/globals.js',
  'build/angular.test.js',
  'build/console.test.js',
  'build/json-stringify-safe.test.js',
  'build/raven.test.js',
  'build/react-native.test.js',
  'build/tracekit.test.js',
  'build/tracekit-parser.test.js',
  'build/utils.test.js',
  'build/vue.test.js',
];

module.exports = function(config) {
  var testConfig = Object.assign(
    {},
    commonConfig,
    {files: testFiles},
    {logLevel: config.LOG_INFO}
  );
  config.set(testConfig);
};
