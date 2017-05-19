'use strict';

var util = require('util');

function fill(obj, name, replacement, track) {
  var orig = obj[name];
  obj[name] = replacement(orig);
  if (track) {
    track.push([obj, name, orig]);
  }
}

module.exports = function (Raven, console, originals) {
  var wrapConsoleMethod = function (level) {
    if (!(level in console)) {
      return;
    }

    fill(console, level, function (originalConsoleLevel) {
      var sentryLevel = level === 'warn'
          ? 'warning'
          : level;

      return function () {
        var args = [].slice.call(arguments);

        Raven.captureBreadcrumb({
          message: util.format.apply(null, args),
          level: sentryLevel,
          category: 'console'
        });

        originalConsoleLevel.apply(console, args);
      };
    }, originals);
  };

  ['debug', 'info', 'warn', 'error', 'log'].forEach(wrapConsoleMethod);

  return console;
};
