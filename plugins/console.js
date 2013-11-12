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
    return function () {
        var args = [].slice.call(arguments);
        Raven.captureMessage('' + args, {level: level, logger: 'console'});

        // this fails for some browsers. :(
        if (originalConsole[level]) {
             originalConsole[level].apply(null, args);
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

}(this, Raven, console || {}));
