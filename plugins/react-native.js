/*global ErrorUtils:false*/

/**
 * react-native plugin for Raven
 *
 * Usage:
 *   var Raven = require('raven-js');
 *   require('raven-js/plugins/react-native')(Raven);
 */
module.exports = function (Raven) {
    "use strict";

    function urlencode(obj) {
        var pairs = [];
        for (var key in obj) {
          if ({}.hasOwnProperty.call(obj, key))
            pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]));
        }
        return pairs.join('&');
    }

    function xhrTransport(options) {
        options.auth.sentry_data = JSON.stringify(options.data);

        var request = new XMLHttpRequest();
        request.onreadystatechange = function (e) {
            if (request.readyState !== 4) {
                return;
            }

            if (request.status === 200) {
                if (options.onSuccess) {
                    options.onSuccess();
                }
            } else {
                if (options.onError) {
                    options.onError();
                }
            }
        };

        request.open('GET', options.url + '?' + urlencode(options.auth));
        request.send();
    }

    // react-native doesn't have a document, so can't use default Image
    // transport - use XMLHttpRequest instead
    Raven.setTransport(xhrTransport);

    ErrorUtils.setGlobalHandler(Raven.captureException);
};
