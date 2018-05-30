var commonConfig = require('./karma.config');

module.exports = function(config) {
  var testConfig = Object.assign({}, commonConfig, {
    logLevel: config.LOG_INFO,
    files: ['build/raven.test.js']
  });
  config.set(testConfig);
};
