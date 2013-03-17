;(function(window, Raven, console) {
'use strict';

var originalConsole = console,
    logLevels = ['debug', 'info', 'warn', 'error'],
    level;

while(level = logLevels.pop()) {
    console[level] = function () {
        var args = [].slice.call(arguments);
        Raven.captureMessage('' + args, {level: level, logger: 'console'});

        // this fails for some browsers. :(
        originalConsole[level] && originalConsole[level].apply(null, args);
    };
}
// export
window.console = console;

}(this, Raven, console || {}));
