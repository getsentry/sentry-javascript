/**
 * Electron plugin for Raven
 *
 * Usage:
 *   var Raven = require('raven-js');
 *   require('raven-js/plugins/electron')(Raven);
 *
 * Options:
 *
 *   pathMatch: A RegExp that matches the portions of a file URI that should be
 *     send to Sentry.
 *
 */
'use strict';

var PATH_MATCH_RE = /[^/]+$/;

/**
 * Strip device-specific url part from Electron file:// paths
 */
function normalizeUrl(url, pathMatchRe) {
    var match = url.match(pathMatchRe);
    return match ? match[0] : '';
}

/**
 * Initializes Electron plugin
 */
function electronPlugin(Raven, options) {
    options = options || {};

    // Use data callback to strip device-specific paths from stack traces
    Raven.setDataCallback(function(data) {
        electronPlugin._normalizeData(data, options.pathMatch)
    });
}

/**
 * Strip device-specific url paths found in culprit and frame filenames
 */
electronPlugin._normalizeData = function (data, pathMatchRe) {
    if (!pathMatchRe) {
        pathMatchRe = PATH_MATCH_RE;
    }

    if (data.culprit) {
        data.culprit = normalizeUrl(data.culprit, pathMatchRe);
    }

    if (data.exception) {
        // if data.exception exists, all of the other keys are guaranteed to exist
        data.exception.values[0].stacktrace.frames.forEach(function (frame) {
            frame.filename = normalizeUrl(frame.filename, pathMatchRe);
        });
    }
};

module.exports = electronPlugin;
