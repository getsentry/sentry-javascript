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

function consolePlugin(Raven, console, pluginOptions) {
    console = console || window.console || {};
    pluginOptions = pluginOptions || {};

    var originalConsole = console,
        logLevels = pluginOptions.levels || ['debug', 'info', 'warn', 'error'],
        level = logLevels.pop();

    var logForGivenLevel = function(l) {
        var originalConsoleLevel = console[l];

        // warning level is the only level that doesn't map up
        // correctly with what Sentry expects.
        if (l === 'warn') l = 'warning';
        return function () {
            var args = [].slice.call(arguments);
            Raven.captureMessage('' + args.join(' '), {level: l, logger: 'console', extra: { 'arguments': args }});

            // this fails for some browsers. :(
            if (originalConsoleLevel) {
                // IE9 doesn't allow calling apply on console functions directly
                // See: https://stackoverflow.com/questions/5472938/does-ie9-support-console-log-and-is-it-a-real-function#answer-5473193
                Function.prototype.apply.call(
                    originalConsoleLevel,
                    originalConsole,
                    args
                );
            }
        };
    };

    while(level) {
        console[level] = logForGivenLevel(level);
        level = logLevels.pop();
    }
}

module.exports = consolePlugin;
