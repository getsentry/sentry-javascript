/**
 * Angular.js plugin
 *
 * Provides an $exceptionHandler for Angular.js
 */
;(function(window) {
'use strict';

var angular = window.angular,
    Raven = window.Raven;

// quit if angular isn't on the page
if (!(angular && Raven)) return;

function RavenProvider() {
    this.$get = ['$window', function($window, $log) {
        return $window.Raven;
    }];
}

function ExceptionHandlerProvider($provide) {
    $provide.decorator('$exceptionHandler',
        ['Raven', '$delegate', exceptionHandler]);
}

function exceptionHandler(Raven, $delegate) {
    return function (ex, cause) {
        Raven.captureException(ex, {
            extra: { cause: cause }
        });
        $delegate(ex, cause);
    };
}

// See https://github.com/angular/angular.js/blob/v1.4.7/src/minErr.js
var angularPattern = /^\[((?:[$a-zA-Z0-9]+:)?(?:[$a-zA-Z0-9]+))\] (.+?)\n(\S+)$/;

Raven.addPlugin(function () {
    angular.module('ngRaven', [])
        .provider('Raven',  RavenProvider)
        .config(['$provide', ExceptionHandlerProvider]);
});

Raven.setDataCallback(function(data) {
    // We only care about mutating an exception
    var exception = data.exception;
    if (exception) {
        exception = exception.values[0];
        var matches = angularPattern.exec(exception.value);

        if (matches) {
            // This type now becomes something like: $rootScope:inprog
            exception.type = matches[1];
            exception.value = matches[2];
            data.message = exception.type + ': ' + exception.value;
            // auto set a new tag specifically for the angular error url
            data.extra.angularDocs = matches[3].substr(0, 250);
        }
    }
});

}(typeof window !== 'undefined' ? window : this));
