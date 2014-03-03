/**
 * Angular.js plugin
 *
 * Provides an $exceptionHandler for Angular.js
 */
;(function(Raven, angular) {
'use strict';

// quit if angular isn't on the page
if (!angular) {
    return;
}

function ngRavenProvider($provide) {
    $provide.decorator('$exceptionHandler', [
        'RavenConfig, $delegate',
        ngRavenExceptionHandler
    ]);
}

function ngRavenExceptionHandler(RavenConfig, $delegate) {
    if (!RavenConfig)
        throw new Error('RavenConfig must be set before using this');

    // Pop off DSN
    var DSN = RavenConfig.DSN;
    delete RavenConfig.DSN;

    Raven.config(DSN, RavenConfig).install();
    return function angularExceptionHandler(ex, cause) {
        $delegate(ex, cause);
        Raven.captureException(ex, {extra: {cause: cause}});
    };
}

angular.module('ngRaven', [])
    .config(['$provide', ngRavenProvider])
    .value('Raven', Raven);

})(Raven, window.angular);
