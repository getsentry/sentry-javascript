var commonConfig = require('./karma.config');

var testFiles = [
  'node_modules/es6-promise/dist/es6-promise.auto.js',
  'node_modules/whatwg-fetch/fetch.js',
  'test/globals.js',
  'build/raven.js',
  {pattern: 'test/integration/123', included: false},
  {pattern: 'test/integration/throw-string.js', included: false},
  {pattern: 'test/integration/throw-error.js', included: false},
  {pattern: 'test/integration/throw-object.js', included: false},
  {pattern: 'test/integration/example.json', included: false},
  'test/integration/test.js',
  {pattern: 'test/integration/frame.html', included: false}
];

module.exports = function(config) {
  var testConfig = Object.assign({}, commonConfig, {files: testFiles});
  config.set(testConfig);
};
