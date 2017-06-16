/**
 * Angular.js plugin
 *
 * Provides an $exceptionHandler for Angular.js
 */
var wrappedCallback = require('../src/utils').wrappedCallback;

// See https://github.com/angular/angular.js/blob/v1.4.7/src/minErr.js
var angularPattern = /^\[((?:[$a-zA-Z0-9]+:)?(?:[$a-zA-Z0-9]+))\] (.*?)\n?(\S+)$/;
var moduleName = 'ngRaven';

function angularPlugin(Raven, angular) {
  angular = angular || window.angular;

  if (!angular) return;

  function RavenProvider() {
    this.$get = [
      '$window',
      function($window) {
        return Raven;
      }
    ];
  }

  function ExceptionHandlerProvider($provide) {
    $provide.decorator('$exceptionHandler', ['Raven', '$delegate', exceptionHandler]);
  }

  function exceptionHandler(R, $delegate) {
    return function(ex, cause) {
      R.captureException(ex, {
        extra: {cause: cause}
      });
      $delegate(ex, cause);
    };
  }

  angular
    .module(moduleName, [])
    .provider('Raven', RavenProvider)
    .config(['$provide', ExceptionHandlerProvider]);

  Raven.setDataCallback(
    wrappedCallback(function(data) {
      return angularPlugin._normalizeData(data);
    })
  );
}

angularPlugin._normalizeData = function(data) {
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

  return data;
};

angularPlugin.moduleName = moduleName;

module.exports = angularPlugin;
