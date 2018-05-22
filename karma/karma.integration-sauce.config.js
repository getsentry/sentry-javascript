var commonSauceConfig = require('./karma.sauce.config');
var files = require('./karma.integration.config').files;

module.exports = function(config) {
  var testConfig = Object.assign({}, commonSauceConfig, {
    logLevel: config.LOG_INFO,
    files: files.concat(['build/raven.test.js'])
  });
  config.set(testConfig);
};
