var commonConfig = require('./karma.config');

var testFiles = ['test/globals.js', 'build/raven.test.js'];

module.exports = function(config) {
  var testConfig = Object.assign(
    {},
    commonConfig,
    {files: testFiles},
    {logLevel: config.LOG_INFO}
  );
  config.set(testConfig);
};
