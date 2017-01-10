/**
 * Angular.js plugin
 *
 * Provides an $exceptionHandler for Angular.js
 */
'use strict';

// See https://github.com/angular/angular.js/blob/v1.4.7/src/minErr.js
var angularPattern = /^\[((?:[$a-zA-Z0-9]+:)?(?:[$a-zA-Z0-9]+))\] (.*?)\n?(\S+)$/;


function angularPlugin(Raven, angular) {
    angular = angular || window.angular;

    if (!angular) return;

    var _development = false;

    function RavenProvider() {
        Raven.setDataCallback(function(data, original) {
            angularPlugin._normalizeData(data);

            original && original(data);
        });

        this.setTagsContext = function(opts) {
            return Raven.setTagsContext(opts);
        };

        this.development = function(config) {
            _development = config || _development;
            return this;
        };

        this.config = function(configuration) {
            return Raven.config(configuration);
        };

        this.install = function() {
            return Raven.install();
        };

        this.$get = [function() {
            return Raven;
        }];
    }

    function ExceptionHandlerProvider($provide) {
        $provide.decorator('$exceptionHandler',
            ['Raven', '$delegate', exceptionHandler]);
    }

    function exceptionHandler(R, $delegate) {
        return function (ex, cause) {
            if(!_development) {
                R.captureException(ex, {
                    extra: { cause: cause }
                });
            }
            $delegate(ex, cause);
        };
    }

    angular.module('ngRaven', [])
        .provider('Raven',  RavenProvider)
        .config(['$provide', ExceptionHandlerProvider]);
}

angularPlugin._normalizeData = function (data) {
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
};

module.exports = angularPlugin;
// Install plugin when included
angularPlugin(window.Raven);