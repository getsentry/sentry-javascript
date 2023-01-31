/*! @sentry/integrations 7.34.0 (c51ed5605) | https://github.com/getsentry/sentry-javascript */
(function (__window) {
var exports = {};

/** Internal global with common properties and Sentry extensions  */

// The code below for 'isGlobalObj' and 'GLOBAL_OBJ' was copied from core-js before modification
// https://github.com/zloirock/core-js/blob/1b944df55282cdc99c90db5f49eb0b6eda2cc0a3/packages/core-js/internals/global.js
// core-js has the following licence:
//
// Copyright (c) 2014-2022 Denis Pushkarev
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/** Returns 'obj' if it's the global object, otherwise returns undefined */
function isGlobalObj(obj) {
  return obj && obj.Math == Math ? obj : undefined;
}

/** Get's the global object for the current JavaScript runtime */
const GLOBAL_OBJ =
  (typeof globalThis == 'object' && isGlobalObj(globalThis)) ||
  // eslint-disable-next-line no-restricted-globals
  (typeof window == 'object' && isGlobalObj(window)) ||
  (typeof self == 'object' && isGlobalObj(self)) ||
  (typeof global == 'object' && isGlobalObj(global)) ||
  (function () {
    return this;
  })() ||
  {};

/**
 * Returns a global singleton contained in the global `__SENTRY__` object.
 *
 * If the singleton doesn't already exist in `__SENTRY__`, it will be created using the given factory
 * function and added to the `__SENTRY__` object.
 *
 * @param name name of the global singleton on __SENTRY__
 * @param creator creator Factory function to create the singleton if it doesn't already exist on `__SENTRY__`
 * @param obj (Optional) The global object on which to look for `__SENTRY__`, if not `GLOBAL_OBJ`'s return value
 * @returns the singleton
 */
function getGlobalSingleton(name, creator, obj) {
  const gbl = (obj || GLOBAL_OBJ) ;
  const __SENTRY__ = (gbl.__SENTRY__ = gbl.__SENTRY__ || {});
  const singleton = __SENTRY__[name] || (__SENTRY__[name] = creator());
  return singleton;
}

/** Prefix for logging strings */
const PREFIX = 'Sentry Logger ';

const CONSOLE_LEVELS = ['debug', 'info', 'warn', 'error', 'log', 'assert', 'trace'] ;

/**
 * Temporarily disable sentry console instrumentations.
 *
 * @param callback The function to run against the original `console` messages
 * @returns The results of the callback
 */
function consoleSandbox(callback) {
  if (!('console' in GLOBAL_OBJ)) {
    return callback();
  }

  const originalConsole = GLOBAL_OBJ.console ;
  const wrappedLevels = {};

  // Restore all wrapped console methods
  CONSOLE_LEVELS.forEach(level => {
    // TODO(v7): Remove this check as it's only needed for Node 6
    const originalWrappedFunc =
      originalConsole[level] && (originalConsole[level] ).__sentry_original__;
    if (level in originalConsole && originalWrappedFunc) {
      wrappedLevels[level] = originalConsole[level] ;
      originalConsole[level] = originalWrappedFunc ;
    }
  });

  try {
    return callback();
  } finally {
    // Revert restoration to wrapped state
    Object.keys(wrappedLevels).forEach(level => {
      originalConsole[level] = wrappedLevels[level ];
    });
  }
}

function makeLogger() {
  let enabled = false;
  const logger = {
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
    },
  };

  {
    CONSOLE_LEVELS.forEach(name => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger[name] = (...args) => {
        if (enabled) {
          consoleSandbox(() => {
            GLOBAL_OBJ.console[name](`${PREFIX}[${name}]:`, ...args);
          });
        }
      };
    });
  }

  return logger ;
}

// Ensure we only have a single logger instance, even if multiple versions of @sentry/utils are being used
let logger;
{
  logger = getGlobalSingleton('logger', makeLogger);
}

/** Deduplication filter */
class Dedupe  {constructor() { Dedupe.prototype.__init.call(this); }
  /**
   * @inheritDoc
   */
   static __initStatic() {this.id = 'Dedupe';}

  /**
   * @inheritDoc
   */
   __init() {this.name = Dedupe.id;}

  /**
   * @inheritDoc
   */

  /**
   * @inheritDoc
   */
   setupOnce(addGlobalEventProcessor, getCurrentHub) {
    const eventProcessor = currentEvent => {
      const self = getCurrentHub().getIntegration(Dedupe);
      if (self) {
        // Juuust in case something goes wrong
        try {
          if (_shouldDropEvent(currentEvent, self._previousEvent)) {
            logger.warn('Event dropped due to being a duplicate of previously captured event.');
            return null;
          }
        } catch (_oO) {
          return (self._previousEvent = currentEvent);
        }

        return (self._previousEvent = currentEvent);
      }
      return currentEvent;
    };

    eventProcessor.id = this.name;
    addGlobalEventProcessor(eventProcessor);
  }
} Dedupe.__initStatic();

