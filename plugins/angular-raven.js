/*!
 * https://github.com/fastreload/angular-raven
 * All rights reserved.
 *
 * See github link for example usage
 * */

(function () {
    "use strict";
    var ngRaven = angular.module("angular-raven", []);

    ngRaven.config(["$provide", function ($provide) {
        $provide.decorator("$exceptionHandler", ["RavenConfig", "$delegate", function (cfg, del) {
            if (!cfg) { throw new Error("Raven config must be set before using this"); }
            Raven.config(cfg.ravenUrl).install();
            return function (ex, cause) {
                del(ex, cause);
                Raven.captureException(ex, cause);
            };
        }]);
    }]);
    ngRaven.value("Raven", Raven);

})();
