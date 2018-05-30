var commonSauceConfig = require('./karma.sauce.config');
var files = require('./karma.loader.config').files;

module.exports = function(config) {
  var testConfig = Object.assign({}, commonSauceConfig, {
    logLevel: config.LOG_INFO,
    files: files
  });
  config.set(testConfig);
};
