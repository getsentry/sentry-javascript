/**
 * console plugin
 *
 * Monkey patches console.* calls into Sentry messages with
 * their appropriate log levels. (Experimental)
 */
;(function(window, Raven, console) {
'use strict';

var originalConsole = console,
    logLevels = ['debug', 'info', 'warn', 'error'],
    level;

var logForGivenLevel = function(level) {
    var originalConsoleLevel = console[level];
    return function () {
        var args = [].slice.call(arguments);
        Raven.captureMessage('' + args, {level: level, logger: 'console'});

        // this fails for some browsers. :(
        if (originalConsoleLevel) {
             originalConsoleLevel.apply(originalConsole, args);
        }
    };
};


level = logLevels.pop();
while(level) {
    console[level] = logForGivenLevel(level);
    level = logLevels.pop();
}
// export
window.console = console;

}(this, Raven, window.console || {}));
