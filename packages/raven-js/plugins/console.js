/**
 * console plugin
 *
 * Monkey patches console.* calls into Sentry messages with
 * their appropriate log levels. (Experimental)
 *
 * Options:
 *
 *   `levels`: An array of levels (methods on `console`) to report to Sentry.
 *     Defaults to debug, info, warn, and error.
 */
var wrapConsoleMethod = require('../src/console').wrapMethod;

function consolePlugin(Raven, console, pluginOptions) {
  console = console || window.console || {};
  pluginOptions = pluginOptions || {};

  var logLevels = pluginOptions.levels || ['debug', 'info', 'warn', 'error'];
  if ('assert' in console) logLevels.push('assert');

  var callback = function(msg, data) {
    Raven.captureMessage(msg, data);
  };

  var level = logLevels.pop();
  while (level) {
    wrapConsoleMethod(console, level, callback);
    level = logLevels.pop();
  }
}

module.exports = consolePlugin;
