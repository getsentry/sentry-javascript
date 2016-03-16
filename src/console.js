'use strict';

var utils = require('./utils');

var wrapMethod = function(console, level, callback) {
    var originalConsoleLevel = console[level];
    var originalConsole = console;

    if (!(level in console)) {
        return;
    }

    var sentryLevel = level === 'warn'
        ? 'warning'
        : level;

    console[level] = function () {
        var args = [].slice.call(arguments);
        var error;

        // If we have an error passed directly as an argument, extract it.
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            if (utils.isError(arg)) {
                error = arg;
            }
        }

        var msg = '' + args.join(' ');
        var data = {level: sentryLevel, logger: 'console', extra: {'arguments': args}};
        callback && callback(msg, data, error);

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

module.exports = {
    wrapMethod: wrapMethod
};
