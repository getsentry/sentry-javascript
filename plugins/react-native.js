/*global ErrorUtils:false*/

/**
 * react-native plugin for Raven
 *
 * Usage:
 *   var Raven = require('raven-js');
 *   Raven.addPlugin(require('raven-js/plugins/react-native'));
 *
 * Options:
 *
 *   pathStrip: A RegExp that matches the portions of a file URI that should be
 *     removed from stacks prior to submission.
 *
 */
'use strict';

var PATH_STRIP_RE = /^\/var\/mobile\/Containers\/Bundle\/Application\/[^\/]+\/[^\.]+\.app/;

/**
 * Strip device-specific IDs from React Native file:// paths
 */
function normalizeUrl(url, pathStripRe) {
    return url
        .replace(/^file\:\/\//, '')
        .replace(pathStripRe, '');
}

/**
 * Extract key/value pairs from an object and encode them for
 * use in a query string
 */
function urlencode(obj) {
    var pairs = [];
    for (var key in obj) {
        if ({}.hasOwnProperty.call(obj, key))
            pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]));
    }
    return pairs.join('&');
}

/**
 * Initializes React Native plugin
 */
function reactNativePlugin(Raven, options) {
    options = options || {};

    // react-native doesn't have a document, so can't use default Image
    // transport - use XMLHttpRequest instead
    Raven.setTransport(reactNativePlugin._transport);

    // Use data callback to strip device-specific paths from stack traces
    Raven.setDataCallback(function(data) {
        reactNativePlugin._normalizeData(data, options.pathStrip)
    });

    var defaultHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler() || ErrorUtils._globalHandler;

    ErrorUtils.setGlobalHandler(function() {
        var error = arguments[0];
        defaultHandler.apply(this, arguments)
        Raven.captureException(error);
    });
}

/**
 * Custom HTTP transport for use with React Native applications.
 */
reactNativePlugin._transport = function (options) {
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

    request.open('POST', options.url + '?' + urlencode(options.auth));

    // NOTE: React Native ignores CORS and will NOT send a preflight
    //       request for application/json.
    // See: https://facebook.github.io/react-native/docs/network.html#xmlhttprequest
    request.setRequestHeader('Content-type', 'application/json');

    // Sentry expects an Origin header when using HTTP POST w/ public DSN.
    // Just set a phony Origin value; only matters if Sentry Project is configured
    // to whitelist specific origins.
    request.setRequestHeader('Origin', 'react-native://');
    request.send(JSON.stringify(options.data));
};

/**
 * Strip device-specific IDs found in culprit and frame filenames
 * when running React Native applications on a physical device.
 */
reactNativePlugin._normalizeData = function (data, pathStripRe) {
    if (!pathStripRe) {
        pathStripRe = PATH_STRIP_RE;
    }

    if (data.culprit) {
        data.culprit = normalizeUrl(data.culprit, pathStripRe);
    }

    if (data.exception) {
        // if data.exception exists, all of the other keys are guaranteed to exist
        data.exception.values[0].stacktrace.frames.forEach(function (frame) {
            frame.filename = normalizeUrl(frame.filename, pathStripRe);
        });
    }
};

module.exports = reactNativePlugin;
