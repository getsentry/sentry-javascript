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
    return function (ex, cause)     {
        Raven.captureException(ex, {
            extra: { cause: cause }
        });
        $delegate(ex, cause);
    };
}

Raven.addPlugin(function () {
    angular.module('ngRaven', [])
        .provider('Raven',  RavenProvider)
        .config(['$provide', ExceptionHandlerProvider]);
});

}(typeof window !== 'undefined' ? window : this));
