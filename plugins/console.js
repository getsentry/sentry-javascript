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
'use strict';

var wrapConsoleMethod = require('../src/console').wrapMethod;

function consolePlugin(Raven, console, pluginOptions) {
    console = console || window.console || {};
    pluginOptions = pluginOptions || {};

    var logLevels = pluginOptions.levels || ['debug', 'info', 'warn', 'error'],
        level = logLevels.pop();

    var callback = function (msg, data) {
        Raven.captureMessage(msg, data);
    };

    while(level) {
        wrapConsoleMethod(console, level, callback);
        level = logLevels.pop();
    }
    
    console.assert = function () {
        var args = [].slice.call(arguments);
        var result = args.shift();
        if (!result) {
            args.unshift("Assertion failed");
            // IE9 doesn't allow calling apply on console functions directly
            // See: https://stackoverflow.com/questions/5472938/does-ie9-support-console-log-and-is-it-a-real-function#answer-5473193
            Function.prototype.apply.call(
                console.error,
                console,
                args
            );
        }
    }
}

module.exports = consolePlugin;