/** JSDoc */
function _shouldDropEvent(currentEvent, previousEvent) {
  if (!previousEvent) {
    return false;
  }

  if (_isSameMessageEvent(currentEvent, previousEvent)) {
    return true;
  }

  if (_isSameExceptionEvent(currentEvent, previousEvent)) {
    return true;
  }

  return false;
}

/** JSDoc */
function _isSameMessageEvent(currentEvent, previousEvent) {
  const currentMessage = currentEvent.message;
  const previousMessage = previousEvent.message;

  // If neither event has a message property, they were both exceptions, so bail out
  if (!currentMessage && !previousMessage) {
    return false;
  }

  // If only one event has a stacktrace, but not the other one, they are not the same
  if ((currentMessage && !previousMessage) || (!currentMessage && previousMessage)) {
    return false;
  }

  if (currentMessage !== previousMessage) {
    return false;
  }

  if (!_isSameFingerprint(currentEvent, previousEvent)) {
    return false;
  }

  if (!_isSameStacktrace(currentEvent, previousEvent)) {
    return false;
  }

  return true;
}

/** JSDoc */
function _isSameExceptionEvent(currentEvent, previousEvent) {
  const previousException = _getExceptionFromEvent(previousEvent);
  const currentException = _getExceptionFromEvent(currentEvent);

  if (!previousException || !currentException) {
    return false;
  }

  if (previousException.type !== currentException.type || previousException.value !== currentException.value) {
    return false;
  }

  if (!_isSameFingerprint(currentEvent, previousEvent)) {
    return false;
  }

  if (!_isSameStacktrace(currentEvent, previousEvent)) {
    return false;
  }

  return true;
}

/** JSDoc */
function _isSameStacktrace(currentEvent, previousEvent) {
  let currentFrames = _getFramesFromEvent(currentEvent);
  let previousFrames = _getFramesFromEvent(previousEvent);

  // If neither event has a stacktrace, they are assumed to be the same
  if (!currentFrames && !previousFrames) {
    return true;
  }

  // If only one event has a stacktrace, but not the other one, they are not the same
  if ((currentFrames && !previousFrames) || (!currentFrames && previousFrames)) {
    return false;
  }

  currentFrames = currentFrames ;
  previousFrames = previousFrames ;

  // If number of frames differ, they are not the same
  if (previousFrames.length !== currentFrames.length) {
    return false;
  }

  // Otherwise, compare the two
  for (let i = 0; i < previousFrames.length; i++) {
    const frameA = previousFrames[i];
    const frameB = currentFrames[i];

    if (
      frameA.filename !== frameB.filename ||
      frameA.lineno !== frameB.lineno ||
      frameA.colno !== frameB.colno ||
      frameA.function !== frameB.function
    ) {
      return false;
    }
  }

  return true;
}

/** JSDoc */
function _isSameFingerprint(currentEvent, previousEvent) {
  let currentFingerprint = currentEvent.fingerprint;
  let previousFingerprint = previousEvent.fingerprint;

  // If neither event has a fingerprint, they are assumed to be the same
  if (!currentFingerprint && !previousFingerprint) {
    return true;
  }

  // If only one event has a fingerprint, but not the other one, they are not the same
  if ((currentFingerprint && !previousFingerprint) || (!currentFingerprint && previousFingerprint)) {
    return false;
  }

  currentFingerprint = currentFingerprint ;
  previousFingerprint = previousFingerprint ;

  // Otherwise, compare the two
  try {
    return !!(currentFingerprint.join('') === previousFingerprint.join(''));
  } catch (_oO) {
    return false;
  }
}

/** JSDoc */
function _getExceptionFromEvent(event) {
  return event.exception && event.exception.values && event.exception.values[0];
}

/** JSDoc */
function _getFramesFromEvent(event) {
  const exception = event.exception;

  if (exception) {
    try {
      // @ts-ignore Object could be undefined
      return exception.values[0].stacktrace.frames;
    } catch (_oO) {
      return undefined;
    }
  }
  return undefined;
}

exports.Dedupe = Dedupe;
exports._shouldDropEvent = _shouldDropEvent;


  // Add this module's exports to the global `Sentry.Integrations`
  __window.Sentry = __window.Sentry || {};
  __window.Sentry.Integrations = __window.Sentry.Integrations || {};
  for (var key in exports) {
    if (Object.prototype.hasOwnProperty.call(exports, key)) {
      __window.Sentry.Integrations[key] = exports[key];
    }
  }
}(window));


// All the functions below can be called within the iframe under the test

