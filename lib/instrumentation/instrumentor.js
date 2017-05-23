'use strict';

var utils = require('../utils');

var defaultOnConfig = {
  console: true
};

var defaultConfig = {
  console: false,
  http: false,
  pg: false
};

function fill(obj, name, replacement, track) {
  var orig = obj[name];
  obj[name] = replacement(orig);
  if (track) {
    track.push([obj, name, orig]);
  }
}

function instrument(Raven, config) {
  if (config === false) {
    return;
  } else if (config === true) {
    config = defaultOnConfig;
  } else {
    config = utils.extend({}, defaultConfig, config);
  }

  Raven.instrumentedOriginals = [];

  var Module = require('module');
  fill(Module.prototype, 'require', function (origRequire) {
    return function (moduleId) {
      var origModule = origRequire.call(this, moduleId);
      if (config[moduleId]) {
        return require('./' + moduleId)(Raven, origModule, Raven.instrumentedOriginals);
      }
      return origModule;
    };
  }, Raven.instrumentedOriginals);

  // special case: since console is built-in and app-level code won't require() it, do that here
  if (config.console) {
    require('console');
  }

  // special case: loading http proactively ensures that if https loads it, it's been instrumented
  // todo: might be able to avoid need for this, still investigating
  if (config.http) {
    require('http');
  }
}

function deinstrument(Raven) {
  if (!Raven.instrumentedOriginals) return;
  var original;
  // eslint-disable-next-line no-cond-assign
  while (original = Raven.instrumentedOriginals.shift()) {
    var obj = original[0];
    var name = original[1];
    var orig = original[2];
    obj[name] = orig;
  }
}

module.exports = {
  instrument: instrument,
  deinstrument: deinstrument
};
