/**
 * chrome-extension plugin for Raven
 *
 * Usage:
 *   var Raven = require('raven-js');
 *   Raven.addPlugin(require('raven-js/plugins/chrome-extension'));
 *
 *
 */
'use strict';

// Example chrome extension path:
// "chrome-extension://iffdacemhfpnchinonehhnppllonacfj/js/bundle.min.js"
/**
 * Strip chrome path component and replace it with app://
 */
function normalizeUrl(url, pathStripRe) {
    return url
        .replace(/^chrome-extension\:\/\/[A-z]*/, '/');
}


/**
 * Initializes chrome extension plugin
 */
function chromeExtensionPlugin(Raven) {
    // Use data callback to strip device-specific paths from stack traces
    Raven.setDataCallback(function(data) {
        chromeExtensionPlugin._normalizeData(data)
    });
}

/**
 * Strip device-specific IDs found in culprit and frame filenames
 * when running chrome extensions on a browser
 */

 chromeExtensionPlugin._normalizeData = function (data) {
     // We only care about mutating an exception
     if (data.culprit) {
         data.culprit = normalizeUrl(data.culprit);
     }

     // NOTE: if data.exception exists, exception.values and exception.values[0] are
     // guaranteed to exist
     var stacktrace = data.stacktrace || data.exception && data.exception.values[0].stacktrace;
     if (stacktrace) {
         stacktrace.frames.forEach(function (frame) {
             frame.filename = normalizeUrl(frame.filename);
         });
     }

 };

module.exports = chromeExtensionPlugin;
