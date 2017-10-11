var commonConfig = require('./karma.config');

module.exports = function(config) {
  var unitTestFiles = ['test/globals.js', 'build/raven.test.js'];
  var unitTestConfig = Object.assign(
    {},
    commonConfig,
    {files: unitTestFiles},
    {logLevel: config.LOG_INFO}
  );
  config.set(unitTestConfig);
};