function supportsFetch() {
  if (!('fetch' in window)) {
    return false;
  }

  try {
    new Headers();
    new Request('http://www.example.com');
    new Response();
    return true;
  } catch (e) {
    return false;
  }
}

function supportsNativeFetch() {
  if (!supportsFetch()) {
    return false;
  }

  function isNativeFunc(func) {
    return func.toString().indexOf('native') !== -1;
  }

  var result = null;
  if (window.document) {
    var sandbox = window.document.createElement('iframe');
    sandbox.hidden = true;
    try {
      window.document.head.appendChild(sandbox);
      if (sandbox.contentWindow && sandbox.contentWindow.fetch) {
        result = isNativeFunc(sandbox.contentWindow.fetch);
      }
      window.document.head.removeChild(sandbox);
      // eslint-disable-next-line no-empty
    } catch (o_O) {}
  }

  if (result === null) {
    result = isNativeFunc(window.fetch);
  }

  return result;
}

function supportsOnunhandledRejection() {
  return typeof PromiseRejectionEvent !== 'undefined';
}

function isBelowIE11() {
  // eslint-disable-next-line spaced-comment
  return /*@cc_on!@*/ false == !false;
}

// Thanks for nothing IE!
// (╯°□°）╯︵ ┻━┻
function canReadFunctionName() {
  function foo() {}
  if (foo.name === 'foo') return true;
  return false;
}

function waitForXHR(xhr, cb) {
  if (xhr.readyState === 4) {
    return cb();
  }

  setTimeout(function () {
    waitForXHR(xhr, cb);
  }, 1000 / 60);
}

// All the functions below can be called within the iframe under the test

function bar() {
  baz();
}

function foo() {
  bar();
}

function foo2() {
  // identical to foo, but meant for testing
  // different stack frame fns w/ same stack length
  bar();
}

function throwNonError() {
  try {
    throw { foo: 'bar' };
  } catch (o_O) {
    Sentry.captureException(o_O);
  }
}

function throwError(message) {
  // eslint-disable-next-line no-param-reassign
  message = message || 'foo';
  try {
    throw new Error(message);
  } catch (o_O) {
    Sentry.captureException(o_O);
  }
}

function throwRandomError() {
  try {
    throw new Error('Exception no ' + (Date.now() + Math.random()));
  } catch (o_O) {
    Sentry.captureException(o_O);
  }
}

function throwSameConsecutiveErrors(message) {
  throwError(message);
  throwError(message);
}

function captureMessage(message) {
  // eslint-disable-next-line no-param-reassign
  message = message || 'message';
  Sentry.captureMessage(message);
}

function captureRandomMessage() {
  Sentry.captureMessage('Message no ' + (Date.now() + Math.random()));
}

function captureSameConsecutiveMessages(message) {
  captureMessage(message);
  captureMessage(message);
}

// store references to original, unwrapped built-ins in order to:
// - get a clean, unwrapped setTimeout (so stack traces don't include frames from mocha)
// - make assertions re: wrapped functions
var originalBuiltIns = {
  setTimeout: setTimeout,
  addEventListener: document.addEventListener,
};

var events = [];
var eventHints = [];
var breadcrumbs = [];
var breadcrumbHints = [];

// Oh dear IE10...
var dsn =
  document.location.protocol +
  '//public@' +
  document.location.hostname +
  (document.location.port ? ':' + document.location.port : '') +
  '/1';

function initSDK() {
  Sentry.init({
    dsn: dsn,
    integrations: [new Sentry.Integrations.Dedupe()],
    attachStacktrace: true,
    ignoreErrors: ['ignoreErrorTest'],
    denyUrls: ['foo.js'],
    beforeSend: function (event, eventHint) {
      events.push(event);
      eventHints.push(eventHint);
      return event;
    },
    beforeBreadcrumb: function (breadcrumb, breadcrumbHint) {
      // Filter console logs as we use them for debugging *a lot* and they are not *that* important
      // But allow then if we explicitly say so (for one of integration tests)
      if (breadcrumb.category === 'console' && !window.allowConsoleBreadcrumbs) {
        return null;
      }

      // One of the tests use manually created breadcrumb without eventId and we want to let it through
      if (breadcrumb.category.indexOf('sentry') === 0 && breadcrumb.event_id && !window.allowSentryBreadcrumbs) {
        return null;
      }

      if (
        breadcrumb.type === 'http' &&
        (breadcrumb.data.url.indexOf('test.js') !== -1 || breadcrumb.data.url.indexOf('frame.html') !== -1)
      ) {
        return null;
      }

      // Filter "refresh" like navigation which occurs in Mocha when testing on Android 4
      if (breadcrumb.category === 'navigation' && breadcrumb.data.to === breadcrumb.data.from) {
        return null;
      }

      breadcrumbs.push(breadcrumb);
      breadcrumbHints.push(breadcrumbHint);
      return breadcrumb;
    },
  });
}
