/**
 * Enforces a single instance of the Raven client, and the
 * main entry point for Raven. If you are a consumer of the
 * Raven library, you SHOULD load this file (vs raven.js).
 **/

var RavenConstructor = require('./raven');

// This is to be defensive in environments where window does not exist (see https://github.com/getsentry/raven-js/pull/785)
var _window =
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};
var _Raven = _window.Raven;

var Raven = new RavenConstructor();

/*
 * Allow multiple versions of Raven to be installed.
 * Strip Raven from the global context and returns the instance.
 *
 * @return {Raven}
 */
Raven.noConflict = function() {
  _window.Raven = _Raven;
  return Raven;
};

Raven.afterLoad();

module.exports = Raven;

/**
 * DISCLAIMER:
 *
 * Expose `Client` constructor for cases where user want to track multiple "sub-applications" in one larger app.
 * It's not meant to be used by a wide audience, so pleaaase make sure that you know what you're doing before using it.
 * Accidentally calling `install` multiple times, may result in an unexpected behavior that's very hard to debug.
 *
 * It's called `Client' to be in-line with Raven Node implementation.
 *
 * HOWTO:
 *
 * import Raven from 'raven-js';
 *
 * const someAppReporter = new Raven.Client();
 * const someOtherAppReporter = new Raven.Client();
 *
 * someAppReporter.config('__DSN__', {
 *   ...config goes here
 * });
 *
 * someOtherAppReporter.config('__OTHER_DSN__', {
 *   ...config goes here
 * });
 *
 * someAppReporter.captureMessage(...);
 * someAppReporter.captureException(...);
 * someAppReporter.captureBreadcrumb(...);
 *
 * someOtherAppReporter.captureMessage(...);
 * someOtherAppReporter.captureException(...);
 * someOtherAppReporter.captureBreadcrumb(...);
 *
 * It should "just work".
 */
module.exports.Client = RavenConstructor;
