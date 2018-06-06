var commonConfig = require('./karma.config');

var testFiles = [
  {pattern: 'node_modules/es6-promise/dist/es6-promise.auto.js', included: false},
  {pattern: 'test/integration/loader.html', included: false},
  {pattern: 'build/raven.js', included: false},
  {pattern: 'src/loader.js', included: false},
  'test/integration/loader-test.js'
];

module.exports = function(config) {
  var testConfig = Object.assign({}, commonConfig, {files: testFiles});
  config.set(testConfig);
};
module.exports.files = testFiles;
