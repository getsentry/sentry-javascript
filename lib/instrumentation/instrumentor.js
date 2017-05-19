'use strict';

var utils = require('../utils');

var defaultOnConfig = {
  console: true
};

var defaultConfig = {
  console: false
};

module.exports = function (Raven, config) {
  if (config === false) {
    return;
  } else if (config === true) {
    config = defaultOnConfig;
  } else {
    config = utils.extend({}, defaultConfig, config);
  }

  var originals = [];
  var Module = require('module');
  var origRequire = Module.prototype.require;
  Module.prototype.require = function (moduleId) {
    var origModule = origRequire.call(this, moduleId);
    if (config[moduleId]) {
      return require('./' + moduleId)(Raven, origModule, originals);
    }
    return origModule;
  };

  // special case: since console is built-in and app-level code won't require() it, do that here
  if (config.console) {
    require('console');
  }
};
