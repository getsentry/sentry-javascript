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

// Angular plugin doesn't go through the normal `Raven.addPlugin`
// since this bootstraps the `install()` automatically.

function ngRavenProvider($provide) {
    $provide.decorator('$exceptionHandler', [
        'RavenConfig', '$delegate',
        ngRavenExceptionHandler
    ]);
}

function ngRavenExceptionHandler(RavenConfig, $delegate) {
    if (!RavenConfig)
        throw new Error('RavenConfig must be set before using this');

    if (RavenConfig.debug !== void 0) {
      Raven.debug = RavenConfig.debug;
    }

    Raven.config(RavenConfig.dsn, RavenConfig.config).install();
    return function angularExceptionHandler(ex, cause) {
        $delegate(ex, cause);
        Raven.captureException(ex, {extra: {cause: cause}});
    };
}

angular.module('ngRaven', [])
    .config(['$provide', ngRavenProvider])
    .value('Raven', Raven);

}(typeof window !== 'undefined' ? window : this));
