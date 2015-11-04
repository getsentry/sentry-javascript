/*global ErrorUtils:false*/

/**
 * react-native plugin for Raven
 *
 * Usage:
 *   var Raven = require('raven-js');
 *   require('raven-js/plugins/react-native')(Raven);
 */

var DEVICE_PATH_RE = /^\/var\/mobile\/Containers\/Bundle\/Application\/[^\/]+\/[^\.]+\.app/;
function normalizeUrl(url) {
    "use strict";

    return url
        .replace(/file\:\/\//, '')
        .replace(DEVICE_PATH_RE, '');
}

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


    // Use data callback to strip device-specific paths from stack traces
    Raven.setDataCallback(function (data) {
        if (data.culprit) {
          data.culprit = normalizeUrl(data.culprit);
        }

        if (data.exception) {
          // if data.exception exists, all of the other keys are guaranteed to exist
          data.exception.values[0].stacktrace.frames.forEach(function (frame) {
            frame.filename = normalizeUrl(frame.filename);
          });
        }
    });

    ErrorUtils.setGlobalHandler(Raven.captureException);
};
