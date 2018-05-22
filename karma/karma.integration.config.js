var commonConfig = require('./karma.config');

var testFiles = [
  {pattern: 'node_modules/es6-promise/dist/es6-promise.auto.js', included: false},
  {pattern: 'node_modules/whatwg-fetch/fetch.js', included: false},
  {pattern: 'test/integration/123', included: false},
  {pattern: 'test/integration/throw-string.js', included: false},
  {pattern: 'test/integration/throw-error.js', included: false},
  {pattern: 'test/integration/throw-object.js', included: false},
  {pattern: 'test/integration/example.json', included: false},
  {pattern: 'test/integration/frame.html', included: false},
  {pattern: 'build/raven.js', included: false},
  'test/integration/test.js'
];

module.exports = function(config) {
  var testConfig = Object.assign({}, commonConfig, {files: testFiles});
  config.set(testConfig);
};

module.exports.files = testFiles;
